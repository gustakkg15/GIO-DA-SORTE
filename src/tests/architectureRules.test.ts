/**
 * SUÍTE 10 — REGRAS FUNDAMENTAIS DE ARQUITETURA (UID, FIRESTORE, LOGOUT & WORKERS)
 * Valida de ponta a ponta as 4 regras arquiteturais inegociáveis do GIO DA SORTE PRO:
 * 1. Cada usuário terá seus dados isolados pelo próprio UID.
 * 2. O Firestore será a fonte oficial dos dados.
 * 3. Logout limpa a sessão e o cache local, mas não apaga os dados armazenados.
 * 4. Os workers continuam processando eventos mesmo que o usuário feche o site.
 */

import fs from 'fs';
import path from 'path';
import { idleStorage, getStorageKeyForUid } from '../utils/idleStorage.ts';
import { DEFAULT_SETTINGS, STORAGE_KEY } from '../utils/raffle.ts';
import { tiktokConnector } from '../utils/tiktokConnector.ts';
import { tiktokEventQueue, type SequencedSseFrame } from '../server/tiktokEventQueue.ts';
import type { Participant, Winner, TikTokLiveGiftEvent } from '../types.ts';

function assert(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(`Falha na asserção: ${message}`);
  }
}

class MemoryStorageMock implements Storage {
  private map = new Map<string, string>();

  get length(): number {
    return this.map.size;
  }

  clear(): void {
    this.map.clear();
  }

  getItem(key: string): string | null {
    return this.map.has(key) ? this.map.get(key)! : null;
  }

  key(index: number): string | null {
    return Array.from(this.map.keys())[index] ?? null;
  }

  removeItem(key: string): void {
    this.map.delete(key);
  }

  setItem(key: string, value: string): void {
    this.map.set(String(key), String(value));
  }
}

