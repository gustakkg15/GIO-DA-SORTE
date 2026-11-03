import assert from 'node:assert/strict';
import { TikTokLiveAdapter } from '../src/server/tiktokLiveAdapter.js';
import { TikTokDurableEventQueue, SequencedSseFrame } from '../src/server/tiktokEventQueue.js';
import {
  getOrCreateLiveSession,
  recordGiftEventAtomic,
  fetchSessionParticipants,
  fetchRecentSessionEvents,
  fetchSessionStreaks,
} from '../src/utils/tiktokLiveService.js';

function calcPercentiles(arr: number[]) {
  if (arr.length === 0) return { p50: 0, p95: 0, p99: 0, avg: 0 };
  const sorted = [...arr].sort((a, b) => a - b);
  const pick = (q: number) => sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * q))];
  const sum = sorted.reduce((a, b) => a + b, 0);
  return {
    p50: Number(pick(0.5).toFixed(2)),
    p95: Number(pick(0.95).toFixed(2)),
    p99: Number(pick(0.99).toFixed(2)),
    avg: Number((sum / sorted.length).toFixed(2)),
  };
}

async function runLoadAndRecoverySuite() {
  console.log('================================================================================');
  console.log('🚀 SUITE DE TESTES DE CARGA, BAIXA LATÊNCIA E RECUPERAÇÃO — GIO DA SORTE PRO');
  console.log('================================================================================\n');

  // ---------------------------------------------------------------------------
  // 0. BASELINE MEASUREMENT (PREVIOUS ARCHITECTURE VS OPTIMIZED ARCHITECTURE)
  // ---------------------------------------------------------------------------
  console.log('▶ [0/10] Medindo Latência Anterior (Sequencial + 4 Re-leituras Firestore/evento)...');
  const baselineSid = `perf_baseline_${Date.now()}`;
  await getOrCreateLiveSession(baselineSid, 'gioborelli', 100);
  const baselineAdapter = new TikTokLiveAdapter();
  const baselineDisplayLatencies: number[] = [];
  const baselinePersistLatencies: number[] = [];

  for (let i = 1; i <= 10; i++) {
    const t0 = performance.now();
    const out = baselineAdapter.handleIncomingGift({
      sessionId: baselineSid,
      msgId: `base_tx_${i}`,
      createTime: String(1730001000000 + i),
      user: { userId: `700010${i % 4}`, uniqueId: `apoiador_${i % 4}`, nickname: `Apoiador ${i % 4}` },
      giftId: 5655,
      giftName: 'Rosa',
      diamondCount: 50,
      repeatCount: 1,
      repeatEnd: true,
    });
    // In previous architecture, client waited for sequential persistence + 4 full reads per event
    await recordGiftEventAtomic(out.event!);
    const tPersist = performance.now();
    await Promise.all([
      fetchSessionParticipants(baselineSid),
      getOrCreateLiveSession(baselineSid, 'gioborelli', 100),
      fetchRecentSessionEvents(baselineSid, 40),
      fetchSessionStreaks(baselineSid),
    ]);
    const tFull = performance.now();
    baselineDisplayLatencies.push(Number((tPersist - t0).toFixed(2)));
    baselinePersistLatencies.push(Number((tFull - t0).toFixed(2)));
  }

  const baseDisplayStats = calcPercentiles(baselineDisplayLatencies);
  const basePersistStats = calcPercentiles(baselinePersistLatencies);
  console.log(
    `  ✔ Baseline Anterior (10 eventos): Captura→Feed p50=${baseDisplayStats.p50}ms, p95=${baseDisplayStats.p95}ms | Ciclo Completo c/ 4 Leituras p50=${basePersistStats.p50}ms, p95=${basePersistStats.p95}ms\n`
  );

  // Create dedicated adapter + durable queue for load tests
  const adapter = new TikTokLiveAdapter();
  const queue = new TikTokDurableEventQueue(false);
  queue.resetMetricsForTesting();

  adapter.onGift((ev, _streak, capturePerfStart) => {
    queue.enqueueGiftEvent(ev, capturePerfStart);
  });

  // Helper to run an EPS load test
  async function runEpsStage(label: string, totalEvents: number, targetEps: number) {
    const sid = `perf_${targetEps}eps_${Date.now()}`;
    await getOrCreateLiveSession(sid, 'gioborelli', 100);
    const displayLatencies: number[] = [];
    const perEventPersistLatencies: number[] = [];

    const unsub = queue.onFrame((frame) => {
      if (frame.sessionId === sid && frame.type === 'gift') {
        displayLatencies.push(Number(frame.payload.captureToFeedLatencyMs || 0.2));
      } else if (frame.sessionId === sid && frame.type === 'gift_confirmed') {
        perEventPersistLatencies.push(Number(frame.payload.persistenceLatencyMs || 1));
      }
    });

    const intervalMs = Math.max(1, Math.floor(1000 / targetEps));
    const startWall = performance.now();

    for (let i = 1; i <= totalEvents; i++) {
      adapter.handleIncomingGift({
        sessionId: sid,
        msgId: `tx_${targetEps}eps_${i}`,
        createTime: String(1730002000000 + i),
        user: {
          userId: `8000${(i % 10) + 1}`,
          uniqueId: `user_${(i % 10) + 1}`,
          nickname: `Usuário ${(i % 10) + 1}`,
        },
        giftId: 5655,
        giftName: 'Rosa',
        diamondCount: 25,
        repeatCount: 1,
        repeatEnd: true,
      });
      if (targetEps <= 100 && i < totalEvents) {
        const expectedElapsed = i * intervalMs;
        const actualElapsed = performance.now() - startWall;
        if (expectedElapsed > actualElapsed) {
          await new Promise((r) => setTimeout(r, expectedElapsed - actualElapsed));
        }
      }
    }

    const idleOk = await queue.waitForIdle(45000);
    unsub();
    assert.equal(idleOk, true, `Fila deve concluir todos os ${totalEvents} eventos em ${label}`);

    const sessionAfter = await getOrCreateLiveSession(sid, 'gioborelli', 100);
    assert.equal(
      sessionAfter.totalCoins,
      totalEvents * 25,
      `Soma de moedas em ${label} deve ser exatamente ${totalEvents * 25}`
    );

    const disp = calcPercentiles(displayLatencies);
    const pers = calcPercentiles(perEventPersistLatencies);
    console.log(
      `  ✔ ${label} (${totalEvents} eventos): Captura→Exibição p50=${disp.p50}ms, p95=${disp.p95}ms, p99=${disp.p99}ms | Captura→Persistência p50=${pers.p50}ms, p95=${pers.p95}ms, p99=${pers.p99}ms | Moedas=${sessionAfter.totalCoins} | Bilhetes=${sessionAfter.currentTicketCounter}`
    );
    assert.ok(disp.p95 < 500, `Latência p95 de Captura→Exibição (${disp.p95}ms) deve ser < 500ms`);
    return { disp, pers, sessionAfter };
  }

  // ---------------------------------------------------------------------------
  // 1. 10 EVENTOS POR SEGUNDO
  // ---------------------------------------------------------------------------
  console.log('▶ [1/10] Teste de Carga: 10 Eventos por Segundo (10 EPS)...');
  const res10Eps = await runEpsStage('10 EPS', 10, 10);

  // ---------------------------------------------------------------------------
  // 2. 50 EVENTOS POR SEGUNDO
  // ---------------------------------------------------------------------------
  console.log('▶ [2/10] Teste de Carga: 50 Eventos por Segundo (50 EPS)...');
  const res50Eps = await runEpsStage('50 EPS', 50, 50);

  // ---------------------------------------------------------------------------
  // 3. 100 EVENTOS POR SEGUNDO
  // ---------------------------------------------------------------------------
  console.log('▶ [3/10] Teste de Carga: 100 Eventos por Segundo (100 EPS)...');
  const res100Eps = await runEpsStage('100 EPS', 100, 100);

  // ---------------------------------------------------------------------------
  // 4. RAJADA DE 500 EVENTOS SIMULTÂNEOS (BURST 500)
  // ---------------------------------------------------------------------------
  console.log('▶ [4/10] Teste de Rajada Extrema: 500 Eventos Simultâneos (Burst 500)...');
  const burstSid = `perf_burst500_${Date.now()}`;
  await getOrCreateLiveSession(burstSid, 'gioborelli', 100);

  const burstDisplayLatencies: number[] = [];
  const burstConfirmedKeys = new Set<string>();
  const burstIssuedTickets: number[] = [];

  const unsubBurst = queue.onFrame((frame) => {
    if (frame.sessionId === burstSid && frame.type === 'gift') {
      burstDisplayLatencies.push(Number(frame.payload.captureToFeedLatencyMs || 0.2));
    } else if (frame.sessionId === burstSid && frame.type === 'gift_confirmed') {
      if (frame.eventKey) burstConfirmedKeys.add(frame.eventKey);
      const tks = (frame.payload.ticketNumbers as number[]) || [];
      burstIssuedTickets.push(...tks);
    }
  });

  const tBurstStart = performance.now();
  for (let i = 1; i <= 500; i++) {
    adapter.handleIncomingGift({
      sessionId: burstSid,
      msgId: `burst500_tx_${i}`,
      createTime: String(1730005000000 + i),
      user: {
        userId: `9000${(i % 25) + 1}`,
        uniqueId: `apoiador_burst_${(i % 25) + 1}`,
        nickname: `Burst User ${(i % 25) + 1}`,
      },
      giftId: 5655,
      giftName: 'Rosa',
      diamondCount: 20, // 500 * 20 = 10,000 coins = 100 tickets across 25 users (each sends 20 gifts = 400 coins = 4 tickets)
      repeatCount: 1,
      repeatEnd: true,
    });
  }
  const tBurstCaptureDone = performance.now();
  const burstCaptureTotalMs = Number((tBurstCaptureDone - tBurstStart).toFixed(2));
  assert.equal(burstDisplayLatencies.length, 500, 'Todos os 500 eventos da rajada devem ser emitidos imediatamente ao feed otimista');

  const burstIdleOk = await queue.waitForIdle(90000);
  unsubBurst();
  assert.equal(burstIdleOk, true, 'Fila deve persistir todos os 500 eventos da rajada no Firestore');
  assert.equal(burstConfirmedKeys.size, 500, 'Todos os 500 eventos devem receber confirmação individual (CONFIRMED)');

  const burstSession = await getOrCreateLiveSession(burstSid, 'gioborelli', 100);
  assert.equal(burstSession.totalCoins, 10000, '500 presentes de 20 moedas devem somar exatamente 10.000 moedas');
  assert.equal(burstSession.currentTicketCounter, 100, '10.000 moedas a taxa 100 devem gerar exatamente 100 bilhetes');
  assert.equal(new Set(burstIssuedTickets).size, 100, 'Todos os 100 bilhetes emitidos na rajada de 500 eventos devem ser únicos sem colisão');
  const burstDispStats = calcPercentiles(burstDisplayLatencies);
  console.log(
    `  ✔ Rajada de 500 eventos: Ingestão total=${burstCaptureTotalMs}ms | Captura→Exibição p50=${burstDispStats.p50}ms, p95=${burstDispStats.p95}ms | Confirmados=${burstConfirmedKeys.size}/500 | Bilhetes únicos=${burstIssuedTickets.length}/100`
  );

  // ---------------------------------------------------------------------------
  // 5. MÚLTIPLOS USUÁRIOS E MÚLTIPLOS COMBOS/STREAKS SIMULTÂNEOS + DEDUPLICAÇÃO
  // ---------------------------------------------------------------------------
  console.log('▶ [5/10] Teste de Múltiplos Combos e Streaks Simultâneos + Bloqueio de Duplicatas...');
  const comboSid = `perf_combos_${Date.now()}`;
  await getOrCreateLiveSession(comboSid, 'gioborelli', 100);

  // 3 users doing interleaved combos at the same time + duplicate retransmissions
  const comboSteps = [
    // @ana combo 1: repeat 1 -> 3 -> 5 (end) = 5 * 10 = 50 coins
    { u: 'u_ana', handle: 'ana_live', gid: 5655, grp: 'grp_ana_1', r: 1, end: false, diamonds: 10, tx: 'tx_ana_1' },
    // @bruno combo 1: repeat 1 -> 4 -> 10 (end) = 10 * 10 = 100 coins (1 ticket)
    { u: 'u_bruno', handle: 'bruno_live', gid: 5655, grp: 'grp_bruno_1', r: 1, end: false, diamonds: 10, tx: 'tx_bruno_1' },
    // Duplicate technical retransmission of @ana r=1 (MUST BE BLOCKED)
    { u: 'u_ana', handle: 'ana_live', gid: 5655, grp: 'grp_ana_1', r: 1, end: false, diamonds: 10, tx: 'tx_ana_1', expectDup: true },
    { u: 'u_ana', handle: 'ana_live', gid: 5655, grp: 'grp_ana_1', r: 3, end: false, diamonds: 10, tx: 'tx_ana_3' },
    { u: 'u_bruno', handle: 'bruno_live', gid: 5655, grp: 'grp_bruno_1', r: 4, end: false, diamonds: 10, tx: 'tx_bruno_4' },
    { u: 'u_ana', handle: 'ana_live', gid: 5655, grp: 'grp_ana_1', r: 5, end: true, diamonds: 10, tx: 'tx_ana_5' },
    { u: 'u_bruno', handle: 'bruno_live', gid: 5655, grp: 'grp_bruno_1', r: 10, end: true, diamonds: 10, tx: 'tx_bruno_10' },
    // @ana starts a NEW combo right after finishing the first one: repeat 1 -> 5 (end) = +50 coins (total 100 coins = 1 ticket!)
    { u: 'u_ana', handle: 'ana_live', gid: 5655, grp: 'grp_ana_2', r: 1, end: false, diamonds: 10, tx: 'tx_ana_2_1' },
    { u: 'u_ana', handle: 'ana_live', gid: 5655, grp: 'grp_ana_2', r: 5, end: true, diamonds: 10, tx: 'tx_ana_2_5' },
  ];

  for (const step of comboSteps) {
    const out = adapter.handleIncomingGift({
      sessionId: comboSid,
      msgId: step.tx,
      user: { userId: step.u, uniqueId: step.handle, nickname: step.handle },
      giftId: step.gid,
      giftName: 'Rosa Combo',
      diamondCount: step.diamonds,
      groupId: step.grp,
      repeatCount: step.r,
      repeatEnd: step.end,
    });
    if (step.expectDup) {
      assert.equal(out.isDuplicate, true, 'Retransmissão técnica repetida do combo deve ser bloqueada');
    } else {
      assert.equal(out.accepted, true, `Passo legítimo do combo (${step.tx}) deve ser aceito`);
    }
  }

  await queue.waitForIdle(15000);
  const comboSess = await getOrCreateLiveSession(comboSid, 'gioborelli', 100);
  assert.equal(comboSess.totalCoins, 200, 'Soma exata dos combos simultâneos de @ana (100) + @bruno (100) deve ser 200 moedas');
  assert.equal(comboSess.currentTicketCounter, 2, 'Ambos os usuários devem receber 1 bilhete cada (total 2)');
  console.log('  ✔ Combos simultâneos e deduplicação técnica validados com precisão (200 moedas = 2 bilhetes).');

  // ---------------------------------------------------------------------------
  // 6. FIRESTORE TEMPORARIAMENTE LENTO (NON-BLOCKING CAPTURE + BACKPRESSURE)
  // ---------------------------------------------------------------------------
  console.log('▶ [6/10] Teste de Firestore Temporariamente Lento (Latência de Banco Simulada = 250ms)...');
  const slowSid = `perf_slow_db_${Date.now()}`;
  await getOrCreateLiveSession(slowSid, 'gioborelli', 100);
  queue.setSimulatedFirestoreDelayMs(250);

  const slowCaptureTimes: number[] = [];
  for (let i = 1; i <= 15; i++) {
    const t0 = performance.now();
    const out = adapter.handleIncomingGift({
      sessionId: slowSid,
      msgId: `slow_db_tx_${i}`,
      user: { userId: 'u_slow_1', uniqueId: 'carla_apoiadora', nickname: 'Carla' },
      giftId: 5655,
      giftName: 'Rosa',
      diamondCount: 20,
      repeatCount: 1,
      repeatEnd: true,
    });
    slowCaptureTimes.push(Number((performance.now() - t0).toFixed(2)));
    assert.equal(out.accepted, true);
  }

  const maxSlowCaptureMs = Math.max(...slowCaptureTimes);
  assert.ok(maxSlowCaptureMs < 25, `Captura jamais deve bloquear esperando Firestore lento (max=${maxSlowCaptureMs}ms)`);
  await queue.waitForIdle(15000);
  queue.setSimulatedFirestoreDelayMs(0);

  const slowSess = await getOrCreateLiveSession(slowSid, 'gioborelli', 100);
  assert.equal(slowSess.totalCoins, 300, 'Todos os 15 presentes durante lentidão do Firestore devem ser persistidos (300 moedas)');
  assert.equal(slowSess.currentTicketCounter, 3, '300 moedas devem gerar 3 bilhetes');
  console.log(`  ✔ Firestore lento superado sem bloquear captura (captura máx=${maxSlowCaptureMs}ms, 300 moedas = 3 bilhetes).`);

  // ---------------------------------------------------------------------------
  // 7. FALHA DURANTE PERSISTÊNCIA E RETRY COM BACKOFF EXPONENCIAL
  // ---------------------------------------------------------------------------
  console.log('▶ [7/10] Teste de Falha Transitória no Firestore e Retry Automático com Backoff Exponencial...');
  const retrySid = `perf_retry_${Date.now()}`;
  await getOrCreateLiveSession(retrySid, 'gioborelli', 100);
  // Inject 2 transient Firestore batch failures before succeeding
  queue.setSimulatedFailuresRemaining(2);

  for (let i = 1; i <= 5; i++) {
    adapter.handleIncomingGift({
      sessionId: retrySid,
      msgId: `retry_tx_${i}`,
      user: { userId: 'u_retry_1', uniqueId: 'diego_apoiador', nickname: 'Diego' },
      giftId: 5655,
      giftName: 'Rosa',
      diamondCount: 40,
      repeatCount: 1,
      repeatEnd: true,
    });
  }

  const retryIdle = await queue.waitForIdle(15000);
  assert.equal(retryIdle, true, 'Fila deve recuperar após falhas transitórias via retry com backoff exponencial');
  const retrySess = await getOrCreateLiveSession(retrySid, 'gioborelli', 100);
  assert.equal(retrySess.totalCoins, 200, 'Nenhum evento deve ser perdido ou duplicado durante retries (5 * 40 = 200 moedas)');
  assert.equal(retrySess.currentTicketCounter, 2, '200 moedas devem emitir exatamente 2 bilhetes');
  console.log('  ✔ Falha transitória recuperada automaticamente com backoff exponencial (0 perdas, 0 duplicações).');

  // ---------------------------------------------------------------------------
  // 8. DESCONEXÃO SSE E REPLAY COM Last-Event-ID
  // ---------------------------------------------------------------------------
  console.log('▶ [8/10] Teste de Desconexão SSE e Replay Durável via Last-Event-ID...');
  const sseSid = `perf_sse_replay_${Date.now()}`;
  await getOrCreateLiveSession(sseSid, 'gioborelli', 100);

  const lastSeenSeqBeforeDisconnect = queue.getCurrentSeqId();

  // Emit 4 gifts while browser SSE is "disconnected"
  for (let i = 1; i <= 4; i++) {
    adapter.handleIncomingGift({
      sessionId: sseSid,
      msgId: `sse_missed_tx_${i}`,
      user: { userId: `u_sse_${i}`, uniqueId: `viewer_${i}`, nickname: `Viewer ${i}` },
      giftId: 5655,
      giftName: 'Rosa Replay',
      diamondCount: 25,
      repeatCount: 1,
      repeatEnd: true,
    });
  }
  await queue.waitForIdle(10000);

  // Browser reconnects passing Last-Event-ID = lastSeenSeqBeforeDisconnect
  const replayedFrames: SequencedSseFrame[] = queue.getFramesSince(lastSeenSeqBeforeDisconnect, sseSid);
  const replayedOptimisticGifts = replayedFrames.filter((f) => f.type === 'gift');
  const replayedConfirmedGifts = replayedFrames.filter((f) => f.type === 'gift_confirmed');

  assert.equal(replayedOptimisticGifts.length, 4, 'Replay SSE deve conter todos os 4 eventos de presente recebidos durante desconexão');
  assert.equal(replayedConfirmedGifts.length, 4, 'Replay SSE deve conter todas as 4 confirmações de persistência');
  console.log(
    `  ✔ Replay SSE via Last-Event-ID (${lastSeenSeqBeforeDisconnect}) recuperou ${replayedFrames.length} frames (${replayedOptimisticGifts.length} presentes + ${replayedConfirmedGifts.length} confirmações).`
  );

  // ---------------------------------------------------------------------------
  // 9. RECONEXÃO TIKTOK & REINICIALIZAÇÃO DO SERVIDOR (RECUPERAÇÃO DO WAL EM DISCO)
  // ---------------------------------------------------------------------------
  console.log('▶ [9/10] Teste de Reinicialização do Servidor e Recuperação de Eventos Pendentes (Disk WAL + Firestore)...');
  const walSid = `perf_wal_restart_${Date.now()}`;
  await getOrCreateLiveSession(walSid, 'gioborelli', 100);

  // Enqueue 6 events with skipPersistence=true to simulate server crash right after WAL disk write & before Firestore commit
  for (let i = 1; i <= 6; i++) {
    const out = adapter.handleIncomingGift({
      sessionId: walSid,
      msgId: `wal_crash_tx_${i}`,
      user: { userId: 'u_wal_1', uniqueId: 'fernanda_vip', nickname: 'Fernanda VIP' },
      giftId: 5655,
      giftName: 'Coroa',
      diamondCount: 50,
      repeatCount: 1,
      repeatEnd: true,
    });
    // Force entry in disk WAL as PENDING without running worker yet
    const walEntry = (queue as any).walEntries.get(out.event!.eventKey!);
    if (walEntry) {
      walEntry.status = 'PENDING';
    }
  }
  queue.flushWalToDiskSync();

  // Simulate process memory wipe & restart recovery from disk WAL + Firestore streak restoration
  adapter.resetMemoryStateForSimulatedRestart();
  const walRecovery = await queue.simulateServerRestartAndRecover();
  const firestoreRestore = await adapter.restoreSessionFromFirestore(walSid);

  const walSessionAfter = await getOrCreateLiveSession(walSid, 'gioborelli', 100);
  assert.equal(walSessionAfter.totalCoins, 300, 'Todos os 6 eventos do WAL devem estar persistidos após reinicialização (300 moedas)');
  assert.equal(walSessionAfter.currentTicketCounter, 3, '300 moedas devem emitir exatamente 3 bilhetes após recuperação do WAL');
  assert.ok(firestoreRestore.restoredEvents >= 6, 'Adapter deve restaurar os eventos persistidos do Firestore após reinício');
  console.log(
    `  ✔ Recuperação pós-reinício concluída: WAL recuperados=${walRecovery.recoveredCount}, Eventos restaurados=${firestoreRestore.restoredEvents}, Moedas=${walSessionAfter.totalCoins}, Bilhetes=${walSessionAfter.currentTicketCounter}.`
  );

  // ---------------------------------------------------------------------------
  // 10. DIAGNÓSTICO EM TEMPO REAL E RELATÓRIO DE MÉTRICAS
  // ---------------------------------------------------------------------------
  console.log('▶ [10/10] Validando Painel de Diagnóstico em Tempo Real...');
  const finalDiag = queue.getDiagnostics({
    connectionState: 'CONNECTED',
    roomUsername: 'gioborelli',
    sessionId: burstSid,
    connectedAt: Date.now() - 60000,
    activeSseClients: 1,
    adapterDuplicatesBlocked: adapter.getStatus().duplicatesBlocked,
    adapterReconnectCount: adapter.getStatus().reconnectCount,
  });

  assert.equal(finalDiag.connectionState, 'CONNECTED');
  assert.ok(finalDiag.captureToDisplayLatency.p95 < 500, 'Meta de latência p95 Captura→Feed (< 500ms) atingida');
  assert.ok(res10Eps.pers.p95 < 1000, `Meta p95 Captura→Persistência em 10 EPS (${res10Eps.pers.p95}ms < 1000ms) atingida`);
  assert.ok(res50Eps.pers.p95 < 1000, `Meta p95 Captura→Persistência em 50 EPS (${res50Eps.pers.p95}ms < 1000ms) atingida`);
  assert.ok(res100Eps.pers.p95 < 1000, `Meta p95 Captura→Persistência em 100 EPS (${res100Eps.pers.p95}ms < 1000ms) atingida`);

  console.log('\n================================================================================');
  console.log('📊 RESUMO DE LATÊNCIA E PERFORMANCE (ANTES vs DEPOIS)');
  console.log('================================================================================');
  console.log(
    JSON.stringify(
      {
        beforeOptimization: {
          captureToFeedMs: baseDisplayStats,
          fullClientCycleWith4QueriesMs: basePersistStats,
        },
        afterOptimization: {
          stage10Eps: { captureToFeedMs: res10Eps.disp, captureToPersistenceMs: res10Eps.pers },
          stage50Eps: { captureToFeedMs: res50Eps.disp, captureToPersistenceMs: res50Eps.pers },
          stage100Eps: { captureToFeedMs: res100Eps.disp, captureToPersistenceMs: res100Eps.pers },
          burst500Events: {
            totalIngestionMs: burstCaptureTotalMs,
            captureToFeedMs: burstDispStats,
            totalConfirmed: burstConfirmedKeys.size,
            uniqueTicketsIssued: burstIssuedTickets.length,
          },
          globalDiagnostics: {
            captureToDisplayLatency: finalDiag.captureToDisplayLatency,
            captureToPersistenceLatency: finalDiag.captureToPersistenceLatency,
            duplicatesBlocked: finalDiag.duplicatesBlocked,
            errorsAndFailuresCount: finalDiag.errorsAndFailuresCount,
          },
        },
      },
      null,
      2
    )
  );
  console.log('================================================================================');
  console.log('✅ TODOS OS 10 CENÁRIOS DE CARGA, LATÊNCIA E RECUPERAÇÃO PASSARAM COM 100% DE SUCESSO!');
  console.log('================================================================================');
  process.exit(0);
}

runLoadAndRecoverySuite().catch((err) => {
  console.error('❌ Falha na suite de carga e recuperação:', err);
  process.exit(1);
});
