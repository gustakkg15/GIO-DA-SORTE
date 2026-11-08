/**
 * GIO DA SORTE PRO — FASE 10.4: SUÍTE OFICIAL FIREBASE RULES UNIT TESTING (EMU-01 A EMU-11)
 * 
 * Requisitos de Isolamento:
 * - Projeto de Teste: "demo-gio-da-sorte" (estritamente isolado de qualquer ambiente real ou GCP).
 * - Sem credenciais reais.
 * - Utilização de @firebase/rules-unit-testing com os métodos:
 *   - initializeTestEnvironment
 *   - authenticatedContext / unauthenticatedContext
 *   - assertSucceeds / assertFails
 *   - withSecurityRulesDisabled
 * - Validação explícita de exceção com código "permission-denied".
 * - Suporte a Admin SDK isolado apontando para o Emulator (EMU-06, PRO Plan Updates, Global Participants).
 * - Se o emulador não estiver ativo (ausência de Java), o script encerra com código NÃO ZERO (process.exit(1)).
 */

import fs from 'fs';
import path from 'path';
import http from 'http';
import {
  initializeTestEnvironment,
  assertSucceeds,
  assertFails,
  RulesTestEnvironment,
} from '@firebase/rules-unit-testing';
import { initializeApp as initializeAdminApp, getApps as getAdminApps, deleteApp } from 'firebase-admin/app';
import { getFirestore as getAdminFirestore, FieldValue } from 'firebase-admin/firestore';

const ISOLATED_PROJECT_ID = 'demo-gio-da-sorte';

async function isEmulatorReachable(host: string, port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const req = http.get(`http://${host}:${port}/`, { timeout: 1500 }, (res) => {
      resolve(true);
      res.resume();
    });
    req.on('error', () => resolve(false));
    req.on('timeout', () => {
      req.destroy();
      resolve(false);
    });
  });
}

function verifyPermissionDenied(err: any, scenarioId: string) {
  if (
    err &&
    (err.code === 'permission-denied' ||
      err.code === 'PERMISSION_DENIED' ||
      (typeof err.message === 'string' && err.message.includes('permission-denied')))
  ) {
    return true;
  }
  throw new Error(`${scenarioId} falhou com código inesperado: ${err?.code || err?.message}`);
}

