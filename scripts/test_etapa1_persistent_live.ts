/**
 * SUÍTE DE VALIDAÇÃO AUTOMATIZADA — ETAPA 1: CONEXÃO LIVE PERSISTENTE
 * GIO DA SORTE PRO
 *
 * Cobre todos os 10 testes obrigatórios autorizados na Etapa 1:
 * 1. Conectar uma LIVE e navegar por todas as páginas sem desconectar.
 * 2. Alternar entre TikTok LIVE, Sorteios, Participantes e Assinatura.
 * 3. Atualizar o navegador com F5 e recuperar o mesmo sessionId.
 * 4. Simular queda do SSE e reconexão com emissão de novo ticket.
 * 5. Confirmar que nenhum Firebase ID Token aparece em URL ou log.
 * 6. Confirmar que não existem conexões Webcast duplicadas.
 * 7. Simular reinício do backend e verificar recuperação segura (sessão persistida vs Webcast ativo).
 * 8. Testar concorrência entre chamadas simultâneas de conexão.
 * 9. Verificar que eventos não são duplicados nem perdidos (WAL, Outbox, Cursores, Replay).
 * 10. Executar testes de regressão (regras comerciais, planos R$ 29,90 / R$ 199,90, trial 7 dias).
 */

import { spawn, ChildProcess } from 'child_process';
import {
  issueSseStreamTicket,
  consumeSseStreamTicket,
  sanitizeTicketForLog,
} from '../src/server/sseTicketService.js';
import { mercadoPagoSubscriptionService } from '../src/server/mercadoPagoSubscriptionService.js';
import { UserSubscriptionRecord } from '../src/types.js';
import { getOrCreateLiveSession } from '../src/utils/tiktokLiveService.js';
import { TikTokWebSocketClient, TikTokEventBus, TikTokLiveConnector } from '../src/utils/tiktokConnector.js';
import { auth } from '../src/firebase.js';

const BASE_URL = 'http://127.0.0.1:3000';
const TEST_UID = 'etapa1_pro_organizer_uid';
const TEST_EMAIL = 'etapa1_pro@test.local';
const LOOPBACK_TOKEN = `gio_loopback_test_token:valid:${TEST_UID}:${TEST_EMAIL}`;

const AUTH_HEADERS: Record<string, string> = {
  'Content-Type': 'application/json',
  Authorization: `Bearer ${LOOPBACK_TOKEN}`,
  'x-gio-loopback-test-suite': 'etapa1',
};

interface TestCaseResult {
  id: string;
  category: string;
  description: string;
  passed: boolean;
  details?: string;
}

const results: TestCaseResult[] = [];

function recordTest(
  id: string,
  category: string,
  description: string,
  condition: boolean,
  details?: string
) {
  const passed = Boolean(condition);
  results.push({ id, category, description, passed, details });
  const badge = passed ? '✓ [PASS]' : '✗ [FAIL]';
  console.log(`  ${badge} [${id}] ${description}${details ? ` — ${details}` : ''}`);
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

class HeadlessCDPClient {
  private ws!: WebSocket;
  private nextId = 1;
  private callbacks = new Map<number, (res: any) => void>();
  public networkUrls: string[] = [];
  public consoleLogs: string[] = [];

  async connect(targetUrl: string): Promise<void> {
    const listRes = await fetch('http://127.0.0.1:9229/json/list');
    const targets = await listRes.json();
    let target = targets.find((t: any) => t.type === 'page');
    if (!target) {
      const newRes = await fetch(`http://127.0.0.1:9229/json/new?${encodeURIComponent(targetUrl)}`);
      target = await newRes.json();
    }
    return new Promise((resolve, reject) => {
      this.ws = new WebSocket(target.webSocketDebuggerUrl);
      this.ws.onopen = () => resolve();
      this.ws.onerror = (err) => reject(err);
      this.ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data.toString());
          if (msg.id && this.callbacks.has(msg.id)) {
            const cb = this.callbacks.get(msg.id)!;
            this.callbacks.delete(msg.id);
            cb(msg.result || msg.error);
          } else if (msg.method === 'Network.requestWillBeSent') {
            const reqUrl = msg.params?.request?.url || '';
            if (reqUrl) this.networkUrls.push(reqUrl);
          } else if (msg.method === 'Runtime.consoleAPICalled') {
            const text = (msg.params?.args || [])
              .map((a: any) => a.value || a.description || '')
              .join(' ');
            this.consoleLogs.push(text);
          }
        } catch {
          // ignore
        }
      };
    });
  }

  send(method: string, params: any = {}): Promise<any> {
    return new Promise((resolve) => {
      const id = this.nextId++;
      this.callbacks.set(id, resolve);
      this.ws.send(JSON.stringify({ id, method, params }));
    });
  }

  async evaluate(expression: string): Promise<any> {
    const res = await this.send('Runtime.evaluate', {
      expression,
      returnByValue: true,
      awaitPromise: true,
    });
    return res?.result?.value;
  }

  close() {
    try {
      this.ws.close();
    } catch {
      // ignore
    }
  }
}

