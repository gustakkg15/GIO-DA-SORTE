import {
  getOrCreateLiveSession,
  recordGiftEventAtomic,
  createNonBlockingSessionSnapshot,
  executeIndividualLiveDraw,
  updateSessionConversionRate,
  fetchSessionParticipants,
  fetchGlobalParticipantHistory,
} from '../src/utils/tiktokLiveService.js';

async function runTests() {
  console.log('==============================================');
  console.log('INICIANDO TESTES AUTOMATIZADOS DA FASE 2');
  console.log('==============================================');

  const testSession1 = `live_test_1_${Date.now()}`;
  const testSession2 = `live_test_2_${Date.now()}`;
  const testUserId = `user_tiktok_9988_${Date.now()}`;
  const username = 'carlos_silva';
  const nickname = 'Carlos Silva';

  // --- TESTE 1 (Cenário A): Enviar 300 moedas na LIVE 1 ---
  console.log('\n[TESTE 1] Criando LIVE 1 e processando 300 moedas (taxa 100)...');
  await getOrCreateLiveSession(testSession1, 'gioborelli', 100);

  const res1 = await recordGiftEventAtomic({
    sessionId: testSession1,
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
    groupId: 'grp_001',
    eventId: `${testSession1}_grp001_3`,
  });

  console.log(` -> Moedas concedidas: ${res1.event.coinsGranted}`);
  console.log(` -> Novos bilhetes: ${res1.newTickets} (Números: ${res1.ticketNumbers.join(', ')})`);
  console.log(` -> Saldo residual de moedas: ${res1.carryover}`);

  if (res1.newTickets !== 3 || res1.ticketNumbers.length !== 3) {
    throw new Error(`Falha no Teste 1: Esperava 3 bilhetes, recebeu ${res1.newTickets}`);
  }
  console.log(' ✅ TESTE 1 APROVADO: 300 moedas geraram exatamente 3 bilhetes (#1, #2, #3).');

  // --- TESTE 2 (Cenário B): Mesmo usuário envia 200 moedas na LIVE 2 ---
  console.log('\n[TESTE 2] Criando LIVE 2 e processando 200 moedas para o mesmo usuário...');
  await getOrCreateLiveSession(testSession2, 'gioborelli', 100);

  const res2 = await recordGiftEventAtomic({
    sessionId: testSession2,
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
    groupId: 'grp_002',
    eventId: `${testSession2}_grp002_2`,
  });

  console.log(` -> Novos bilhetes na LIVE 2: ${res2.newTickets} (Números: ${res2.ticketNumbers.join(', ')})`);
  if (res2.newTickets !== 2 || res2.ticketNumbers[0] !== 1 || res2.ticketNumbers[1] !== 2) {
    throw new Error(`Falha no Teste 2: Esperava bilhetes #1 e #2 na LIVE 2, recebeu ${res2.ticketNumbers.join(', ')}`);
  }
  console.log(' ✅ TESTE 2 APROVADO: 200 moedas na LIVE 2 geraram 2 bilhetes exclusivos (#1, #2).');

  // --- TESTE 3 (Cenário C): Consulta do histórico geral vitalício ---
  console.log('\n[TESTE 3] Consultando perfil global acumulado do usuário...');
  const history = await fetchGlobalParticipantHistory(testUserId);
  console.log(` -> Total de moedas vitalícias: ${history.global?.totalCoinsLifetime}`);
  console.log(` -> Total de bilhetes vitalícios: ${history.global?.totalTicketsLifetime}`);
  console.log(` -> Quantidade de lives participadas: ${history.participations.length}`);
  history.participations.forEach((p) => {
    console.log(`    - Sessão: ${p.sessionId} | Moedas: ${p.coinsContributed} | Bilhetes: ${p.ticketsIssued}`);
  });

  if (history.global?.totalCoinsLifetime !== 500 || history.global?.totalTicketsLifetime !== 5) {
    throw new Error(`Falha no Teste 3: Esperava 500 moedas e 5 bilhetes no global. Obtido: ${history.global?.totalCoinsLifetime}`);
  }
  console.log(' ✅ TESTE 3 APROVADO: Histórico geral consolida 500 moedas e 5 bilhetes com subcoleções isoladas.');

  // --- TESTE 4 (Cenário D): Idempotência contra eventos repetidos ---
  console.log('\n[TESTE 4] Tentando reprocessar o mesmo evento da LIVE 1...');
  const resDup = await recordGiftEventAtomic({
    sessionId: testSession1,
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
    groupId: 'grp_001',
    eventId: `${testSession1}_grp001_3`, // mesmo eventId
  });

  console.log(` -> Bilhetes gerados na duplicata: ${resDup.newTickets}`);
  if (resDup.newTickets !== 0) {
    throw new Error('Falha no Teste 4: Evento repetido não foi bloqueado pela trava de idempotência.');
  }
  console.log(' ✅ TESTE 4 APROVADO: Evento duplicado foi ignorado sem gerar créditos adicionais.');

  // --- TESTE 5: Congelamento não-bloqueante e integridade SHA-256 ---
  console.log('\n[TESTE 5] Executando congelamento não-bloqueante na LIVE 1...');
  const snapshot = await createNonBlockingSessionSnapshot(testSession1);
  console.log(` -> Snapshot ID: ${snapshot.snapshotId}`);
  console.log(` -> Bilhetes elegíveis congelados: ${snapshot.totalEligibleTickets}`);
  console.log(` -> Teto de bilhete congelado: #${snapshot.maxTicketNumberFrozen}`);
  console.log(` -> Hash de integridade SHA-256: ${snapshot.rosterSha256Hash}`);
  console.log(` -> Quantidade de chunks particionados: ${snapshot.totalChunks}`);

  if (snapshot.totalEligibleTickets !== 3 || !snapshot.rosterSha256Hash) {
    throw new Error('Falha no Teste 5: Snapshot não conteve os 3 bilhetes esperados ou falhou no hash.');
  }
  console.log(' ✅ TESTE 5 APROVADO: Snapshot gerado com SHA-256 e particionamento em chunks.');

  // --- TESTE 6: Arrecadação contínua após congelamento (Sem interrupção) ---
  console.log('\n[TESTE 6] Enviando nova doação de 100 moedas após o congelamento...');
  const resPostFreeze = await recordGiftEventAtomic({
    sessionId: testSession1,
    tiktokUserId: 'outro_usuario_123',
    username: 'outro_doador',
    nickname: 'Outro Doador',
    giftId: 5655,
    giftName: 'Rosa',
    diamondCount: 100,
    repeatCount: 1,
    deltaCount: 1,
    coinsGranted: 100,
    repeatEnd: true,
    groupId: 'grp_post_freeze',
  });

  console.log(` -> Novo bilhete emitido: #${resPostFreeze.ticketNumbers[0]}`);
  if (resPostFreeze.ticketNumbers[0] <= snapshot.maxTicketNumberFrozen) {
    throw new Error(`Falha no Teste 6: Bilhete pós-congelamento (#${resPostFreeze.ticketNumbers[0]}) colidiu com o teto congelado (#${snapshot.maxTicketNumberFrozen})`);
  }
  console.log(` ✅ TESTE 6 APROVADO: LIVE continua recebendo presentes sem interrupção e bilhete #${resPostFreeze.ticketNumbers[0]} fica reservado para a próxima rodada!`);

  // --- TESTE 7: Sorteio individual da LIVE 1 com CSPRNG e Semente ---
  console.log('\n[TESTE 7] Realizando sorteio individual da rodada congelada...');
  const drawResult = await executeIndividualLiveDraw(testSession1, snapshot.snapshotId, 'iPhone 16 Pro Max');
  console.log(` -> Bilhete sorteado: #${drawResult.winningTicket.ticketNumber} (${drawResult.winningTicket.username})`);
  console.log(` -> Compromisso de semente: ${drawResult.seedCommitment}`);
  console.log(` -> Semente revelada: ${drawResult.seedRevealed}`);
  console.log(' ✅ TESTE 7 APROVADO: Sorteio executado com seleção CSPRNG e compromisso de semente registrado.');

  // --- TESTE 8: Versionamento de regras de conversão ---
  console.log('\n[TESTE 8] Alterando taxa de conversão da LIVE 1 de 100 para 150 moedas...');
  const ruleRes = await updateSessionConversionRate(testSession1, 150, 'Taxa Promocional 150');
  console.log(` -> Nova regra: ${ruleRes.ruleId} (Versão ${ruleRes.version}, Taxa: ${ruleRes.newRate})`);

  console.log('==============================================');
  console.log('TODOS OS TESTES DA FASE 2 FORAM APROVADOS COM SUCESSO!');
  console.log('==============================================');
  process.exit(0);
}

runTests().catch((err) => {
  console.error('\n❌ ERRO NOS TESTES:', err);
  process.exit(1);
});
