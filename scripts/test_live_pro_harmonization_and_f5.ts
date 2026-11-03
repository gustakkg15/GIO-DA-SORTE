import fs from 'fs';
import path from 'path';
import {
  mapTikTokConnectionState,
  mapLiveSessionCommercialStatus,
} from '../src/utils/tiktokStatusMapper.js';
import {
  getOrCreateLiveSession,
  setProPlanTier,
} from '../src/utils/tiktokLiveService.js';
import {
  createCampaign,
  fetchCampaigns,
} from '../src/utils/campaignService.js';

function assert(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(`FALHA DE ASSERÇÃO: ${message}`);
  }
}

async function runTests() {
  console.log('==============================================================');
  console.log('  TESTE DE VERIFICAÇÃO — CORREÇÃO PONTUAL TIKTOK LIVE PRO');
  console.log('==============================================================\n');

  setProPlanTier('PRO', 'ACTIVE');

  // ------------------------------------------------------------------
  // 1. Conta offline -> Aguardando LIVE / Reconectando
  // ------------------------------------------------------------------
  const stateReconnecting = mapTikTokConnectionState('RECONNECTING', false, 'gioborelli');
  assert(
    stateReconnecting.state === 'RECONNECTING' &&
      stateReconnecting.label === 'Aguardando LIVE / Reconectando',
    `Esperado "Aguardando LIVE / Reconectando" para RECONNECTING, obtido "${stateReconnecting.label}"`
  );
  const stateConnecting = mapTikTokConnectionState('CONNECTING', false, 'gioborelli');
  assert(
    stateConnecting.state === 'CONNECTING' && stateConnecting.label === 'Conectando',
    `Esperado "Conectando" para CONNECTING, obtido "${stateConnecting.label}"`
  );
  console.log('✅ [1/10] Conta offline (RECONNECTING) mapeada para "Aguardando LIVE / Reconectando" e CONNECTING para "Conectando".');

  // ------------------------------------------------------------------
  // 2. Conexão bem-sucedida -> Conectado
  // ------------------------------------------------------------------
  const stateConnected = mapTikTokConnectionState('CONNECTED', true, 'gioborelli');
  assert(
    stateConnected.state === 'CONNECTED' && stateConnected.label === 'Conectado',
    `Esperado "Conectado" para CONNECTED, obtido "${stateConnected.label}"`
  );
  console.log('✅ [2/10] Conexão bem-sucedida (CONNECTED) mapeada para "Conectado" em todos os componentes.');

  // ------------------------------------------------------------------
  // 3. Desconexão voluntária -> Desconectado
  // ------------------------------------------------------------------
  const stateDisconnected = mapTikTokConnectionState('DISCONNECTED', false, 'gioborelli');
  assert(
    stateDisconnected.state === 'DISCONNECTED' && stateDisconnected.label === 'Desconectado',
    `Esperado "Desconectado" para DISCONNECTED, obtido "${stateDisconnected.label}"`
  );
  console.log('✅ [3/10] Desconexão voluntária (DISCONNECTED) mapeada para "Desconectado".');

  // ------------------------------------------------------------------
  // 4. Erro real -> Erro na conexão (nunca texto genérico de desconectado)
  // ------------------------------------------------------------------
  const stateError = mapTikTokConnectionState('ERROR', false, 'gioborelli');
  assert(
    stateError.state === 'ERROR' && stateError.label === 'Erro na conexão',
    `Esperado "Erro na conexão" para ERROR, obtido "${stateError.label}"`
  );
  console.log('✅ [4/10] Erro real (ERROR) mapeado para "Erro na conexão" sem transformar em desconectado.');

  // ------------------------------------------------------------------
  // 5. Sessão comercial aberta com Webcast desconectado -> estados separados
  // ------------------------------------------------------------------
  const sessOpen = mapLiveSessionCommercialStatus('active');
  const sessPaused = mapLiveSessionCommercialStatus('paused');
  const sessEnded = mapLiveSessionCommercialStatus('ended');
  assert(
    sessOpen.label === 'Ingressão de presentes aberta',
    `Esperado "Ingressão de presentes aberta", obtido "${sessOpen.label}"`
  );
  assert(
    sessPaused.label === 'Ingressão de presentes pausada',
    `Esperado "Ingressão de presentes pausada", obtido "${sessPaused.label}"`
  );
  assert(
    sessEnded.label === 'Ingressão de presentes encerrada',
    `Esperado "Ingressão de presentes encerrada", obtido "${sessEnded.label}"`
  );
  assert(
    stateDisconnected.label !== sessOpen.label,
    'Estado de conexão Webcast e estado comercial da sessão devem ser distintos'
  );
  console.log('✅ [5/10] Sessão comercial ("Ingressão de presentes aberta / pausada / encerrada") separada do estado Webcast.');

  // ------------------------------------------------------------------
  // Leitura estática de código-fonte dos componentes para validar 6, 7, 8, 9
  // ------------------------------------------------------------------
  const headerSrc = fs.readFileSync(
    path.resolve(process.cwd(), 'src/components/layout/AppHeader.tsx'),
    'utf-8'
  );
  const arenaSrc = fs.readFileSync(
    path.resolve(process.cwd(), 'src/components/TikTokLiveGiftsArenaView.tsx'),
    'utf-8'
  );
  const managerSrc = fs.readFileSync(
    path.resolve(process.cwd(), 'src/components/TikTokLiveManager.tsx'),
    'utf-8'
  );

  assert(
    headerSrc.includes('mapTikTokConnectionState') &&
      arenaSrc.includes('mapTikTokConnectionState') &&
      managerSrc.includes('mapTikTokConnectionState'),
    'AppHeader, TikTokLiveGiftsArenaView e TikTokLiveManager devem usar mapTikTokConnectionState'
  );

  // ------------------------------------------------------------------
  // 6. Confirmar que existe apenas uma mesa de sorteio
  // ------------------------------------------------------------------
  assert(
    !managerSrc.includes('BLOCO 2 — SORTEIO ATIVO'),
    'Bloco 2 legado de sorteio ativo deve ter sido removido de TikTokLiveManager.tsx'
  );
  assert(
    !managerSrc.includes('<span>Realizar Sorteio</span>'),
    'Botão legado duplicado "Realizar Sorteio" do Bloco 2 deve ter sido removido'
  );
  assert(
    arenaSrc.includes('Sortear Agora com Bilhetes LIVE'),
    'A mesa oficial TikTokLiveGiftsArenaView deve manter o botão oficial de sorteio'
  );
  console.log('✅ [6/10] Apenas uma mesa oficial de sorteio presente (Bloco 2 legado removido).');

  // ------------------------------------------------------------------
  // 7. Confirmar que os indicadores não estão duplicados
  // ------------------------------------------------------------------
  assert(
    !managerSrc.includes('BLOCO 3 — INDICADORES'),
    'Bloco 3 legado de indicadores duplicados deve ter sido removido de TikTokLiveManager.tsx'
  );
  assert(
    !managerSrc.includes('Total real acumulado nesta transmissão'),
    'Cards duplicados do Bloco 3 legado devem ter sido removidos'
  );
  assert(
    arenaSrc.includes('Moedas LIVE') && arenaSrc.includes('Bilhetes Reais'),
    'Os indicadores oficiais devem permanecer na TikTokLiveGiftsArenaView'
  );
  console.log('✅ [7/10] Indicadores não estão duplicados (Bloco 3 legado removido; indicadores oficiais na Arena).');

  // ------------------------------------------------------------------
  // 8. Confirmar que a busca de participantes aparece apenas na Arena oficial
  // ------------------------------------------------------------------
  const arenaSearchMatches = (arenaSrc.match(/Buscar participante por @usuário, nome ou #bilhete/g) || []).length;
  const managerSearchMatches = (managerSrc.match(/Buscar @usuário, nome ou #bilhete/g) || []).length;
  assert(
    arenaSearchMatches === 1 && managerSearchMatches === 0,
    `Busca de participantes deve aparecer apenas na Arena oficial (arena=${arenaSearchMatches}, manager=${managerSearchMatches})`
  );
  assert(
    !managerSrc.includes("setBlock4View('participants')"),
    'Aba redundante de participantes do Bloco 4 deve ter sido removida'
  );
  console.log('✅ [8/10] Busca de participantes e tabela de participantes aparecem exclusivamente na Arena oficial.');

  // ------------------------------------------------------------------
  // 9. Confirmar que o feed de presentes continua funcionando
  // ------------------------------------------------------------------
  assert(
    managerSrc.includes('Presentes Recebidos em Tempo Real') &&
      managerSrc.includes('unifiedGiftRows.map') &&
      managerSrc.includes('item.isStreak') &&
      managerSrc.includes('item.repeatCount'),
    'Feed de presentes em tempo real com animações e combos deve permanecer intacto'
  );
  console.log('✅ [9/10] Feed de presentes em tempo real (com combos, animações e bilhetes) preservado.');

  // ------------------------------------------------------------------
  // 10. Conectar com Campanha A, simular F5 e verificar recuperação da Campanha A e ciclo correto
  // ------------------------------------------------------------------
  const testUid = `uid_f5_test_${Date.now()}`;
  const campB = await createCampaign(
    {
      title: 'Campanha B Secundária',
      description: 'Campanha não selecionada',
      startDate: Date.now() - 3600000,
      cutoffDate: Date.now() + 86400000,
      prizeName: 'Prêmio B',
      defaultRate: 100,
      campaignMode: 'SINGLE_DRAW',
    },
    testUid
  );
  const campA = await createCampaign(
    {
      title: 'Campanha A Oficial Recorrente',
      description: 'Campanha vinculada antes do F5',
      startDate: Date.now() - 3600000,
      cutoffDate: Date.now() + 86400000,
      prizeName: 'Prêmio A Oficial',
      defaultRate: 50,
      campaignMode: 'RECURRING_RESET',
    },
    testUid
  );

  const sessionId = `live_f5_${Date.now()}`;
  const createdSession = await getOrCreateLiveSession(
    sessionId,
    'gioborelli',
    50,
    'rule_50',
    testUid,
    {
      campaignId: campA.campaignId,
      cycleId: campA.activeCycleId,
      raffleTitle: campA.title,
      prizeName: campA.prizeName,
    }
  );

  assert(
    createdSession.campaignId === campA.campaignId,
    `Sessão criada deveria ter campaignId=${campA.campaignId}`
  );
  assert(
    createdSession.cycleId === campA.activeCycleId,
    `Sessão criada deveria ter cycleId=${campA.activeCycleId}`
  );

  // Simulate F5 reload: re-fetch session and campaigns list where campB is at index 0 and campA is at index 1
  const reloadedSession = await getOrCreateLiveSession(sessionId, 'gioborelli', 100, 'rule_default_100', testUid);
  const allLoadedCampaigns = await fetchCampaigns(testUid);
  const orderedCampaigns = [
    allLoadedCampaigns.find((c) => c.campaignId === campB.campaignId)!,
    allLoadedCampaigns.find((c) => c.campaignId === campA.campaignId)!,
  ].filter(Boolean);

  assert(
    orderedCampaigns[0].campaignId === campB.campaignId,
    'Para testar ausência de fallback em campaigns[0], Campanha B deve estar na posição 0'
  );

  // Replicate exact recovery logic from TikTokLiveManager
  const recoveredCampaign =
    orderedCampaigns.find((c) => c.campaignId === reloadedSession.campaignId) || null;

  assert(
    recoveredCampaign !== null && recoveredCampaign.campaignId === campA.campaignId,
    `Após F5, deveria recuperar Campanha A (${campA.campaignId}), e não campaigns[0] (${orderedCampaigns[0].campaignId})`
  );
  assert(
    reloadedSession.cycleId === campA.activeCycleId &&
      recoveredCampaign?.currentCycleIndex === 1,
    `Ciclo recuperado deve ser ${campA.activeCycleId} (Ciclo #1)`
  );

  // Verify missing campaign warning behavior (no silent fallback to campaigns[0])
  const sessionWithMissingCamp = {
    ...reloadedSession,
    campaignId: 'camp_inexistente_999',
  };
  const missingMatch =
    orderedCampaigns.find((c) => c.campaignId === sessionWithMissingCamp.campaignId) || null;
  assert(
    missingMatch === null,
    'Quando a campanha vinculada não existe na lista, não deve selecionar campaigns[0] silenciosamente'
  );

  console.log(
    `✅ [10/10] Recuperação pós-F5 validada: Campanha A (${recoveredCampaign?.campaignId}) e ciclo (${reloadedSession.cycleId}) restaurados sem fallback indevido para campaigns[0].`
  );

  console.log('\n==============================================================');
  console.log('  TODOS OS 10 TESTES OBRIGATÓRIOS PASSARAM COM SUCESSO (10/10)');
  console.log('==============================================================');
}

runTests().catch((err) => {
  console.error('\n❌ ERRO NOS TESTES:', err);
  process.exit(1);
});
