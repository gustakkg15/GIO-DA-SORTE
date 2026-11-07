#!/usr/bin/env node
/**
 * scripts/manage-admin-role.ts
 *
 * Utilitário administrativo CLI oficial do GIO DA SORTE PRO para concessão,
 * consulta e revogação de permissões administrativas (ADMIN) no Firebase Authentication.
 *
 * REGRAS CRÍTICAS DE SEGURANÇA:
 * 1. Execução restrita ao ambiente administrativo/CLI (nunca exposto em rotas públicas HTTP).
 * 2. Validação rigorosa do formato de UID do Firebase.
 * 3. Preservação de Custom Claims preexistentes (não-administrativas).
 * 4. Registro de auditoria em `audit_logs` no Firestore.
 * 5. Revogação forçada de refresh tokens na despromoção.
 * 6. Total desacoplamento de privilégios comerciais do plano PRO.
 */

import { getAuth } from 'firebase-admin/auth';
import { doc, setDoc } from 'firebase/firestore';
import { db } from '../src/firebase.ts';
import { getOrInitFirebaseAdminApp } from '../src/server/firebaseAdminAuth.ts';

export type AdminRoleAction = 'grant' | 'revoke' | 'status';

export interface ManageAdminRoleOptions {
  uid: string;
  action: AdminRoleAction;
  actor?: string;
  reason?: string;
}

export interface ManageAdminRoleResult {
  success: boolean;
  uid: string;
  email?: string;
  action: AdminRoleAction;
  previousClaims: Record<string, unknown>;
  updatedClaims: Record<string, unknown>;
  isAdminNow: boolean;
  revokedTokens: boolean;
  auditLogged: boolean;
  message: string;
}

/**
 * Valida o formato padrão de UID do Firebase Authentication.
 * UIDs válidos são strings não vazias de 1 a 128 caracteres alfanuméricos ou símbolos seguros (-_).
 */
export function isValidFirebaseUid(uid: unknown): uid is string {
  if (typeof uid !== 'string') return false;
  const clean = uid.trim();
  if (clean.length === 0 || clean.length > 128) return false;
  return /^[a-zA-Z0-9_\-:]+$/.test(clean);
}

/**
 * Registra a operação administrativa na coleção de trilha de auditoria `/audit_logs`.
 */
