import {
  TikTokEventBus,
  TikTokWebSocketClient,
  TikTokLiveConnector,
} from '../src/utils/tiktokConnector.js';
import { getOrCreateLiveSession } from '../src/utils/tiktokLiveService.js';

async function runConnectorTests() {
  console.log('================================================================');
  console.log('TESTES DE DEDUPLICAÇÃO POR TRANSACTION ID & BACKOFF EXPONENCIAL');
  console.log('================================================================\n');

  const testSessionId = `live_tx_test_${Date.now()}`;
  await getOrCreateLiveSession(testSessionId, 'gioborelli', 100);

  // -------------------------------------------------------------
  // TESTE 1: Deduplicação Rigorosa por TikTok transactionId
  // -------------------------------------------------------------
  console.log('▶ [TESTE 1] Testando deduplicação estrita por transactionId...');
  const eventBus = new TikTokEventBus(500, 60000);

  const txId = `tiktok_tx_${Date.now()}_9988`;

  const giftPayloadA = {
    transactionId: txId, // Identificador original do TikTok
    sessionId: testSessionId,
    tiktokUserId: 'user_tx_123',
    username: 'apoiador_tiktok',
    nickname: 'Apoiador TikTok',
    giftId: 5655,
    giftName: 'Rosa Especial',
    diamondCount: 100,
    repeatCount: 1,
    deltaCount: 1,
    coinsGranted: 100,
    repeatEnd: true,
    groupId: 'grp_001',
  };

  // 1ª Tentativa com transactionId inédito: DEVE SER ACEITO E PERSISTIDO
  console.log('   -> Submetendo evento com transactionId inédito...');
  const res1 = await eventBus.processAndPersistGiftEvent(giftPayloadA);
  console.log(`   -> Resultado 1: persisted=${res1.persisted}, isDuplicate=${res1.isDuplicate}, tickets=${res1.result?.newTickets}`);

  if (!res1.persisted || res1.isDuplicate || !res1.result || res1.result.newTickets !== 1) {
    throw new Error('FALHA NO TESTE 1: O evento inédito deveria ter sido aceito e persistido com 1 bilhete.');
  }

  // 2ª Tentativa com EXATAMENTE o mesmo transactionId: DEVE SER DESCARTADO
  console.log('   -> Submetendo segundo evento com o MESMO transactionId...');
  const res2 = await eventBus.processAndPersistGiftEvent(giftPayloadA);
  console.log(`   -> Resultado 2: persisted=${res2.persisted}, isDuplicate=${res2.isDuplicate}`);

  if (res2.persisted || !res2.isDuplicate) {
    throw new Error('FALHA NO TESTE 1: O evento duplicado com o mesmo transactionId NÃO foi descartado pelo EventBus!');
  }

  const stats = eventBus.getStats();
  console.log(`   -> Estatísticas do EventBus: Recebidos=${stats.totalReceived}, Processados=${stats.uniqueProcessed}, Descartados=${stats.duplicatesDropped}`);
  if (stats.duplicatesDropped !== 1 || stats.uniqueProcessed !== 1) {
    throw new Error('FALHA NO TESTE 1: As métricas de deduplicação estão incorretas.');
  }
  console.log('   ✅ SUCESSO: Nenhum evento duplicado com o mesmo transactionId foi salvo no Firestore!\n');

  // -------------------------------------------------------------
  // TESTE 2: Backoff Exponencial do TikTokWebSocketClient
  // -------------------------------------------------------------
  console.log('▶ [TESTE 2] Validando backoff exponencial do TikTokWebSocketClient...');
  const wsClient = new TikTokWebSocketClient('/api/tiktok/stream', {
    initialDelayMs: 1000,
    maxDelayMs: 16000,
    backoffFactor: 2,
    jitter: false,
    maxRetries: 5,
  }, eventBus);

  const delay0 = wsClient.calculateBackoffDelay(0); // 1000ms
  const delay1 = wsClient.calculateBackoffDelay(1); // 2000ms
  const delay2 = wsClient.calculateBackoffDelay(2); // 4000ms
  const delay3 = wsClient.calculateBackoffDelay(3); // 8000ms
  const delay4 = wsClient.calculateBackoffDelay(4); // 16000ms
  const delay5 = wsClient.calculateBackoffDelay(5); // 16000ms (teto máximo)

  console.log(`   -> Tentativa 0: ${delay0}ms (Esperado: 1000ms)`);
  console.log(`   -> Tentativa 1: ${delay1}ms (Esperado: 2000ms)`);
  console.log(`   -> Tentativa 2: ${delay2}ms (Esperado: 4000ms)`);
  console.log(`   -> Tentativa 3: ${delay3}ms (Esperado: 8000ms)`);
  console.log(`   -> Tentativa 4: ${delay4}ms (Esperado: 16000ms)`);
  console.log(`   -> Tentativa 5 (teto): ${delay5}ms (Esperado: 16000ms)`);

  if (delay0 !== 1000 || delay1 !== 2000 || delay2 !== 4000 || delay3 !== 8000 || delay4 !== 16000 || delay5 !== 16000) {
    throw new Error('FALHA NO TESTE 2: Cálculo do backoff exponencial incorreto.');
  }
  console.log('   ✅ SUCESSO: Escalonamento exponencial e limites de teto validados.\n');

  // -------------------------------------------------------------
  // TESTE 3: Fallback de Chave Composta Sem transactionId Explícito
  // -------------------------------------------------------------
  console.log('▶ [TESTE 3] Testando chave composta para eventos legados sem transactionId...');
  const key1 = eventBus.resolveDeduplicationKey({
    sessionId: 'session_xyz',
    groupId: 'grp_099',
    repeatCount: 5,
  });
  console.log(`   -> Chave composta gerada: ${key1}`);
  if (key1 !== 'comp_session_xyz_grp_099_5') {
    throw new Error(`FALHA NO TESTE 3: Chave composta incorreta: ${key1}`);
  }
  console.log('   ✅ SUCESSO: Chave de contingência gerada adequadamente.\n');

  console.log('================================================================');
  console.log('🏆 TODOS OS TESTES DO TIKTOK CONNECTOR & EVENTBUS FORAM APROVADOS!');
  console.log('================================================================');
  process.exit(0);
}

runConnectorTests().catch((err) => {
  console.error('\n❌ ERRO NOS TESTES:', err);
  process.exit(1);
});
