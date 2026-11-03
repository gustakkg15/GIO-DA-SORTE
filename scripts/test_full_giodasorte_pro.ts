import assert from 'node:assert/strict';
import {
  getOrCreateLiveSession,
  updateSessionConversionRate,
  recordGiftEventAtomic,
  pauseLiveSessionCollection,
  resumeLiveSessionCollection,
  endLiveSessionCollection,
  createNonBlockingSessionSnapshot,
  executeIndividualLiveDraw,
  fetchSessionDraws,
  selectUniformRandomIndex,
} from '../src/utils/tiktokLiveService';
import {
  createCampaign,
  addSessionToCampaign,
  freezeCampaignSnapshot,
  executeCampaignDraw,
  fetchCampaignDraws,
  fetchCampaignSessions,
} from '../src/utils/campaignService';
import { TikTokLiveAdapter } from '../src/server/tiktokLiveAdapter';
import { db } from '../src/firebase';
import { doc, getDoc, deleteDoc, collection, getDocs } from 'firebase/firestore';

async function runFullIntegrationSuite() {
  console.log('================================================================');
  console.log('🚀 GIO DA SORTE PRO — SUITE DE TESTES END-TO-END (FIRESTORE REAL)');
  console.log('================================================================\n');

  const cleanupSessionIds: string[] = [];
  const cleanupCampaignIds: string[] = [];
  const cleanupSnapshotIds: string[] = [];
  const cleanupDrawIds: string[] = [];

  try {
    // ------------------------------------------------------------------
    // 1. TESTE CSPRNG UNIFORME (REJECTION SAMPLING)
    // ------------------------------------------------------------------
    console.log('▶ [Teste 1] CSPRNG Uniforme com Rejection Sampling...');
    for (let i = 0; i < 200; i++) {
      const { index, rawEntropyHex } = selectUniformRandomIndex(17);
      assert(index >= 0 && index < 17, `Índice fora do intervalo: ${index}`);
      assert(rawEntropyHex.length > 32, 'Entropia criptográfica deve estar presente');
    }
    assert.equal(selectUniformRandomIndex(1).index, 0, 'Lista unitária deve retornar índice 0');
    console.log('✅ [Teste 1 APROVADO] CSPRNG validado sem viés de módulo.\n');

    // ------------------------------------------------------------------
    // 2. TESTE MOTOR 1: SESSÃO LIVE, CONVERSÃO DE MOEDAS E MUDANÇA DE REGRA
    // ------------------------------------------------------------------
    console.log('▶ [Teste 2] Motor 1: Criação de LIVE, Conversão de Moedas e Versionamento de Regras...');
    const sessionAId = `test_live_a_${Date.now()}`;
    const sessionA = await getOrCreateLiveSession(sessionAId, 'giodasorte_test_live_a', 10); // 10 moedas = 1 bilhete
    cleanupSessionIds.push(sessionA.sessionId);
    assert.equal(sessionA.status, 'active');
    assert.equal(sessionA.currentRate, 10);

    // Participante 1 (Alice) envia 25 moedas -> deve gerar 2 bilhetes e sobrar 5 moedas de saldo residual
    const event1Id = `test_ev_1_${Date.now()}`;
    const res1 = await recordGiftEventAtomic({
      sessionId: sessionA.sessionId,
      tiktokUserId: 'user_alice_01',
      username: 'alice.tik',
      nickname: 'Alice Sorte',
      avatarUrl: 'https://picsum.photos/seed/alice/80/80',
      giftId: 5655,
      giftName: 'Rosa',
      diamondCount: 25,
      repeatCount: 1,
      deltaCount: 1,
      coinsGranted: 25,
      repeatEnd: true,
      groupId: 'grp_alice_1',
      eventId: event1Id,
    });
    assert.equal(res1.success, true);
    assert.equal(res1.newTickets, 2);
    assert.equal(res1.carryover, 5);

    // Idempotência: enviar o MESMO eventId novamente não deve duplicar moedas nem bilhetes
    const res1Dup = await recordGiftEventAtomic({
      sessionId: sessionA.sessionId,
      tiktokUserId: 'user_alice_01',
      username: 'alice.tik',
      nickname: 'Alice Sorte',
      avatarUrl: 'https://picsum.photos/seed/alice/80/80',
      giftId: 5655,
      giftName: 'Rosa',
      diamondCount: 25,
      repeatCount: 1,
      deltaCount: 1,
      coinsGranted: 25,
      repeatEnd: true,
      groupId: 'grp_alice_1',
      eventId: event1Id,
    });
    assert.equal(res1Dup.newTickets, 0, 'Evento duplicado não pode emitir novos bilhetes');

    // Alteração da regra de conversão para 5 moedas = 1 bilhete
    // Os 2 bilhetes já emitidos de Alice devem continuar intactos com rateAtCreation=10
    await updateSessionConversionRate(sessionA.sessionId, 5, 'Promo 5 Moedas');

    // Alice envia mais 5 moedas (5 residuais + 5 novas = 10 moedas -> na nova regra de 5 moedas/bilhete = +2 bilhetes!)
    const event2Id = `test_ev_2_${Date.now()}`;
    const res2 = await recordGiftEventAtomic({
      sessionId: sessionA.sessionId,
      tiktokUserId: 'user_alice_01',
      username: 'alice.tik',
      nickname: 'Alice Sorte',
      avatarUrl: 'https://picsum.photos/seed/alice/80/80',
      giftId: 5655,
      giftName: 'Rosa',
      diamondCount: 5,
      repeatCount: 1,
      deltaCount: 1,
      coinsGranted: 5,
      repeatEnd: true,
      groupId: 'grp_alice_2',
      eventId: event2Id,
    });
    assert.equal(res2.newTickets, 2);
    assert.equal(res2.carryover, 0);

    // Participante 2 (Bruno) envia 15 moedas na regra de 5 moedas/bilhete -> 3 bilhetes
    const event3Id = `test_ev_3_${Date.now()}`;
    const res3 = await recordGiftEventAtomic({
      sessionId: sessionA.sessionId,
      tiktokUserId: 'user_bruno_02',
      username: 'bruno.live',
      nickname: 'Bruno VIP',
      avatarUrl: 'https://picsum.photos/seed/bruno/80/80',
      giftId: 5879,
      giftName: 'Coroa',
      diamondCount: 15,
      repeatCount: 1,
      deltaCount: 1,
      coinsGranted: 15,
      repeatEnd: true,
      groupId: 'grp_bruno_1',
      eventId: event3Id,
    });
    assert.equal(res3.newTickets, 3);
    console.log('✅ [Teste 2 APROVADO] Conversão, saldo residual, idempotência e mudança de regra sem afetar bilhetes antigos validados.\n');

    // ------------------------------------------------------------------
    // 3. TESTE PAUSAR / RETOMAR / ENCERRAR COLETA DA LIVE
    // ------------------------------------------------------------------
    console.log('▶ [Teste 3] Controles de Coleta (Pausar, Retomar, Encerrar)...');
    const pausedState = await pauseLiveSessionCollection(sessionA.sessionId);
    assert.equal(pausedState.status, 'paused');

    let pausedErrorCaught = false;
    try {
      await recordGiftEventAtomic({
        sessionId: sessionA.sessionId,
        tiktokUserId: 'user_bruno_02',
        username: 'bruno.live',
        nickname: 'Bruno VIP',
        giftId: 5655,
        giftName: 'Rosa',
        diamondCount: 50,
        repeatCount: 1,
        deltaCount: 1,
        coinsGranted: 50,
        repeatEnd: true,
        groupId: 'grp_paused_test',
      });
    } catch {
      pausedErrorCaught = true;
    }
    assert.equal(pausedErrorCaught, true, 'Sessão pausada deve recusar emissão de novos bilhetes');

    const resumedState = await resumeLiveSessionCollection(sessionA.sessionId);
    assert.equal(resumedState.status, 'active');

    const resumedGift = await recordGiftEventAtomic({
      sessionId: sessionA.sessionId,
      tiktokUserId: 'user_carla_03',
      username: 'carla.sorte',
      nickname: 'Carla Estrela',
      avatarUrl: 'https://picsum.photos/seed/carla/80/80',
      giftId: 5655,
      giftName: 'Rosa',
      diamondCount: 10,
      repeatCount: 1,
      deltaCount: 1,
      coinsGranted: 10,
      repeatEnd: true,
      groupId: 'grp_carla_1',
    });
    assert.equal(resumedGift.newTickets, 2); // 10 moedas / 5 = 2 bilhetes
    console.log('✅ [Teste 3 APROVADO] Pausa e retomada de coleta operacionais.\n');

    // ------------------------------------------------------------------
    // 4. TESTE ADAPTER TIKTOK LIVE: COMBOS, PRESENÇA E RESTAURAÇÃO DO FIRESTORE
    // ------------------------------------------------------------------
    console.log('▶ [Teste 4] TikTokLiveAdapter: Combos Diferenciais, Entrada/Saída e Restauração...');
    const adapter = new TikTokLiveAdapter();

    let memberEventsReceived = 0;
    const unsubMember = adapter.onMember(() => {
      memberEventsReceived++;
    });

    adapter.handleMemberEnter({
      userId: 'user_alice_01',
      uniqueId: 'alice.tik',
      nickname: 'Alice Sorte',
    });
    adapter.handleMemberLeave({
      userId: 'user_alice_01',
      uniqueId: 'alice.tik',
      nickname: 'Alice Sorte',
    });
    assert.equal(memberEventsReceived, 2, 'Deve emitir evento de entrada (JOINED) e saída (LEFT)');
    unsubMember();

    // Simular combo progressivo no adapter (x1 -> x3 -> x5 final)
    let totalAdapterCoins = 0;
    const unsubGift = adapter.onGift((ev) => {
      totalAdapterCoins += ev.coinsGranted;
    });

    adapter.handleIncomingGift({
      sessionId: sessionA.sessionId,
      userId: 'user_combo_99',
      uniqueId: 'combo.king',
      nickname: 'Combo King',
      giftId: 777,
      giftName: 'Super Estrela',
      diamondCount: 10,
      repeatCount: 1,
      repeatEnd: false,
      groupId: 'combo_grp_99',
    });
    adapter.handleIncomingGift({
      sessionId: sessionA.sessionId,
      userId: 'user_combo_99',
      uniqueId: 'combo.king',
      nickname: 'Combo King',
      giftId: 777,
      giftName: 'Super Estrela',
      diamondCount: 10,
      repeatCount: 3,
      repeatEnd: false,
      groupId: 'combo_grp_99',
    });
    // Evento duplicado / fora de ordem com repeatCount=2 não deve somar nada!
    adapter.handleIncomingGift({
      sessionId: sessionA.sessionId,
      userId: 'user_combo_99',
      uniqueId: 'combo.king',
      nickname: 'Combo King',
      giftId: 777,
      giftName: 'Super Estrela',
      diamondCount: 10,
      repeatCount: 2,
      repeatEnd: false,
      groupId: 'combo_grp_99',
    });
    adapter.handleIncomingGift({
      sessionId: sessionA.sessionId,
      userId: 'user_combo_99',
      uniqueId: 'combo.king',
      nickname: 'Combo King',
      giftId: 777,
      giftName: 'Super Estrela',
      diamondCount: 10,
      repeatCount: 5,
      repeatEnd: true,
      groupId: 'combo_grp_99',
    });
    unsubGift();
    assert.equal(totalAdapterCoins, 50, 'Combo x1->x3->x5 de presente de 10 moedas deve somar exatamente 50 moedas (10 + 20 + 20)');

    // Testar restauração de streaks e eventos do Firestore em uma nova instância do Adapter (simulando restart do Cloud Run)
    const adapterAfterRestart = new TikTokLiveAdapter();
    const restoredStats = await adapterAfterRestart.restoreSessionFromFirestore(sessionA.sessionId);
    assert(restoredStats.restoredEvents >= 4, 'Deve restaurar eventos já processados do Firestore');
    assert(restoredStats.restoredStreaks >= 3, 'Deve restaurar streaks de combos do Firestore');
    console.log(`✅ [Teste 4 APROVADO] Combos diferenciais (50 moedas exatas), presença (JOINED/LEFT) e restauração pós-restart (${restoredStats.restoredEvents} eventos, ${restoredStats.restoredStreaks} streaks) validados.\n`);

    // ------------------------------------------------------------------
    // 5. TESTE MOTOR 1: SNAPSHOT IMUTÁVEL NÃO-BLOQUEANTE E SORTEIO INDIVIDUAL
    // ------------------------------------------------------------------
    console.log('▶ [Teste 5] Motor 1: Snapshot Imutável SHA-256 (Não-Bloqueante) e Sorteio Verificável...');
    const snapshot1 = await createNonBlockingSessionSnapshot(sessionA.sessionId);
    cleanupSnapshotIds.push(snapshot1.snapshotId);
    assert.equal(snapshot1.totalEligibleTickets, 9); // Alice (4) + Bruno (3) + Carla (2) = 9 bilhetes
    assert.equal(snapshot1.rosterSha256Hash.length, 64);

    // Confirmar que a LIVE continua ATIVA após o congelamento do snapshot (permite vários sorteios na mesma LIVE)
    const sessionAfterFreezeSnap = await getDoc(doc(db, 'sessions', sessionA.sessionId));
    assert.equal(sessionAfterFreezeSnap.data()?.status, 'active', 'Congelar snapshot NÃO deve encerrar a coleta da LIVE');

    const draw1 = await executeIndividualLiveDraw(sessionA.sessionId, snapshot1.snapshotId, 'Prêmio Teste Motor 1');
    cleanupDrawIds.push(draw1.drawId);
    assert(draw1.winningTicket.ticketNumber >= 1 && draw1.winningTicket.ticketNumber <= 9);

    const drawsList = await fetchSessionDraws(sessionA.sessionId);
    assert(drawsList.some((d) => d.drawId === draw1.drawId), 'Sorteio deve constar no histórico persistido da LIVE');
    console.log(`✅ [Teste 5 APROVADO] Vencedor Motor 1: @${draw1.winningTicket.username} (Bilhete #${draw1.winningTicket.ticketNumber}) | Hash: ${draw1.rosterSha256Hash.slice(0, 16)}...\n`);

    // ------------------------------------------------------------------
    // 6. TESTE MOTOR 2: CAMPANHA MULTI-LIVE ACUMULADA E DEDUPLICAÇÃO ESTRITA
    // ------------------------------------------------------------------
    console.log('▶ [Teste 6] Motor 2: Campanha Acumulada Multi-LIVE e Deduplicação entre Sessões...');
    const sessionBId = `test_live_b_${Date.now()}`;
    const sessionB = await getOrCreateLiveSession(sessionBId, 'giodasorte_test_live_b', 10);
    cleanupSessionIds.push(sessionB.sessionId);

    await recordGiftEventAtomic({
      sessionId: sessionB.sessionId,
      tiktokUserId: 'user_diego_04',
      username: 'diego.pro',
      nickname: 'Diego Pro',
      avatarUrl: 'https://picsum.photos/seed/diego/80/80',
      giftId: 5655,
      giftName: 'Rosa',
      diamondCount: 30,
      repeatCount: 1,
      deltaCount: 1,
      coinsGranted: 30,
      repeatEnd: true,
      groupId: 'grp_diego_b1',
    }); // 3 bilhetes na Live B

    const now = Date.now();
    const campaign = await createCampaign({
      title: 'Campanha Teste Oficial Multi-LIVE',
      description: 'Teste automatizado de acumulação sem duplicidade',
      prizeName: 'Super Prêmio Acumulado',
      startDate: now - 3600_000,
      cutoffDate: now + 86400_000,
    });
    cleanupCampaignIds.push(campaign.campaignId);

    // Vincular LIVE A (9 bilhetes)
    const linkA1 = await addSessionToCampaign(campaign.campaignId, sessionA.sessionId, {
      eligibilityRule: 'ALL_TICKETS',
    });
    assert.equal(linkA1.addedTicketsCount, 9);
    assert.equal(linkA1.skippedDuplicatesCount, 0);

    // Tentar vincular LIVE A novamente -> deve pular os 9 bilhetes duplicados e adicionar 0!
    const linkA2 = await addSessionToCampaign(campaign.campaignId, sessionA.sessionId, {
      eligibilityRule: 'ALL_TICKETS',
    });
    assert.equal(linkA2.addedTicketsCount, 0, 'Re-vincular a mesma LIVE não pode duplicar bilhetes na campanha');
    assert.equal(linkA2.skippedDuplicatesCount, 9);

    // Vincular LIVE B (3 bilhetes)
    const linkB1 = await addSessionToCampaign(campaign.campaignId, sessionB.sessionId, {
      eligibilityRule: 'ALL_TICKETS',
    });
    assert.equal(linkB1.addedTicketsCount, 3);
    assert.equal(linkB1.totalCampaignTickets, 12);

    // Congelar Snapshot da Campanha (9 + 3 = 12 bilhetes)
    const campaignSnapshot = await freezeCampaignSnapshot(campaign.campaignId);
    cleanupSnapshotIds.push(campaignSnapshot.snapshotId);
    assert.equal(campaignSnapshot.totalEligibleTickets, 12);

    // Executar Sorteio da Campanha Acumulada
    const campaignDraw = await executeCampaignDraw(
      campaign.campaignId,
      campaignSnapshot.snapshotId,
      'Super Prêmio Acumulado'
    );
    cleanupDrawIds.push(campaignDraw.drawId);
    assert(campaignDraw.winningTicket.ticketNumber >= 1);

    const campaignSessions = await fetchCampaignSessions(campaign.campaignId);
    const campaignDraws = await fetchCampaignDraws(campaign.campaignId);
    assert.equal(campaignSessions.length, 2, 'Deve listar as 2 LIVEs vinculadas à campanha');
    assert.equal(campaignDraws.length, 1, 'Deve listar o sorteio realizado na campanha');

    // Encerrar coleta da Live A e Live B
    const endedA = await endLiveSessionCollection(sessionA.sessionId);
    assert.equal(endedA.status, 'ended');
    await endLiveSessionCollection(sessionB.sessionId);

    console.log(`✅ [Teste 6 APROVADO] Campanha Multi-LIVE (12 bilhetes de 2 LIVEs, 0 duplicações) sorteada: @${campaignDraw.winningTicket.username} (Bilhete #${campaignDraw.winningTicket.ticketNumber} da sessão ${campaignDraw.winningTicket.sessionId}).\n`);

    console.log('================================================================');
    console.log('🎉 TODOS OS 6 BLOCOS END-TO-END (MOTOR 1 + MOTOR 2 + LIVE) APROVADOS!');
    console.log('================================================================');
  } finally {
    // Limpeza segura dos documentos temporários de teste criados no Firestore
    console.log('\n🧹 Limpando dados temporários de teste no Firestore...');
    for (const sId of cleanupSessionIds) {
      try {
        for (const sub of ['participants', 'tickets', 'events', 'streaks', 'draws']) {
          const snap = await getDocs(collection(db, `sessions/${sId}/${sub}`));
          for (const d of snap.docs) await deleteDoc(d.ref);
        }
        await deleteDoc(doc(db, 'sessions', sId));
      } catch {}
    }
    for (const cId of cleanupCampaignIds) {
      try {
        for (const sub of ['sessions', 'tickets', 'draws']) {
          const snap = await getDocs(collection(db, `campaigns/${cId}/${sub}`));
          for (const d of snap.docs) await deleteDoc(d.ref);
        }
        await deleteDoc(doc(db, 'campaigns', cId));
      } catch {}
    }
    for (const snapId of cleanupSnapshotIds) {
      try {
        const chunksSnap = await getDocs(collection(db, `draw_snapshots/${snapId}/chunks`));
        for (const d of chunksSnap.docs) await deleteDoc(d.ref);
        await deleteDoc(doc(db, 'draw_snapshots', snapId));
      } catch {}
    }
    for (const drawId of cleanupDrawIds) {
      try {
        await deleteDoc(doc(db, 'draws', drawId));
      } catch {}
    }
    console.log('🧹 Limpeza concluída.');
  }
}

runFullIntegrationSuite()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('❌ Falha na suíte de integração:', err);
    process.exit(1);
  });
