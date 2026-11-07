/**
 * GIO DA SORTE PRO — FASE 10.2.2: SUÍTE OFICIAL FIREBASE RULES UNIT TESTING
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
 * - Suporte a Admin SDK isolado apontando para o Emulator (EMU-06).
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

async function runOfficialRulesEmulatorSuite() {
  console.log('================================================================');
  console.log('  GIO DA SORTE PRO — FASE 10.2.2: OFFICIAL FIREBASE RULES TEST');
  console.log('  PROJETO DE ISOLAMENTO: ' + ISOLATED_PROJECT_ID);
  console.log('================================================================\n');

  const envEmulatorHost = process.env.FIRESTORE_EMULATOR_HOST;
  console.log(`[VERIFICAÇÃO DE AMBIENTE] FIRESTORE_EMULATOR_HOST: ${envEmulatorHost || 'não definido'}`);

  if (!envEmulatorHost) {
    console.error(`\n✗ [ERRO DE CONFIGURAÇÃO DE AMBIENTE]: FIRESTORE_EMULATOR_HOST não está definido.`);
    console.error('ℹ [DIAGNÓSTICO]: O container Linux do ambiente AI Studio não possui Java JRE instalado para executar o Firebase Emulator.');
    console.error('ℹ [REGRAS DE AUDITORIA 10.2.2]: Conforme exigido pela normativa da Fase 10.2.2, a execução sem o emulador oficial ATIVO é encerrada com erro (código 1) sem declarar aprovação falsa dos cenários EMU-01 a EMU-06.\n');
    process.exit(1);
  }

  const host = envEmulatorHost.split(':')[0];
  const port = parseInt(envEmulatorHost.split(':')[1], 10);
  const reachable = await isEmulatorReachable(host, port);

  if (!reachable) {
    console.error(`\n✗ [ERRO DE CONEXÃO]: Firestore Emulator não acessível em ${host}:${port}.`);
    console.error('ℹ [REGRAS DE AUDITORIA 10.2.2]: A execução sem o emulador oficial ATIVO é encerrada com erro (código 1).\n');
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
  const totalScenarios = 6;

  try {
    testEnv = await initializeTestEnvironment({
      projectId: ISOLATED_PROJECT_ID,
      firestore: {
        rules: rulesContent,
        host,
        port,
      },
    });

    // EMU-01: Anônimo tentando ler /sessions/sess_100
    console.log('\n--- [EMU-01] Leitura Anônima em /sessions/sess_100 ---');
    const unauthDb = testEnv.unauthenticatedContext().firestore();
    const errEmu01 = await assertFails(unauthDb.doc('sessions/sess_100').get());
    if (errEmu01.code === 'permission-denied' || errEmu01.code === 'PERMISSION_DENIED' || errEmu01.message.includes('permission-denied')) {
      console.log('✓ [PASS] EMU-01: Leitura anônima rejeitada estritamente por permission-denied.');
      passedCount++;
    } else {
      throw new Error(`EMU-01 falhou com código inesperado: ${errEmu01.code}`);
    }

    // Preparação de dados isolados via withSecurityRulesDisabled
    await testEnv.withSecurityRulesDisabled(async (context) => {
      const setupDb = context.firestore();
      await setupDb.doc('campaigns/camp_user_a').set({
        ownerUid: 'user_emu_a',
        title: 'Campanha Teste Usuário A',
      });
      await setupDb.doc('draw_snapshots/snap_100').set({
        ownerUid: 'user_emu_a',
        rosterHash: 'hash_sha256_oficial',
      });
    });

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
    if (errEmu03.code === 'permission-denied' || errEmu03.code === 'PERMISSION_DENIED' || errEmu03.message.includes('permission-denied')) {
      console.log('✓ [PASS] EMU-03: Acesso IDOR cruzado rejeitado por permission-denied.');
      passedCount++;
    } else {
      throw new Error(`EMU-03 falhou com código inesperado: ${errEmu03.code}`);
    }

    // EMU-04: Usuário B tentando alterar a campanha do Usuário A
    console.log('\n--- [EMU-04] Tentativa de Usurpação de Campanha (User B -> User A) ---');
    const userBDb = testEnv.authenticatedContext('user_emu_b').firestore();
    const errEmu04 = await assertFails(
      userBDb.doc('campaigns/camp_user_a').update({
        title: 'Campanha Usurpada',
      })
    );
    if (errEmu04.code === 'permission-denied' || errEmu04.code === 'PERMISSION_DENIED' || errEmu04.message.includes('permission-denied')) {
      console.log('✓ [PASS] EMU-04: Usurpação de campanha rejeitada por permission-denied.');
      passedCount++;
    } else {
      throw new Error(`EMU-04 falhou com código inesperado: ${errEmu04.code}`);
    }

    // EMU-05: Tentativa de atualizar snapshot imutável
    console.log('\n--- [EMU-05] Imutabilidade de Snapshot (/draw_snapshots/snap_100) ---');
    const errEmu05 = await assertFails(
      userADb.doc('draw_snapshots/snap_100').update({
        rosterHash: 'hash_fraudulento',
      })
    );
    if (errEmu05.code === 'permission-denied' || errEmu05.code === 'PERMISSION_DENIED' || errEmu05.message.includes('permission-denied')) {
      console.log('✓ [PASS] EMU-05: Alteração em snapshot imutável rejeitada por permission-denied.');
      passedCount++;
    } else {
      throw new Error(`EMU-05 falhou com código inesperado: ${errEmu05.code}`);
    }

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
    console.log('✓ [PASS] EMU-06: Gravação privileged via Admin SDK efetuada no Emulator.');
    passedCount++;

    console.log(`\n================================================================`);
    console.log(`  RESULTADO EMULADOR OFICIAL: ${passedCount}/${totalScenarios} cenario(s) aprovados.`);
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
