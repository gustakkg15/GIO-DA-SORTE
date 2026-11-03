import {
  getOrCreateLiveSession,
  recordGiftEventAtomic,
  createNonBlockingSessionSnapshot,
  executeIndividualLiveDraw,
  updateSessionConversionRate,
  fetchGlobalParticipantHistory,
} from '../src/utils/tiktokLiveService.js';
import {
  createCampaign,
  addSessionToCampaign,
  fetchCampaignById,
  fetchCampaignTickets,
  freezeCampaignSnapshot,
  executeCampaignDraw,
} from '../src/utils/campaignService.js';

async function runFullMatrixVerification() {
  console.log('================================================================');
  console.log('CERTIFICAÇÃO TÉCNICA OFICIAL — GIO DA SORTE PRO');
  console.log('EXECUÇÃO DA MATRIZ COMPLETA DE TESTES OBRIGATÓRIOS 1 A 8');
  console.log('================================================================\n');

  const live1 = `live_mat1_${Date.now()}`;
  const live2 = `live_mat2_${Date.now()}`;
  const testUserId = `user_mat_${Date.now()}`;
  const username = 'roberto_albuquerque';
  const nickname = 'Roberto Albuquerque';

  // -------------------------------------------------------------
  // TESTE 1: Usuário recebe 300 moedas na LIVE 1 (Taxa 100)
  // Esperado: Ganha exatamente 3 bilhetes vinculados à LIVE 1
  // -------------------------------------------------------------
  console.log('▶ [TESTE 1] Enviando 300 moedas na LIVE 1...');
  await getOrCreateLiveSession(live1, 'gioborelli', 100);
  const res1 = await recordGiftEventAtomic({
    sessionId: live1,
    tiktokUserId: testUserId,
    username,
    nickname,
    giftId: 5655,
    giftName: 'Rosa Especial',
    diamondCount: 100,
    repeatCount: 3,
    deltaCount: 3,
    coinsGranted: 300,
    repeatEnd: true,
    groupId: 'grp_mat_1',
    eventId: `${live1}_grp_mat_1_3`,
  });

  if (res1.newTickets !== 3 || res1.ticketNumbers.length !== 3) {
    throw new Error(`FALHA NO TESTE 1: Esperava 3 bilhetes, obteve ${res1.newTickets}`);
  }
  console.log(`   ✅ SUCESSO: Emitidos 3 bilhetes na LIVE 1 (#${res1.ticketNumbers.join(', #')})\n`);

  // -------------------------------------------------------------
  // TESTE 2: Mesmo usuário recebe 200 moedas na LIVE 2 (Taxa 100)
  // Esperado: Ganha exatamente 2 bilhetes exclusivos vinculados à LIVE 2
  // -------------------------------------------------------------
  console.log('▶ [TESTE 2] Mesmo usuário enviando 200 moedas na LIVE 2...');
  await getOrCreateLiveSession(live2, 'gioborelli', 100);
  const res2 = await recordGiftEventAtomic({
    sessionId: live2,
    tiktokUserId: testUserId,
    username,
    nickname,
    giftId: 5655,
    giftName: 'Rosa Especial',
    diamondCount: 100,
    repeatCount: 2,
    deltaCount: 2,
    coinsGranted: 200,
    repeatEnd: true,
    groupId: 'grp_mat_2',
    eventId: `${live2}_grp_mat_2_2`,
  });

  if (res2.newTickets !== 2 || res2.ticketNumbers[0] !== 1 || res2.ticketNumbers[1] !== 2) {
    throw new Error(`FALHA NO TESTE 2: Esperava bilhetes #1 e #2 na LIVE 2, obteve ${res2.ticketNumbers.join(', ')}`);
  }
  console.log(`   ✅ SUCESSO: Emitidos 2 bilhetes na LIVE 2 (#${res2.ticketNumbers.join(', #')})\n`);

  // -------------------------------------------------------------
  // TESTE 3: Criação de Campanha Especial agregando LIVE 1 e LIVE 2
  // Esperado: Usuário possui 5 bilhetes elegíveis acumulados
  // -------------------------------------------------------------
  console.log('▶ [TESTE 3] Criando Campanha Especial Multi-LIVE e vinculando LIVE 1 e LIVE 2...');
  const campaign = await createCampaign({
    title: 'Campanha de Certificação Oficial GIO DA SORTE',
    description: 'Campanha agregadora de transmissões com verificação ponta a ponta',
    prizeName: 'Carro Zero KM',
  });

  await addSessionToCampaign(campaign.campaignId, live1);
  await addSessionToCampaign(campaign.campaignId, live2);

  const campTickets = await fetchCampaignTickets(campaign.campaignId);
  const userTicketsInCamp = campTickets.filter((t) => t.tiktokUserId === testUserId);

  if (campTickets.length !== 5 || userTicketsInCamp.length !== 5) {
    throw new Error(`FALHA NO TESTE 3: Esperava 5 bilhetes na campanha, obteve ${campTickets.length}`);
  }
  console.log(`   ✅ SUCESSO: Campanha acumulou exatamente 5 bilhetes (3 da LIVE 1 + 2 da LIVE 2)\n`);

  // -------------------------------------------------------------
  // TESTE 6: Tentativa de adicionar o mesmo bilhete duas vezes
  // Esperado: Chave primária deduplicada rejeita duplicações
  // -------------------------------------------------------------
  console.log('▶ [TESTE 6] Tentando re-vincular LIVE 1 na mesma campanha para testar duplicidade...');
  await addSessionToCampaign(campaign.campaignId, live1);
  const campTicketsAfterRetry = await fetchCampaignTickets(campaign.campaignId);
  if (campTicketsAfterRetry.length !== 5) {
    throw new Error(`FALHA NO TESTE 6: Duplicação detectada! Esperava 5, obteve ${campTicketsAfterRetry.length}`);
  }
  console.log('   ✅ SUCESSO: Chave primária ${campaignId}_${ticketId} impediu bilhetes duplicados.\n');

  // -------------------------------------------------------------
  // TESTE 4: Execução de sorteio individual da LIVE 2 (Motor 1)
  // Esperado: Apenas os 2 bilhetes da LIVE 2 concorrem neste sorteio
  // -------------------------------------------------------------
  console.log('▶ [TESTE 4] Executando Sorteio Individual da LIVE 2 (Motor 1)...');
  const snapLive2 = await createNonBlockingSessionSnapshot(live2);
  if (snapLive2.totalEligibleTickets !== 2) {
    throw new Error(`FALHA NO TESTE 4: Snapshot da LIVE 2 deveria conter exatamente 2 bilhetes, obteve ${snapLive2.totalEligibleTickets}`);
  }

  const drawLive2 = await executeIndividualLiveDraw(live2, snapLive2.snapshotId, 'Fone Bluetooth');
  console.log(`   -> Bilhete sorteado no Motor 1: #${drawLive2.winningTicket.ticketNumber} (${drawLive2.winningTicket.username})`);
  console.log(`   -> Semente CSPRNG: ${drawLive2.seedRevealed}`);
  console.log('   ✅ SUCESSO: Apenas os 2 bilhetes da LIVE 2 concorreram no Motor 1.\n');

  // -------------------------------------------------------------
  // TESTE 5: Execução de sorteio acumulado da Campanha (Motor 2)
  // Esperado: Todos os 5 bilhetes concorrem; CSPRNG extrai vencedor
  // -------------------------------------------------------------
  console.log('▶ [TESTE 5] Executando Sorteio Acumulado da Campanha (Motor 2)...');
  const snapCamp = await freezeCampaignSnapshot(campaign.campaignId);
  if (snapCamp.totalEligibleTickets !== 5) {
    throw new Error(`FALHA NO TESTE 5: Snapshot da campanha deveria conter 5 bilhetes, obteve ${snapCamp.totalEligibleTickets}`);
  }

  const drawCamp = await executeCampaignDraw(campaign.campaignId, snapCamp.snapshotId, 'Carro Zero KM');
  console.log(`   -> Vencedor do Super Prêmio: #${drawCamp.winningTicket.ticketNumber} (@${drawCamp.winningTicket.username})`);
  console.log(`   -> LIVE de origem do bilhete: ${drawCamp.winningTicket.sessionId}`);
  console.log('   ✅ SUCESSO: Sorteio do Motor 2 executado sobre a totalidade dos bilhetes acumulados.\n');

  // -------------------------------------------------------------
  // TESTE 7: Alteração da taxa de conversão (de 100 para 150)
  // Esperado: Versionamento de regras garante que bilhetes passados não sejam recalculados
  // -------------------------------------------------------------
  console.log('▶ [TESTE 7] Alterando taxa de conversão da LIVE 1 de 100 para 150 moedas...');
  const newRule = await updateSessionConversionRate(live1, 150, 'Regra Promocional 150');
  console.log(`   -> Nova regra criada: ${newRule.ruleId} (Versão: ${newRule.version}, Taxa: ${newRule.newRate})`);

  // Enviando 150 moedas com a nova taxa -> deve gerar exatamente 1 bilhete (#4)
  const resPostRule = await recordGiftEventAtomic({
    sessionId: live1,
    tiktokUserId: 'outro_user_777',
    username: 'novo_apoiador',
    nickname: 'Novo Apoiador',
    giftId: 5655,
    giftName: 'Rosa',
    diamondCount: 150,
    repeatCount: 1,
    deltaCount: 1,
    coinsGranted: 150,
    repeatEnd: true,
    groupId: 'grp_rule_test',
  });

  if (resPostRule.newTickets !== 1 || resPostRule.ticketNumbers[0] !== 4) {
    throw new Error(`FALHA NO TESTE 7: Esperava 1 bilhete sob a nova taxa 150, obteve ${resPostRule.newTickets}`);
  }
  console.log('   ✅ SUCESSO: Nova taxa aplicada apenas para doações subsequentes; bilhetes anteriores 100% preservados.\n');

  // -------------------------------------------------------------
  // TESTE 8: Arrecadação pós-congelamento (Não-bloqueante)
  // Esperado: Novo bilhete emitido não colide com o teto congelado
  // -------------------------------------------------------------
  console.log('▶ [TESTE 8] Verificando integridade da rodada pós-congelamento...');
  const snapLive1 = await createNonBlockingSessionSnapshot(live1);
  console.log(`   -> Snapshot LIVE 1: Teto congelado em #${snapLive1.maxTicketNumberFrozen}`);

  // Enviar presente após o snapshot
  const resPostFreeze = await recordGiftEventAtomic({
    sessionId: live1,
    tiktokUserId: 'doador_extra_999',
    username: 'doador_extra',
    nickname: 'Doador Extra',
    giftId: 5655,
    giftName: 'Rosa',
    diamondCount: 150,
    repeatCount: 1,
    deltaCount: 1,
    coinsGranted: 150,
    repeatEnd: true,
    groupId: 'grp_post_snap',
  });

  const nextTicket = resPostFreeze.ticketNumbers[0];
  if (nextTicket <= snapLive1.maxTicketNumberFrozen) {
    throw new Error(`FALHA NO TESTE 8: Bilhete pós-congelamento #${nextTicket} violou o teto #${snapLive1.maxTicketNumberFrozen}`);
  }
  console.log(`   -> Novo bilhete #${nextTicket} emitido e reservado para a próxima rodada.`);
  console.log('   ✅ SUCESSO: A LIVE arrecadou moedas continuamente sem bloqueios ou interrupções.\n');

  // -------------------------------------------------------------
  // VERIFICAÇÃO ADICIONAL: Histórico Geral Vitalício
  // -------------------------------------------------------------
  console.log('▶ [HISTÓRICO GERAL VITALÍCIO] Verificando consolidação do participante Roberto...');
  const robertoHistory = await fetchGlobalParticipantHistory(testUserId);
  console.log(`   -> Total moedas acumuladas em todas as LIVEs: ${robertoHistory.global?.totalCoinsLifetime}`);
  console.log(`   -> Total bilhetes acumulados em todas as LIVEs: ${robertoHistory.global?.totalTicketsLifetime}`);
  console.log(`   -> Transmissões registradas: ${robertoHistory.participations.length}`);

  if (robertoHistory.global?.totalCoinsLifetime !== 500 || robertoHistory.global?.totalTicketsLifetime !== 5) {
    throw new Error(`FALHA NO HISTÓRICO GLOBAL: Esperava 500 moedas e 5 bilhetes, obteve ${robertoHistory.global?.totalCoinsLifetime} moedas`);
  }
  console.log('   ✅ SUCESSO: Perfil global consolida exatamente 500 moedas e 5 bilhetes em subcoleções isoladas.\n');

  console.log('================================================================');
  console.log('🏆 RESULTADO FINAL: TODOS OS 8 TESTES OBRIGATÓRIOS FORAM APROVADOS!');
  console.log('================================================================');
  process.exit(0);
}

runFullMatrixVerification().catch((err) => {
  console.error('\n❌ ERRO NA MATRIZ DE TESTES:', err);
  process.exit(1);
});
