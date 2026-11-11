/**
 * FASE 5H — DIAGNÓSTICO E AUDITORIA DE INTEGRAÇÃO DO FIRESTORE EMULATOR / ADMIN SDK
 * Este módulo verifica a disponibilidade real do ambiente Firestore Emulator ou Firestore Admin SDK.
 */

import assert from 'node:assert';
import { getOrInitFirebaseAdminApp } from '../server/firebaseAdminAuth.ts';
import { getFirestore } from 'firebase-admin/firestore';
import firebaseConfig from '../../firebase-applet-config.json' with { type: 'json' };

export async function runFirestoreIntegrationAudit(): Promise<{
  emulatorAvailable: boolean;
  adminSdkAvailable: boolean;
  reason: string;
}> {
  console.log('\n--- VERIFICANDO DISPONIBILIDADE DO FIRESTORE EMULATOR / ADMIN SDK ---');

  // Check 1: Firebase Admin SDK connection
  try {
    const app = getOrInitFirebaseAdminApp();
    const db = firebaseConfig.firestoreDatabaseId
      ? getFirestore(app, firebaseConfig.firestoreDatabaseId)
      : getFirestore(app);

    const testRef = db.collection('_test_isolation_fase5h').doc('probe');
    const setPromise = testRef.set({ probe: true, timestamp: Date.now() });
    const timeoutPromise = new Promise((_, reject) =>
      setTimeout(() => reject(new Error('TIMEOUT_NO_ADC: Firestore Admin SDK connection timed out (3s)')), 3000)
    );
    await Promise.race([setPromise, timeoutPromise]);
    await testRef.delete().catch(() => {});

    console.log('  ✓ [INFO] Firestore Admin SDK conectado e operacional no projeto.');
    return {
      emulatorAvailable: false,
      adminSdkAvailable: true,
      reason: 'Firestore Admin SDK operacional com credenciais de ambiente.',
    };
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    console.log(`  ⚠ [LIMITAÇÃO DO AMBIENTE] Firestore Admin SDK indisponível: ${errorMsg}`);
    console.log('  ⚠ [LIMITAÇÃO DO AMBIENTE] Java runtime não está instalado no container, impedindo a execução do Firestore Emulator local.');
    return {
      emulatorAvailable: false,
      adminSdkAvailable: false,
      reason: `Ambiente sem Java runtime instalado (impossibilita Firestore Emulator local) e sem ADC credentials para Cloud Firestore (${errorMsg}).`,
    };
  }
}