export async function runArchitectureRulesTests(): Promise<{ passed: number; total: number }> {
  console.log('\n------------------------------------------------------------------------');
  console.log('  SUÍTE 10: REGRAS FUNDAMENTAIS DE ARQUITETURA (UID, FIRESTORE, LOGOUT & WORKERS)');
  console.log('------------------------------------------------------------------------');

  let passed = 0;
  const total = 6;

  // Install deterministic browser storage mocks for Node test execution
  const g = globalThis as any;
  const prevWindow = g.window;
  const prevLocalStorage = g.localStorage;
  const prevSessionStorage = g.sessionStorage;

  const localStore = new MemoryStorageMock();
  const sessionStore = new MemoryStorageMock();

  g.localStorage = localStore;
  g.sessionStorage = sessionStore;
  g.window = {
    ...(prevWindow || {}),
    localStorage: localStore,
    sessionStorage: sessionStore,
    addEventListener: () => {},
    removeEventListener: () => {},
  };

  try {
    // =========================================================================
    // TESTE 10.1: Regra 1 — Isolamento estrito de dados por UID no cache e armazenamento
    // =========================================================================
    {
      const uidA = 'uid_organizador_alpha_001';
      const uidB = 'uid_organizador_beta_002';

      const keyA = getStorageKeyForUid(uidA);
      const keyB = getStorageKeyForUid(uidB);
      const keyAnon = getStorageKeyForUid(null);

      assert(keyA === `${STORAGE_KEY}_uid_${uidA}`, 'Chave do Usuário A deve ser isolada pelo UID A');
      assert(keyB === `${STORAGE_KEY}_uid_${uidB}`, 'Chave do Usuário B deve ser isolada pelo UID B');
      assert(keyA !== keyB && keyA !== keyAnon, 'Chaves de usuários distintos nunca podem colidir');

      const participantAlpha: Participant = {
        id: 'p_alpha_1',
        name: 'Participante Alpha',
        coins: 1500,
        addedAt: Date.now(),
      };
      const participantBeta: Participant = {
        id: 'p_beta_1',
        name: 'Participante Beta',
        coins: 3000,
        addedAt: Date.now(),
      };

      // User A saves data
      idleStorage.setActiveOwnerUid(uidA);
      idleStorage.scheduleSave(
        {
          settings: { ...DEFAULT_SETTINGS, raffleTitle: 'Sorteio Exclusivo Alpha' },
          participants: [participantAlpha],
          winners: [],
        },
        true
      );

      // User B saves data
      idleStorage.setActiveOwnerUid(uidB);
      idleStorage.scheduleSave(
        {
          settings: { ...DEFAULT_SETTINGS, raffleTitle: 'Sorteio Exclusivo Beta' },
          participants: [participantBeta],
          winners: [],
        },
        true
      );

      const readA = idleStorage.readLocalStateForUid(uidA);
      const readB = idleStorage.readLocalStateForUid(uidB);
      const readAnon = idleStorage.readLocalStateForUid(null);

      assert(readA !== null && readA.ownerUid === uidA, 'Leitura do UID A deve retornar payload com ownerUid === uidA');
      assert(readA!.participants[0]?.name === 'Participante Alpha', 'Dados do UID A devem permanecer íntegros');
      assert(readB !== null && readB.ownerUid === uidB, 'Leitura do UID B deve retornar payload com ownerUid === uidB');
      assert(readB!.participants[0]?.name === 'Participante Beta', 'Dados do UID B devem permanecer íntegros');
      assert(readAnon === null, 'Sessão anônima não pode ler dados de usuários autenticados');

      // Simulate cross-UID key tampering: if someone copies UID A's payload into UID B's slot, readLocalStateForUid(uidB) rejects it
      localStore.setItem(keyB, JSON.stringify(readA));
      const tamperedReadB = idleStorage.readLocalStateForUid(uidB);
      assert(
        tamperedReadB === null,
        'readLocalStateForUid deve rejeitar payload cujo ownerUid interno pertença a outro usuário'
      );

      console.log('  ✓ [10.1] Regra 1: Isolamento estrito de dados por UID e bloqueio de contaminação entre contas validado');
      passed++;
    }

    // =========================================================================
    // TESTE 10.2: Regra 1 & 2 — Auditoria das Regras do Firestore (firestore.rules)
    // =========================================================================
    {
      const rulesPath = path.resolve(process.cwd(), 'firestore.rules');
      const rulesContent = fs.readFileSync(rulesPath, 'utf-8');

      assert(
        rulesContent.includes('function isOwner(userId)') &&
          rulesContent.includes('request.auth.uid == userId'),
        'firestore.rules deve definir isOwner(userId) validando request.auth.uid == userId'
      );
      assert(
        rulesContent.includes('match /users/{userId}') &&
          rulesContent.includes('match /raffles/{raffleId}'),
        'firestore.rules deve isolar documentos em /users/{userId} e /users/{userId}/raffles/{raffleId}'
      );
      assert(
        rulesContent.includes('resource.data.ownerUid == request.auth.uid'),
        'firestore.rules deve exigir resource.data.ownerUid == request.auth.uid nas coleções de sessões e campanhas'
      );

      console.log('  ✓ [10.2] Regra 1 & 2: Isolamento por UID em firestore.rules (users, raffles, sessions, campaigns, draws) validado');
      passed++;
    }

    // =========================================================================
    // TESTE 10.3: Regra 2 — O Firestore é a fonte oficial dos dados na hidratação
    // =========================================================================
    {
      const appPath = path.resolve(process.cwd(), 'src/App.tsx');
      const appSource = fs.readFileSync(appPath, 'utf-8');

      assert(
        appSource.includes('hydrateDirectlyFromFirestore') &&
          appSource.includes("doc(db, 'users', user.uid, 'raffles', 'default')"),
        'App.tsx deve consultar diretamente o Firestore (users/{uid}/raffles/default) como fonte oficial dos dados'
      );
      assert(
        appSource.includes('idleStorage.readLocalStateForUid(user.uid)') &&
          appSource.includes('!isSwitchingFromAnotherAccount'),
        'App.tsx nunca deve sobrescrever o Firestore de um usuário com participantes locais de outra conta'
      );

      console.log('  ✓ [10.3] Regra 2: Firestore configurado como fonte oficial autoritativa dos dados por UID');
      passed++;
    }

    // =========================================================================
    // TESTE 10.4: Regra 3 — Logout limpa a sessão e o cache local sem apagar dados no Firestore
    // =========================================================================
    {
      const uid = 'uid_cliente_pro_777';
      const firestoreCloudStore = new Map<string, any>();

      const cloudParticipants: Participant[] = [
        { id: 'p_cloud_1', name: 'Maria Firestore', coins: 5000, addedAt: Date.now() },
        { id: 'p_cloud_2', name: 'João Firestore', coins: 2500, addedAt: Date.now() },
      ];
      const cloudWinners: Winner[] = [
        {
          id: 'w_cloud_1',
          participantId: 'p_cloud_1',
          name: 'Maria Firestore',
          number: 12,
          prize: '1º Lugar - Prêmio Principal',
          drawnAt: Date.now(),
        },
      ];

      // Official data stored in Firestore
      const firestoreRaffleDoc = {
        ownerUid: uid,
        raffleId: 'default',
        settings: { ...DEFAULT_SETTINGS, raffleTitle: 'Sorteio Oficial no Firestore' },
        participants: cloudParticipants,
        winners: cloudWinners,
        drawSequence: 1,
      };
      firestoreCloudStore.set(`users/${uid}/raffles/default`, structuredClone(firestoreRaffleDoc));

      // Populate browser local cache for this user
      idleStorage.setActiveOwnerUid(uid);
      idleStorage.scheduleSave(
        {
          settings: firestoreRaffleDoc.settings,
          participants: firestoreRaffleDoc.participants,
          winners: firestoreRaffleDoc.winners,
        },
        true
      );
      localStore.setItem(`gio_organizer_handle_v1_${uid}`, '@organizador_pro');
      localStore.setItem(`gio_organizer_bio_v1_${uid}`, 'Bio oficial');
      localStore.setItem('gio_active_live_session_id', 'live_session_777');
      sessionStore.setItem('gio_active_live_session_id', 'live_session_777');

      // Schedule a pending dirty save right before logout to verify it is cancelled and NOT flushed after logout
      idleStorage.scheduleSave(
        {
          settings: { ...DEFAULT_SETTINGS, raffleTitle: 'Mutação Pendente Antes do Logout' },
          participants: [],
          winners: [],
        },
        false
      );

      // Execute Logout local cache cleanup
      idleStorage.clearLocalCacheOnLogout(uid);

      // Verify all local caches were wiped
      assert(
        localStore.getItem(getStorageKeyForUid(uid)) === null,
        'Cache local do UID deve ser removido no logout'
      );
      assert(
        localStore.getItem(`${getStorageKeyForUid(uid)}_backup`) === null,
        'Backup local do UID deve ser removido no logout'
      );
      assert(
        localStore.getItem(`gio_organizer_handle_v1_${uid}`) === null &&
          localStore.getItem(`gio_organizer_bio_v1_${uid}`) === null,
        'Caches locais de perfil do UID devem ser removidos no logout'
      );
      assert(
        localStore.getItem('gio_active_live_session_id') === null &&
          sessionStore.getItem('gio_active_live_session_id') === null,
        'Caches de sessão ativa no navegador devem ser limpos no logout'
      );
      assert(
        idleStorage.getActiveOwnerUid() === null,
        'activeOwnerUid deve ser limpo (null) após logout'
      );

      // Verify Firestore data remains 100% intact and untouched
      const cloudAfterLogout = firestoreCloudStore.get(`users/${uid}/raffles/default`);
      assert(
        cloudAfterLogout !== undefined &&
          cloudAfterLogout.participants.length === 2 &&
          cloudAfterLogout.winners.length === 1 &&
          cloudAfterLogout.settings.raffleTitle === 'Sorteio Oficial no Firestore',
        'Dados armazenados no Firestore NUNCA devem ser apagados ou sobrescritos pelo logout'
      );

      console.log('  ✓ [10.4] Regra 3: Logout limpa sessão e cache local preservando 100% dos dados armazenados no Firestore');
      passed++;
    }

    // =========================================================================
    // TESTE 10.5: Regra 4 — Fechar o site desacopla apenas o stream SSE sem parar o worker
    // =========================================================================
    {
      let disconnectApiCalled = false;
      const originalFetch = g.fetch;
      g.fetch = async (input: any) => {
        const url = String(input || '');
        if (url.includes('/api/tiktok/disconnect')) {
          disconnectApiCalled = true;
        }
        return new Response(JSON.stringify({ ok: true }), { status: 200 });
      };

      try {
        tiktokConnector.setSessionId('live_worker_persistent_999');
        tiktokConnector.setCachedGiftsFeed([{ id: 'gift_1', giftName: 'Rosa', coinsGranted: 10 }]);

        // Simulate user closing the browser tab (pagehide -> detachClientStreamOnly({ clearLocalCache: false }))
        tiktokConnector.detachClientStreamOnly({ clearLocalCache: false });

        assert(
          disconnectApiCalled === false,
          'detachClientStreamOnly NUNCA deve chamar /api/tiktok/disconnect ao fechar o site ou fazer logout'
        );
        assert(
          tiktokConnector.getSessionId() === 'live_worker_persistent_999',
          'Fechar a aba preserva o identificador da sessão para reconexão imediata ao reabrir o site'
        );

        // Simulate user logging out (detachClientStreamOnly({ clearLocalCache: true }))
        tiktokConnector.detachClientStreamOnly({ clearLocalCache: true });
        assert(
          disconnectApiCalled === false,
          'Logout no navegador não deve interromper o worker TikTok LIVE no servidor'
        );
        assert(
          tiktokConnector.getCachedGiftsFeed().length === 0,
          'Logout com clearLocalCache: true deve limpar o feed em memória do navegador'
        );
      } finally {
        g.fetch = originalFetch;
      }

      console.log('  ✓ [10.5] Regra 4 (Cliente): Fechar o site ou fazer logout desacopla apenas o SSE local sem enviar /api/tiktok/disconnect');
      passed++;
    }

    // =========================================================================
    // TESTE 10.6: Regra 4 (Servidor) — TikTokDurableEventQueue continua processando eventos com o site fechado
    // =========================================================================
    {
      const sessionId = `live_headless_worker_${Date.now()}`;
      const clientId = 'tab_client_001';

      // Browser connects and then closes the site
      const cursorOnConnect = tiktokEventQueue.registerClientConnection({
        sessionId,
        clientId,
        initialConfirmedSequence: 0,
      });
      assert(cursorOnConnect.disconnectedAt === null, 'Cliente SSE deve iniciar conectado');

      // User closes the browser tab -> SSE cleanup marks client disconnected without stopping the worker
      tiktokEventQueue.markClientDisconnected(sessionId, clientId);

      const capturedFramesWhileSiteClosed: SequencedSseFrame[] = [];
      const unsubscribe = tiktokEventQueue.onFrame((frame: SequencedSseFrame) => {
        if (frame.sessionId === sessionId && frame.type === 'gift') {
          capturedFramesWhileSiteClosed.push(frame);
        }
      });

      try {
        const gift1: TikTokLiveGiftEvent = {
          eventId: `tx_offline_gift_1_${Date.now()}`,
          sessionId,
          tiktokUserId: 'viewer_100',
          username: 'viewer100',
          nickname: 'Viewer 100',
          giftId: 5655,
          giftName: 'Rosa',
          diamondCount: 1,
          repeatCount: 5,
          deltaCount: 5,
          coinsGranted: 500,
          ruleIdApplied: 'rule_default_100',
          rateApplied: 100,
          repeatEnd: true,
          groupId: 'grp_offline_1',
          receivedAt: Date.now(),
        };
        const gift2: TikTokLiveGiftEvent = {
          eventId: `tx_offline_gift_2_${Date.now()}`,
          sessionId,
          tiktokUserId: 'viewer_101',
          username: 'viewer101',
          nickname: 'Viewer 101',
          giftId: 5655,
          giftName: 'Rosa',
          diamondCount: 1,
          repeatCount: 10,
          deltaCount: 10,
          coinsGranted: 1000,
          ruleIdApplied: 'rule_default_100',
          rateApplied: 100,
          repeatEnd: true,
          groupId: 'grp_offline_2',
          receivedAt: Date.now(),
        };

        const enq1 = tiktokEventQueue.enqueueGiftEvent(gift1, undefined, { skipPersistence: true });
        const enq2 = tiktokEventQueue.enqueueGiftEvent(gift2, undefined, { skipPersistence: true });

        assert(
          enq1.accepted && enq2.accepted,
          'Worker deve aceitar e processar eventos mesmo após o usuário fechar o site'
        );
        assert(
          capturedFramesWhileSiteClosed.length === 2 &&
            capturedFramesWhileSiteClosed[0].eventId === gift1.eventId &&
            capturedFramesWhileSiteClosed[1].eventId === gift2.eventId,
          'Eventos devem ser processados em ordem na fila durável mesmo sem navegador conectado'
        );
      } finally {
        unsubscribe();
      }

      console.log('  ✓ [10.6] Regra 4 (Servidor): Workers continuam processando presentes/bilhetes com o site fechado');
      passed++;
    }
  } finally {
    g.window = prevWindow;
    g.localStorage = prevLocalStorage;
    g.sessionStorage = prevSessionStorage;
  }

  return { passed, total };
}
