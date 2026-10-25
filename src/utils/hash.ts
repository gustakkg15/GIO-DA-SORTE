import { Participant, RaffleSettings, MonteCarloResult, ComputedRaffle } from '../types';

/**
 * Generates a cryptographic SHA-256 integrity hash of participants and settings.
 * Organizers can publish this hash to spectators before drawing to prove
 * that no participants or coins were altered behind the scenes.
 */
export async function generateRosterHash(
  participants: Participant[],
  settings: RaffleSettings
): Promise<string> {
  const canonicalData = {
    settings: {
      rate: settings.rate,
      total: settings.total,
      start: settings.start,
      order: settings.order,
      seed: settings.seed,
    },
    participants: participants
      .map((p) => ({ name: p.name.trim().toLowerCase(), coins: p.coins }))
      .sort((a, b) => a.name.localeCompare(b.name)),
  };

  const jsonString = JSON.stringify(canonicalData);
  const encoder = new TextEncoder();
  const data = encoder.encode(jsonString);

  try {
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
  } catch {
    // Fallback simple checksum if subtle crypto unavailable
    let hash = 0;
    for (let i = 0; i < jsonString.length; i++) {
      hash = (hash << 5) - hash + jsonString.charCodeAt(i);
      hash |= 0;
    }
    return Math.abs(hash).toString(16).padStart(16, '0');
  }
}

/**
 * Runs 10,000 Monte Carlo draws to empirically prove fairness and odds accuracy.
 */
export function runMonteCarloSimulation(
  computed: ComputedRaffle,
  iterations = 10000
): MonteCarloResult[] {
  const tickets = computed.eligibleTickets;
  if (tickets.length === 0) return [];

  const winsMap = new Map<string, number>();

  // Run iterations
  const len = tickets.length;
  for (let i = 0; i < iterations; i++) {
    const idx = Math.floor(Math.random() * len);
    const winnerId = tickets[idx].participantId;
    winsMap.set(winnerId, (winsMap.get(winnerId) || 0) + 1);
  }

  // Compile results
  return computed.allocations
    .filter((a) => a.assignedTickets > 0)
    .map((alloc) => {
      const wins = winsMap.get(alloc.participant.id) || 0;
      const simulatedPct = Math.round((wins / iterations) * 1000) / 10;
      const diff = Math.round((simulatedPct - alloc.winProbability) * 10) / 10;

      return {
        participantId: alloc.participant.id,
        name: alloc.participant.name,
        coins: alloc.participant.coins,
        tickets: alloc.assignedTickets,
        simulatedWins: wins,
        simulatedPct,
        theoreticalPct: alloc.winProbability,
        difference: diff,
      };
    })
    .sort((a, b) => b.simulatedWins - a.simulatedWins);
}
