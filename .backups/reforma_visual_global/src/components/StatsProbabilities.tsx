import React from 'react';
import { BarChart3, PieChart, Users, Coins, Ticket, Percent } from 'lucide-react';
import { ComputedRaffle, RaffleSettings, Winner } from '../types';

interface StatsProbabilitiesProps {
  computed: ComputedRaffle;
  settings: RaffleSettings;
  winners: Winner[];
}

export const StatsProbabilities: React.FC<StatsProbabilitiesProps> = ({
  computed,
  settings,
  winners,
}) => {
  const totalCoins = computed.allocations.reduce((acc, a) => acc + a.participant.coins, 0);
  const totalTickets = computed.usedCount;
  const capacity = settings.total;
  const remainingInPool = Math.max(0, capacity - totalTickets);
  const capacityPercent = Math.min(100, Math.round((totalTickets / capacity) * 100));

  const eligibleAllocations = computed.allocations.filter((a) => a.assignedTickets > 0);
  const topContenders = [...eligibleAllocations].sort((a, b) => b.assignedTickets - a.assignedTickets).slice(0, 8);

  const averageCoins =
    computed.allocations.length > 0 ? Math.round(totalCoins / computed.allocations.length) : 0;
  const totalRemainderCoins = computed.allocations.reduce((acc, a) => acc + a.remainderCoins, 0);

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* Top Level Metric Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 sm:gap-4">
        <div className="bg-[#101F3D] border border-[#182943] rounded-2xl p-4 sm:p-5 shadow-lg space-y-1 animate-card-enter neon-card">
          <div className="flex items-center justify-between text-[#94A3B8]">
            <span className="text-xs font-semibold">Participantes</span>
            <Users className="w-4 h-4 text-[#00A9FF]" />
          </div>
          <div className="font-mono font-black text-2xl sm:text-3xl text-[#F8FAFC] tabular-nums">
            {computed.allocations.length}
          </div>
          <div className="text-[11px] text-[#64748B]">
            {eligibleAllocations.length} com ao menos 1 bilhete
          </div>
        </div>

        <div className="bg-[#101F3D] border border-[#182943] rounded-2xl p-4 sm:p-5 shadow-lg space-y-1 animate-card-enter neon-card">
          <div className="flex items-center justify-between text-[#94A3B8]">
            <span className="text-xs font-semibold">Total de Moedas</span>
            <Coins className="w-4 h-4 text-[#00A9FF]" />
          </div>
          <div className="font-mono font-black text-2xl sm:text-3xl text-[#00A9FF] tabular-nums">
            {totalCoins.toLocaleString('pt-BR')}
          </div>
          <div className="text-[11px] text-[#64748B]">Média de {averageCoins} por pessoa</div>
        </div>

        <div className="bg-[#101F3D] border border-[#182943] rounded-2xl p-4 sm:p-5 shadow-lg space-y-1 animate-card-enter neon-card">
          <div className="flex items-center justify-between text-[#94A3B8]">
            <span className="text-xs font-semibold">Bilhetes Entregues</span>
            <Ticket className="w-4 h-4 text-[#20C997]" />
          </div>
          <div className="font-mono font-black text-2xl sm:text-3xl text-[#F8FAFC] tabular-nums">
            {totalTickets} <span className="text-sm font-normal text-[#64748B]">/ {capacity}</span>
          </div>
          <div className="text-[11px] text-[#64748B]">{remainingInPool} bilhetes disponíveis</div>
        </div>

        <div className="bg-[#101F3D] border border-[#182943] rounded-2xl p-4 sm:p-5 shadow-lg space-y-1 animate-card-enter neon-card">
          <div className="flex items-center justify-between text-[#94A3B8]">
            <span className="text-xs font-semibold">Moedas em Sobra</span>
            <Percent className="w-4 h-4 text-[#35B9F5]" />
          </div>
          <div className="font-mono font-black text-2xl sm:text-3xl text-[#35B9F5] tabular-nums">
            {totalRemainderCoins}
          </div>
          <div className="text-[11px] text-[#64748B]">Não formaram 1 bilhete</div>
        </div>
      </div>

      {/* Pool Capacity Progress Bar */}
      <div className="bg-[#101F3D] border border-[#182943] rounded-2xl p-5 sm:p-6 shadow-xl space-y-3 animate-card-enter neon-card">
        <div className="flex items-center justify-between">
          <span className="font-display font-bold text-sm text-[#F8FAFC] flex items-center gap-2">
            <PieChart className="w-4 h-4 text-[#00A9FF]" />
            <span>Ocupação da Série · GIO DA SORTE</span>
          </span>
          <span className="text-xs font-mono font-bold text-[#00A9FF] tabular-nums">
            {capacityPercent}% preenchido
          </span>
        </div>

        <div className="w-full h-3 bg-[#050D20] rounded-full overflow-hidden border border-[#182943]">
          <div
            className="h-full transition-all duration-500 rounded-full bg-gradient-to-r from-[#0866F5] via-[#00A9FF] to-[#35B9F5] shadow-sm"
            style={{ width: `${capacityPercent}%` }}
          />
        </div>

        <div className="flex items-center justify-between text-xs text-[#94A3B8]">
          <span className="font-mono">Início: #{settings.start}</span>
          <span>
            {totalTickets} distribuídos · {remainingInPool} sobrando
          </span>
          <span className="font-mono">Fim da série: #{settings.start + settings.total - 1}</span>
        </div>
      </div>

      {/* Probability Leaderboard */}
      <div className="bg-[#101F3D] border border-[#182943] rounded-2xl p-5 sm:p-6 shadow-xl space-y-4 animate-card-enter neon-card">
        <div className="flex items-center justify-between pb-3 border-b border-[#182943]">
          <div className="flex items-center gap-2">
            <BarChart3 className="w-5 h-5 text-[#00A9FF]" />
            <h3 className="font-display font-bold text-lg text-[#F8FAFC]">Maiores Chances de Vitória</h3>
          </div>
          <span className="text-xs text-[#94A3B8]">Classificação por probabilidade</span>
        </div>

        {topContenders.length === 0 ? (
          <div className="py-8 text-center text-xs text-[#64748B]">
            Ainda não há participantes com bilhetes distribuídos.
          </div>
        ) : (
          <div className="space-y-3">
            {topContenders.map((alloc, idx) => (
              <div key={alloc.participant.id} className="space-y-1">
                <div className="flex items-center justify-between text-xs">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="w-5 font-mono font-bold text-[#64748B] text-right">{idx + 1}.</span>
                    <span className="font-bold text-[#F8FAFC] truncate">{alloc.participant.name}</span>
                    <span className="font-mono text-[#64748B]">({alloc.participant.coins} moedas)</span>
                  </div>

                  <div className="flex items-center gap-3 shrink-0">
                    <span className="font-mono text-[#94A3B8] font-medium">{alloc.assignedTickets} bilhetes</span>
                    <span className="font-mono font-bold text-[#00A9FF] tabular-nums w-14 text-right">
                      {alloc.winProbability}%
                    </span>
                  </div>
                </div>

                <div className="w-full h-2 bg-[#050D20] rounded-full overflow-hidden border border-[#182943]/60">
                  <div
                    className="h-full bg-gradient-to-r from-[#0866F5] to-[#00A9FF] rounded-full"
                    style={{ width: `${Math.min(100, alloc.winProbability * 2.5)}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
