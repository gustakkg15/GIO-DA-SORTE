import {
  getProPlanEntitlement,
  setProPlanTier,
  getOrCreateLiveSession,
  updateLiveSessionConfigAndRules,
  recordGiftEventAtomic,
  fetchSessionParticipants,
  fetchSessionTickets,
  fetchRecentSessionEvents,
  createNonBlockingSessionSnapshot,
  executeIndividualLiveDraw,
} from '../src/utils/tiktokLiveService.js';
import {
  createCampaign,
  updateCampaignRulesConfig,
  addSessionToCampaign,
  freezeCampaignSnapshot,
  executeCampaignDraw,
  fetchCampaignTickets,
} from '../src/utils/campaignService.js';

async function runTests() {
  console.log('================================================================');
  console.log('🧪 GIO DA SORTE PRO — TESTE AUTOMATIZADO TIKTOK LIVE PRO COMPLETO');
  console.log('================================================================\n');

  let passed = 0;
  let failed = 0;

  function assert(condition: boolean, label: string, details?: string) {
    if (condition) {
      passed++;
      console.log(`✅ [PASS] ${label}`);
    } else {
      failed++;
      console.error(`❌ [FAIL] ${label}${details ? ` — ${details}` : ''}`);
    }
  }

  try {
    // ------------------------------------------------------------------------
    // 1. VALIDAÇÃO DE PLANO PRO NO BACKEND (FREE BLOQUEADO, PRO LIBERADO)
    // ------------------------------------------------------------------------
    console.log('\n--- [1] Validação de Plano PRO no Backend ---');
    setProPlanTier('FREE');
    const freeEntitlement = getProPlanEntitlement();
    assert(
      freeEntitlement.tier === 'FREE' && freeEntitlement.active === false,
      'Plano FREE desativa todos os módulos exclusivos do TikTok LIVE PRO'
    );

    let blockedGift = false;
    try {
      await recordGiftEventAtomic({
        sessionId: 'blocked_session',
        tiktokUserId: 'u_free',
        username: 'user_free',
        nickname: 'User Free',
        giftId: 1,
        giftName: 'Rosa',
        diamondCount: 10,
        repeatCount: 1,
        deltaCount: 1,
        coinsGranted: 10,
        repeatEnd: true,
        groupId: 'grp_free',
        transactionId: 'tx_blocked_free',
      });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes('PRO_PLAN_REQUIRED')) {
        blockedGift = true;
      }
    }
    assert(blockedGift, 'Backend bloqueia contabilização de presentes quando plano = FREE (PRO_PLAN_REQUIRED)');

    let blockedCampaign = false;
    try {
      await createCampaign({
        title: 'Campanha Bloqueada FREE',
        description: 'Teste de bloqueio',
        prizeName: 'Prêmio',
        defaultRate: 10,
      });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes('PRO_PLAN_REQUIRED')) {
        blockedCampaign = true;
      }
    }
    assert(blockedCampaign, 'Backend bloqueia criação de campanha acumulada quando plano = FREE');

    // Reativa plano PRO para os próximos testes
    setProPlanTier('PRO');
    const proEntitlement = getProPlanEntitlement();
    assert(
      proEntitlement.tier === 'PRO' && proEntitlement.active === true,
      'Plano PRO habilita conexão LIVE, emissão de bilhetes e campanhas acumuladas'
    );

    // ------------------------------------------------------------------------
    // 2. CONFIGURAÇÃO DO SORTEIO DA LIVE & REGRAS DE PARTICIPAÇÃO
    // ------------------------------------------------------------------------
    console.log('\n--- [2] Configuração do Sorteio da LIVE & Regras ---');
    const uniqueSuffix = Date.now().toString(36);
    const sessionId = `sess_pro_test_${uniqueSuffix}`;
    const session = await getOrCreateLiveSession(sessionId, `@criador_pro_${uniqueSuffix}`, 20);

    const updatedSession = await updateLiveSessionConfigAndRules(session.sessionId, {
      raffleTitle: 'Sorteio PIX 500 Reais',
      prizeName: 'PIX R$ 500,00',
      coinsPerTicket: 10,
      minCoinsPerGift: 15,
      maxTicketsPerUser: 5,
      maxTotalTickets: 8,
      allowDuplicateWinners: false,
      participationRulesNotes: 'Mínimo de 15 moedas por envio; máximo de 5 bilhetes por participante e 8 na LIVE.',
    });

    assert(
      updatedSession.currentRate === 10 &&
        updatedSession.minCoinsPerGift === 15 &&
        updatedSession.maxTicketsPerUser === 5 &&
        updatedSession.maxTotalTickets === 8 &&
        updatedSession.raffleTitle === 'Sorteio PIX 500 Reais',
      'Configuração do sorteio da LIVE salva regras, conversão (10 moedas = 1 bilhete) e limites (min 15 moedas, máx 5/usuário, máx 8/LIVE)'
    );

    // ------------------------------------------------------------------------
    // 3. REGRA DE MÍNIMO DE MOEDAS POR PRESENTE (minCoinsPerGift)
    // ------------------------------------------------------------------------
    console.log('\n--- [3] Regra de Mínimo de Moedas por Presente ---');
    const smallGiftRes = await recordGiftEventAtomic({
      sessionId: session.sessionId,
      tiktokUserId: 'uid_ana_101',
      username: 'ana_live',
      nickname: 'Ana Live',
      giftId: 5655,
      giftName: 'Rosa',
      diamondCount: 1, // 1 * 5 = 5 moedas (< minCoinsPerGift = 15)
      repeatCount: 5,
      deltaCount: 5,
      coinsGranted: 5,
      repeatEnd: true,
      groupId: `grp_small_${uniqueSuffix}`,
      transactionId: `tx_small_${uniqueSuffix}`,
    });

    assert(
      smallGiftRes.success === true &&
        smallGiftRes.event.coinsGranted === 5 &&
        smallGiftRes.carryover === 0 &&
        smallGiftRes.newTickets === 0,
      'Presente abaixo do mínimo configurado (5 < 15 moedas) é auditado (5 moedas registradas) mas não acumula carryover (0) nem gera bilhetes (0)'
    );

    // ------------------------------------------------------------------------
    // 4. CONTABILIZAÇÃO DE COMBOS (STREAKS), SALDO ACUMULADO E DUPLICIDADE
    // ------------------------------------------------------------------------
    console.log('\n--- [4] Combos, Saldo Acumulado (Carryover) e Bloqueio de Duplicidade ---');
    const comboGroupId = `combo_grp_${uniqueSuffix}`;
    // Envio 1 do combo: repeatCount = 1, diamondCount = 20 -> 20 moedas -> 2 bilhetes (#1, #2)
    const comboStep1 = await recordGiftEventAtomic({
      sessionId: session.sessionId,
      tiktokUserId: 'uid_bruno_202',
      username: 'bruno_vip',
      nickname: 'Bruno VIP',
      giftId: 7001,
      giftName: 'Perfume',
      diamondCount: 20,
      repeatCount: 1,
      deltaCount: 1,
      coinsGranted: 20,
      repeatEnd: false,
      groupId: comboGroupId,
      transactionId: `tx_combo_step1_${uniqueSuffix}`,
    });

    // Envio 2 do mesmo combo: repeatCount = 2 -> delta = +1 unidade (+20 moedas) -> +2 bilhetes (#3, #4)
    const comboStep2 = await recordGiftEventAtomic({
      sessionId: session.sessionId,
      tiktokUserId: 'uid_bruno_202',
      username: 'bruno_vip',
      nickname: 'Bruno VIP',
      giftId: 7001,
      giftName: 'Perfume',
      diamondCount: 20,
      repeatCount: 2,
      deltaCount: 1,
      coinsGranted: 20,
      repeatEnd: true,
      groupId: comboGroupId,
      transactionId: `tx_combo_step2_${uniqueSuffix}`,
    });

    // Retransmissão idêntica do passo 2 (mesmo transactionId + repeatCount) -> deve ser bloqueada por idempotência
    const duplicateRetry = await recordGiftEventAtomic({
      sessionId: session.sessionId,
      tiktokUserId: 'uid_bruno_202',
      username: 'bruno_vip',
      nickname: 'Bruno VIP',
      giftId: 7001,
      giftName: 'Perfume',
      diamondCount: 20,
      repeatCount: 2,
      deltaCount: 1,
      coinsGranted: 20,
      repeatEnd: true,
      groupId: comboGroupId,
      transactionId: `tx_combo_step2_${uniqueSuffix}`,
    });

    assert(
      comboStep1.event.coinsGranted === 20 &&
        comboStep1.newTickets === 2 &&
        comboStep2.event.coinsGranted === 20 &&
        comboStep2.newTickets === 2 &&
        duplicateRetry.newTickets === 0,
      'Combos contabilizam apenas o delta real (20 + 20 = 40 moedas -> 4 bilhetes) e bloqueiam retransmissão duplicada'
    );

    // ------------------------------------------------------------------------
    // 5. LIMITES POR PARTICIPANTE (maxTicketsPerUser) E TOTAL DA LIVE (maxTotalTickets)
    // ------------------------------------------------------------------------
    console.log('\n--- [5] Limites Atômicos por Participante e Total da LIVE ---');
    // Bruno já tem 4 bilhetes e o limite por usuário é 5.
    // Se Bruno enviar 30 moedas (que daria +3 bilhetes), ele só pode receber +1 bilhete (#5).
    const brunoCapRes = await recordGiftEventAtomic({
      sessionId: session.sessionId,
      tiktokUserId: 'uid_bruno_202',
      username: 'bruno_vip',
      nickname: 'Bruno VIP',
      giftId: 7002,
      giftName: 'Coroa',
      diamondCount: 30,
      repeatCount: 1,
      deltaCount: 1,
      coinsGranted: 30,
      repeatEnd: true,
      groupId: `grp_bruno_cap_${uniqueSuffix}`,
      transactionId: `tx_bruno_cap_${uniqueSuffix}`,
    });

    assert(
      brunoCapRes.newTickets === 1 && brunoCapRes.ticketNumbers[0] === 5,
      'Limite por participante (maxTicketsPerUser = 5) respeitado atomicamente (Bruno parou no bilhete #5)'
    );

    // Agora a LIVE tem 5 bilhetes emitidos e o limite total da LIVE é 8 (restam 3 vagas).
    // Carla envia 50 moedas (que daria 5 bilhetes), mas o teto da LIVE (8) limita a emissão a 3 bilhetes (#6, #7, #8).
    const carlaCapRes = await recordGiftEventAtomic({
      sessionId: session.sessionId,
      tiktokUserId: 'uid_carla_303',
      username: 'carla_top',
      nickname: 'Carla Top',
      giftId: 7003,
      giftName: 'Cisne',
      diamondCount: 50,
      repeatCount: 1,
      deltaCount: 1,
      coinsGranted: 50,
      repeatEnd: true,
      groupId: `grp_carla_cap_${uniqueSuffix}`,
      transactionId: `tx_carla_cap_${uniqueSuffix}`,
    });

    assert(
      carlaCapRes.newTickets === 3 &&
        carlaCapRes.ticketNumbers[0] === 6 &&
        carlaCapRes.ticketNumbers[2] === 8,
      'Limite total da LIVE (maxTotalTickets = 8) respeitado atomicamente (Carla recebeu bilhetes #6, #7 e #8)'
    );

    // ------------------------------------------------------------------------
    // 6. EMISSÃO INDIVIDUALIZADA E BUSCA POR @USUÁRIO / #BILHETE
    // ------------------------------------------------------------------------
    console.log('\n--- [6] Emissão Individualizada e Busca por @usuário / #bilhete ---');
    const allTickets = await fetchSessionTickets(session.sessionId);
    const allParticipants = await fetchSessionParticipants(session.sessionId);
    const ticketNumbers = allTickets.map((t) => t.ticketNumber).sort((a, b) => a - b);

    assert(
      allTickets.length === 8 &&
        JSON.stringify(ticketNumbers) === JSON.stringify([1, 2, 3, 4, 5, 6, 7, 8]),
      'Bilhetes individualizados (#1 a #8) persistidos sem buracos e sem colisão'
    );

    const searchBruno = allParticipants.find((p) =>
      p.username.toLowerCase().includes('bruno_vip')
    );
    const brunoTickets = allTickets.filter((t) => t.tiktokUserId === 'uid_bruno_202');
    assert(
      Boolean(searchBruno) &&
        searchBruno?.ticketsInSession === 5 &&
        searchBruno?.coinsInSession === 70 &&
        brunoTickets.length === 5,
      'Busca por @usuário (@bruno_vip) retorna saldo exato de moedas (70) e seus 5 bilhetes (#1 a #5)'
    );

    // ------------------------------------------------------------------------
    // 7. PERSISTÊNCIA DURÁVEL E RECUPERAÇÃO DO FIRESTORE PÓS-REINICIALIZAÇÃO
    // ------------------------------------------------------------------------
    console.log('\n--- [7] Recuperação Pós-Reinicialização do Servidor ---');
    const persistedSession = await getOrCreateLiveSession(session.sessionId, `@criador_pro_${uniqueSuffix}`);
    const persistedEvents = await fetchRecentSessionEvents(session.sessionId, 20);

    assert(
      persistedSession.currentTicketCounter === 8 &&
        persistedSession.totalCoins === 125 &&
        persistedEvents.length === 5,
      'Estado completo da LIVE (8 bilhetes, 125 moedas auditadas e 5 eventos persistidos) recuperado do Firestore'
    );

    // ------------------------------------------------------------------------
    // 8. SORTEIO INDIVIDUAL DA LIVE COM HASH SHA-256 E CSPRNG
    // ------------------------------------------------------------------------
    console.log('\n--- [8] Sorteio Individual da LIVE (SHA-256 + CSPRNG) ---');
    const liveSnapshot = await createNonBlockingSessionSnapshot(session.sessionId);
    const liveDrawResult = await executeIndividualLiveDraw(
      session.sessionId,
      liveSnapshot.snapshotId,
      'PIX R$ 500,00'
    );

    assert(
      liveSnapshot.totalEligibleTickets === 8 &&
        liveDrawResult.rosterSha256Hash.length === 64 &&
        liveDrawResult.seedCommitment.length === 64 &&
        Boolean(liveDrawResult.winningTicket?.username),
      `Sorteio individual da LIVE executado com hash SHA-256 e CSPRNG — Bilhete vencedor #${liveDrawResult.winningTicket.ticketNumber} (@${liveDrawResult.winningTicket.username})`
    );

    // ------------------------------------------------------------------------
    // 9. CAMPANHA ACUMULADA MULTI-LIVE COM REGRAS, CONGELAMENTO E SORTEIO
    // ------------------------------------------------------------------------
    console.log('\n--- [9] Campanha Acumulada Multi-LIVE ---');
    const campaign = await createCampaign({
      title: `Campanha Multi-LIVE ${uniqueSuffix}`,
      description: 'Campanha acumulada de teste automatizado',
      prizeName: 'iPhone 16 Pro Max',
      defaultRate: 10,
      maxTicketsPerUser: 4, // Limita a 4 bilhetes por usuário na campanha acumulada
      maxTotalTickets: 6,   // Limita a 6 bilhetes totais na campanha
      eligibilityRuleDefault: 'ALL_TICKETS',
      rulesSummary: 'Campanha acumulada com teto de 4 bilhetes/usuário e 6 bilhetes totais',
    });

    const updatedCamp = await updateCampaignRulesConfig(campaign.campaignId, {
      maxTicketsPerUser: 4,
      maxTotalTickets: 6,
      rulesSummary: 'Regras atualizadas: máx 4 bilhetes/usuário e 6 bilhetes totais.',
    });

    const linkResult = await addSessionToCampaign(updatedCamp.campaignId, session.sessionId);
    const campTickets = await fetchCampaignTickets(updatedCamp.campaignId);
    const brunoCampTickets = campTickets.filter((t) => t.tiktokUserId === 'uid_bruno_202');
    const carlaCampTickets = campTickets.filter((t) => t.tiktokUserId === 'uid_carla_303');

    assert(
      linkResult.totalCampaignTickets === 6 &&
        brunoCampTickets.length === 4 &&
        carlaCampTickets.length === 2,
      'Campanha acumulada indexou a LIVE aplicando maxTicketsPerUser=4 (Bruno=4) e maxTotalTickets=6 (Carla=2, Total=6)'
    );

    const snapshot = await freezeCampaignSnapshot(updatedCamp.campaignId);
    assert(
      snapshot.rosterSha256Hash.length === 64 && snapshot.totalEligibleTickets === 6,
      'Snapshot da campanha congelado com hash SHA-256 de 64 caracteres e 6 bilhetes elegíveis'
    );

    const campaignDraw = await executeCampaignDraw(
      updatedCamp.campaignId,
      snapshot.snapshotId,
      'iPhone 16 Pro Max'
    );
    assert(
      Boolean(campaignDraw.winningTicket?.username) && campaignDraw.seedCommitment.length === 64,
      `Sorteio da campanha acumulada executado com sucesso — Vencedor: @${campaignDraw.winningTicket.username} (Bilhete original #${campaignDraw.winningTicket.ticketNumber})`
    );
  } catch (err: unknown) {
    failed++;
    console.error('❌ Erro inesperado durante os testes:', err);
  } finally {
    // Garante que o plano PRO permaneça ativo ao finalizar os testes
    setProPlanTier('PRO');
  }

  console.log('\n================================================================');
  console.log(`📊 RESULTADO FINAL: ${passed} APROVADOS | ${failed} FALHAS`);
  console.log('================================================================');

  if (failed > 0) {
    process.exit(1);
  }
  process.exit(0);
}

runTests();
