import assert from 'node:assert/strict';
import { TikTokLiveAdapter, extractTikTokGiftPayload } from '../src/server/tiktokLiveAdapter.js';
import { EventBus } from '../src/utils/tiktokConnector.js';
import {
  getOrCreateLiveSession,
  recordGiftEventAtomic,
  fetchSessionParticipants,
  fetchRecentSessionEvents,
  fetchSessionStreaks,
} from '../src/utils/tiktokLiveService.js';

async function runAuditTestSuite() {
  console.log('================================================================================');
  console.log('🧪 AUDITORIA E TESTES AUTOMATIZADOS — FEED DE PRESENTES EM TEMPO REAL (10 CENÁRIOS)');
  console.log('================================================================================\n');

  let passed = 0;

  // =========================================================================
  // TABELA OBRIGATÓRIA DO PROMPT: @joao (Rosa) -> @joao (Rosa) -> @joao (Leão) -> @maria (Rosa) -> @joao (Rosa)
  // =========================================================================
  {
    console.log('▶ [0/10] Validando Tabela Obrigatória do Prompt (@joao Rosa x2, Leão, @maria Rosa, @joao Rosa)...');
    const adapter = new TikTokLiveAdapter();
    const sessionId = `audit_prompt_table_${Date.now()}`;
    await getOrCreateLiveSession(sessionId, 'gioborelli', 100);

    const capturedFeed: Array<{ displayHandle: string; giftName: string; deltaCount: number; coinsGranted: number }> = [];
    adapter.onGift((ev) => {
      capturedFeed.push({
        displayHandle: ev.displayHandle || `@${ev.username}`,
        giftName: ev.giftName,
        deltaCount: ev.deltaCount,
        coinsGranted: ev.coinsGranted,
      });
    });

    const sequence = [
      { user: { userId: '1001', uniqueId: 'joao', nickname: 'João' }, giftDetails: { giftId: 5655, giftName: 'Rosa', diamondCount: 50 } },
      { user: { userId: '1001', uniqueId: 'joao', nickname: 'João' }, giftDetails: { giftId: 5655, giftName: 'Rosa', diamondCount: 50 } },
      { user: { userId: '1001', uniqueId: 'joao', nickname: 'João' }, giftDetails: { giftId: 5879, giftName: 'Leão', diamondCount: 200 } },
      { user: { userId: '1002', uniqueId: 'maria', nickname: 'Maria' }, giftDetails: { giftId: 5655, giftName: 'Rosa', diamondCount: 100 } },
      { user: { userId: '1001', uniqueId: 'joao', nickname: 'João' }, giftDetails: { giftId: 5655, giftName: 'Rosa', diamondCount: 50 } },
    ];

    for (const item of sequence) {
      const outcome = adapter.handleIncomingGift({ ...item, sessionId });
      assert.equal(outcome.accepted, true, 'Todo envio válido da tabela deve ser aceito');
      assert.ok(outcome.event, 'Evento normalizado deve existir');
      await recordGiftEventAtomic(outcome.event);
    }

    assert.equal(capturedFeed.length, 5, 'Os 5 presentes da tabela devem constar no feed');
    assert.deepEqual(
      capturedFeed.map((f) => `${f.displayHandle}:${f.giftName}`),
      ['@joao:Rosa', '@joao:Rosa', '@joao:Leão', '@maria:Rosa', '@joao:Rosa']
    );

    const participants = await fetchSessionParticipants(sessionId);
    const joao = participants.find((p) => p.tiktokUserId === '1001');
    const maria = participants.find((p) => p.tiktokUserId === '1002');
    assert.ok(joao, '@joao deve estar registrado nos participantes');
    assert.ok(maria, '@maria deve estar registrada nos participantes');
    assert.equal(joao.coinsInSession, 350, '@joao deve somar 50+50+200+50 = 350 moedas');
    assert.equal(joao.ticketsInSession, 3, '@joao deve ter 3 bilhetes (taxa 100) e 50 residual');
    assert.equal(joao.carryoverCoins, 50);
    assert.equal(maria.coinsInSession, 100, '@maria deve somar 100 moedas');
    assert.equal(maria.ticketsInSession, 1, '@maria deve ter 1 bilhete');
    await adapter.disconnect();
    console.log('  ✅ [PASSOU] Tabela obrigatória: todos os 5 envios registrados e contabilizados com @usuario real!\n');
  }

  // =========================================================================
  // CENÁRIO 1: Cinco usuários diferentes enviando presentes (estruturas Protobuf v2 e v1)
  // =========================================================================
  {
    console.log('▶ [1/10] Cenário 1: Cinco usuários diferentes enviando presentes...');
    const adapter = new TikTokLiveAdapter();
    const sessionId = `audit_scen1_${Date.now()}`;
    await getOrCreateLiveSession(sessionId, 'gioborelli', 100);

    const users = [
      { userId: '2001', uniqueId: 'ana_live', nickname: 'Ana', giftName: 'Rosa', diamonds: 100 },
      { userId: '2002', uniqueId: 'bruno_vip', nickname: 'Bruno', giftName: 'Coração', diamonds: 200 },
      { userId: '2003', uniqueId: 'carla_sp', nickname: 'Carla', giftName: 'Perfume', diamonds: 150 },
      { userId: '2004', uniqueId: 'diego_gamer', nickname: 'Diego', giftName: 'Boné', diamonds: 100 },
      { userId: '2005', uniqueId: 'elena_luz', nickname: 'Elena', giftName: 'Coroa', diamonds: 300 },
    ];

    for (let i = 0; i < users.length; i++) {
      const u = users[i];
      // Alternate between nested v2 Protobuf payload and flat v1 payload
      const payload =
        i % 2 === 0
          ? {
              sessionId,
              common: { msgId: `msg_u_${u.userId}` },
              user: { userId: u.userId, uniqueId: u.uniqueId, nickname: u.nickname },
              giftDetails: { giftId: 5000 + i, giftName: u.giftName, diamondCount: u.diamonds },
              repeatCount: 1,
              repeatEnd: true,
            }
          : {
              sessionId,
              msgId: `msg_u_${u.userId}`,
              userId: u.userId,
              uniqueId: u.uniqueId,
              nickname: u.nickname,
              giftId: 5000 + i,
              giftName: u.giftName,
              diamondCount: u.diamonds,
              repeatCount: 1,
              repeatEnd: true,
            };

      const outcome = adapter.handleIncomingGift(payload);
      assert.equal(outcome.accepted, true);
      assert.equal(outcome.event?.username, u.uniqueId);
      assert.equal(outcome.event?.displayHandle, `@${u.uniqueId}`);
      assert.equal(outcome.event?.handleAvailable, true);
      await recordGiftEventAtomic(outcome.event!);
    }

    const participants = await fetchSessionParticipants(sessionId);
    assert.equal(participants.length, 5, 'Devem existir exatamente 5 participantes distintos');
    for (const u of users) {
      const found = participants.find((p) => p.tiktokUserId === u.userId);
      assert.ok(found, `Participante @${u.uniqueId} encontrado`);
      assert.equal(found.username, u.uniqueId);
      assert.equal(found.coinsInSession, u.diamonds);
    }
    await adapter.disconnect();
    passed++;
    console.log('  ✅ [PASSOU] Cenário 1: 5 usuários diferentes identificados com @usuario real e IDs numéricos estáveis!\n');
  }

  // =========================================================================
  // CENÁRIO 2: Um mesmo usuário enviando cinco presentes iguais em sequência
  // =========================================================================
  {
    console.log('▶ [2/10] Cenário 2: Um mesmo usuário enviando cinco presentes iguais em sequência...');
    const adapter = new TikTokLiveAdapter();
    const bus = new EventBus();
    const sessionId = `audit_scen2_${Date.now()}`;
    await getOrCreateLiveSession(sessionId, 'gioborelli', 100);

    for (let i = 1; i <= 5; i++) {
      // Simulate same user sending 5 identical Roses in sequence, even when connector sends groupId="0" or same groupId
      const outcome = adapter.handleIncomingGift({
        sessionId,
        msgId: `seq_msg_${i}`,
        user: { userId: '3001', uniqueId: 'lucas_fiel', nickname: 'Lucas Fiel' },
        giftDetails: { giftId: 5655, giftName: 'Rosa', diamondCount: 100, giftType: 0 },
        repeatCount: 1,
        repeatEnd: true,
        groupId: '0',
      });

      assert.equal(outcome.accepted, true, `Envio #${i} do mesmo presente pelo mesmo usuário deve ser aceito`);
      assert.equal(outcome.event?.deltaCount, 1, `Delta do envio #${i} deve ser 1`);
      assert.equal(outcome.event?.coinsGranted, 100);

      const isUniqueInBus = bus.processEvent(outcome.event!);
      assert.equal(isUniqueInBus, true, `EventBus deve aceitar envio #${i}`);

      const persisted = await recordGiftEventAtomic(outcome.event!);
      assert.equal(persisted.newTickets, 1, `Envio #${i} deve emitir 1 novo bilhete`);
    }

    const parts = await fetchSessionParticipants(sessionId);
    assert.equal(parts.length, 1);
    assert.equal(parts[0].username, 'lucas_fiel');
    assert.equal(parts[0].coinsInSession, 500, '5 Rosas de 100 moedas = 500 moedas totais');
    assert.equal(parts[0].ticketsInSession, 5, '5 bilhetes emitidos para os 5 presentes iguais em sequência');
    await adapter.disconnect();
    passed++;
    console.log('  ✅ [PASSOU] Cenário 2: 5 presentes iguais em sequência do mesmo usuário registrados (500 moedas, 5 bilhetes)!\n');
  }

  // =========================================================================
  // CENÁRIO 3: Um mesmo usuário enviando presentes diferentes
  // =========================================================================
  {
    console.log('▶ [3/10] Cenário 3: Um mesmo usuário enviando presentes diferentes...');
    const adapter = new TikTokLiveAdapter();
    const sessionId = `audit_scen3_${Date.now()}`;
    await getOrCreateLiveSession(sessionId, 'gioborelli', 100);

    const gifts = [
      { giftId: 5655, giftName: 'Rosa', diamondCount: 40 },
      { giftId: 5658, giftName: 'Sorvete', diamondCount: 60 },
      { giftId: 5879, giftName: 'Leão', diamondCount: 300 },
    ];

    for (const g of gifts) {
      const outcome = adapter.handleIncomingGift({
        sessionId,
        user: { userId: '4001', uniqueId: 'fernanda_top', nickname: 'Fernanda' },
        giftDetails: g,
        repeatCount: 1,
        repeatEnd: true,
      });
      assert.equal(outcome.accepted, true);
      await recordGiftEventAtomic(outcome.event!);
    }

    const parts = await fetchSessionParticipants(sessionId);
    assert.equal(parts.length, 1);
    assert.equal(parts[0].username, 'fernanda_top');
    assert.equal(parts[0].coinsInSession, 400);
    assert.equal(parts[0].ticketsInSession, 4);
    const events = await fetchRecentSessionEvents(sessionId, 10);
    assert.equal(events.length, 3, 'Os 3 presentes diferentes devem estar gravados no histórico');
    await adapter.disconnect();
    passed++;
    console.log('  ✅ [PASSOU] Cenário 3: Presentes diferentes do mesmo usuário registrados e somados (40+60+300 = 400 moedas, 4 bilhetes)!\n');
  }

  // =========================================================================
  // CENÁRIO 4: Um mesmo usuário enviando vários presentes em momentos diferentes
  // =========================================================================
  {
    console.log('▶ [4/10] Cenário 4: Um mesmo usuário enviando vários presentes em momentos diferentes...');
    const adapter = new TikTokLiveAdapter();
    const sessionId = `audit_scen4_${Date.now()}`;
    await getOrCreateLiveSession(sessionId, 'gioborelli', 100);

    // Momento 1: 70 moedas (0 bilhetes, 70 carryover)
    const out1 = adapter.handleIncomingGift({
      sessionId,
      msgId: 't_moment_1',
      user: { userId: '5001', uniqueId: 'rafael_live', nickname: 'Rafael' },
      giftDetails: { giftId: 6001, giftName: 'Café', diamondCount: 70 },
      repeatCount: 1,
      repeatEnd: true,
    });
    const res1 = await recordGiftEventAtomic(out1.event!);
    assert.equal(res1.newTickets, 0);
    assert.equal(res1.carryover, 70);

    await new Promise((r) => setTimeout(r, 40));

    // Momento 2: +50 moedas -> total 120 (1 bilhete emitido, 20 carryover)
    const out2 = adapter.handleIncomingGift({
      sessionId,
      msgId: 't_moment_2',
      user: { userId: '5001', uniqueId: 'rafael_live', nickname: 'Rafael' },
      giftDetails: { giftId: 6002, giftName: 'Rosquinha', diamondCount: 50 },
      repeatCount: 1,
      repeatEnd: true,
    });
    const res2 = await recordGiftEventAtomic(out2.event!);
    assert.equal(res2.newTickets, 1);
    assert.equal(res2.carryover, 20);

    await new Promise((r) => setTimeout(r, 40));

    // Momento 3: +180 moedas -> total elegível 200 (2 bilhetes emitidos, 0 carryover)
    const out3 = adapter.handleIncomingGift({
      sessionId,
      msgId: 't_moment_3',
      user: { userId: '5001', uniqueId: 'rafael_live', nickname: 'Rafael' },
      giftDetails: { giftId: 6003, giftName: 'Super Carro', diamondCount: 180 },
      repeatCount: 1,
      repeatEnd: true,
    });
    const res3 = await recordGiftEventAtomic(out3.event!);
    assert.equal(res3.newTickets, 2);
    assert.equal(res3.carryover, 0);
    assert.equal(res3.totalCoins, 300);

    await adapter.disconnect();
    passed++;
    console.log('  ✅ [PASSOU] Cenário 4: Envios em momentos distintos acumulam saldo residual e geram bilhetes exatos!\n');
  }

  // =========================================================================
  // CENÁRIO 5: Eventos retransmitidos pelo conector (Idempotência Técnica)
  // =========================================================================
  {
    console.log('▶ [5/10] Cenário 5: Eventos técnicos retransmitidos pelo conector...');
    const adapter = new TikTokLiveAdapter();
    const bus = new EventBus();
    const sessionId = `audit_scen5_${Date.now()}`;
    await getOrCreateLiveSession(sessionId, 'gioborelli', 100);

    const rawTechnicalPacket = {
      sessionId,
      common: { msgId: 'webcast_msg_999888777' },
      user: { userId: '6001', uniqueId: 'paula_vip', nickname: 'Paula VIP' },
      giftDetails: { giftId: 5655, giftName: 'Rosa', diamondCount: 100 },
      repeatCount: 1,
      repeatEnd: true,
      groupId: 'grp_paula_1',
    };

    // 1st arrival: must be accepted
    const firstTry = adapter.handleIncomingGift(rawTechnicalPacket);
    assert.equal(firstTry.accepted, true);
    assert.equal(firstTry.isDuplicate, false);
    assert.equal(bus.processEvent(firstTry.event!), true);
    await recordGiftEventAtomic(firstTry.event!);

    // 2nd & 3rd arrivals of the exact same technical packet (connector retransmission): must be blocked!
    const secondTry = adapter.handleIncomingGift(rawTechnicalPacket);
    assert.equal(secondTry.accepted, false);
    assert.equal(secondTry.isDuplicate, true);

    // Even if passed directly to EventBus on frontend, EventBus blocks it:
    assert.equal(bus.processEvent(firstTry.event!), false);

    // Now the same user sends a NEW gift (new msgId): must be accepted!
    const newSendTry = adapter.handleIncomingGift({
      ...rawTechnicalPacket,
      common: { msgId: 'webcast_msg_999888778' },
    });
    assert.equal(newSendTry.accepted, true, 'Novo presente com novo msgId da mesma pessoa deve ser aceito');
    assert.equal(bus.processEvent(newSendTry.event!), true);
    await recordGiftEventAtomic(newSendTry.event!);

    const parts = await fetchSessionParticipants(sessionId);
    assert.equal(parts[0].coinsInSession, 200, 'Apenas os 2 envios legítimos devem ser contabilizados (200 moedas)');
    assert.equal(parts[0].ticketsInSession, 2);
    await adapter.disconnect();
    passed++;
    console.log('  ✅ [PASSOU] Cenário 5: Retransmissões técnicas bloqueadas sem impedir novos envios da mesma pessoa!\n');
  }

  // =========================================================================
  // CENÁRIO 6: Presentes em combo e streak (progressão incremental + fechamento)
  // =========================================================================
  {
    console.log('▶ [6/10] Cenário 6: Presentes em combo e streak...');
    const adapter = new TikTokLiveAdapter();
    const sessionId = `audit_scen6_${Date.now()}`;
    await getOrCreateLiveSession(sessionId, 'gioborelli', 100);

    // Combo de 5 unidades de um presente de 20 moedas (total esperado = 100 moedas = 1 bilhete):
    // Passo 1: repeatCount = 1, repeatEnd = false -> delta = +1 (20 moedas)
    const step1 = adapter.handleIncomingGift({
      sessionId,
      msgId: 'combo_m1',
      user: { userId: '7001', uniqueId: 'combo_master', nickname: 'Combo Master' },
      giftDetails: { giftId: 5655, giftName: 'Rosa Combo', diamondCount: 20, giftType: 1 },
      repeatCount: 1,
      repeatEnd: false,
      groupId: 'grp_streak_777',
    });
    assert.equal(step1.accepted, true);
    assert.equal(step1.event?.deltaCount, 1);
    assert.equal(step1.event?.coinsGranted, 20);
    await recordGiftEventAtomic(step1.event!);

    // Passo 2: repeatCount = 3, repeatEnd = false -> delta = +2 (40 moedas)
    const step2 = adapter.handleIncomingGift({
      sessionId,
      msgId: 'combo_m2',
      user: { userId: '7001', uniqueId: 'combo_master', nickname: 'Combo Master' },
      giftDetails: { giftId: 5655, giftName: 'Rosa Combo', diamondCount: 20, giftType: 1 },
      repeatCount: 3,
      repeatEnd: false,
      groupId: 'grp_streak_777',
    });
    assert.equal(step2.accepted, true);
    assert.equal(step2.event?.deltaCount, 2);
    assert.equal(step2.event?.coinsGranted, 40);
    await recordGiftEventAtomic(step2.event!);

    // Passo 3: repeatCount = 5, repeatEnd = false -> delta = +2 (40 moedas)
    const step3 = adapter.handleIncomingGift({
      sessionId,
      msgId: 'combo_m3',
      user: { userId: '7001', uniqueId: 'combo_master', nickname: 'Combo Master' },
      giftDetails: { giftId: 5655, giftName: 'Rosa Combo', diamondCount: 20, giftType: 1 },
      repeatCount: 5,
      repeatEnd: false,
      groupId: 'grp_streak_777',
    });
    assert.equal(step3.accepted, true);
    assert.equal(step3.event?.deltaCount, 2);
    assert.equal(step3.event?.coinsGranted, 40);
    await recordGiftEventAtomic(step3.event!);

    // Passo 4 (Pacote finalizador do TikTok Webcast): repeatCount = 5, repeatEnd = true -> delta = 0 (não duplica!)
    const step4Close = adapter.handleIncomingGift({
      sessionId,
      msgId: 'combo_m4_end',
      user: { userId: '7001', uniqueId: 'combo_master', nickname: 'Combo Master' },
      giftDetails: { giftId: 5655, giftName: 'Rosa Combo', diamondCount: 20, giftType: 1 },
      repeatCount: 5,
      repeatEnd: true,
      groupId: 'grp_streak_777',
    });
    assert.equal(step4Close.accepted, false, 'Pacote finalizador sem incremento não deve gerar crédito duplicado');
    assert.equal(step4Close.reason, 'COMBO_FINALIZATION_ACK');
    assert.equal(step4Close.streak?.status, 'COMPLETED');

    const parts = await fetchSessionParticipants(sessionId);
    assert.equal(parts[0].coinsInSession, 100, 'Combo de 5x20 moedas deve contabilizar exatamente 100 moedas');
    assert.equal(parts[0].ticketsInSession, 1, 'Deve gerar exatamente 1 bilhete');
    await adapter.disconnect();
    passed++;
    console.log('  ✅ [PASSOU] Cenário 6: Combo/streak contabilizou deltas exatos (+1, +2, +2 = 5x) sem duplicar no fechamento!\n');
  }

  // =========================================================================
  // CENÁRIO 7: Reconexão da TikTok LIVE durante combo ativo
  // =========================================================================
  {
    console.log('▶ [7/10] Cenário 7: Reconexão da TikTok LIVE...');
    const adapter = new TikTokLiveAdapter();
    const sessionId = `audit_scen7_${Date.now()}`;
    await getOrCreateLiveSession(sessionId, 'gioborelli', 100);

    // Antes da queda de conexão: combo inicia em repeatCount = 2 (50 moedas cada = 100 moedas)
    const preDrop = adapter.handleIncomingGift({
      sessionId,
      msgId: 'reconn_msg_1',
      user: { userId: '8001', uniqueId: 'marcos_reconn', nickname: 'Marcos' },
      giftDetails: { giftId: 5655, giftName: 'Estrela', diamondCount: 50, giftType: 1 },
      repeatCount: 2,
      repeatEnd: false,
      groupId: 'grp_reconn_1',
    });
    assert.equal(preDrop.accepted, true);
    assert.equal(preDrop.event?.deltaCount, 2);
    await recordGiftEventAtomic(preDrop.event!);

    // Simula desconexão e reconexão da LIVE (mantendo a sessão ativa)
    await adapter.disconnect(false);
    await adapter.restoreSessionFromFirestore(sessionId);

    // Conector reenvia o pacote anterior após reconectar: deve ser ignorado!
    const retransmitted = adapter.handleIncomingGift({
      sessionId,
      msgId: 'reconn_msg_1',
      user: { userId: '8001', uniqueId: 'marcos_reconn', nickname: 'Marcos' },
      giftDetails: { giftId: 5655, giftName: 'Estrela', diamondCount: 50, giftType: 1 },
      repeatCount: 2,
      repeatEnd: false,
      groupId: 'grp_reconn_1',
    });
    assert.equal(retransmitted.accepted, false);
    assert.equal(retransmitted.isDuplicate, true);

    // Combo conclui após reconexão em repeatCount = 4, repeatEnd = true -> deve creditar apenas o delta +2 (100 moedas)
    const postReconnect = adapter.handleIncomingGift({
      sessionId,
      msgId: 'reconn_msg_2',
      user: { userId: '8001', uniqueId: 'marcos_reconn', nickname: 'Marcos' },
      giftDetails: { giftId: 5655, giftName: 'Estrela', diamondCount: 50, giftType: 1 },
      repeatCount: 4,
      repeatEnd: true,
      groupId: 'grp_reconn_1',
    });
    assert.equal(postReconnect.accepted, true);
    assert.equal(postReconnect.event?.deltaCount, 2, 'Após reconexão, delta de 2->4 deve ser +2');
    assert.equal(postReconnect.event?.coinsGranted, 100);
    await recordGiftEventAtomic(postReconnect.event!);

    const parts = await fetchSessionParticipants(sessionId);
    assert.equal(parts[0].coinsInSession, 200);
    assert.equal(parts[0].ticketsInSession, 2);
    await adapter.disconnect();
    passed++;
    console.log('  ✅ [PASSOU] Cenário 7: Reconexão da LIVE preservou estado de combo e evitou perda/duplicação!\n');
  }

  // =========================================================================
  // CENÁRIO 8: Reinício do servidor (Recuperação completa via Firestore)
  // =========================================================================
  {
    console.log('▶ [8/10] Cenário 8: Reinício do servidor e restauração via Firestore...');
    const sessionId = `audit_scen8_${Date.now()}`;
    await getOrCreateLiveSession(sessionId, 'gioborelli', 100);

    // Instância 1 do servidor antes do restart
    const serverInstance1 = new TikTokLiveAdapter();
    const ev1 = serverInstance1.handleIncomingGift({
      sessionId,
      msgId: 'srv_msg_1',
      user: { userId: '9001', uniqueId: 'julia_restart', nickname: 'Júlia' },
      giftDetails: { giftId: 5655, giftName: 'Rosa', diamondCount: 50, giftType: 1 },
      repeatCount: 3,
      repeatEnd: false,
      groupId: 'grp_srv_restart',
    });
    assert.equal(ev1.accepted, true);
    await recordGiftEventAtomic(ev1.event!);
    await serverInstance1.disconnect();

    // Simula reinício completo do processo Node.js (nova instância com memória limpa)
    const serverInstance2 = new TikTokLiveAdapter();
    serverInstance2.resetMemoryStateForSimulatedRestart();
    const restored = await serverInstance2.restoreSessionFromFirestore(sessionId);
    assert.ok(restored.restoredStreaks >= 1, 'Deve restaurar streaks do Firestore');
    assert.ok(restored.restoredEvents >= 1, 'Deve restaurar eventos do Firestore');

    // Retransmissão do evento anterior ao restart deve ser bloqueada pela instância 2
    const dupAfterRestart = serverInstance2.handleIncomingGift({
      sessionId,
      msgId: 'srv_msg_1',
      user: { userId: '9001', uniqueId: 'julia_restart', nickname: 'Júlia' },
      giftDetails: { giftId: 5655, giftName: 'Rosa', diamondCount: 50, giftType: 1 },
      repeatCount: 3,
      repeatEnd: false,
      groupId: 'grp_srv_restart',
    });
    assert.equal(dupAfterRestart.accepted, false);
    assert.equal(dupAfterRestart.isDuplicate, true);

    // Continuação do combo após restart (repeatCount: 3 -> 6) deve creditar apenas delta +3 (150 moedas)
    const contAfterRestart = serverInstance2.handleIncomingGift({
      sessionId,
      msgId: 'srv_msg_2',
      user: { userId: '9001', uniqueId: 'julia_restart', nickname: 'Júlia' },
      giftDetails: { giftId: 5655, giftName: 'Rosa', diamondCount: 50, giftType: 1 },
      repeatCount: 6,
      repeatEnd: true,
      groupId: 'grp_srv_restart',
    });
    assert.equal(contAfterRestart.accepted, true);
    assert.equal(contAfterRestart.event?.deltaCount, 3, 'Delta pós-restart (6 - 3) deve ser +3');
    assert.equal(contAfterRestart.event?.coinsGranted, 150);
    await recordGiftEventAtomic(contAfterRestart.event!);

    const parts = await fetchSessionParticipants(sessionId);
    assert.equal(parts[0].coinsInSession, 300, 'Total na sessão após restart deve ser 150 + 150 = 300 moedas');
    assert.equal(parts[0].ticketsInSession, 3);
    await serverInstance2.disconnect();
    passed++;
    console.log('  ✅ [PASSOU] Cenário 8: Reinício do servidor recuperou streaks e eventos do Firestore com 100% de precisão!\n');
  }

  // =========================================================================
  // CENÁRIO 9: Evento sem arroba (uniqueId) disponível
  // =========================================================================
  {
    console.log('▶ [9/10] Cenário 9: Evento sem arroba (uniqueId) disponível...');
    const adapter = new TikTokLiveAdapter();
    const sessionId = `audit_scen9_${Date.now()}`;
    await getOrCreateLiveSession(sessionId, 'gioborelli', 100);

    // Dois usuários distintos cujos eventos vieram sem uniqueId (apenas userId numérico ou sem handle)
    const noHandle1 = adapter.handleIncomingGift({
      sessionId,
      msgId: 'no_handle_msg_1',
      user: { userId: '99001122', nickname: 'Apoiador Misterioso A' },
      giftDetails: { giftId: 5655, giftName: 'Rosa', diamondCount: 100 },
      repeatCount: 1,
      repeatEnd: true,
    });

    const noHandle2 = adapter.handleIncomingGift({
      sessionId,
      msgId: 'no_handle_msg_2',
      user: { userId: '99003344', nickname: 'Apoiador Misterioso B' },
      giftDetails: { giftId: 5655, giftName: 'Rosa', diamondCount: 100 },
      repeatCount: 1,
      repeatEnd: true,
    });

    assert.equal(noHandle1.accepted, true);
    assert.equal(noHandle1.event?.handleAvailable, false, 'Deve sinalizar handleAvailable = false');
    assert.equal(noHandle1.event?.displayHandle, 'Arroba indisponível', 'Deve exibir "Arroba indisponível" sem inventar arroba');
    assert.notEqual(noHandle1.event?.username, 'gioborelli', 'Jamais deve usar o criador da LIVE como presenteador');
    assert.notEqual(noHandle1.event?.username, 'anonimo', 'Jamais deve usar "anonimo" fixo');

    assert.equal(noHandle2.accepted, true);
    assert.equal(noHandle2.event?.handleAvailable, false);
    assert.notEqual(noHandle1.event?.tiktokUserId, noHandle2.event?.tiktokUserId, 'Usuários distintos sem arroba não podem ser fundidos');

    await recordGiftEventAtomic(noHandle1.event!);
    await recordGiftEventAtomic(noHandle2.event!);

    const parts = await fetchSessionParticipants(sessionId);
    assert.equal(parts.length, 2, 'Os 2 usuários sem arroba devem permanecer separados pelo seu ID');
    await adapter.disconnect();
    passed++;
    console.log('  ✅ [PASSOU] Cenário 9: Eventos sem arroba sinalizados como "Arroba indisponível" sem inventar identidade nem fundir usuários!\n');
  }

  // =========================================================================
  // CENÁRIO 10: Dois usuários diferentes enviando o mesmo presente simultaneamente
  // =========================================================================
  {
    console.log('▶ [10/10] Cenário 10: Dois usuários diferentes enviando o mesmo presente simultaneamente...');
    const adapter = new TikTokLiveAdapter();
    const sessionId = `audit_scen10_${Date.now()}`;
    await getOrCreateLiveSession(sessionId, 'gioborelli', 100);

    const outUserA = adapter.handleIncomingGift({
      sessionId,
      msgId: 'simul_msg_A',
      user: { userId: '10001', uniqueId: 'bia_simultanea', nickname: 'Bia' },
      giftDetails: { giftId: 5879, giftName: 'Leão', diamondCount: 200 },
      repeatCount: 1,
      repeatEnd: true,
    });

    const outUserB = adapter.handleIncomingGift({
      sessionId,
      msgId: 'simul_msg_B',
      user: { userId: '10002', uniqueId: 'caio_simultaneo', nickname: 'Caio' },
      giftDetails: { giftId: 5879, giftName: 'Leão', diamondCount: 200 },
      repeatCount: 1,
      repeatEnd: true,
    });

    assert.equal(outUserA.accepted, true);
    assert.equal(outUserB.accepted, true);

    // Dispara persistência concorrente simultânea via Promise.all
    const [resA, resB] = await Promise.all([
      recordGiftEventAtomic(outUserA.event!),
      recordGiftEventAtomic(outUserB.event!),
    ]);

    assert.equal(resA.newTickets, 2);
    assert.equal(resB.newTickets, 2);

    const allTicketNumbers = [...resA.ticketNumbers, ...resB.ticketNumbers].sort((a, b) => a - b);
    assert.deepEqual(
      allTicketNumbers,
      [1, 2, 3, 4],
      'Bilhetes simultâneos devem ser sequenciais [1, 2, 3, 4] sem colisão'
    );

    const parts = await fetchSessionParticipants(sessionId);
    assert.equal(parts.length, 2);
    await adapter.disconnect();
    passed++;
    console.log('  ✅ [PASSOU] Cenário 10: Envios simultâneos de 2 usuários processados atomicamente com bilhetes [1, 2, 3, 4] sem colisão!\n');
  }

  // =========================================================================
  // CENÁRIO 11: Eventos sem eventId/msgId (Assinatura Técnica + 5 envios sem ID)
  // =========================================================================
  {
    console.log('▶ [11/12] Cenário 11: Eventos sem eventId (assinatura técnica e envios legítimos sem ID)...');
    const adapter = new TikTokLiveAdapter();
    const bus = new EventBus();
    const sessionId = `audit_scen11_${Date.now()}`;
    await getOrCreateLiveSession(sessionId, 'gioborelli', 100);

    const feedEventKeys: string[] = [];
    bus.subscribe('gift', (ev: any) => {
      feedEventKeys.push(ev.eventKey);
    });

    // Parte A: 5 presentes iguais enviados individualmente pela mesma pessoa SEM eventId e SEM msgId
    for (let i = 1; i <= 5; i++) {
      const outcome = adapter.handleIncomingGift({
        sessionId,
        user: { userId: '11001', uniqueId: 'gabriel_sem_id', nickname: 'Gabriel' },
        giftDetails: { giftId: 5655, giftName: 'Rosa', diamondCount: 100 },
        repeatCount: 1,
        repeatEnd: true,
      });
      assert.equal(outcome.accepted, true, `Envio sem eventId #${i} deve ser aceito`);
      assert.ok(outcome.event?.eventKey, 'Todo evento deve possuir eventKey exclusivo');
      assert.ok(outcome.event?.technicalSignature, 'Todo evento deve possuir technicalSignature');
      assert.equal(bus.processEvent(outcome.event!), true);
      await recordGiftEventAtomic(outcome.event!);
    }

    assert.equal(new Set(feedEventKeys).size, 5, 'Cada um dos 5 presentes deve gerar um eventKey exclusivo no feed');

    // Parte B: Evento sem eventId/msgId mas com createTime original de alta precisão -> retransmissão idêntica bloqueada
    const packetWithOrigTimestamp = {
      sessionId,
      common: { createTime: '1730389999123' },
      user: { userId: '11001', uniqueId: 'gabriel_sem_id', nickname: 'Gabriel' },
      giftDetails: { giftId: 5655, giftName: 'Rosa', diamondCount: 100 },
      repeatCount: 1,
      repeatEnd: true,
      groupId: 'grp_ts_1',
    };
    const firstWithTs = adapter.handleIncomingGift(packetWithOrigTimestamp);
    assert.equal(firstWithTs.accepted, true, '1º envio com timestamp original deve ser aceito');
    const duplicateWithTs = adapter.handleIncomingGift(packetWithOrigTimestamp);
    assert.equal(duplicateWithTs.accepted, false, 'Retransmissão com mesma assinatura técnica (createTime+sender+gift+group+repeat) deve ser bloqueada');
    assert.equal(duplicateWithTs.isDuplicate, true);

    await adapter.disconnect();
    passed++;
    console.log('  ✅ [PASSOU] Cenário 11: Eventos sem eventId identificados por assinatura técnica com eventKey exclusivo!\n');
  }

  // =========================================================================
  // CENÁRIO 12: Novo combo após encerramento do combo anterior + Retransmissão de eventId
  // =========================================================================
  {
    console.log('▶ [12/12] Cenário 12: Novo combo após encerramento do combo anterior e retransmissão de eventId...');
    const adapter = new TikTokLiveAdapter();
    const bus = new EventBus();
    const sessionId = `audit_scen12_${Date.now()}`;
    await getOrCreateLiveSession(sessionId, 'gioborelli', 100);

    // Combo Ciclo 1: repeatCount 1 -> 2 (encerrado com repeatEnd: true)
    const c1Step1 = adapter.handleIncomingGift({
      sessionId,
      eventId: 'tiktok_evt_c1_s1',
      user: { userId: '12001', uniqueId: 'vitoria_combos', nickname: 'Vitória' },
      giftDetails: { giftId: 5655, giftName: 'Rosa', diamondCount: 50, giftType: 1 },
      repeatCount: 1,
      repeatEnd: false,
      groupId: 'grp_vitoria_1',
    });
    assert.equal(c1Step1.accepted, true);
    assert.equal(bus.processEvent(c1Step1.event!), true);
    await recordGiftEventAtomic(c1Step1.event!);

    // Retransmissão exata do mesmo eventId deve ser bloqueada
    const c1Step1Dup = adapter.handleIncomingGift({
      sessionId,
      eventId: 'tiktok_evt_c1_s1',
      user: { userId: '12001', uniqueId: 'vitoria_combos', nickname: 'Vitória' },
      giftDetails: { giftId: 5655, giftName: 'Rosa', diamondCount: 50, giftType: 1 },
      repeatCount: 1,
      repeatEnd: false,
      groupId: 'grp_vitoria_1',
    });
    assert.equal(c1Step1Dup.accepted, false);
    assert.equal(c1Step1Dup.isDuplicate, true);

    const c1Step2End = adapter.handleIncomingGift({
      sessionId,
      eventId: 'tiktok_evt_c1_s2',
      user: { userId: '12001', uniqueId: 'vitoria_combos', nickname: 'Vitória' },
      giftDetails: { giftId: 5655, giftName: 'Rosa', diamondCount: 50, giftType: 1 },
      repeatCount: 2,
      repeatEnd: true,
      groupId: 'grp_vitoria_1',
    });
    assert.equal(c1Step2End.accepted, true);
    assert.equal(c1Step2End.event?.deltaCount, 1);
    assert.equal(bus.processEvent(c1Step2End.event!), true);
    await recordGiftEventAtomic(c1Step2End.event!);

    // Combo Ciclo 2 (NOVO COMBO da mesma usuária e mesmo presente após o anterior ter encerrado, mesmo que reutilize groupId):
    const c2Step1 = adapter.handleIncomingGift({
      sessionId,
      eventId: 'tiktok_evt_c2_s1',
      user: { userId: '12001', uniqueId: 'vitoria_combos', nickname: 'Vitória' },
      giftDetails: { giftId: 5655, giftName: 'Rosa', diamondCount: 50, giftType: 1 },
      repeatCount: 1,
      repeatEnd: false,
      groupId: 'grp_vitoria_1',
    });
    assert.equal(c2Step1.accepted, true, 'Novo combo após repeatEnd=true deve iniciar novo ciclo');
    assert.equal(c2Step1.event?.deltaCount, 1);

    const c2Step2 = adapter.handleIncomingGift({
      sessionId,
      eventId: 'tiktok_evt_c2_s2',
      user: { userId: '12001', uniqueId: 'vitoria_combos', nickname: 'Vitória' },
      giftDetails: { giftId: 5655, giftName: 'Rosa', diamondCount: 50, giftType: 1 },
      repeatCount: 2,
      repeatEnd: true,
      groupId: 'grp_vitoria_1',
    });
    assert.equal(c2Step2.accepted, true);
    assert.equal(c2Step2.event?.deltaCount, 1);

    assert.notEqual(c1Step1.event?.eventKey, c2Step1.event?.eventKey, 'eventKey do 2º combo deve ser distinto do 1º combo');
    assert.equal(bus.processEvent(c2Step1.event!), true);
    assert.equal(bus.processEvent(c2Step2.event!), true);
    await recordGiftEventAtomic(c2Step1.event!);
    await recordGiftEventAtomic(c2Step2.event!);

    const parts = await fetchSessionParticipants(sessionId);
    assert.equal(parts[0].coinsInSession, 200, 'Dois combos de 2x50 moedas = 200 moedas');
    assert.equal(parts[0].ticketsInSession, 2, '200 moedas = 2 bilhetes');
    await adapter.disconnect();
    passed++;
    console.log('  ✅ [PASSOU] Cenário 12: Novo combo após encerramento do anterior e bloqueio de retransmissão de eventId validados!\n');
  }

  console.log('================================================================================');
  console.log(`🏆 RESULTADO FINAL: ${passed}/12 CENÁRIOS OBRIGATÓRIOS + TABELA DO PROMPT APROVADOS COM SUCESSO!`);
  console.log('================================================================================');
  process.exit(0);
}

runAuditTestSuite().catch((err) => {
  console.error('❌ Falha na suíte de testes de auditoria:', err);
  process.exit(1);
});