async function runEtapa1Suite() {
  console.log('\n================================================================================');
  console.log('  GIO DA SORTE PRO — SUÍTE DE VALIDAÇÃO ETAPA 1 (CONEXÃO LIVE PERSISTENTE)');
  console.log('================================================================================\n');

  const now = Date.now();

  // 0. Provisionar assinatura PRO ativa para o usuário de teste
  const proSubscription: UserSubscriptionRecord = {
    uid: TEST_UID,
    email: TEST_EMAIL,
    emailVerified: true,
    planId: 'pro_monthly',
    planName: 'GIO DA SORTE PRO Mensal',
    tier: 'PRO',
    statusState: 'ACTIVE',
    billingSubStatus: 'PAID_ACTIVE',
    mpPreapprovalId: 'mp_etapa1_sub_001',
    mpPlanId: 'mp_plan_monthly',
    remoteMpStatus: 'authorized',
    checkoutInitPoint: null,
    contractedPriceVersion: 'v1.0.0',
    contractedAmount: 29.90,
    currency: 'BRL',
    frequency: 1,
    frequencyType: 'months',
    trialApplied: false,
    trialDaysGranted: 0,
    trialStartDate: null,
    trialEndDate: null,
    firstPaymentDate: new Date(now - 86400000).toISOString(),
    nextPaymentDate: new Date(now + 29 * 86400000).toISOString(),
    currentPeriodStart: new Date(now - 86400000).toISOString(),
    currentPeriodEnd: new Date(now + 29 * 86400000).toISOString(),
    cancelAtPeriodEnd: false,
    canceledAt: null,
    hasUsedFreeTrial: false,
    firstTrialStartedAt: null,
    firstTrialPreapprovalId: null,
    firstTrialPlanId: null,
    acceptedTermsVersion: '1.0.0',
    acceptedAt: now,
    chargedQuantity: 1,
    chargedAmount: 29.90,
    updatedAt: now,
  };
  await mercadoPagoSubscriptionService.saveUserSubscriptionRecord(proSubscription);

  const testSessionId = `live_etapa1_${now}`;
  const testRuleId = 'rule_etapa1_50';
  const testRate = 50;
  const testCreator = 'gioborelli';

  // Criar sessão persistida no Firestore vinculada ao ownerUid
  await getOrCreateLiveSession(testSessionId, testCreator, testRate, testRuleId, TEST_UID);

  // ============================================================================
  // TESTE 5: Confirmar que nenhum Firebase ID Token aparece em URL ou log
  // ============================================================================
  console.log('--- 1. SEGURANÇA DO HANDSHAKE SSE E AUSÊNCIA DE TOKEN NA URL ---');

  const forbiddenUrlRes = await fetch(`${BASE_URL}/api/tiktok/stream?idToken=${LOOPBACK_TOKEN}&sessionId=${testSessionId}`);
  const forbiddenUrlBody = await forbiddenUrlRes.json().catch(() => ({}));
  recordTest(
    'T5.1',
    'Segurança SSE',
    'GET /api/tiktok/stream rejeita imediatamente idToken na query string com HTTP 400',
    forbiddenUrlRes.status === 400 && forbiddenUrlBody.code === 'FIREBASE_TOKEN_IN_URL_FORBIDDEN',
    `HTTP ${forbiddenUrlRes.status} (${forbiddenUrlBody.code})`
  );

  // Emitir ticket via POST /api/tiktok/stream/ticket com Bearer Auth
  const ticketRes1 = await fetch(`${BASE_URL}/api/tiktok/stream/ticket`, {
    method: 'POST',
    headers: AUTH_HEADERS,
    body: JSON.stringify({ sessionId: testSessionId }),
  });
  const ticketData1 = await ticketRes1.json();
  recordTest(
    'T5.2',
    'Segurança SSE',
    'POST /api/tiktok/stream/ticket emite ticket temporário de curta duração (<= 30s) via Authorization Bearer',
    ticketRes1.status === 200 &&
      typeof ticketData1.ticket === 'string' &&
      ticketData1.ticket.startsWith('tk_sse_') &&
      ticketData1.expiresInSec <= 30 &&
      ticketData1.sessionId === testSessionId,
    `expiresInSec=${ticketData1.expiresInSec}s, sessionId=${ticketData1.sessionId}`
  );

  // Verificar que buildSseUrlWithTicket no TikTokWebSocketClient nunca inclui idToken
  const wsClient = new TikTokWebSocketClient('/api/tiktok/stream');
  const builtUrl = wsClient.buildSseUrlWithTicket(ticketData1.ticket, testSessionId, 4);
  recordTest(
    'T5.3',
    'Segurança SSE',
    'TikTokWebSocketClient.buildSseUrlWithTicket usa exclusivamente ticket descartável e nunca inclui idToken na URL',
    builtUrl.includes('ticket=tk_sse_') &&
      !builtUrl.includes('idToken') &&
      !builtUrl.includes(LOOPBACK_TOKEN) &&
      builtUrl.includes(`sessionId=${testSessionId}`) &&
      builtUrl.includes('lastConfirmedCursor='),
    `URL gerada sem idToken (contém ticket, sessionId, clientId e lastConfirmedCursor)`
  );

  const sanitizedLog = sanitizeTicketForLog(ticketData1.ticket);
  recordTest(
    'T5.4',
    'Segurança SSE',
    'Tickets nunca aparecem integralmente nos logs (sanitizeTicketForLog mascara o segredo)',
    sanitizedLog !== ticketData1.ticket && sanitizedLog.includes('...'),
    `Sanitizado: ${sanitizedLog}`
  );

  // ============================================================================
  // TESTE 4: Simular queda do SSE e reconexão com emissão de novo ticket
  // ============================================================================
  console.log('\n--- 2. QUEDA DO SSE, CONSUMO ATÔMICO E RECONEXÃO COM NOVO TICKET ---');

  // Abrir conexão SSE usando ticketData1.ticket
  const abortController1 = new AbortController();
  const sseRes1 = await fetch(`${BASE_URL}${builtUrl}`, {
    headers: { Accept: 'text/event-stream' },
    signal: abortController1.signal,
  });
  recordTest(
    'T4.1',
    'Reconexão SSE',
    'Primeira conexão SSE abre com sucesso (HTTP 200 text/event-stream) consumindo o ticket #1',
    sseRes1.status === 200 && (sseRes1.headers.get('content-type') || '').includes('text/event-stream'),
    `HTTP ${sseRes1.status}`
  );

  // Simular queda do SSE abortando o stream 1
  abortController1.abort();
  await sleep(100);

  // Tentar reutilizar o MESMO ticket #1 em uma reconexão (deve falhar com 401 SSE_TICKET_REUSED)
  const reuseRes = await fetch(`${BASE_URL}${builtUrl}`);
  const reuseBody = await reuseRes.json().catch(() => ({}));
  recordTest(
    'T4.2',
    'Reconexão SSE',
    'Tentativa de reutilizar o ticket #1 após queda do SSE é bloqueada atomicamente (HTTP 401 SSE_TICKET_REUSED)',
    reuseRes.status === 401 && reuseBody.code === 'SSE_TICKET_REUSED',
    `HTTP ${reuseRes.status} (${reuseBody.code})`
  );

  // Reconexão solicita um NOVO ticket #2 via POST /api/tiktok/stream/ticket
  const ticketRes2 = await fetch(`${BASE_URL}/api/tiktok/stream/ticket`, {
    method: 'POST',
    headers: AUTH_HEADERS,
    body: JSON.stringify({ sessionId: testSessionId }),
  });
  const ticketData2 = await ticketRes2.json();
  const builtUrl2 = wsClient.buildSseUrlWithTicket(ticketData2.ticket, testSessionId, 4);

  const abortController2 = new AbortController();
  const sseRes2 = await fetch(`${BASE_URL}${builtUrl2}`, {
    headers: { Accept: 'text/event-stream' },
    signal: abortController2.signal,
  });
  recordTest(
    'T4.3',
    'Reconexão SSE',
    'Reconexão SSE emite novo ticket #2 distinto do #1 e restabelece o stream com sucesso',
    ticketData2.ticket !== ticketData1.ticket && sseRes2.status === 200,
    `Ticket #1 != Ticket #2, Reconexão HTTP ${sseRes2.status}`
  );
  abortController2.abort();

  // ============================================================================
  // TESTES 6 & 8: Concorrência e proteção contra conexões Webcast duplicadas
  // ============================================================================
  console.log('\n--- 3. CONCORRÊNCIA E PREVENÇÃO DE CONEXÕES WEBCAST DUPLICADAS ---');

  // Disparar 5 chamadas simultâneas para POST /api/tiktok/connect para a mesma sessão/usuário
  const concurrentConnectPromises = Array.from({ length: 5 }, () =>
    fetch(`${BASE_URL}/api/tiktok/connect`, {
      method: 'POST',
      headers: AUTH_HEADERS,
      body: JSON.stringify({
        username: testCreator,
        sessionId: testSessionId,
        currentRate: testRate,
        ruleId: testRuleId,
      }),
    }).then(async (r) => ({ status: r.status, body: await r.json().catch(() => ({})) }))
  );

  const concurrentResults = await Promise.all(concurrentConnectPromises);
  const allSucceededOrCoalesced = concurrentResults.every(
    (r) => r.status === 200 && r.body.status?.sessionId === testSessionId
  );

  const statusAfterConcurrentRes = await fetch(
    `${BASE_URL}/api/tiktok/status?sessionId=${encodeURIComponent(testSessionId)}`,
    { headers: AUTH_HEADERS }
  );
  const statusAfterConcurrent = await statusAfterConcurrentRes.json();

  recordTest(
    'T8.1',
    'Concorrência',
    '5 chamadas simultâneas a POST /api/tiktok/connect são serializadas/coalescidas sem erro e preservam o mesmo sessionId',
    allSucceededOrCoalesced && statusAfterConcurrent.sessionId === testSessionId,
    `Respostas HTTP: [${concurrentResults.map((r) => r.status).join(', ')}], sessionId=${statusAfterConcurrent.sessionId}`
  );

  recordTest(
    'T6.1',
    'Prevenção de Duplicidade',
    'Nenhuma instância duplicada de TikTokLiveConnection é criada sob chamadas concorrentes (activeWebcastInstancesCount <= 1)',
    typeof statusAfterConcurrent.activeWebcastInstancesCount === 'number' &&
      statusAfterConcurrent.activeWebcastInstancesCount <= 1,
    `activeWebcastInstancesCount=${statusAfterConcurrent.activeWebcastInstancesCount}`
  );

  // Teste de concorrência entre múltiplas instâncias do backend (instanceId secundário)
  const crossInstanceRes = await fetch(`${BASE_URL}/api/tiktok/connect`, {
    method: 'POST',
    headers: AUTH_HEADERS,
    body: JSON.stringify({
      username: testCreator,
      sessionId: testSessionId,
      currentRate: testRate,
      ruleId: testRuleId,
      instanceId: 'cloud_run_instance_secondary_02',
    }),
  });
  const crossInstanceData = await crossInstanceRes.json();

  recordTest(
    'T8.2',
    'Concorrência Multi-Instância',
    'Lock distribuído no Firestore impede que uma segunda instância do backend abra Webcast duplicado para a mesma sessão (coalescedCrossInstance=true)',
    crossInstanceRes.status === 200 &&
      crossInstanceData.coalescedCrossInstance === true &&
      crossInstanceData.sessionId === testSessionId,
    `coalescedCrossInstance=${crossInstanceData.coalescedCrossInstance}, sessionId=${crossInstanceData.sessionId}`
  );

  recordTest(
    'T3.1',
    'Contrato /api/tiktok/status',
    'GET /api/tiktok/status retorna sessionId, activeRuleId, currentRate, webcastActive e persistedSessionActive',
    statusAfterConcurrent.sessionId === testSessionId &&
      statusAfterConcurrent.activeRuleId === testRuleId &&
      statusAfterConcurrent.currentRate === testRate &&
      typeof statusAfterConcurrent.webcastActive === 'boolean' &&
      statusAfterConcurrent.persistedSessionActive === true,
    `sessionId=${statusAfterConcurrent.sessionId}, activeRuleId=${statusAfterConcurrent.activeRuleId}, currentRate=${statusAfterConcurrent.currentRate}, webcastActive=${statusAfterConcurrent.webcastActive}, persistedSessionActive=${statusAfterConcurrent.persistedSessionActive}`
  );

  // ============================================================================
  // TESTE 9: Verificar que eventos não são duplicados nem perdidos (WAL, Outbox, Replay)
  // ============================================================================
  console.log('\n--- 4. PRESERVAÇÃO DE EVENTOS, WAL, OUTBOX, DEDUPLICAÇÃO E REPLAY ---');

  const uniqueMsgId1 = `msg_etapa1_${now}_001`;
  const uniqueMsgId2 = `msg_etapa1_${now}_002`;

  // Enviar Presente #1 via /api/tiktok/test-event
  const simRes1 = await fetch(`${BASE_URL}/api/tiktok/test-event`, {
    method: 'POST',
    headers: AUTH_HEADERS,
    body: JSON.stringify({
      sessionId: testSessionId,
      msgId: uniqueMsgId1,
      user: {
        userId: '9001001',
        uniqueId: 'apoiador_etapa1_a',
        nickname: 'Apoiador Etapa 1 A',
      },
      giftId: 5655,
      giftName: 'Rosa',
      diamondCount: 100, // 2 bilhetes na taxa de 50
      repeatCount: 1,
      repeatEnd: true,
    }),
  });
  const simData1 = await simRes1.json();

  // Enviar Presente #1 NOVAMENTE com o mesmo msgId (deve ser deduplicado e descartado)
  const simRes1Dup = await fetch(`${BASE_URL}/api/tiktok/test-event`, {
    method: 'POST',
    headers: AUTH_HEADERS,
    body: JSON.stringify({
      sessionId: testSessionId,
      msgId: uniqueMsgId1,
      user: {
        userId: '9001001',
        uniqueId: 'apoiador_etapa1_a',
        nickname: 'Apoiador Etapa 1 A',
      },
      giftId: 5655,
      giftName: 'Rosa',
      diamondCount: 100,
      repeatCount: 1,
      repeatEnd: true,
    }),
  });
  const simData1Dup = await simRes1Dup.json();

  // Enviar Presente #2 inédito
  const simRes2 = await fetch(`${BASE_URL}/api/tiktok/test-event`, {
    method: 'POST',
    headers: AUTH_HEADERS,
    body: JSON.stringify({
      sessionId: testSessionId,
      msgId: uniqueMsgId2,
      user: {
        userId: '9001002',
        uniqueId: 'apoiador_etapa1_b',
        nickname: 'Apoiador Etapa 1 B',
      },
      giftId: 5655,
      giftName: 'Rosa Dupla',
      diamondCount: 150, // 3 bilhetes na taxa de 50
      repeatCount: 1,
      repeatEnd: true,
    }),
  });
  const simData2 = await simRes2.json();

  recordTest(
    'T9.1',
    'Deduplicação e Persistência',
    'Eventos inéditos são aceitos e persistidos no WAL/Outbox; evento repetido com mesmo msgId é descartado sem duplicar bilhetes',
    simRes1.status === 200 &&
      simData1.accepted === true &&
      simData1Dup.accepted === false &&
      simData1Dup.isDuplicate === true &&
      simRes2.status === 200 &&
      simData2.accepted === true,
    `Evt1 accepted=${simData1.accepted}, Evt1Dup accepted=${simData1Dup.accepted} (isDuplicate=${simData1Dup.isDuplicate}), Evt2 accepted=${simData2.accepted}`
  );

  // Aguardar processamento da fila durável e testar replay SSE a partir do cursor #1 (cliente já confirmou o evento #1 e reconecta para receber o #2)
  await sleep(1500);
  const replayTicketRes = await fetch(`${BASE_URL}/api/tiktok/stream/ticket`, {
    method: 'POST',
    headers: AUTH_HEADERS,
    body: JSON.stringify({ sessionId: testSessionId }),
  });
  const replayTicketData = await replayTicketRes.json();
  const replayUrl = wsClient.buildSseUrlWithTicket(replayTicketData.ticket, testSessionId, 1);

  const replayAbort = new AbortController();
  const receivedSseMessages: string[] = [];
  const replayFetchPromise = (async () => {
    try {
      const resp = await fetch(`${BASE_URL}${replayUrl}`, {
        headers: { Accept: 'text/event-stream' },
        signal: replayAbort.signal,
      });
      if (!resp.body) return;
      const reader = resp.body.getReader();
      const decoder = new TextDecoder();
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        receivedSseMessages.push(decoder.decode(value, { stream: true }));
      }
    } catch {
      // aborted intentionally
    }
  })();

  await sleep(1000);
  replayAbort.abort();
  await replayFetchPromise;

  const combinedSsePayload = receivedSseMessages.join('');
  const hasReplayedFrame =
    combinedSsePayload.includes('event: gift_confirmed') &&
    combinedSsePayload.includes('"replayed":true');
  const skippedAlreadyConfirmedGift1 = !combinedSsePayload.includes(uniqueMsgId1);
  const hasReplayedGift2 = combinedSsePayload.includes(uniqueMsgId2);

  recordTest(
    'T9.2',
    'Replay e Cursores SSE',
    'Reconexão SSE com lastConfirmedCursor=1 não reenvia evento #1 já confirmado e recupera evento #2 pendente da Outbox sem perda',
    hasReplayedFrame && skippedAlreadyConfirmedGift1 && hasReplayedGift2,
    `replayedFrame=${hasReplayedFrame}, skippedConfirmedGift1=${skippedAlreadyConfirmedGift1}, replayedGift2=${hasReplayedGift2}`
  );

  // ============================================================================
  // TESTE 7: Simular reinício do backend e verificar recuperação segura
  // ============================================================================
  console.log('\n--- 5. REINÍCIO DO SERVIDOR E DISTINÇÃO ENTRE SESSÃO PERSISTIDA E WEBCAST ATIVO ---');

  // Chamar POST /api/tiktok/restore-session com simulateServerRestart: true
  const restoreRes = await fetch(`${BASE_URL}/api/tiktok/restore-session`, {
    method: 'POST',
    headers: AUTH_HEADERS,
    body: JSON.stringify({
      sessionId: testSessionId,
      simulateServerRestart: true,
    }),
  });
  const restoreData = await restoreRes.json();
  const restoredEventsCount = restoreData.restoredEvents ?? restoreData.processedEventsRestored ?? 0;

  recordTest(
    'T7.1',
    'Recuperação Pós-Restart',
    'POST /api/tiktok/restore-session restaura sessionId, activeRuleId, streaks e IDs processados a partir do Firestore após limpeza de memória',
    restoreRes.status === 200 &&
      restoreData.ok === true &&
      restoreData.sessionId === testSessionId &&
      restoreData.activeRuleId === testRuleId &&
      restoredEventsCount >= 2,
    `sessionId=${restoreData.sessionId}, activeRuleId=${restoreData.activeRuleId}, restoredEvents=${restoredEventsCount}, webcastActive=${restoreData.webcastActive}`
  );

  // Verificar /api/tiktok/status imediatamente após o restart simulado (memória restaurada do Firestore, mas sem Webcast socket ativo)
  const statusPostRestartRes = await fetch(
    `${BASE_URL}/api/tiktok/status?sessionId=${encodeURIComponent(testSessionId)}`,
    { headers: AUTH_HEADERS }
  );
  const statusPostRestart = await statusPostRestartRes.json();

  recordTest(
    'T7.2',
    'Recuperação Pós-Restart',
    'GET /api/tiktok/status distingue claramente sessão persistida ativa (persistedSessionActive=true) de conexão Webcast ativa (webcastActive=false, requiresWebcastRecovery=true)',
    statusPostRestart.persistedSessionActive === true &&
      statusPostRestart.webcastActive === false &&
      statusPostRestart.requiresWebcastRecovery === true &&
      statusPostRestart.sessionId === testSessionId &&
      statusPostRestart.activeRuleId === testRuleId,
    `persistedSessionActive=${statusPostRestart.persistedSessionActive}, webcastActive=${statusPostRestart.webcastActive}, requiresWebcastRecovery=${statusPostRestart.requiresWebcastRecovery}`
  );

  // Verificar que após o restart do servidor + restoreSessionFromFirestore, o msgId1 antigo continua deduplicado!
  const dupAfterRestartRes = await fetch(`${BASE_URL}/api/tiktok/test-event`, {
    method: 'POST',
    headers: AUTH_HEADERS,
    body: JSON.stringify({
      sessionId: testSessionId,
      msgId: uniqueMsgId1,
      user: {
        userId: '9001001',
        uniqueId: 'apoiador_etapa1_a',
        nickname: 'Apoiador Etapa 1 A',
      },
      giftId: 5655,
      giftName: 'Rosa',
      diamondCount: 100,
      repeatCount: 1,
      repeatEnd: true,
    }),
  });
  const dupAfterRestartData = await dupAfterRestartRes.json();

  recordTest(
    'T7.3',
    'Recuperação Pós-Restart',
    'Deduplicação de eventos sobrevive ao reinício do servidor (msgId já processado antes do restart continua bloqueado)',
    dupAfterRestartData.accepted === false && dupAfterRestartData.isDuplicate === true,
    `accepted=${dupAfterRestartData.accepted}, isDuplicate=${dupAfterRestartData.isDuplicate}`
  );

  // Reconectar a sessão para os testes de navegação e F5 (Testes 1, 2 e 3)
  await fetch(`${BASE_URL}/api/tiktok/connect`, {
    method: 'POST',
    headers: AUTH_HEADERS,
    body: JSON.stringify({
      username: testCreator,
      sessionId: testSessionId,
      currentRate: testRate,
      ruleId: testRuleId,
    }),
  });

  // ============================================================================
  // TESTES 1, 2 e 3: Navegação entre páginas (TikTok LIVE, Sorteios, Participantes, Assinatura) + F5 Reload
  // ============================================================================
  console.log('\n--- 6. NAVEGAÇÃO ENTRE PÁGINAS E RELOAD F5 COM SINGLETON TIKTOKCONNECTOR ---');

  const capturedNetworkUrls: string[] = [];
  const sessionStore = new Map<string, string>();
  const localStore = new Map<string, string>();

  const createStorageMock = (store: Map<string, string>) => ({
    getItem: (k: string) => (store.has(k) ? store.get(k)! : null),
    setItem: (k: string, v: string) => store.set(k, String(v)),
    removeItem: (k: string) => store.delete(k),
    clear: () => store.clear(),
  });

  // Configurar ambiente de janela e EventSource real conectado ao servidor local http://127.0.0.1:3000
  const origFetchGlobal = globalThis.fetch.bind(globalThis);
  (globalThis as any).window = {
    location: { protocol: 'http:', host: '127.0.0.1:3000' },
    sessionStorage: createStorageMock(sessionStore),
    localStorage: createStorageMock(localStore),
  };
  (auth as any).currentUser = {
    uid: TEST_UID,
    email: TEST_EMAIL,
    emailVerified: true,
    getIdToken: async () => LOOPBACK_TOKEN,
  };

  globalThis.fetch = async (input: any, init: any = {}) => {
    let url = typeof input === 'string' ? input : input?.url || '';
    if (url.startsWith('/')) {
      url = `${BASE_URL}${url}`;
    }
    capturedNetworkUrls.push(url);
    if (url.includes('/api/tiktok/')) {
      const headers = new Headers(init?.headers || {});
      if (!headers.has('Authorization')) {
        headers.set('Authorization', `Bearer ${LOOPBACK_TOKEN}`);
      }
      headers.set('x-gio-loopback-test-suite', 'etapa1');
      init = { ...init, headers };
    }
    return origFetchGlobal(url, init);
  };

  class RealHttpEventSource {
    public readyState = 0; // CONNECTING
    public url: string;
    public onopen: ((ev?: any) => void) | null = null;
    public onmessage: ((ev: { data: string; lastEventId?: string }) => void) | null = null;
    public onerror: ((err?: any) => void) | null = null;
    private listeners = new Map<string, Set<(ev: { data: string; lastEventId?: string }) => void>>();
    private abortController = new AbortController();

    constructor(urlPath: string) {
      this.url = urlPath.startsWith('http') ? urlPath : `${BASE_URL}${urlPath}`;
      capturedNetworkUrls.push(this.url);
      void this.startStream();
    }

    private async startStream() {
      try {
        const res = await origFetchGlobal(this.url, {
          headers: { Accept: 'text/event-stream' },
          signal: this.abortController.signal,
        });
        if (!res.ok || !res.body) {
          this.readyState = 2;
          if (this.onerror) this.onerror(new Error(`SSE HTTP ${res.status}`));
          return;
        }
        this.readyState = 1; // OPEN
        if (this.onopen) this.onopen({});
      } catch (err) {
        if (this.readyState !== 2) {
          this.readyState = 2;
          if (this.onerror) this.onerror(err);
        }
      }
    }

    public addEventListener(type: string, cb: (ev: any) => void) {
      if (!this.listeners.has(type)) this.listeners.set(type, new Set());
      this.listeners.get(type)!.add(cb);
    }

    public close() {
      this.readyState = 2;
      this.abortController.abort();
    }
  }

  (globalThis as any).EventSource = RealHttpEventSource;

  try {
    const connectorTab1 = new TikTokLiveConnector();
    const connectSuccess = await connectorTab1.connect(testCreator, testSessionId, {
      ruleId: testRuleId,
      rate: testRate,
    });
    connectorTab1.ensureSseStream(testSessionId);
    await sleep(400);

    const ticketsIssuedAtStart = connectorTab1.getClient().getTicketsIssuedCount();
    const sseOpenAtStart = connectorTab1.getClient().isSseOpenOrConnecting();

    // Simular navegação pelas abas: TikTok LIVE -> Sorteios -> Participantes -> Assinatura -> Estatísticas -> Painel -> TikTok LIVE
    // Durante a saída da aba TikTok LIVE, o TikTokLiveManager desmonta (sem fechar o singleton connectorTab1),
    // e o App.tsx executa syncWithBackendStatus() a cada troca de aba.
    const tabsToNavigate = ['tiktok', 'draw', 'search', 'subscription', 'stats', 'dashboard', 'tiktok'];
    const observedTabStates: Array<{
      tab: string;
      sessionId: string;
      ruleId: string;
      sseActive: boolean;
    }> = [];

    for (const tab of tabsToNavigate) {
      await connectorTab1.syncWithBackendStatus();
      if (tab === 'tiktok') {
        // Quando TikTokLiveManager monta na aba TikTok LIVE, chama ensureSseStream(sessionId)
        connectorTab1.ensureSseStream(connectorTab1.getSessionId());
      }
      observedTabStates.push({
        tab,
        sessionId: connectorTab1.getSessionId(),
        ruleId: connectorTab1.getActiveRuleId(),
        sseActive: connectorTab1.getClient().isSseOpenOrConnecting(),
      });
    }

    const ticketsIssuedAfterNav = connectorTab1.getClient().getTicketsIssuedCount();
    const allTabsKeptSessionAndSse = observedTabStates.every(
      (s) => s.sessionId === testSessionId && s.ruleId === testRuleId && s.sseActive === true
    );

    recordTest(
      'T1.1',
      'Navegação Interna',
      'Conectar uma LIVE e navegar por todas as páginas mantém o SSE aberto (readyState=OPEN) e não reinicia a conexão',
      connectSuccess !== undefined &&
        sseOpenAtStart === true &&
        allTabsKeptSessionAndSse &&
        ticketsIssuedAfterNav === ticketsIssuedAtStart,
      `Abas navegadas: ${tabsToNavigate.length}, SSE permaneceu aberto: ${allTabsKeptSessionAndSse}, tickets emitidos antes/depois: ${ticketsIssuedAtStart}/${ticketsIssuedAfterNav}`
    );

    recordTest(
      'T2.1',
      'Alternância de Abas',
      'Alternar entre TikTok LIVE, Sorteios, Participantes e Assinatura preserva exatamente o mesmo sessionId e activeRuleId',
      observedTabStates.every((s) => s.sessionId === testSessionId && s.ruleId === testRuleId),
      observedTabStates.map((s) => `${s.tab}:${s.sessionId}`).join(' -> ')
    );

    // TESTE 3: Simular F5 (Recarregamento do navegador)
    // No F5, a instância em memória anterior é descartada e uma nova instância do singleton TikTokLiveConnector
    // inicializa lendo sessionStorage/localStorage e sincronizando com GET /api/tiktok/status
    connectorTab1.getClient().disconnect();

    const connectorAfterF5 = new TikTokLiveConnector();
    const sessionFromStorageOnBoot = connectorAfterF5.getSessionId();
    const ruleFromStorageOnBoot = connectorAfterF5.getActiveRuleId();
    const syncedStatusOnF5 = await connectorAfterF5.syncWithBackendStatus();
    await sleep(400);

    recordTest(
      'T3.2',
      'Reload F5',
      'Atualizar o navegador com F5 recupera o mesmo sessionId e activeRuleId do storage e de /api/tiktok/status sem criar sessão duplicada',
      sessionFromStorageOnBoot === testSessionId &&
        ruleFromStorageOnBoot === testRuleId &&
        syncedStatusOnF5?.sessionId === testSessionId &&
        syncedStatusOnF5?.activeRuleId === testRuleId &&
        connectorAfterF5.getSessionId() === testSessionId &&
        connectorAfterF5.getClient().getTicketsIssuedCount() === 1,
      `Storage boot=${sessionFromStorageOnBoot}, Status sync=${syncedStatusOnF5?.sessionId}, ruleId=${syncedStatusOnF5?.activeRuleId}, novo ticket emitido no F5=${connectorAfterF5.getClient().getTicketsIssuedCount()}`
    );

    connectorAfterF5.getClient().disconnect();

    const anyUrlWithIdToken = capturedNetworkUrls.some(
      (u) => u.includes('idToken=') || u.includes(LOOPBACK_TOKEN)
    );
    recordTest(
      'T5.5',
      'Auditoria de URLs',
      'Nenhuma URL de rede construída durante conexão, navegação e F5 contém Firebase ID Token',
      !anyUrlWithIdToken && capturedNetworkUrls.length > 0,
      `Total URLs inspecionadas: ${capturedNetworkUrls.length}, vazamentos de idToken: 0`
    );
  } finally {
    globalThis.fetch = origFetchGlobal;
  }

  // ============================================================================
  // TESTE 10: Regressão das Regras Comerciais Inalteradas (Preços e Trial 7 dias)
  // ============================================================================
  console.log('\n--- 7. REGRESSÃO DE REGRAS COMERCIAIS E DEMAIS ETAPAS INALTERADAS ---');

  const { monthly: monthlyPlan, annual: annualPlan } = await mercadoPagoSubscriptionService.getOfficialPlans();

  recordTest(
    'T10.1',
    'Regressão Comercial',
    'Preços oficiais (R$ 29,90 mensal e R$ 199,90 anual) e trial de 7 dias permanecem rigorosamente inalterados',
    monthlyPlan?.price === 29.90 &&
      annualPlan?.price === 199.90 &&
      monthlyPlan?.freeTrial?.frequency === 7 &&
      annualPlan?.freeTrial?.frequency === 7,
    `Mensal: R$ ${monthlyPlan?.price} (${monthlyPlan?.freeTrial?.frequency}d trial), Anual: R$ ${annualPlan?.price} (${annualPlan?.freeTrial?.frequency}d trial)`
  );

  // Limpar conexão de teste ao final
  await fetch(`${BASE_URL}/api/tiktok/disconnect`, {
    method: 'POST',
    headers: AUTH_HEADERS,
    body: JSON.stringify({ sessionId: testSessionId }),
  });

  // Resumo final
  const passedCount = results.filter((r) => r.passed).length;
  const failedCount = results.filter((r) => !r.passed).length;

  console.log('\n================================================================================');
  console.log(`  RESULTADO FINAL DA SUÍTE ETAPA 1: ${passedCount}/${results.length} APROVADOS | ${failedCount} FALHAS`);
  console.log('================================================================================\n');

  if (failedCount > 0) {
    process.exit(1);
  }
  process.exit(0);
}

runEtapa1Suite().catch((err) => {
  console.error('Erro fatal na execução da suíte Etapa 1:', err);
  process.exit(1);
});