async function runOfficialRulesEmulatorSuite() {
  console.log('================================================================');
  console.log('  GIO DA SORTE PRO — FASE 10.4: OFFICIAL FIREBASE RULES TEST');
  console.log('  PROJETO DE ISOLAMENTO: ' + ISOLATED_PROJECT_ID);
  console.log('================================================================\n');

  const envEmulatorHost = process.env.FIRESTORE_EMULATOR_HOST;
  console.log(`[VERIFICAÇÃO DE AMBIENTE] FIRESTORE_EMULATOR_HOST: ${envEmulatorHost || 'não definido'}`);

  if (!envEmulatorHost) {
    console.error(`\n✗ [ERRO DE CONFIGURAÇÃO DE AMBIENTE]: FIRESTORE_EMULATOR_HOST não está definido.`);
    console.error('ℹ [DIAGNÓSTICO]: O container Linux do ambiente AI Studio não possui Java JRE instalado para executar o Firebase Emulator.');
    console.error('ℹ [REGRAS DE AUDITORIA 10.4]: Conforme exigido pela normativa da Fase 10.4, a execução sem o emulador oficial ATIVO é encerrada com erro (código 1) sem declarar aprovação falsa dos cenários EMU-01 a EMU-11.\n');
    process.exit(1);
  }

  const host = envEmulatorHost.split(':')[0];
  const port = parseInt(envEmulatorHost.split(':')[1], 10);
  const reachable = await isEmulatorReachable(host, port);

  if (!reachable) {
    console.error(`\n✗ [ERRO DE CONEXÃO]: Firestore Emulator não acessível em ${host}:${port}.`);
    console.error('ℹ [REGRAS DE AUDITORIA 10.4]: A execução sem o emulador oficial ATIVO é encerrada com erro (código 1).\n');
    process.exit(1);
  }

  const rulesPath = path.resolve(process.cwd(), 'firestore.rules');
  if (!fs.existsSync(rulesPath)) {
    console.error('✗ [FAIL] Arquivo firestore.rules não encontrado!');
    process.exit(1);
  }

  const rulesContent = fs.readFileSync(rulesPath, 'utf-8');

  let testEnv: RulesTestEnvironment | null = null;
  let passedCount = 0;
  const totalScenarios = 11;

  try {
    testEnv = await initializeTestEnvironment({
      projectId: ISOLATED_PROJECT_ID,
      firestore: {
        rules: rulesContent,
        host,
        port,
      },
    });

    // Preparar estado isolado inicial via withSecurityRulesDisabled
    await testEnv.withSecurityRulesDisabled(async (context) => {
      const setupDb = context.firestore();
      await setupDb.doc('users/user_emu_a').set({
        uid: 'user_emu_a',
        email: 'user_a@test.com',
        statusState: 'FREE',
      });
      await setupDb.doc('campaigns/camp_user_a').set({
        ownerUid: 'user_emu_a',
        title: 'Campanha Teste Usuário A',
      });
      await setupDb.doc('draw_snapshots/snap_100').set({
        ownerUid: 'user_emu_a',
        rosterHash: 'hash_sha256_oficial',
      });
      await setupDb.doc('lgpd_requests/req_user_a').set({
        requestId: 'req_user_a',
        userId: 'user_emu_a',
        type: 'DELETE',
      });
      await setupDb.doc('lgpd_requests/req_user_b').set({
        requestId: 'req_user_b',
        userId: 'user_emu_b',
        type: 'ACCESS',
      });
      await setupDb.doc('support_tickets/ticket_user_a').set({
        ticketId: 'ticket_user_a',
        userId: 'user_emu_a',
        subject: 'Ajuda com Rifa',
      });
      await setupDb.doc('support_tickets/ticket_user_b').set({
        ticketId: 'ticket_user_b',
        userId: 'user_emu_b',
        subject: 'Suporte VIP',
      });
    });

    // EMU-01: Anônimo tentando ler /sessions/sess_100
    console.log('\n--- [EMU-01] Leitura Anônima em /sessions/sess_100 ---');
    const unauthDb = testEnv.unauthenticatedContext().firestore();
    const errEmu01 = await assertFails(unauthDb.doc('sessions/sess_100').get());
    verifyPermissionDenied(errEmu01, 'EMU-01');
    console.log('✓ [PASS] EMU-01: Leitura anônima rejeitada estritamente por permission-denied.');
    passedCount++;

    // EMU-02: Escrita pelo proprietário (User A)
    console.log('\n--- [EMU-02] Escrita de Configurações pelo Proprietário (User A) ---');
    const userADb = testEnv.authenticatedContext('user_emu_a').firestore();
    await assertSucceeds(
      userADb.doc('users/user_emu_a/settings/raffle_config').set({
        defaultRate: 10,
      })
    );
    console.log('✓ [PASS] EMU-02: Escrita de configurações autorizada para o proprietário.');
    passedCount++;

    // EMU-03: Bloqueio de Acesso Cruzado IDOR (User A -> User B)
    console.log('\n--- [EMU-03] Bloqueio IDOR (User A acessando User B) ---');
    const errEmu03 = await assertFails(
      userADb.doc('users/user_emu_b/settings/raffle_config').get()
    );
    verifyPermissionDenied(errEmu03, 'EMU-03');
    console.log('✓ [PASS] EMU-03: Acesso IDOR cruzado rejeitado por permission-denied.');
    passedCount++;

    // EMU-04: Usuário B tentando alterar a campanha do Usuário A
    console.log('\n--- [EMU-04] Tentativa de Usurpação de Campanha (User B -> User A) ---');
    const userBDb = testEnv.authenticatedContext('user_emu_b').firestore();
    const errEmu04 = await assertFails(
      userBDb.doc('campaigns/camp_user_a').update({
        title: 'Campanha Usurpada',
      })
    );
    verifyPermissionDenied(errEmu04, 'EMU-04');
    console.log('✓ [PASS] EMU-04: Usurpação de campanha rejeitada por permission-denied.');
    passedCount++;

    // EMU-05: Tentativa de atualizar snapshot imutável
    console.log('\n--- [EMU-05] Imutabilidade de Snapshot (/draw_snapshots/snap_100) ---');
    const errEmu05 = await assertFails(
      userADb.doc('draw_snapshots/snap_100').update({
        rosterHash: 'hash_fraudulento',
      })
    );
    verifyPermissionDenied(errEmu05, 'EMU-05');
    console.log('✓ [PASS] EMU-05: Alteração em snapshot imutável rejeitada por permission-denied.');
    passedCount++;

    // EMU-06: Acesso do Firebase Admin SDK ao Emulator (Bypasses Security Rules)
    console.log('\n--- [EMU-06] Firebase Admin SDK Conectado ao Emulator ---');
    const adminApps = getAdminApps();
    const adminApp = adminApps.length === 0 ? initializeAdminApp({ projectId: ISOLATED_PROJECT_ID }) : adminApps[0];
    const adminDb = getAdminFirestore(adminApp);
    adminDb.settings({ host: `${host}:${port}`, ssl: false });

    await adminDb.doc('draws/draw_100').set({
      ownerUid: 'user_emu_a',
      winnerName: 'Ganhador Homologado',
      drawnAt: FieldValue.serverTimestamp(),
    });
    console.log('✓ [PASS] EMU-06: Gravação privilegiada via Admin SDK efetuada no Emulator.');
    passedCount++;

    // EMU-07: Usuário FREE tenta elevação manual para PRO/ACTIVE via Client SDK
    console.log('\n--- [EMU-07] Bloqueio de Elevação Manual para PRO via Client SDK ---');
    const errEmu07 = await assertFails(
      userADb.doc('users/user_emu_a').update({
        statusState: 'ACTIVE',
        mpPreapprovalId: 'fake_preapp_123',
        mpExternalReference: 'user_emu_a',
      })
    );
    verifyPermissionDenied(errEmu07, 'EMU-07');
    console.log('✓ [PASS] EMU-07: Elevação comercial para PRO rejeitada estritamente por permission-denied.');
    passedCount++;

    // EMU-08: Usuário A tentando listar solicitações LGPD de outros usuários
    console.log('\n--- [EMU-08] Isolamento de Listagem LGPD ---');
    const errEmu08 = await assertFails(userADb.collection('lgpd_requests').get());
    verifyPermissionDenied(errEmu08, 'EMU-08');
    await assertSucceeds(
      userADb.doc('lgpd_requests/req_user_a').get()
    );
    console.log('✓ [PASS] EMU-08: Listagem global LGPD bloqueada; consulta individual autorizada ao proprietário.');
    passedCount++;

    // EMU-09: Usuário A tentando listar chamados de suporte de todos
    console.log('\n--- [EMU-09] Isolamento de Chamados de Suporte ---');
    const errEmu09 = await assertFails(userADb.collection('support_tickets').get());
    verifyPermissionDenied(errEmu09, 'EMU-09');
    await assertSucceeds(
      userADb.doc('support_tickets/ticket_user_a').get()
    );
    console.log('✓ [PASS] EMU-09: Listagem global de tíquetes bloqueada; acesso individual autorizado ao proprietário.');
    passedCount++;

    // EMU-10: Usuário A tentando alterar moedas/dados de outro participante em global_participants
    console.log('\n--- [EMU-10] Bloqueio de Adulteração de Participantes Globais ---');
    const errEmu10 = await assertFails(
      userADb.doc('global_participants/tiktok_user_b').set({
        accumulatedCoins: 999999,
      })
    );
    verifyPermissionDenied(errEmu10, 'EMU-10');
    console.log('✓ [PASS] EMU-10: Mutação direta em participante global rejeitada por permission-denied.');
    passedCount++;

    // EMU-11: Usuário A tentando forjar log atribuído a operatorUid: 'SYSTEM'
    console.log('\n--- [EMU-11] Forja de Log atribuído a SYSTEM ---');
    const errEmu11 = await assertFails(
      userADb.doc('audit_logs/log_fake_sys').set({
        logId: 'log_fake_sys',
        operatorUid: 'SYSTEM',
        action: 'FORGED_SYSTEM_EVENT',
      })
    );
    verifyPermissionDenied(errEmu11, 'EMU-11');
    await assertSucceeds(
      userADb.doc('audit_logs/log_user_a_ok').set({
        logId: 'log_user_a_ok',
        operatorUid: 'user_emu_a',
        action: 'USER_ACTION_OK',
      })
    );
    console.log('✓ [PASS] EMU-11: Log forjado como SYSTEM rejeitado; log assinado pelo próprio usuário aprovado.');
    passedCount++;

    console.log(`\n================================================================`);
    console.log(`  RESULTADO EMULADOR OFICIAL: ${passedCount}/${totalScenarios} cenários EMU-01 a EMU-11 APROVADOS.`);
    console.log(`================================================================\n`);
  } finally {
    if (testEnv) {
      await testEnv.cleanup();
    }
    const appsToCleanup = getAdminApps();
    if (appsToCleanup.length > 0) {
      await Promise.all(appsToCleanup.map((app) => deleteApp(app)));
    }
  }
}

runOfficialRulesEmulatorSuite().catch((err) => {
  console.error('Falha na suíte do emulador:', err);
  process.exit(1);
});
