/**
 * Comprehensive Automated Verification Suite for ETAPA 2:
 * PERSISTÊNCIA E SINCRONIZAÇÃO AUTOMÁTICA DOS SORTEIOS
 *
 * Validates all 14 scenarios specified in the approved implementation plan:
 * 1. Save & retrieve organizer defaults
 * 2. Auto-load defaults on session creation
 * 3. Bind session to campaign and cycle on connection
 * 4. Idempotent deterministic cycle IDs
 * 5. Initial draw creation with PENDING_CONTACT and initial audit trail
 * 6. Block cycle advance while previous prize is PENDING_CONTACT
 * 7. Block cycle advance while previous prize is CONTACTED
 * 8. Transition delivery status to DELIVERED with append-only immutable audit trail
 * 9. Unlock next cycle when previous is DELIVERED
 * 10. Transition delivery status to UNCLAIMED_EXPIRED
 * 11. Execute auditable redraw: previous winner excluded, SHA-256 snapshot, bilateral links
 * 12. Chained redraw: substitute winner expires, second redraw excludes both winners
 * 13. Cumulative campaign allowDuplicateWinners === false excludes all past winners
 * 14. Legacy records backward compatibility without arbitrary owner assignment
 */

import {
  saveOrganizerRaffleDefaults,
  getOrganizerRaffleDefaults,
  getOrCreateLiveSession,
} from '../src/utils/tiktokLiveService.js';
import {
  createCampaign,
  addSessionToCampaign,
  freezeCampaignSnapshot,
  executeCampaignDraw,
  advanceCampaignCycle,
  updateDrawDeliveryStatus,
  executeUnclaimedRedraw,
  fetchCampaignCycles,
  fetchCampaignById,
} from '../src/utils/campaignService.js';
import { db } from '../src/firebase.js';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import type { LiveDrawRecord, TikTokTicket } from '../src/types.js';

interface TestResult {
  scenario: number;
  name: string;
  passed: boolean;
  details?: string;
  error?: string;
}

const results: TestResult[] = [];

function recordResult(scenario: number, name: string, passed: boolean, details?: string, error?: string) {
  results.push({ scenario, name, passed, details, error });
  const icon = passed ? '✅' : '❌';
  console.log(`${icon} [Cenário ${scenario}] ${name}: ${passed ? 'PASSOU' : 'FALHOU'}`);
  if (details) console.log(`   ↳ Detalhes: ${details}`);
  if (error) console.error(`   ↳ Erro: ${error}`);
}

