import React from 'react';
import {
  BarChart3,
  PieChart,
  Users,
  Coins,
  Ticket,
  Percent,
  Award,
} from 'lucide-react';
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
  const capacityPercent = capacity > 0 ? Math.min(100, Math.round((totalTickets / capacity) * 100)) : 0;

  const eligibleAllocations = computed.allocations.filter((a) => a.assignedTickets > 0);
  const topContenders = [...eligibleAllocations].sort(
    (a, b) => b.assignedTickets - a.assignedTickets
  );

  const averageCoins =
    computed.allocations.length > 0 ? Math.round(totalCoins / computed.allocations.length) : 0;
  const totalRemainderCoins = computed.allocations.reduce((acc, a) => acc + a.remainderCoins, 0);

  return (
    <div className="w-full space-y-6 animate-fade-in">
      {/* 1. Full-Width Metric Cards Row (4 Columns) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="gio-card p-5 flex items-start justify-between gap-3">
          <div>
            <span className="text-[11px] font-bold uppercase tracking-wider text-[#94A3B8]">
              Participantes
            </span>
            <div className="font-mono font-bold text-3xl text-[#F8FAFC] mt-1 tabular-nums">
              {computed.allocations.length.toLocaleString('pt-BR')}
            </div>
            <div className="text-xs text-[#94A3B8] mt-1">
              {eligibleAllocations.length} com ao menos 1 bilhete
            </div>
          </div>
          <div className="w-10 h-10 rounded-xl bg-[#0866F5]/20 border border-[#00A9FF]/35 flex items-center justify-center text-[#00A9FF] shrink-0">
            <Users className="w-5 h-5" />
          </div>
        </div>

        <div className="gio-card p-5 flex items-start justify-between gap-3">
          <div>
            <span className="text-[11px] font-bold uppercase tracking-wider text-[#94A3B8]">
              Total de Moedas
            </span>
            <div className="font-mono font-bold text-3xl text-[#00A9FF] mt-1 tabular-nums">
              {totalCoins.toLocaleString('pt-BR')}
            </div>
            <div className="text-xs text-[#94A3B8] mt-1 font-mono tabular-nums">
              Média de {averageCoins.toLocaleString('pt-BR')} por pessoa
            </div>
          </div>
          <div className="w-10 h-10 rounded-xl bg-[#00A9FF]/15 border border-[#00A9FF]/35 flex items-center justify-center text-[#00A9FF] shrink-0">
            <Coins className="w-5 h-5" />
          </div>
        </div>

        <div className="gio-card p-5 flex items-start justify-between gap-3">
          <div>
            <span className="text-[11px] font-bold uppercase tracking-wider text-[#94A3B8]">
              Bilhetes Entregues
            </span>
            <div className="font-mono font-bold text-3xl text-[#F8FAFC] mt-1 tabular-nums">
              {totalTickets.toLocaleString('pt-BR')}{' '}
              <span className="text-sm font-normal text-[#94A3B8]">
                / {capacity.toLocaleString('pt-BR')}
              </span>
            </div>
            <div className="text-xs text-[#20C997] mt-1 font-mono tabular-nums">
              {remainingInPool.toLocaleString('pt-BR')} bilhetes disponíveis
            </div>
          </div>
          <div className="w-10 h-10 rounded-xl bg-[#20C997]/15 border border-[#20C997]/35 flex items-center justify-center text-[#20C997] shrink-0">
            <Ticket className="w-5 h-5" />
          </div>
        </div>

        <div className="gio-card p-5 flex items-start justify-between gap-3">
          <div>
            <span className="text-[11px] font-bold uppercase tracking-wider text-[#94A3B8]">
              Moedas em Sobra
            </span>
            <div className="font-mono font-bold text-3xl text-[#35B9F5] mt-1 tabular-nums">
              {totalRemainderCoins.toLocaleString('pt-BR')}
            </div>
            <div className="text-xs text-[#94A3B8] mt-1">
              Abaixo de {settings.rate} moedas/bilhete
            </div>
          </div>
          <div className="w-10 h-10 rounded-xl bg-[#35B9F5]/15 border border-[#35B9F5]/35 flex items-center justify-center text-[#35B9F5] shrink-0">
            <Percent className="w-5 h-5" />
          </div>
        </div>
      </div>

      {/* 2. 12-Column Analytical Grid: Series Occupancy (Left 4 cols) + Probability Leaderboard (Right 8 cols) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left (4 cols): Pool Capacity & Series Metadata */}
        <div className="lg:col-span-4 gio-card p-5 sm:p-6 space-y-4">
          <div className="flex items-center justify-between">
            <span className="font-bold text-sm text-[#F8FAFC] flex items-center gap-2">
              <PieChart className="w-4 h-4 text-[#00A9FF]" />
              <span>Ocupação da Série</span>
            </span>
            <span className="px-2.5 py-0.5 rounded-md bg-[#0866F5]/20 border border-[#00A9FF]/35 text-xs font-mono font-bold text-[#00A9FF] tabular-nums">
              {capacityPercent}% preenchido
            </span>
          </div>

          <div className="w-full h-3.5 bg-[#050D20] rounded-full overflow-hidden border border-[#182943]">
            <div
              className="h-full transition-all duration-500 rounded-full bg-gradient-to-r from-[#0866F5] via-[#00A9FF] to-[#20C997]"
              style={{ width: `${capacityPercent}%` }}
            />
          </div>

          <div className="grid grid-cols-2 gap-2.5 pt-2">
            <div className="p-3 rounded-xl bg-[#0B1730] border border-[#182943]">
              <span className="block text-[10px] font-bold uppercase tracking-wider text-[#94A3B8]">
                Início da Série
              </span>
              <span className="font-mono font-bold text-sm text-[#F8FAFC] tabular-nums">
                #{settings.start}
              </span>
            </div>
            <div className="p-3 rounded-xl bg-[#0B1730] border border-[#182943]">
              <span className="block text-[10px] font-bold uppercase tracking-wider text-[#94A3B8]">
                Fim da Série
              </span>
              <span className="font-mono font-bold text-sm text-[#F8FAFC] tabular-nums">
                #{settings.start + settings.total - 1}
              </span>
            </div>
            <div className="p-3 rounded-xl bg-[#0B1730] border border-[#182943]">
              <span className="block text-[10px] font-bold uppercase tracking-wider text-[#94A3B8]">
                Distribuídos
              </span>
              <span className="font-mono font-bold text-sm text-[#00A9FF] tabular-nums">
                {totalTickets.toLocaleString('pt-BR')}
              </span>
            </div>
            <div className="p-3 rounded-xl bg-[#0B1730] border border-[#182943]">
              <span className="block text-[10px] font-bold uppercase tracking-wider text-[#94A3B8]">
                Vencedores
              </span>
              <span className="font-mono font-bold text-sm text-[#F5B942] tabular-nums">
                {winners.length.toLocaleString('pt-BR')}
              </span>
            </div>
          </div>
        </div>

        {/* Right (8 cols): Probability Leaderboard */}
        <div className="lg:col-span-8 gio-card p-5 sm:p-6 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-3 border-b border-[#182943]">
            <div className="flex items-center gap-2.5">
              <div className="w-9 h-9 rounded-xl bg-[#0866F5]/20 border border-[#00A9FF]/35 flex items-center justify-center text-[#00A9FF]">
                <BarChart3 className="w-4 h-4" />
              </div>
              <div>
                <h3 className="font-bold text-base text-[#F8FAFC]">
                  Ranking de Probabilidades por Participante
                </h3>
                <p className="text-xs text-[#94A3B8]">
                  Classificação matemática proporcional ao número de bilhetes emitidos
                </p>
              </div>
            </div>
            <span className="text-xs font-mono text-[#94A3B8] tabular-nums">
              {topContenders.length} elegíveis
            </span>
          </div>

          {topContenders.length === 0 ? (
            <div className="py-10 text-center rounded-xl bg-[#0B1730] border border-dashed border-[#182943] text-xs text-[#94A3B8]">
              Ainda não há participantes com bilhetes distribuídos nesta sessão.
            </div>
          ) : (
            <div className="space-y-2.5 max-h-[520px] overflow-y-auto pr-1 custom-scrollbar">
              {topContenders.map((alloc, idx) => {
                const hasWon = winners.some((w) => w.participantId === alloc.participant.id);
                return (
                  <div
                    key={alloc.participant.id}
                    className={`p-3.5 rounded-xl border transition-colors ${
                      hasWon
                        ? 'bg-[#0B1730] border-[#F5B942]/45'
                        : 'bg-[#0B1730] border-[#182943] hover:border-[#00A9FF]/35'
                    }`}
                  >
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-2 text-xs">
                      <div className="flex items-center gap-2.5 min-w-0">
                        <span
                          className={`w-6 h-6 rounded-lg font-mono font-bold text-xs flex items-center justify-center shrink-0 tabular-nums ${
                            idx === 0
                              ? 'bg-[#F5B942]/20 text-[#F5B942] border border-[#F5B942]/40'
                              : idx === 1
                              ? 'bg-[#00A9FF]/20 text-[#00A9FF] border border-[#00A9FF]/40'
                              : idx === 2
                              ? 'bg-[#20C997]/20 text-[#20C997] border border-[#20C997]/40'
                              : 'bg-[#101F3D] text-[#94A3B8] border border-[#182943]'
                          }`}
                        >
                          {idx + 1}
                        </span>
                        <span className="font-bold text-sm text-[#F8FAFC] truncate">
                          {alloc.participant.name}
                        </span>
                        <span className="font-mono text-[#94A3B8] tabular-nums">
                          ({alloc.participant.coins.toLocaleString('pt-BR')} moedas)
                        </span>
                        {hasWon && (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold uppercase bg-[#F5B942]/15 text-[#F5B942] border border-[#F5B942]/35 shrink-0">
                            <Award className="w-3 h-3" />
                            Premiado
                          </span>
                        )}
                      </div>

                      <div className="flex items-center gap-3 shrink-0 font-mono tabular-nums">
                        <span className="text-[#F8FAFC] font-semibold">
                          {alloc.assignedTickets.toLocaleString('pt-BR')}{' '}
                          {alloc.assignedTickets === 1 ? 'bilhete' : 'bilhetes'}
                        </span>
                        <span className="px-2 py-0.5 rounded-md bg-[#0866F5]/20 border border-[#00A9FF]/35 font-bold text-[#00A9FF] w-16 text-right">
                          {alloc.winProbability}%
                        </span>
                      </div>
                    </div>

                    <div className="w-full h-2 bg-[#050D20] rounded-full overflow-hidden border border-[#182943]/60">
                      <div
                        className={`h-full rounded-full ${
                          hasWon
                            ? 'bg-[#F5B942]'
                            : 'bg-gradient-to-r from-[#0866F5] to-[#00A9FF]'
                        }`}
                        style={{ width: `${Math.min(100, Math.max(2, alloc.winProbability * 2))}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
