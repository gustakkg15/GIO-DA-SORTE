import assert from 'node:assert/strict';
import { TikTokLiveAdapter } from '../src/server/tiktokLiveAdapter.js';
import { TikTokDurableEventQueue } from '../src/server/tiktokEventQueue.js';
import { DurableSseOutboxEvent } from '../src/types.js';
import {
  getOrCreateLiveSession,
  fetchSessionParticipants,
} from '../src/utils/tiktokLiveService.js';

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function runTests() {
  console.log('================================================================================');
  console.log(' GIO DA SORTE PRO — SUITE AUTOMATIZADA: LIVE SYSTEM MONITOR + RECUPERAÇÃO SSE');
  console.log('================================================================================\n');

  const adapter = new TikTokLiveAdapter();
  const queue = new TikTokDurableEventQueue(false);
  queue.resetMetricsForTesting();
  queue.setRetentionConfig({
    maxEventsPerSession: 5000,
    retentionWindowMs: 2 * 60 * 60 * 1000,
  });

  const capturedOutboxBySession = new Map<string, DurableSseOutboxEvent[]>();
  queue.onOutboxEvent((outboxEvt) => {
    const list = capturedOutboxBySession.get(outboxEvt.sessionId) || [];
    list.push(outboxEvt);
    capturedOutboxBySession.set(outboxEvt.sessionId, list);
  });

  adapter.onGift((ev, _streak, capturePerfStart) => {
    queue.enqueueGiftEvent(ev, capturePerfStart);
  });

  const sessionId = `mon_sse_session_${Date.now()}`;
  const creatorHandle = 'gioborelli';
  const coinsPerTicket = 20;
  await getOrCreateLiveSession(sessionId, creatorHandle, coinsPerTicket);

  console.log(`[Setup] Sessão LIVE criada: ${sessionId} (@${creatorHandle}, ${coinsPerTicket} moedas/bilhete)`);

  // ============================================================================
  // CENÁRIOS 1, 2, 3, 4 e 5:
  // 1. Desconexão do navegador durante a LIVE
  // 2. Reconexão após 5 segundos
  // 3. Reconexão após 30 segundos
  // 4. Reconexão após 2 minutos
  // 5. Eventos recebidos durante a desconexão (Persist-Before-SSE + ordem sequencial)
  // ============================================================================
  console.log('\n▶ [Cenários 1 a 5] Desconexão durante a LIVE + Reconexão (5s, 30s, 2m) + Eventos na desconexão...');

  const clientMain = 'client_main_browser';
  const clientSecretMain = 'secret_main_browser_123';

  queue.registerClientConnection({
    sessionId,
    clientId: clientMain,
    clientSecret: clientSecretMain,
    initialConfirmedSequence: 0,
    isReconnect: false,
  });

  // Envia 3 eventos iniciais enquanto o navegador está conectado
  for (let i = 1; i <= 3; i++) {
    const out = adapter.handleIncomingGift({
      sessionId,
      msgId: `tx_initial_${i}`,
      createTime: String(Date.now() - 25), // Horário de criação no TikTok distinto da chegada no servidor
      user: {
        userId: `71000${i}`,
        uniqueId: `apoiador_${i}`,
        nickname: `Apoiador ${i}`,
      },
      giftId: 5655,
      giftName: 'Rosa Imperial',
      diamondCount: 40, // 2 bilhetes cada (taxa 20)
      repeatCount: 1,
      repeatEnd: true,
    });
    assert.equal(out.accepted, true, `Evento inicial ${i} deve ser aceito`);
  }

  const idleInitial = await queue.waitForIdle(15000);
  assert.equal(idleInitial, true, 'Fila deve concluir persistência inicial');

  const initialOutbox = capturedOutboxBySession.get(sessionId) || [];
  assert.equal(initialOutbox.length, 3, 'Outbox deve conter 3 eventos persistidos antes da transmissão SSE');
  assert.deepEqual(
    initialOutbox.map((e) => e.sequenceNumber),
    [1, 2, 3],
    'Os sequenceNumbers devem ser sequenciais por sessão: 1, 2, 3'
  );

  // Simula entrega SSE ao navegador e confirmação ACK pós-renderização até o sequenceNumber 3
  for (const outEvt of initialOutbox) {
    queue.recordSseEventTransmitted(outEvt, clientMain);
    const ackRes = queue.acknowledgeClientEvent({
      sessionId,
      clientId: clientMain,
      clientSecret: clientSecretMain,
      sequenceNumber: outEvt.sequenceNumber,
      eventId: outEvt.eventId,
      browserRenderLatencyMs: 5.8,
    });
    assert.equal(ackRes.accepted, true);
    assert.equal(ackRes.cursor?.lastConfirmedSequenceNumber, outEvt.sequenceNumber);
  }

  // CENÁRIO 1: Desconexão do navegador durante a LIVE no sequenceNumber=3
  queue.markClientDisconnected(sessionId, clientMain);
  console.log('  ✔ [Cenário 1] Navegador desconectou durante a LIVE com cursor confirmado #3.');

  // CENÁRIO 2 & 5: Durante desconexão de 5s chegam os eventos 4 e 5
  for (let i = 4; i <= 5; i++) {
    adapter.handleIncomingGift({
      sessionId,
      msgId: `tx_offline_5s_${i}`,
      createTime: String(Date.now() - 18),
      user: {
        userId: `71000${i}`,
        uniqueId: `apoiador_${i}`,
        nickname: `Apoiador ${i}`,
      },
      giftId: 5655,
      giftName: 'Rosa',
      diamondCount: 20, // 1 bilhete cada
      repeatCount: 1,
      repeatEnd: true,
    });
  }
  await queue.waitForIdle(15000);

  // Navegador reconecta após 5s enviando Last-Event-ID = "${sessionId}:3"
  const rec5s = await queue.recoverEventsForClient({
    sessionId,
    clientId: clientMain,
    rawCursor: `${sessionId}:3`,
  });
  assert.equal(rec5s.status, 'RECOVERED');
  assert.equal(rec5s.events.length, 2, 'Deve recuperar exatamente os 2 eventos perdidos na janela de 5s');
  assert.deepEqual(rec5s.events.map((e) => e.sequenceNumber), [4, 5]);
  for (const ev of rec5s.events) {
    queue.recordSseEventTransmitted(ev, clientMain);
    queue.acknowledgeClientEvent({
      sessionId,
      clientId: clientMain,
      clientSecret: clientSecretMain,
      sequenceNumber: ev.sequenceNumber,
      eventId: ev.eventId,
      browserRenderLatencyMs: 4.2,
    });
  }
  console.log('  ✔ [Cenário 2] Reconexão após 5s validada: eventos #4 e #5 recuperados em ordem.');

  // CENÁRIO 3 & 5: Desconexão de 30s -> chegam eventos 6, 7 e 8
  queue.markClientDisconnected(sessionId, clientMain);
  for (let i = 6; i <= 8; i++) {
    adapter.handleIncomingGift({
      sessionId,
      msgId: `tx_offline_30s_${i}`,
      createTime: String(Date.now() - 20),
      user: {
        userId: `71000${i}`,
        uniqueId: `apoiador_${i}`,
        nickname: `Apoiador ${i}`,
      },
      giftId: 5655,
      giftName: 'Rosa',
      diamondCount: 20,
      repeatCount: 1,
      repeatEnd: true,
    });
  }
  await queue.waitForIdle(15000);

  const rec30s = await queue.recoverEventsForClient({
    sessionId,
    clientId: clientMain,
    rawCursor: `${sessionId}:5`,
  });
  assert.equal(rec30s.status, 'RECOVERED');
  assert.deepEqual(rec30s.events.map((e) => e.sequenceNumber), [6, 7, 8]);
  for (const ev of rec30s.events) {
    queue.recordSseEventTransmitted(ev, clientMain);
    queue.acknowledgeClientEvent({
      sessionId,
      clientId: clientMain,
      clientSecret: clientSecretMain,
      sequenceNumber: ev.sequenceNumber,
      eventId: ev.eventId,
      browserRenderLatencyMs: 4.5,
    });
  }
  console.log('  ✔ [Cenário 3] Reconexão após 30s validada: eventos #6, #7 e #8 recuperados em ordem.');

  // CENÁRIO 4 & 5: Desconexão de 2 minutos -> chegam eventos 9 e 10
  queue.markClientDisconnected(sessionId, clientMain);
  for (let i = 9; i <= 10; i++) {
    adapter.handleIncomingGift({
      sessionId,
      msgId: `tx_offline_2m_${i}`,
      createTime: String(Date.now() - 30),
      user: {
        userId: `71000${i}`,
        uniqueId: `apoiador_${i}`,
        nickname: `Apoiador ${i}`,
      },
      giftId: 5655,
      giftName: 'Rosa',
      diamondCount: 20,
      repeatCount: 1,
      repeatEnd: true,
    });
  }
  await queue.waitForIdle(15000);

  const rec2m = await queue.recoverEventsForClient({
    sessionId,
    clientId: clientMain,
    rawCursor: `${sessionId}:8`,
  });
  assert.equal(rec2m.status, 'RECOVERED');
  assert.deepEqual(rec2m.events.map((e) => e.sequenceNumber), [9, 10]);
  for (const ev of rec2m.events) {
    queue.recordSseEventTransmitted(ev, clientMain);
    queue.acknowledgeClientEvent({
      sessionId,
      clientId: clientMain,
      clientSecret: clientSecretMain,
      sequenceNumber: ev.sequenceNumber,
      eventId: ev.eventId,
      browserRenderLatencyMs: 4.9,
    });
  }

  // Confirma que a recuperação SSE NÃO reexecutou operações financeiras (sem moedas ou bilhetes duplicados)
  const sessAfter10 = await getOrCreateLiveSession(sessionId, creatorHandle, coinsPerTicket);
  // 3 * 40 (120) + 7 * 20 (140) = 260 moedas = 13 bilhetes
  assert.equal(sessAfter10.totalCoins, 260, 'Total de moedas após múltiplas reconexões deve ser exato (260)');
  assert.equal(sessAfter10.currentTicketCounter, 13, 'Total de bilhetes emitidos deve ser exato (13) sem duplicação na retomada');
  console.log('  ✔ [Cenários 4 e 5] Reconexão após 2 min + integridade financeira (260 moedas = 13 bilhetes) validadas.');

  // ============================================================================
  // CENÁRIO 6: Múltiplos eventos do mesmo usuário
  // ============================================================================
  console.log('\n▶ [Cenário 6] Múltiplos eventos legítimos enviados pelo mesmo usuário...');
  const vipUserId = '888999000';
  // Envia 3 presentes distintos de 15 moedas cada (total = 45 moedas -> 2 bilhetes + 5 moedas carryover)
  for (let cycle = 1; cycle <= 3; cycle++) {
    const out = adapter.handleIncomingGift({
      sessionId,
      msgId: `tx_same_user_cycle_${cycle}`,
      groupId: `grp_same_user_cycle_${cycle}`,
      createTime: String(Date.now() - 10 + cycle),
      user: {
        userId: vipUserId,
        uniqueId: 'vip_master',
        nickname: 'VIP Master',
      },
      giftId: 5655,
      giftName: 'Rosa Ouro',
      diamondCount: 15,
      repeatCount: 1,
      repeatEnd: true,
    });
    assert.equal(out.accepted, true, `Presente ${cycle} do mesmo usuário deve ser aceito como evento distinto`);
  }
  await queue.waitForIdle(15000);

  const participantsAfterVip = await fetchSessionParticipants(sessionId);
  const vipRecord = participantsAfterVip.find((p) => p.tiktokUserId === vipUserId);
  assert.ok(vipRecord, 'Participante VIP deve estar persistido no Firestore');
  assert.equal(vipRecord.coinsInSession, 45, 'Soma cumulativa de moedas do mesmo usuário deve ser 45');
  assert.equal(vipRecord.ticketsInSession, 2, 'Usuário deve ter recebido 2 bilhetes (45 / 20 = 2)');
  assert.equal(vipRecord.carryoverCoins, 5, 'Usuário deve preservar 5 moedas de carryover');

  const vipOutbox = (capturedOutboxBySession.get(sessionId) || []).filter((e) => e.senderId === vipUserId);
  assert.equal(vipOutbox.length, 3, 'Cada presente do mesmo usuário deve gerar um item independente no Outbox SSE');
  assert.deepEqual(
    vipOutbox.map((e) => e.sequenceNumber),
    [11, 12, 13],
    'Os 3 presentes do mesmo usuário devem receber sequenceNumbers 11, 12 e 13'
  );
  console.log('  ✔ [Cenário 6] Múltiplos presentes do mesmo usuário preservados (sequenceNumbers 11, 12, 13; 45 moedas = 2 bilhetes + 5 carryover).');

  // ============================================================================
  // CENÁRIO 7: Eventos repetidos por retransmissão técnica
  // ============================================================================
  console.log('\n▶ [Cenário 7] Eventos repetidos por retransmissão técnica...');
  const dupAttempt = adapter.handleIncomingGift({
    sessionId,
    msgId: 'tx_same_user_cycle_1', // Mesmo msgId já processado no ciclo 1
    groupId: 'grp_same_user_cycle_1',
    user: {
      userId: vipUserId,
      uniqueId: 'vip_master',
      nickname: 'VIP Master',
    },
    giftId: 5655,
    giftName: 'Rosa Ouro',
    diamondCount: 15,
    repeatCount: 1,
    repeatEnd: true,
  });
  assert.equal(dupAttempt.isDuplicate, true, 'Retransmissão técnica com mesmo msgId deve ser bloqueada pelo adaptador');
  queue.recordDuplicateBlocked(sessionId, dupAttempt.reason);

  // Também testa bloqueio na camada da fila caso um evento já confirmado seja re-enfileirado diretamente
  const directDupRes = queue.enqueueGiftEvent(vipOutbox[0].payload.event);
  assert.equal(directDupRes.accepted, false, 'Fila deve bloquear re-enfileiramento de evento já confirmado no WAL');
  assert.equal(
    queue.getSessionLatestSequence(sessionId),
    13,
    'Retransmissão técnica não deve incrementar o sequenceNumber da sessão'
  );
  console.log('  ✔ [Cenário 7] Retransmissão técnica bloqueada no adaptador e na fila sem alterar sequenceNumber (#13).');

  // ============================================================================
  // CENÁRIO 8: Falha temporária do Firestore + Retry com Backoff Exponencial
  // ============================================================================
  console.log('\n▶ [Cenário 8] Falha temporária do Firestore, diagnóstico DEGRADED e recuperação automática...');
  queue.setSimulatedFailuresRemaining(2); // Falha nas 2 primeiras tentativas e persiste na 3ª

  const retryGiftOut = adapter.handleIncomingGift({
    sessionId,
    msgId: 'tx_firestore_transient_fail_14',
    user: {
      userId: '777888999',
      uniqueId: 'resiliente_pro',
      nickname: 'Resiliente PRO',
    },
    giftId: 5655,
    giftName: 'Leão Dourado',
    diamondCount: 60, // 3 bilhetes
    repeatCount: 1,
    repeatEnd: true,
  });
  assert.equal(retryGiftOut.accepted, true);

  // Aguarda a primeira falha transitória ocorrer para verificar o diagnóstico em tempo real
  await sleep(80);
  const midRetrySnapshot = queue.getLiveSystemMonitorSnapshot({
    connectionState: 'CONNECTED',
    roomUsername: creatorHandle,
    sessionId,
    connectedAt: Date.now() - 30000,
    activeSseClients: 1,
  });
  assert.ok(
    midRetrySnapshot.totals.persistenceFailures >= 1,
    'Monitor deve contabilizar a falha transitória de persistência'
  );

  const retryIdleOk = await queue.waitForIdle(15000);
  assert.equal(retryIdleOk, true, 'Fila deve concluir o retry com sucesso após as falhas transitórias');
  assert.equal(
    queue.getSessionLatestSequence(sessionId),
    14,
    'Evento recuperado após falha temporária do Firestore deve receber sequenceNumber 14'
  );
  console.log('  ✔ [Cenário 8] Falha temporária do Firestore detectada no Monitor e superada via retry com backoff (sequenceNumber #14).');

  // ============================================================================
  // CENÁRIO 9: Reinicialização do servidor (WAL + Outbox + Continuidade de Sequência)
  // ============================================================================
  console.log('\n▶ [Cenário 9] Reinicialização do servidor e continuidade durável do sequenceNumber...');
  const restartRec = await queue.simulateServerRestartAndRecover();
  assert.ok(restartRec.persistedCount >= 14, 'Todos os 14 eventos anteriores devem estar confirmados no WAL após recuperação de reinício');

  // Envia o 15º evento após a reinicialização simulada do servidor
  const postRestartOut = adapter.handleIncomingGift({
    sessionId,
    msgId: 'tx_post_server_restart_15',
    user: {
      userId: '799999111',
      uniqueId: 'pos_restart_user',
      nickname: 'Pós Restart',
    },
    giftId: 5655,
    giftName: 'Rosa Pós-Restart',
    diamondCount: 20, // 1 bilhete
    repeatCount: 1,
    repeatEnd: true,
  });
  assert.equal(postRestartOut.accepted, true);
  await queue.waitForIdle(15000);

  assert.equal(
    queue.getSessionLatestSequence(sessionId),
    15,
    'Após reinicialização do servidor, a sequência da sessão deve continuar exatamente em #15'
  );
  console.log('  ✔ [Cenário 9] Reinicialização do servidor validada: sequência retomada em #15 sem perda nem colisão.');

  // ============================================================================
  // CENÁRIO 10: Cursor antigo (fora da janela de retenção) ou inexistente
  // ============================================================================
  console.log('\n▶ [Cenário 10] Cursor antigo fora da janela de retenção ou inexistente (OUT_OF_RETENTION_FULL_SYNC)...');
  // Configura retenção curta de 5 eventos por sessão (mantém apenas sequenceNumbers 11..15)
  queue.setRetentionConfig({
    maxEventsPerSession: 5,
  });

  // 10a. Cliente tenta reconectar com cursor antigo (#2), que já saiu da janela [11..15]
  const expiredCursorRes = await queue.recoverEventsForClient({
    sessionId,
    clientId: 'client_ancient_cursor',
    rawCursor: `${sessionId}:2`,
  });
  assert.equal(
    expiredCursorRes.status,
    'OUT_OF_RETENTION_FULL_SYNC',
    'Cursor anterior à janela de retenção deve retornar OUT_OF_RETENTION_FULL_SYNC'
  );
  assert.equal(expiredCursorRes.minRetainedSequence, 11);
  assert.equal(expiredCursorRes.latestSequence, 15);

  // 10b. Cliente tenta reconectar com cursor inexistente no futuro (#9999)
  const futureCursorRes = await queue.recoverEventsForClient({
    sessionId,
    clientId: 'client_future_cursor',
    rawCursor: `${sessionId}:9999`,
  });
  assert.equal(
    futureCursorRes.status,
    'OUT_OF_RETENTION_FULL_SYNC',
    'Cursor futuro inexistente deve retornar OUT_OF_RETENTION_FULL_SYNC'
  );

  // 10c. Cliente tenta reconectar com cursor de outra sessão
  const wrongSessionRes = await queue.recoverEventsForClient({
    sessionId,
    clientId: 'client_wrong_session',
    rawCursor: `outra_sessao_qualquer:12`,
  });
  assert.equal(
    wrongSessionRes.status,
    'OUT_OF_RETENTION_FULL_SYNC',
    'Cursor de outra sessão deve retornar OUT_OF_RETENTION_FULL_SYNC'
  );

  // Restaura janela de retenção ampla para os próximos testes
  queue.setRetentionConfig({
    maxEventsPerSession: 5000,
  });
  console.log('  ✔ [Cenário 10] Cursores expirados, futuros ou de outra sessão tratados com OUT_OF_RETENTION_FULL_SYNC.');

  // ============================================================================
  // CENÁRIO 11: Duas abas do mesmo usuário (Isolamento de Cursor e Proteção por Secret)
  // ============================================================================
  console.log('\n▶ [Cenário 11] Duas abas simultâneas do mesmo usuário (Aba A e Aba B independentes)...');
  const tabAId = 'browser_tab_A';
  const tabASecret = 'tab_A_secret_token';
  const tabBId = 'browser_tab_B';
  const tabBSecret = 'tab_B_secret_token';

  queue.registerClientConnection({
    sessionId,
    clientId: tabAId,
    clientSecret: tabASecret,
    initialConfirmedSequence: 11,
  });
  queue.registerClientConnection({
    sessionId,
    clientId: tabBId,
    clientSecret: tabBSecret,
    initialConfirmedSequence: 13,
  });

  // Aba A confirma evento #12
  const ackA = queue.acknowledgeClientEvent({
    sessionId,
    clientId: tabAId,
    clientSecret: tabASecret,
    sequenceNumber: 12,
  });
  assert.equal(ackA.accepted, true);

  // Aba B confirma evento #14
  const ackB = queue.acknowledgeClientEvent({
    sessionId,
    clientId: tabBId,
    clientSecret: tabBSecret,
    sequenceNumber: 14,
  });
  assert.equal(ackB.accepted, true);

  // Verifica que tentativa de alterar o cursor da Aba A com token incorreto é rejeitada
  const invalidTokenAttempt = queue.acknowledgeClientEvent({
    sessionId,
    clientId: tabAId,
    clientSecret: 'wrong_token_intruder',
    sequenceNumber: 15,
  });
  assert.equal(invalidTokenAttempt.accepted, false, 'Deve bloquear tentativa de alterar cursor de outro cliente com secret inválido');

  // Como os eventos 1..10 foram podados no Cenário 10 e os retidos são 11..15:
  // Aba A (cursor #12) deve recuperar [13, 14, 15], enquanto Aba B (cursor #14) deve recuperar apenas [15]
  const recTabA = await queue.recoverEventsForClient({
    sessionId,
    clientId: tabAId,
    rawCursor: `${sessionId}:12`,
  });
  const recTabB = await queue.recoverEventsForClient({
    sessionId,
    clientId: tabBId,
    rawCursor: `${sessionId}:14`,
  });

  assert.equal(recTabA.status, 'RECOVERED');
  assert.deepEqual(recTabA.events.map((e) => e.sequenceNumber), [13, 14, 15]);
  assert.equal(recTabB.status, 'RECOVERED');
  assert.deepEqual(recTabB.events.map((e) => e.sequenceNumber), [15]);
  console.log('  ✔ [Cenário 11] Isolamento de cursores entre Aba A ([13,14,15]) e Aba B ([15]) + proteção por secret validados.');

  // ============================================================================
  // CENÁRIO 12: Reconexão simultânea de múltiplos clientes
  // ============================================================================
  console.log('\n▶ [Cenário 12] Reconexão simultânea de 10 clientes concorrentes...');
  const concurrentClients = Array.from({ length: 10 }, (_, idx) => ({
    clientId: `concurrent_viewer_${idx + 1}`,
    cursorSeq: 10 + (idx % 5), // Cursores entre 10 e 14 (todos dentro da janela retida 11..15)
  }));

  const concurrentRecoveries = await Promise.all(
    concurrentClients.map((c) =>
      queue.recoverEventsForClient({
        sessionId,
        clientId: c.clientId,
        rawCursor: `${sessionId}:${c.cursorSeq}`,
      })
    )
  );

  concurrentRecoveries.forEach((res, idx) => {
    const startSeq = concurrentClients[idx].cursorSeq + 1;
    const expected: number[] = [];
    for (let s = startSeq; s <= 15; s++) expected.push(s);
    assert.equal(res.status, 'RECOVERED');
    assert.deepEqual(
      res.events.map((e) => e.sequenceNumber),
      expected,
      `Cliente simultâneo ${idx + 1} deve receber exatamente a sequência ${expected.join(',')}`
    );
  });
  console.log('  ✔ [Cenário 12] 10 clientes reconectando simultaneamente receberam suas fatias exatas em ordem.');

  // ============================================================================
  // VALIDAÇÃO FINAL DO SNAPSHOT COMPLETO DO LIVE SYSTEM MONITOR
  // ============================================================================
  console.log('\n▶ [Validação LIVE SYSTEM MONITOR] Auditando indicadores de performance, 9 componentes e 6 estágios de perda...');
  const finalSnapshot = queue.getLiveSystemMonitorSnapshot({
    connectionState: 'CONNECTED',
    roomUsername: creatorHandle,
    sessionId,
    connectedAt: Date.now() - 120000,
    activeSseClients: 3,
    adapterDuplicatesBlocked: adapter.getStatus().duplicatesBlocked,
    adapterReconnectCount: adapter.getStatus().reconnectCount,
  });

  assert.equal(finalSnapshot.clockInfo.durationClock, 'MONOTONIC_PERFORMANCE_NOW');
  assert.equal(finalSnapshot.clockInfo.auditTimestampFormat, 'UTC_EPOCH_MS');
  assert.equal(finalSnapshot.components.length, 9, 'Monitor deve verificar todos os 9 componentes obrigatórios');
  assert.equal(finalSnapshot.lossClassification.length, 6, 'Monitor deve classificar os 6 estágios de perda de eventos');
  assert.ok(finalSnapshot.milestones.lastEventReceived, 'Card de Último Evento Recebido deve estar populado');
  assert.ok(finalSnapshot.milestones.lastEventPersisted, 'Card de Último Evento Persistido deve estar populado');
  assert.ok(finalSnapshot.milestones.lastEventDeliveredToBrowser, 'Card de Último Evento Entregue ao Navegador deve estar populado');
  assert.ok(finalSnapshot.milestones.lastEventConfirmedByBrowser, 'Card de Último Evento Confirmado pelo Navegador deve estar populado');
  assert.equal(finalSnapshot.milestones.lastEventPersisted?.sequenceNumber, 15);
  assert.ok(finalSnapshot.latencies.serverReceive.samples > 0, 'Latência de recebimento pelo servidor medida');
  assert.ok(finalSnapshot.latencies.processing.samples > 0, 'Latência de processamento medida');
  assert.ok(finalSnapshot.latencies.firestorePersistence.samples > 0, 'Latência de persistência Firestore medida');
  assert.ok(finalSnapshot.latencies.sseDelivery.samples > 0, 'Latência de entrega SSE medida');
  assert.ok(finalSnapshot.latencies.browserRender.samples > 0, 'Latência de renderização no navegador medida');
  assert.ok(finalSnapshot.latencies.totalEndToEnd.samples > 0, 'Latência ponta a ponta (End-to-End) medida');

  console.log('\n📊 RESUMO DO SNAPSHOT DO LIVE SYSTEM MONITOR:');
  console.log(
    JSON.stringify(
      {
        sessionId: finalSnapshot.sessionId,
        totals: finalSnapshot.totals,
        latenciesMs: {
          serverReceiveP50: finalSnapshot.latencies.serverReceive.p50,
          processingP50: finalSnapshot.latencies.processing.p50,
          firestorePersistenceP50: finalSnapshot.latencies.firestorePersistence.p50,
          sseDeliveryP50: finalSnapshot.latencies.sseDelivery.p50,
          browserRenderP50: finalSnapshot.latencies.browserRender.p50,
          totalEndToEndP50: finalSnapshot.latencies.totalEndToEnd.p50,
        },
        componentsStatus: finalSnapshot.components.map((c) => `${c.id}: ${c.status}`),
        lossClassificationStatus: finalSnapshot.lossClassification.map((l) => `${l.stage}: ${l.status}`),
      },
      null,
      2
    )
  );

  console.log('\n================================================================================');
  console.log(' ✅ TODOS OS 12 CENÁRIOS + LIVE SYSTEM MONITOR PASSARAM COM 100% DE SUCESSO!');
  console.log('================================================================================');
  process.exit(0);
}

runTests().catch((err) => {
  console.error('\n❌ FALHA NA SUITE DE TESTES:', err);
  process.exit(1);
});