async function runTestSuite() {
  console.log('================================================================');
  console.log('🚀 INICIANDO BATERIA DE TESTES AUTOMATIZADOS — ETAPA 2 LIVE PRO');
  console.log('================================================================\n');

  const testUid = `test_org_${Date.now()}`;
  const now = Date.now();

  // CENÁRIO 1: Salvar e recuperar configuração permanente do organizador
  try {
    const saved = await saveOrganizerRaffleDefaults(
      {
        defaultRaffleTitle: 'Sorteio das Galáxias',
        defaultPrizeName: 'Pix de R$ 500,00',
        defaultRate: 75,
        defaultMinCoinsPerGift: 5,
        defaultMaxTicketsPerUser: 50,
        defaultMaxTotalTickets: 1000,
        allowDuplicateWinners: false,
        defaultParticipationRulesNotes: 'Regulamento oficial do organizador de teste.',
      },
      testUid
    );

    const retrieved = await getOrganizerRaffleDefaults(testUid);
    const ok =
      retrieved.defaultRaffleTitle === 'Sorteio das Galáxias' &&
      retrieved.defaultPrizeName === 'Pix de R$ 500,00' &&
      retrieved.coinsPerTicket === 75 &&
      retrieved.minCoinsPerGift === 5 &&
      retrieved.allowDuplicateWinners === false;

    recordResult(1, 'Salvar e recuperar configuração permanente do organizador', ok, `Rate: ${retrieved.coinsPerTicket}, Título: ${retrieved.defaultRaffleTitle}`);
  } catch (err) {
    recordResult(1, 'Salvar e recuperar configuração permanente do organizador', false, undefined, (err as Error).message);
  }

  // CENÁRIO 2: Carregamento automático da configuração permanente ao criar nova sessão
  let session2Id = `sess_test_auto_${Date.now()}`;
  try {
    const session = await getOrCreateLiveSession(session2Id, 'gio_test_user', undefined, undefined, testUid);
    const ok =
      session.raffleTitle === 'Sorteio das Galáxias' &&
      session.prizeName === 'Pix de R$ 500,00' &&
      session.currentRate === 75 &&
      session.minCoinsPerGift === 5;
    recordResult(2, 'Carregamento automático de defaults em nova sessão', ok, `Sessão adotou taxa ${session.currentRate} e prêmio "${session.prizeName}"`);
  } catch (err) {
    recordResult(2, 'Carregamento automático de defaults em nova sessão', false, undefined, (err as Error).message);
  }

  // CENÁRIO 3: Vincular sessão à campanha e ciclo ativo na inicialização
  const camp3Title = `Campanha Teste Recorrente ${Date.now()}`;
  let camp3Id = '';
  try {
    const camp3 = await createCampaign(
      {
        title: camp3Title,
        description: 'Campanha de teste recorrente com reset de bilhetes por ciclo',
        prizeName: 'iPhone 16 Pro',
        campaignMode: 'RECURRING_RESET',
        allowDuplicateWinners: false,
        startDate: now,
        cutoffDate: now + 7 * 86400000,
        defaultRate: 50,
      },
      testUid
    );
    camp3Id = camp3.campaignId;

    const session3Id = `sess_bound_${Date.now()}`;
    const boundSession = await getOrCreateLiveSession(
      session3Id,
      'gio_bound',
      50,
      undefined,
      testUid,
      {
        campaignId: camp3Id,
        cycleId: camp3.activeCycleId,
      }
    );

    const ok = boundSession.campaignId === camp3Id && boundSession.cycleId === camp3.activeCycleId;
    recordResult(3, 'Vincular sessão à campanha e ciclo ativo na inicialização', ok, `Campanha: ${boundSession.campaignId}, Ciclo: ${boundSession.cycleId}`);
  } catch (err) {
    recordResult(3, 'Vincular sessão à campanha e ciclo ativo na inicialização', false, undefined, (err as Error).message);
  }

  // CENÁRIO 4: Identificador determinístico de ciclo (idempotência)
  try {
    const cycles = await fetchCampaignCycles(camp3Id);
    const expectedCycleId = `campaign_${camp3Id}_cycle_1`;
    const ok = cycles.length === 1 && cycles[0].cycleId === expectedCycleId && cycles[0].cycleIndex === 1;
    recordResult(4, 'Identificador determinístico e idempotente de ciclo', ok, `Ciclo inicial: ${cycles[0]?.cycleId}`);
  } catch (err) {
    recordResult(4, 'Identificador determinístico e idempotente de ciclo', false, undefined, (err as Error).message);
  }

  // CENÁRIO 5: Criação do sorteio com status PENDING_CONTACT e auditoria inicial
  let draw5Id = '';
  try {
    // Seed some tickets for the campaign
    const mockSessionId = `sess_seed_${Date.now()}`;
    await getOrCreateLiveSession(mockSessionId, 'gio_seed', 50, undefined, testUid);

    // Seed mock tickets in session
    for (let t = 1; t <= 5; t++) {
      const ticketRef = doc(db, 'sessions', mockSessionId, 'tickets', `${mockSessionId}_t_${t}`);
      await setDoc(ticketRef, {
        ticketId: `${mockSessionId}_t_${t}`,
        ticketNumber: t,
        sessionId: mockSessionId,
        tiktokUserId: `uid_user_${t}`,
        username: `participante_${t}`,
        nickname: `Participante ${t}`,
        giftName: 'Rosa',
        coinsContributed: 50,
        issuedAt: now,
      } as unknown as TikTokTicket);
    }

    await addSessionToCampaign(camp3Id, mockSessionId, { eligibilityRule: 'ALL_TICKETS' }, testUid);
    const snap = await freezeCampaignSnapshot(camp3Id, testUid);
    const drawOutcome = await executeCampaignDraw(camp3Id, snap.snapshotId, 'iPhone 16 Pro', testUid);
    draw5Id = drawOutcome.drawId;

    const drawDoc = await getDoc(doc(db, 'draws', draw5Id));
    const drawData = drawDoc.data() as LiveDrawRecord;

    const ok =
      drawData.deliveryStatus === 'PENDING_CONTACT' &&
      Array.isArray(drawData.deliveryAuditTrail) &&
      drawData.deliveryAuditTrail.length === 1 &&
      drawData.deliveryAuditTrail[0].newStatus === 'PENDING_CONTACT' &&
      drawData.cycleId === `campaign_${camp3Id}_cycle_1`;

    recordResult(5, 'Sorteio registrado com PENDING_CONTACT e auditoria inicial', ok, `DrawId: ${draw5Id}, status: ${drawData.deliveryStatus}, trail: ${drawData.deliveryAuditTrail?.length || 0}`);
  } catch (err) {
    recordResult(5, 'Sorteio registrado com PENDING_CONTACT e auditoria inicial', false, undefined, (err as Error).message);
  }

  // CENÁRIO 6: Bloqueio estrito de avanço de ciclo enquanto prêmio está PENDING_CONTACT
  try {
    let threw = false;
    try {
      await advanceCampaignCycle(camp3Id, testUid);
    } catch (e) {
      threw = true;
      const msg = (e as Error).message;
      if (msg.includes('BLOQUEIO DE CICLO') && msg.includes('PENDING_CONTACT')) {
        recordResult(6, 'Bloqueio estrito de avanço com prêmio PENDING_CONTACT', true, `Mensagem de bloqueio: ${msg}`);
      } else {
        recordResult(6, 'Bloqueio estrito de avanço com prêmio PENDING_CONTACT', false, undefined, `Erro inesperado: ${msg}`);
      }
    }
    if (!threw) {
      recordResult(6, 'Bloqueio estrito de avanço com prêmio PENDING_CONTACT', false, undefined, 'Avançou o ciclo sem lançar erro de bloqueio.');
    }
  } catch (err) {
    recordResult(6, 'Bloqueio estrito de avanço com prêmio PENDING_CONTACT', false, undefined, (err as Error).message);
  }

  // CENÁRIO 7: Bloqueio estrito de avanço de ciclo enquanto prêmio está CONTACTED
  try {
    await updateDrawDeliveryStatus(
      draw5Id,
      {
        status: 'CONTACTED',
        reason: 'Tentativa de contato via Direct TikTok realizada.',
        method: 'TikTok Direct',
      },
      testUid
    );

    let threw = false;
    try {
      await advanceCampaignCycle(camp3Id, testUid);
    } catch (e) {
      threw = true;
      const msg = (e as Error).message;
      if (msg.includes('BLOQUEIO DE CICLO') && msg.includes('CONTACTED')) {
        recordResult(7, 'Bloqueio estrito de avanço com prêmio CONTACTED', true, `Mensagem de bloqueio: ${msg}`);
      } else {
        recordResult(7, 'Bloqueio estrito de avanço com prêmio CONTACTED', false, undefined, `Erro inesperado: ${msg}`);
      }
    }
    if (!threw) {
      recordResult(7, 'Bloqueio estrito de avanço com prêmio CONTACTED', false, undefined, 'Avançou ciclo indevidamente com status CONTACTED.');
    }
  } catch (err) {
    recordResult(7, 'Bloqueio estrito de avanço com prêmio CONTACTED', false, undefined, (err as Error).message);
  }

  // CENÁRIO 8: Transição para DELIVERED com trilha de auditoria append-only imutável
  try {
    const updated = await updateDrawDeliveryStatus(
      draw5Id,
      {
        status: 'DELIVERED',
        reason: 'Ganhador apresentou comprovante e prêmio entregue com sucesso.',
        method: 'Presencial / Sedex BR123456789BR',
        trackingCode: 'BR123456789BR',
      },
      testUid
    );

    const ok =
      updated.deliveryStatus === 'DELIVERED' &&
      Boolean(updated.deliveryAuditTrail) &&
      (updated.deliveryAuditTrail?.length || 0) === 3 &&
      updated.deliveryAuditTrail![0].newStatus === 'PENDING_CONTACT' &&
      updated.deliveryAuditTrail![1].newStatus === 'CONTACTED' &&
      updated.deliveryAuditTrail![2].newStatus === 'DELIVERED';

    recordResult(8, 'Transição para DELIVERED com auditoria append-only', ok, `Trilha preservada com ${updated.deliveryAuditTrail?.length || 0} transições sem sobrescrita`);
  } catch (err) {
    recordResult(8, 'Transição para DELIVERED com auditoria append-only', false, undefined, (err as Error).message);
  }

  // CENÁRIO 9: Desbloqueio e avanço com sucesso do próximo ciclo quando DELIVERED
  try {
    const advanceResult = await advanceCampaignCycle(camp3Id, testUid);
    const ok =
      advanceResult.campaign.currentCycleIndex === 2 &&
      advanceResult.newCycle.cycleIndex === 2 &&
      advanceResult.newCycle.cycleId === `campaign_${camp3Id}_cycle_2` &&
      advanceResult.campaign.status === 'OPEN';

    recordResult(9, 'Desbloqueio e abertura do próximo ciclo após DELIVERED', ok, `Novo ciclo aberto: ${advanceResult.newCycle.cycleId}`);
  } catch (err) {
    recordResult(9, 'Desbloqueio e abertura do próximo ciclo após DELIVERED', false, undefined, (err as Error).message);
  }

  // CENÁRIO 10: Transição para UNCLAIMED_EXPIRED
  // Vamos criar um sorteio específico para testar o fluxo de expiração e redraw
  let draw10Id = '';
  let originalWinnerUid = '';
  try {
    const camp10 = await createCampaign(
      {
        title: `Campanha Redraw Test ${Date.now()}`,
        description: 'Campanha de teste de sorteio e redraw em caso de prêmio expirado',
        prizeName: 'Smart TV 65 polegadas',
        campaignMode: 'SINGLE_DRAW',
        startDate: now,
        cutoffDate: now + 7 * 86400000,
        defaultRate: 20,
      },
      testUid
    );

    const sess10Id = `sess_redraw_test_${Date.now()}`;
    await getOrCreateLiveSession(sess10Id, 'gio_redraw_host', 20, undefined, testUid);

    // 4 tickets with distinct users
    for (let t = 1; t <= 4; t++) {
      const ticketRef = doc(db, 'sessions', sess10Id, 'tickets', `${sess10Id}_t_${t}`);
      await setDoc(ticketRef, {
        ticketId: `${sess10Id}_t_${t}`,
        ticketNumber: t,
        sessionId: sess10Id,
        tiktokUserId: `uid_cand_${t}`,
        username: `candidato_${t}`,
        nickname: `Candidato ${t}`,
        giftName: 'Rosa',
        coinsContributed: 20,
        issuedAt: now,
      } as unknown as TikTokTicket);
    }

    await addSessionToCampaign(camp10.campaignId, sess10Id, { eligibilityRule: 'ALL_TICKETS' }, testUid);
    const snap10 = await freezeCampaignSnapshot(camp10.campaignId, testUid);
    const drawRes = await executeCampaignDraw(camp10.campaignId, snap10.snapshotId, 'Smart TV 65 polegadas', testUid);
    draw10Id = drawRes.drawId;
    originalWinnerUid = drawRes.winningTicket.tiktokUserId;

    // Transition to UNCLAIMED_EXPIRED
    const expiredDraw = await updateDrawDeliveryStatus(
      draw10Id,
      {
        status: 'UNCLAIMED_EXPIRED',
        reason: 'Prazo regulamentar de 48h esgotado sem contato do participante.',
        method: 'Prazo Expirado',
      },
      testUid
    );

    const ok = expiredDraw.deliveryStatus === 'UNCLAIMED_EXPIRED';
    recordResult(10, 'Transição para UNCLAIMED_EXPIRED', ok, `Sorteio ${draw10Id} marcado como UNCLAIMED_EXPIRED`);
  } catch (err) {
    recordResult(10, 'Transição para UNCLAIMED_EXPIRED', false, undefined, (err as Error).message);
  }

  // CENÁRIO 11: Realizar novo sorteio auditado excluindo vencedor original e gerando snapshot SHA-256
  let redraw11SubDrawId = '';
  let subWinnerUid = '';
  try {
    const redrawOutcome = await executeUnclaimedRedraw(
      draw10Id,
      testUid,
      'Não comparecimento no prazo legal de 48h.'
    );

    redraw11SubDrawId = redrawOutcome.newDraw.drawId;
    subWinnerUid = redrawOutcome.newDraw.winnerTiktokUserId;

    const ok =
      redrawOutcome.originalDraw.deliveryStatus === 'REDRAWN' &&
      redrawOutcome.originalDraw.redrawnAsDrawId === redraw11SubDrawId &&
      redrawOutcome.newDraw.parentDrawId === draw10Id &&
      redrawOutcome.newDraw.deliveryStatus === 'PENDING_CONTACT' &&
      redrawOutcome.newDraw.excludedPreviousWinnerUids?.includes(originalWinnerUid) &&
      subWinnerUid !== originalWinnerUid &&
      Boolean(redrawOutcome.newDraw.frozenRosterHash) &&
      redrawOutcome.newDraw.frozenRosterHash.length === 64;

    recordResult(11, 'Novo sorteio por não comparecimento com exclusão do original', Boolean(ok), `Original: ${draw10Id} -> Substituto: ${redraw11SubDrawId}, Vencedor excluído: ${originalWinnerUid}`);
  } catch (err) {
    recordResult(11, 'Novo sorteio por não comparecimento com exclusão do original', false, undefined, (err as Error).message);
  }

  // CENÁRIO 12: Redraw em cadeia (substituto também não comparece e expira)
  try {
    // Mark substitute draw as expired
    await updateDrawDeliveryStatus(
      redraw11SubDrawId,
      {
        status: 'UNCLAIMED_EXPIRED',
        reason: 'Ganhador substituto também não respondeu no prazo.',
      },
      testUid
    );

    const secondRedrawOutcome = await executeUnclaimedRedraw(
      redraw11SubDrawId,
      testUid,
      'Segundo ganhador substituto também não compareceu.'
    );

    const thirdDraw = secondRedrawOutcome.newDraw;
    const ok =
      thirdDraw.excludedPreviousWinnerUids?.includes(originalWinnerUid) &&
      thirdDraw.excludedPreviousWinnerUids?.includes(subWinnerUid) &&
      thirdDraw.winnerTiktokUserId !== originalWinnerUid &&
      thirdDraw.winnerTiktokUserId !== subWinnerUid &&
      thirdDraw.parentDrawId === redraw11SubDrawId;

    recordResult(12, 'Redraw em cadeia excluindo todos os vencedores anteriores', Boolean(ok), `Terceiro sorteio: ${thirdDraw.drawId}, Excluídos na cadeia: [${thirdDraw.excludedPreviousWinnerUids?.join(', ')}]`);
  } catch (err) {
    recordResult(12, 'Redraw em cadeia excluindo todos os vencedores anteriores', false, undefined, (err as Error).message);
  }

  // CENÁRIO 13: Campanha cumulativa com allowDuplicateWinners === false exclui ganhadores de ciclos anteriores
  try {
    const camp13 = await createCampaign(
      {
        title: `Campanha Cumulativa Anti-Duplicação ${Date.now()}`,
        description: 'Campanha cumulativa com acumulação de bilhetes e exclusão de vencedores anteriores',
        prizeName: 'Prêmio Ciclo Cumulativo',
        campaignMode: 'RECURRING_CUMULATIVE',
        allowDuplicateWinners: false,
        startDate: now,
        cutoffDate: now + 30 * 86400000,
        defaultRate: 10,
      },
      testUid
    );

    const sess13 = `sess_cumul_${Date.now()}`;
    await getOrCreateLiveSession(sess13, 'gio_cumul_host', 10, undefined, testUid);

    // 3 participants
    for (let t = 1; t <= 3; t++) {
      const ticketRef = doc(db, 'sessions', sess13, 'tickets', `${sess13}_t_${t}`);
      await setDoc(ticketRef, {
        ticketId: `${sess13}_t_${t}`,
        ticketNumber: t,
        sessionId: sess13,
        tiktokUserId: `uid_cumul_user_${t}`,
        username: `cumul_user_${t}`,
        nickname: `User ${t}`,
        giftName: 'Rosa',
        coinsContributed: 10,
        issuedAt: now,
      } as unknown as TikTokTicket);
    }

    await addSessionToCampaign(camp13.campaignId, sess13, { eligibilityRule: 'ALL_TICKETS' }, testUid);

    // Draw cycle 1
    const snap1 = await freezeCampaignSnapshot(camp13.campaignId, testUid);
    const drawCycle1 = await executeCampaignDraw(camp13.campaignId, snap1.snapshotId, 'Prêmio Ciclo 1', testUid);
    const cycle1WinnerUid = drawCycle1.winningTicket.tiktokUserId;

    // Deliver cycle 1 prize
    await updateDrawDeliveryStatus(
      drawCycle1.drawId,
      {
        status: 'DELIVERED',
        reason: 'Prêmio do ciclo 1 entregue.',
      },
      testUid
    );

    // Advance to cycle 2
    await advanceCampaignCycle(camp13.campaignId, testUid);

    // Freeze snapshot for cycle 2
    const snap2 = await freezeCampaignSnapshot(camp13.campaignId, testUid);
    const drawCycle2 = await executeCampaignDraw(camp13.campaignId, snap2.snapshotId, 'Prêmio Ciclo 2', testUid);

    const ok =
      drawCycle2.winningTicket.tiktokUserId !== cycle1WinnerUid &&
      Boolean(drawCycle2.excludedPreviousWinnerUids?.includes(cycle1WinnerUid));

    recordResult(13, 'Campanha cumulativa anti-duplicação exclui vencedor de ciclo anterior', ok, `Vencedor ciclo 1: ${cycle1WinnerUid}, Vencedor ciclo 2: ${drawCycle2.winningTicket.tiktokUserId}`);
  } catch (err) {
    recordResult(13, 'Campanha cumulativa anti-duplicação exclui vencedor de ciclo anterior', false, undefined, (err as Error).message);
  }

  // CENÁRIO 14: Compatibilidade com registros legados sem atribuição arbitrária de propriedade
  try {
    const legacyCampId = `camp_legacy_${Date.now()}`;
    const legacyDocRef = doc(db, 'campaigns', legacyCampId);
    // Write a mock legacy campaign without ownerUid
    await setDoc(legacyDocRef, {
      campaignId: legacyCampId,
      title: 'Campanha Legada Pré-Multi-tenant',
      prizeName: 'Prêmio Legado',
      status: 'OPEN',
      startDate: now - 86400000,
      cutoffDate: now + 86400000,
      totalAccumulatedTickets: 10,
      participatingSessionIds: [],
      createdAt: now - 86400000,
      // No ownerUid
    });

    const retrieved = await fetchCampaignById(legacyCampId);
    const ok =
      retrieved !== null &&
      retrieved.campaignId === legacyCampId &&
      retrieved.ownerUid === undefined;

    recordResult(14, 'Compatibilidade de leitura com registros legados sem forçar owner', ok, `Campanha legada lida com status '${retrieved?.status}' sem reescrever ownerUid`);
  } catch (err) {
    recordResult(14, 'Compatibilidade de leitura com registros legados sem forçar owner', false, undefined, (err as Error).message);
  }

  console.log('\n================================================================');
  console.log('📊 RESUMO DA EXECUÇÃO DOS 14 CENÁRIOS — ETAPA 2');
  console.log('================================================================');
  const passedCount = results.filter((r) => r.passed).length;
  console.log(`Total: ${results.length} | Aprovados: ${passedCount} | Falhas: ${results.length - passedCount}`);

  if (passedCount === 14) {
    console.log('🎉 SUCESSO INTEGRAL: Todos os 14 cenários da Etapa 2 foram validados com êxito!');
    process.exit(0);
  } else {
    console.error('⚠️ ALERTA: Um ou mais cenários falharam. Verifique os logs detalhados acima.');
    process.exit(1);
  }
}

runTestSuite().catch((err) => {
  console.error('Fatal test error:', err);
  process.exit(1);
});