async function recordAdminRoleAuditLog(params: {
  action: string;
  targetUid: string;
  targetEmail?: string;
  actor: string;
  reason?: string;
  previousClaims: Record<string, unknown>;
  updatedClaims: Record<string, unknown>;
}): Promise<boolean> {
  try {
    const logId = `log_adm_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const logRef = doc(db, 'audit_logs', logId);
    await setDoc(logRef, {
      logId,
      timestamp: Date.now(),
      actor: params.actor,
      category: 'SECURITY',
      action: params.action,
      details: {
        targetUid: params.targetUid,
        targetEmail: params.targetEmail || null,
        reason: params.reason || 'Operação administrativa via script de controle CLI',
        previousClaims: params.previousClaims,
        updatedClaims: params.updatedClaims,
        environment: process.env.NODE_ENV || 'development',
      },
    });
    return true;
  } catch (err) {
    console.warn('[AuditLog] Aviso: Falha ao gravar log de auditoria no Firestore:', err);
    return false;
  }
}

/**
 * Função executável principal para gerenciar permissões administrativas.
 */
export async function manageAdminRole(
  options: ManageAdminRoleOptions
): Promise<ManageAdminRoleResult> {
  const { uid, action, actor = 'CLI_SUPER_ADMIN', reason } = options;

  if (!isValidFirebaseUid(uid)) {
    throw new Error(
      `UID inválido: '${String(uid)}'. Deve ser uma string de 1 a 128 caracteres alfanuméricos.`
    );
  }

  if (!['grant', 'revoke', 'status'].includes(action)) {
    throw new Error(
      `Ação inválida: '${String(action)}'. Ações permitidas: 'grant', 'revoke', 'status'.`
    );
  }

  const adminApp = getOrInitFirebaseAdminApp();
  const adminAuth = getAuth(adminApp);

  // 1. Verificar se o usuário existe no Firebase Authentication
  let userRecord;
  try {
    userRecord = await adminAuth.getUser(uid);
  } catch (err: any) {
    if (err?.code === 'auth/user-not-found') {
      throw new Error(`Usuário não encontrado no Firebase Authentication para o UID: '${uid}'.`);
    }
    throw new Error(`Falha ao consultar usuário no Firebase Auth: ${err?.message || String(err)}`);
  }

  const previousClaims = (userRecord.customClaims || {}) as Record<string, unknown>;

  // Apenas consulta de status
  if (action === 'status') {
    const isCurrentlyAdmin = Boolean(
      previousClaims.admin === true || previousClaims.role === 'admin'
    );
    return {
      success: true,
      uid,
      email: userRecord.email,
      action: 'status',
      previousClaims,
      updatedClaims: previousClaims,
      isAdminNow: isCurrentlyAdmin,
      revokedTokens: false,
      auditLogged: false,
      message: `Status do UID '${uid}' (${userRecord.email || 'sem e-mail'}): ${
        isCurrentlyAdmin ? 'ADMINISTRADOR ATIVO' : 'USUÁRIO REGULAR (NÃO-ADMIN)'
      }.`,
    };
  }

  // 2. Concessão (Grant)
  if (action === 'grant') {
    const updatedClaims: Record<string, unknown> = {
      ...previousClaims,
      admin: true,
      role: 'admin',
    };

    await adminAuth.setCustomUserClaims(uid, updatedClaims);

    const auditOk = await recordAdminRoleAuditLog({
      action: 'ADMIN_ROLE_GRANTED',
      targetUid: uid,
      targetEmail: userRecord.email,
      actor,
      reason,
      previousClaims,
      updatedClaims,
    });

    return {
      success: true,
      uid,
      email: userRecord.email,
      action: 'grant',
      previousClaims,
      updatedClaims,
      isAdminNow: true,
      revokedTokens: false,
      auditLogged: auditOk,
      message: `Permissão ADMIN concedida com sucesso ao usuário '${uid}' (${userRecord.email || 'sem e-mail'}). Custom claims atualizadas preservando dados preexistentes.`,
    };
  }

  // 3. Revogação (Revoke)
  // Remover admin e role: 'admin', preservando quaisquer outras claims preexistentes
  const updatedClaims: Record<string, unknown> = { ...previousClaims };
  delete updatedClaims.admin;
  if (updatedClaims.role === 'admin') {
    delete updatedClaims.role;
  }

  await adminAuth.setCustomUserClaims(uid, updatedClaims);

  // Revogar todos os refresh tokens para invalidar sessões ativas no próximo ciclo de verificação
  let revokedTokens = false;
  try {
    await adminAuth.revokeRefreshTokens(uid);
    revokedTokens = true;
  } catch (revokeErr) {
    console.warn(`[Revoke] Aviso: Não foi possível revogar refresh tokens para '${uid}':`, revokeErr);
  }

  const auditOk = await recordAdminRoleAuditLog({
    action: 'ADMIN_ROLE_REVOKED',
    targetUid: uid,
    targetEmail: userRecord.email,
    actor,
    reason,
    previousClaims,
    updatedClaims,
  });

  return {
    success: true,
    uid,
    email: userRecord.email,
    action: 'revoke',
    previousClaims,
    updatedClaims,
    isAdminNow: false,
    revokedTokens,
    auditLogged: auditOk,
    message: `Permissão ADMIN revogada com sucesso para o usuário '${uid}' (${userRecord.email || 'sem e-mail'}). Refresh tokens revogados no Firebase Auth.`,
  };
}

// -------------------------------------------------------------
// Modo Executável CLI (quando executado diretamente via terminal)
// -------------------------------------------------------------
async function runCli() {
  const args = process.argv.slice(2);

  if (args.length === 0 || args.includes('--help') || args.includes('-h')) {
    console.log(`
=============================================================
  GIO DA SORTE PRO — Utilitário de Controle Administrativo
=============================================================
Uso:
  npx tsx scripts/manage-admin-role.ts --uid=<UID> --action=<grant|revoke|status> [--actor=<ACTOR>] [--reason=<REASON>]

Ações:
  --action=grant    Concede Custom Claim admin: true e role: "admin"
  --action=revoke   Remove Custom Claim admin e revoga refresh tokens
  --action=status   Consulta se o UID possui permissão administrativa

Exemplos:
  npx tsx scripts/manage-admin-role.ts --uid="ABC123xyz" --action=status
  npx tsx scripts/manage-admin-role.ts --uid="ABC123xyz" --action=grant --reason="Acesso de testes homologado"
  npx tsx scripts/manage-admin-role.ts --uid="ABC123xyz" --action=revoke --reason="Encerramento do ciclo de teste"
=============================================================
`);
    process.exit(0);
  }

  let uid = '';
  let action: AdminRoleAction = 'status';
  let actor = 'CLI_SUPER_ADMIN';
  let reason = '';

  for (const arg of args) {
    if (arg.startsWith('--uid=')) uid = arg.slice(6).trim();
    if (arg.startsWith('--action=')) action = arg.slice(9).trim() as AdminRoleAction;
    if (arg.startsWith('--actor=')) actor = arg.slice(8).trim();
    if (arg.startsWith('--reason=')) reason = arg.slice(9).trim();
  }

  try {
    const result = await manageAdminRole({ uid, action, actor, reason });
    console.log('\n[SUCESSO] Resultado da Operação:');
    console.log(JSON.stringify(result, null, 2));
    process.exit(0);
  } catch (err: any) {
    console.error('\n[ERRO NA OPERAÇÃO]:', err?.message || err);
    process.exit(1);
  }
}

// Executar CLI se chamado como arquivo principal
if (typeof process !== 'undefined' && process.argv[1]?.includes('manage-admin-role.ts')) {
  runCli().catch((err) => {
    console.error('[ERRO CRÍTICO]:', err);
    process.exit(1);
  });
}
