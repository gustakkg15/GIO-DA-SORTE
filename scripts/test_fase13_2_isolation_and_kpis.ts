import { doc, setDoc, deleteDoc } from 'firebase/firestore';
import { db } from '../src/firebase.ts';
import {
  fetchAllLiveSessions,
  getOrCreateLiveSession,
  fetchSessionDraws,
  setProPlanTier,
} from '../src/utils/tiktokLiveService.ts';
import {
  computeRaffle,
  DEFAULT_SETTINGS,
  INITIAL_SAMPLE_PARTICIPANTS,
} from '../src/utils/raffle.ts';
import {
  computeDashboardKpiSummary,
  isDefaultDemoRoster,
} from '../src/components/MainDashboard.tsx';
import type { Participant, TikTokLiveSession, Winner } from '../src/types.ts';

async function runFase13_2Tests() {
  console.log('================================================================================');
  console.log('🛡️ GIO DA SORTE PRO — FASE 13.2: ISOLAMENTO TIKTOK LIVE & CONSISTÊNCIA DE KPIs');
  console.log('================================================================================\n');

  let passed = 0;
  let failed = 0;

  function assert(condition: boolean, scenarioNum: number, label: string, details?: string) {
    const tag = `Cenário #${String(scenarioNum).padStart(2, '0')}`;
    if (condition) {
      passed++;
      console.log(`✅ [APROVADO] ${tag}: ${label}${details ? ` — ${details}` : ''}`);
    } else {
      failed++;
      console.error(`❌ [FALHOU] ${tag}: ${label}${details ? ` — ${details}` : ''}`);
    }
  }

  const runSuffix = `${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
  const USER_A_UID = `uid_fase13_2_user_A_${runSuffix}`;
  const USER_B_UID = `uid_fase13_2_user_B_${runSuffix}`;

  const createdSessionIds: string[] = [];

  try {
    setProPlanTier('PRO', 'ACTIVE', USER_A_UID);
    setProPlanTier('PRO', 'ACTIVE', USER_B_UID);

    // Prepare sessions in Firestore:
    // - 4 sessions owned by User A (startedAt: T+1000..T+4000)
    // - 5 sessions owned by User B (startedAt: T+5000..T+9000, newer than User A's to test pagination!)
    // - 1 legacy/unowned session without ownerUid
    // - 1 demo session marked with isDemo: true
    const baseTime = Date.now() + 100_000; // Ensure top ordering for deterministic pagination test

    for (let i = 1; i <= 4; i++) {
      const sid = `sess_uA_${i}_${runSuffix}`;
      createdSessionIds.push(sid);
      const s = await getOrCreateLiveSession(sid, `@creator_a_${i}`, 100, 'rule_default_100', USER_A_UID);
      await setDoc(
        doc(db, 'sessions', sid),
        {
          ...s,
          ownerUid: USER_A_UID,
          startedAt: baseTime + i * 1000,
          currentTicketCounter: i * 10,
          uniqueSupportersCount: i * 3,
          totalCoins: i * 1000,
        },
        { merge: true }
      );
    }

    for (let j = 1; j <= 5; j++) {
      const sid = `sess_uB_${j}_${runSuffix}`;
      createdSessionIds.push(sid);
      const s = await getOrCreateLiveSession(sid, `@creator_b_${j}`, 100, 'rule_default_100', USER_B_UID);
      await setDoc(
        doc(db, 'sessions', sid),
        {
          ...s,
          ownerUid: USER_B_UID,
          startedAt: baseTime + (j + 10) * 1000, // Newer than User A's sessions
          currentTicketCounter: j * 25,
          uniqueSupportersCount: j * 8,
          totalCoins: j * 2500,
        },
        { merge: true }
      );
    }

    const unownedSid = `sess_unowned_legacy_${runSuffix}`;
    createdSessionIds.push(unownedSid);
    await setDoc(doc(db, 'sessions', unownedSid), {
      sessionId: unownedSid,
      username: 'legacy_demo_stream',
      tiktokUserId: 'legacy_demo_stream',
      raffleTitle: 'Sessão Legada Sem Owner',
      prizeName: 'Prêmio Demo',
      status: 'ended',
      startedAt: baseTime + 50_000,
      endedAt: baseTime + 55_000,
      totalCoins: 11200,
      totalGiftsCount: 42,
      uniqueSupportersCount: 42,
      currentRuleId: 'rule_default_100',
      currentRate: 100,
      currentTicketCounter: 112,
      currentSequenceNumber: 112,
      latestDrawFrozenTicketMax: null,
    });

    const demoFlagSid = `sess_demo_flagged_${runSuffix}`;
    createdSessionIds.push(demoFlagSid);
    await setDoc(doc(db, 'sessions', demoFlagSid), {
      sessionId: demoFlagSid,
      ownerUid: USER_A_UID,
      isDemo: true,
      username: 'demo_flagged_stream',
      tiktokUserId: 'demo_flagged_stream',
      raffleTitle: 'Sessão Demo Flagged',
      prizeName: 'Prêmio Demo',
      status: 'ended',
      startedAt: baseTime + 60_000,
      endedAt: baseTime + 65_000,
      totalCoins: 9900,
      totalGiftsCount: 30,
      uniqueSupportersCount: 30,
      currentRuleId: 'rule_default_100',
      currentRate: 100,
      currentTicketCounter: 99,
      currentSequenceNumber: 99,
      latestDrawFrozenTicketMax: null,
    });

    // -------------------------------------------------------------------------
    // 1. Usuário A consulta suas próprias sessões
    // -------------------------------------------------------------------------
    const sessionsUserA = await fetchAllLiveSessions(15, USER_A_UID);
    const allBelongToUserA =
      sessionsUserA.length === 4 &&
      sessionsUserA.every((s) => s.ownerUid === USER_A_UID && (s as unknown as { isDemo?: boolean }).isDemo !== true);
    assert(
      allBelongToUserA,
      1,
      'Usuário A consulta exclusivamente suas próprias sessões autorizadas',
      `sessionsFound=${sessionsUserA.length}, allOwnedByA=${allBelongToUserA}`
    );

    // -------------------------------------------------------------------------
    // 2. Usuário A não consulta sessões do Usuário B
    // -------------------------------------------------------------------------
    const hasAnyUserBInA = sessionsUserA.some((s) => s.ownerUid === USER_B_UID || s.sessionId.includes('sess_uB_'));
    let crossAccessBlockedAtoB = false;
    try {
      await fetchSessionDraws(`sess_uB_1_${runSuffix}`, USER_A_UID);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes('OWNERSHIP_FORBIDDEN')) {
        crossAccessBlockedAtoB = true;
      }
    }
    assert(
      !hasAnyUserBInA && crossAccessBlockedAtoB,
      2,
      'Usuário A não consulta nem acessa sessões do Usuário B',
      `hasAnyUserBInA=${hasAnyUserBInA}, crossAccessBlockedAtoB=${crossAccessBlockedAtoB}`
    );

    // -------------------------------------------------------------------------
    // 3. Usuário B não consulta sessões do Usuário A
    // -------------------------------------------------------------------------
    const sessionsUserB = await fetchAllLiveSessions(15, USER_B_UID);
    const allBelongToUserB =
      sessionsUserB.length === 5 &&
      sessionsUserB.every((s) => s.ownerUid === USER_B_UID);
    const hasAnyUserAInB = sessionsUserB.some((s) => s.ownerUid === USER_A_UID || s.sessionId.includes('sess_uA_'));
    let crossAccessBlockedBtoA = false;
    try {
      await getOrCreateLiveSession(`sess_uA_1_${runSuffix}`, '@creator_a_1', 100, 'rule_default_100', USER_B_UID);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes('OWNERSHIP_FORBIDDEN')) {
        crossAccessBlockedBtoA = true;
      }
    }
    assert(
      allBelongToUserB && !hasAnyUserAInB && crossAccessBlockedBtoA,
      3,
      'Usuário B consulta apenas suas 5 sessões e é bloqueado ao tentar acessar sessão do Usuário A',
      `sessionsFoundB=${sessionsUserB.length}, hasAnyUserAInB=${hasAnyUserAInB}, crossAccessBlockedBtoA=${crossAccessBlockedBtoA}`
    );

    // -------------------------------------------------------------------------
    // 4. Usuário deslogado não consulta sessões privadas
    // -------------------------------------------------------------------------
    const unauthImplicit = await fetchAllLiveSessions(15);
    const unauthUndefined = await fetchAllLiveSessions(15, undefined);
    const unauthEmptyStr = await fetchAllLiveSessions(15, '   ');
    assert(
      unauthImplicit.length === 0 && unauthUndefined.length === 0 && unauthEmptyStr.length === 0,
      4,
      'Usuário deslogado recebe lista vazia (0 sessões privadas ou históricas expostas)',
      `implicit=${unauthImplicit.length}, undefined=${unauthUndefined.length}, emptyStr=${unauthEmptyStr.length}`
    );

    // -------------------------------------------------------------------------
    // 5. Sessões de demonstração/legadas não contaminam KPIs reais nem consultas
    // -------------------------------------------------------------------------
    const hasUnownedOrDemoInA = sessionsUserA.some(
      (s) => s.sessionId === unownedSid || s.sessionId === demoFlagSid
    );
    const hasUnownedOrDemoInB = sessionsUserB.some(
      (s) => s.sessionId === unownedSid || s.sessionId === demoFlagSid
    );

    const sampleComputed = computeRaffle(INITIAL_SAMPLE_PARTICIPANTS, DEFAULT_SETTINGS, []);
    const pollutedInputSessions: TikTokLiveSession[] = [
      ...sessionsUserA,
      ...sessionsUserB,
      {
        sessionId: unownedSid,
        username: 'legacy_demo_stream',
        tiktokUserId: 'legacy_demo_stream',
        raffleTitle: 'Demo',
        prizeName: 'Demo',
        status: 'ended',
        startedAt: Date.now(),
        endedAt: Date.now(),
        totalCoins: 11200,
        totalGiftsCount: 42,
        uniqueSupportersCount: 42,
        currentRuleId: 'rule_default_100',
        currentRate: 100,
        currentTicketCounter: 112,
        currentSequenceNumber: 112,
        latestDrawFrozenTicketMax: null,
      },
    ];

    const kpiForUnauth = computeDashboardKpiSummary({
      participants: INITIAL_SAMPLE_PARTICIPANTS,
      winners: [],
      computed: sampleComputed,
      liveSessions: pollutedInputSessions,
      currentOwnerUid: null,
      syncStatus: 'offline',
    });

    assert(
      !hasUnownedOrDemoInA &&
        !hasUnownedOrDemoInB &&
        kpiForUnauth.liveSessionsCount === 0 &&
        kpiForUnauth.liveTicketsTotal === 0 &&
        kpiForUnauth.liveSupportersTotal === 0 &&
        kpiForUnauth.traditionalTicketsIssued === 11 &&
        kpiForUnauth.traditionalParticipantsCount === 5,
      5,
      'Sessões de demonstração/sem owner não contaminam consultas autenticadas nem os KPIs do Dashboard',
      `traditionalTickets=${kpiForUnauth.traditionalTicketsIssued}, traditionalParticipants=${kpiForUnauth.traditionalParticipantsCount}, liveTickets=${kpiForUnauth.liveTicketsTotal}`
    );

    // -------------------------------------------------------------------------
    // 6. Consistência de KPIs entre Dashboard, Participantes, Central de Sorteios e Relatórios
    //    + Diferenciação entre DEMO, LOCAL e PERSISTED
    // -------------------------------------------------------------------------
    // Case 6A: Default Demo Roster (5 participants, 11 tickets)
    const statsScreenTicketsDemo = sampleComputed.usedCount; // Relatórios (StatsProbabilities.tsx)
    const statsScreenParticipantsDemo = sampleComputed.allocations.length; // Relatórios
    const drawScreenEligibleDemo = sampleComputed.eligibleTickets.length; // Central de Sorteios (DrawSection.tsx)
    const participantsScreenCountDemo = INITIAL_SAMPLE_PARTICIPANTS.length; // Participantes (ParticipantManager.tsx)

    const parityDemo =
      kpiForUnauth.traditionalTicketsIssued === statsScreenTicketsDemo &&
      kpiForUnauth.traditionalEligibleTickets === drawScreenEligibleDemo &&
      kpiForUnauth.traditionalParticipantsCount === participantsScreenCountDemo &&
      kpiForUnauth.traditionalParticipantsCount === statsScreenParticipantsDemo &&
      kpiForUnauth.dataSourceKind === 'DEMO' &&
      isDefaultDemoRoster(INITIAL_SAMPLE_PARTICIPANTS, []) === true;

    // Case 6B: Custom Local Roster (logged out, modified participants: 3 participants, 8 tickets)
    const customParticipants: Participant[] = [
      { id: 'c1', name: 'Participante 1', coins: 400, addedAt: Date.now() }, // 4 tickets
      { id: 'c2', name: 'Participante 2', coins: 350, addedAt: Date.now() }, // 3 tickets
      { id: 'c3', name: 'Participante 3', coins: 120, addedAt: Date.now() }, // 1 ticket
    ];
    const customWinners: Winner[] = [];
    const customComputed = computeRaffle(customParticipants, DEFAULT_SETTINGS, customWinners);
    const kpiCustomLocal = computeDashboardKpiSummary({
      participants: customParticipants,
      winners: customWinners,
      computed: customComputed,
      liveSessions: sessionsUserA,
      currentOwnerUid: null,
      syncStatus: 'offline',
    });

    const parityLocal =
      kpiCustomLocal.traditionalTicketsIssued === 8 &&
      kpiCustomLocal.traditionalTicketsIssued === customComputed.usedCount &&
      kpiCustomLocal.traditionalParticipantsCount === 3 &&
      kpiCustomLocal.traditionalParticipantsCount === customParticipants.length &&
      kpiCustomLocal.dataSourceKind === 'LOCAL';

    // Case 6C: Persisted Cloud Roster for User A (with 4 active LIVE sessions totaling 100 LIVE tickets)
    // Verify that Traditional KPIs remain strictly 8 tickets / 3 participants, while LIVE section has 100 LIVE tickets
    const kpiPersistedUserA = computeDashboardKpiSummary({
      participants: customParticipants,
      winners: customWinners,
      computed: customComputed,
      liveSessions: pollutedInputSessions, // Contains User A (100 tickets), User B, and unowned (112 tickets)
      currentOwnerUid: USER_A_UID,
      syncStatus: 'synced',
    });

    const parityPersisted =
      kpiPersistedUserA.traditionalTicketsIssued === 8 &&
      kpiPersistedUserA.traditionalParticipantsCount === 3 &&
      kpiPersistedUserA.liveSessionsCount === 4 &&
      kpiPersistedUserA.liveTicketsTotal === 100 && // 10 + 20 + 30 + 40 = 100 (only User A's sessions)
      kpiPersistedUserA.liveSupportersTotal === 30 && // 3 + 6 + 9 + 12 = 30 (only User A's sessions)
      kpiPersistedUserA.dataSourceKind === 'PERSISTED';

    assert(
      parityDemo && parityLocal && parityPersisted,
      6,
      'Dashboard, Participantes, Central de Sorteios e Relatórios apresentam exatamente os mesmos totais e diferenciam DEMO, LOCAL e PERSISTED',
      `demo=(11/5,${kpiForUnauth.dataSourceKind}), local=(8/3,${kpiCustomLocal.dataSourceKind}), persisted=(8/3 trad, 100 live,${kpiPersistedUserA.dataSourceKind})`
    );

    // -------------------------------------------------------------------------
    // 7. Falhas de autenticação no Backend resultam em negação de acesso (401)
    // -------------------------------------------------------------------------
    const baseUrl = 'http://localhost:3000';
    let unauthLiveSessionsStatus = 0;
    let invalidTokenLiveSessionsStatus = 0;
    let unauthHistoryStatus = 0;

    try {
      const r1 = await fetch(`${baseUrl}/api/tiktok/live/sessions?limit=15`);
      unauthLiveSessionsStatus = r1.status;

      const r2 = await fetch(`${baseUrl}/api/tiktok/live/sessions?limit=15`, {
        headers: { Authorization: 'Bearer token_invalido_forjado_123' },
      });
      invalidTokenLiveSessionsStatus = r2.status;

      const r3 = await fetch(`${baseUrl}/api/tiktok/pro/history?limit=15&ownerUid=${USER_A_UID}`);
      unauthHistoryStatus = r3.status;
    } catch (err) {
      console.error('Erro ao conectar em localhost:3000 para teste de rota:', err);
    }

    assert(
      unauthLiveSessionsStatus === 401 &&
        invalidTokenLiveSessionsStatus === 401 &&
        unauthHistoryStatus === 401,
      7,
      'Backend nega acesso (HTTP 401 Fail-Closed) em /api/tiktok/live/sessions e /api/tiktok/pro/history sem token ou com token inválido, ignorando ownerUid enviado na query',
      `noToken=${unauthLiveSessionsStatus}, badToken=${invalidTokenLiveSessionsStatus}, forgedQueryNoToken=${unauthHistoryStatus}`
    );

    // -------------------------------------------------------------------------
    // 8. Paginação e limite de sessões preservam o isolamento entre usuários
    // -------------------------------------------------------------------------
    // User B has 5 newer sessions (startedAt T+11000..T+15000).
    // User A has 4 older sessions (startedAt T+1000..T+4000).
    // Requesting limit=2 for User A must return User A's 2 newest sessions (sess_uA_4 and sess_uA_3),
    // NOT 0 sessions due to User B's newer sessions occupying the top of the global index!
    const paginatedUserA = await fetchAllLiveSessions(2, USER_A_UID);
    const paginatedUserB = await fetchAllLiveSessions(3, USER_B_UID);

    const paginationPreserved =
      paginatedUserA.length === 2 &&
      paginatedUserA[0].sessionId === `sess_uA_4_${runSuffix}` &&
      paginatedUserA[1].sessionId === `sess_uA_3_${runSuffix}` &&
      paginatedUserA.every((s) => s.ownerUid === USER_A_UID) &&
      paginatedUserB.length === 3 &&
      paginatedUserB[0].sessionId === `sess_uB_5_${runSuffix}` &&
      paginatedUserB[1].sessionId === `sess_uB_4_${runSuffix}` &&
      paginatedUserB[2].sessionId === `sess_uB_3_${runSuffix}` &&
      paginatedUserB.every((s) => s.ownerUid === USER_B_UID);

    assert(
      paginationPreserved,
      8,
      'Paginação e limite (limitCount) preservam o isolamento por UID mesmo quando outro usuário possui sessões mais recentes',
      `userALimit2=[${paginatedUserA.map((s) => s.username).join(', ')}], userBLimit3=[${paginatedUserB.map((s) => s.username).join(', ')}]`
    );
  } finally {
    // Clean up only the temporary test sessions created in this test run
    for (const sid of createdSessionIds) {
      try {
        await deleteDoc(doc(db, 'sessions', sid));
      } catch {
        // Ignore cleanup errors
      }
    }
  }

  console.log('\n================================================================================');
  console.log(`🏆 RESULTADO FASE 13.2: ${passed}/${passed + failed} CENÁRIOS APROVADOS`);
  console.log('================================================================================');

  if (failed > 0) {
    process.exit(1);
  }
  process.exit(0);
}

runFase13_2Tests().catch((err) => {
  console.error('Erro fatal na suíte Fase 13.2:', err);
  process.exit(1);
});
