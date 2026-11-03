import {
  getOrCreateLiveSession,
  recordGiftEventAtomic,
} from '../src/utils/tiktokLiveService.js';
import {
  createCampaign,
  addSessionToCampaign,
  fetchCampaignById,
  fetchCampaignTickets,
  freezeCampaignSnapshot,
  executeCampaignDraw,
} from '../src/utils/campaignService.js';

async function runPhase3Tests() {
  console.log('==============================================');
  console.log('INICIANDO TESTES AUTOMATIZADOS DA FASE 3 (MOTOR 2)');
  console.log('==============================================');

  const liveA = `live_p3_A_${Date.now()}`;
  const liveB = `live_p3_B_${Date.now()}`;
  const userId = `user_p3_${Date.now()}`;

  // 1. Setup LIVE A: User sends 300 coins -> 3 tickets
  console.log('\n[PREPARAÇÃO] Criando LIVE A com 300 moedas para o participante...');
  await getOrCreateLiveSession(liveA, 'gioborelli', 100);
  const giftA = await recordGiftEventAtomic({
    sessionId: liveA,
    tiktokUserId: userId,
    username: 'maria_oliveira',
    nickname: 'Maria Oliveira',
    giftId: 5655,
    giftName: 'Rosa Especial',
    diamondCount: 100,
    repeatCount: 3,
    deltaCount: 3,
    coinsGranted: 300,
    repeatEnd: true,
    groupId: 'grp_p3_a',
    eventId: `${liveA}_grp_p3_a_3`,
  });
  console.log(` -> LIVE A gerou ${giftA.newTickets} bilhetes (#${giftA.ticketNumbers.join(', #')})`);

  // 2. Setup LIVE B: User sends 200 coins -> 2 tickets
  console.log('\n[PREPARAÇÃO] Criando LIVE B com 200 moedas para o participante...');
  await getOrCreateLiveSession(liveB, 'gioborelli', 100);
  const giftB = await recordGiftEventAtomic({
    sessionId: liveB,
    tiktokUserId: userId,
    username: 'maria_oliveira',
    nickname: 'Maria Oliveira',
    giftId: 5655,
    giftName: 'Rosa Especial',
    diamondCount: 100,
    repeatCount: 2,
    deltaCount: 2,
    coinsGranted: 200,
    repeatEnd: true,
    groupId: 'grp_p3_b',
    eventId: `${liveB}_grp_p3_b_2`,
  });
  console.log(` -> LIVE B gerou ${giftB.newTickets} bilhetes (#${giftB.ticketNumbers.join(', #')})`);

  // --- TESTE 3: Criação de Campanha Especial agregando LIVE A e LIVE B ---
  console.log('\n[TESTE 3] Criando Campanha Especial de Fim de Mês e vinculando LIVE A e LIVE B...');
  const campaign = await createCampaign({
    title: 'Campanha Super Prêmios da Gio',
    description: 'Campanha acumulada reunindo os bilhetes das transmissões da semana!',
    prizeName: 'Carro Zero KM',
  });
  console.log(` -> Campanha criada com sucesso: ID ${campaign.campaignId}`);

  console.log(' -> Vinculando LIVE A...');
  await addSessionToCampaign(campaign.campaignId, liveA);

  console.log(' -> Vinculando LIVE B...');
  await addSessionToCampaign(campaign.campaignId, liveB);

  const updatedCamp = await fetchCampaignById(campaign.campaignId);
  console.log(` -> Total de bilhetes acumulados na Campanha: ${updatedCamp?.totalAccumulatedTickets}`);
  console.log(` -> Sessões participantes: ${updatedCamp?.participatingSessionIds.join(', ')}`);

  const campTickets = await fetchCampaignTickets(campaign.campaignId);
  console.log(` -> Total de bilhetes indexados no banco: ${campTickets.length}`);
  const userTickets = campTickets.filter((t) => t.tiktokUserId === userId);
  console.log(` -> Bilhetes pertencentes ao usuário: ${userTickets.length}`);

  if (campTickets.length !== 5 || userTickets.length !== 5) {
    throw new Error(`Falha no Teste 3: Esperava 5 bilhetes acumulados na campanha, obteve ${campTickets.length}`);
  }
  console.log(' ✅ TESTE 3 APROVADO: Campanha acumulou exatamente os 5 bilhetes das duas transmissões (3 da LIVE A + 2 da LIVE B).');

  // --- TESTE 6: Tentativa de adicionar o mesmo bilhete duas vezes (Idempotência) ---
  console.log('\n[TESTE 6] Tentando re-vincular a LIVE A na mesma campanha...');
  const resReAdd = await addSessionToCampaign(campaign.campaignId, liveA);
  const campTicketsAfterReAdd = await fetchCampaignTickets(campaign.campaignId);
  console.log(` -> Total de bilhetes após tentativa repetida: ${campTicketsAfterReAdd.length}`);

  if (campTicketsAfterReAdd.length !== 5) {
    throw new Error(`Falha no Teste 6: Bilhetes foram duplicados na campanha! Total: ${campTicketsAfterReAdd.length}`);
  }
  console.log(' ✅ TESTE 6 APROVADO: A chave determinística de bilhete evitou duplicação na campanha acumulada.');

  // --- CONGELAMENTO DE SNAPSHOT (PARTICIONADO COM SHA-256) ---
  console.log('\n[SNAPSHOT] Congelando lista de bilhetes da Campanha com particionamento em chunks...');
  const snapshot = await freezeCampaignSnapshot(campaign.campaignId);
  console.log(` -> Snapshot ID: ${snapshot.snapshotId}`);
  console.log(` -> Bilhetes elegíveis congelados: ${snapshot.totalEligibleTickets}`);
  console.log(` -> Hash de integridade SHA-256: ${snapshot.rosterSha256Hash}`);
  console.log(` -> Chunks criados: ${snapshot.totalChunks}`);

  if (snapshot.totalEligibleTickets !== 5 || !snapshot.rosterSha256Hash) {
    throw new Error('Falha ao congelar snapshot da campanha.');
  }
  console.log(' ✅ SNAPSHOT DA CAMPANHA APROVADO: Lista congelada com integridade criptográfica.');

  // --- TESTE 5: Execução do sorteio acumulado da Campanha (Motor 2) ---
  console.log('\n[TESTE 5] Executando Sorteio Acumulado da Campanha via CSPRNG...');
  const drawResult = await executeCampaignDraw(campaign.campaignId, snapshot.snapshotId, 'Carro Zero KM');
  console.log(` -> ID do Sorteio: ${drawResult.drawId}`);
  console.log(` -> Bilhete Vencedor: #${drawResult.winningTicket.ticketNumber} (${drawResult.winningTicket.username})`);
  console.log(` -> LIVE de origem do bilhete: ${drawResult.winningTicket.sessionId}`);
  console.log(` -> Semente revelada (32 bytes hex): ${drawResult.seedRevealed}`);
  console.log(` -> Compromisso de semente SHA-256: ${drawResult.seedCommitment}`);

  const finishedCamp = await fetchCampaignById(campaign.campaignId);
  console.log(` -> Status final da Campanha: ${finishedCamp?.status}`);

  if (finishedCamp?.status !== 'COMPLETED') {
    throw new Error('Falha no Teste 5: Campanha não foi marcada como COMPLETED.');
  }
  console.log(' ✅ TESTE 5 APROVADO: Sorteio da Campanha executado com sucesso e compromisso de semente registrado.');

  console.log('\n==============================================');
  console.log('TODOS OS TESTES DA FASE 3 FORAM APROVADOS COM SUCESSO!');
  console.log('==============================================');
  process.exit(0);
}

runPhase3Tests().catch((err) => {
  console.error('\n❌ ERRO NOS TESTES DA FASE 3:', err);
  process.exit(1);
});
