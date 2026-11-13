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
            <span className="text-xs font-medium text-[#A5B1C5]">
              Participantes
            </span>
            <div className="font-bold text-3xl text-[#FFFFFF] mt-1 tabular-nums">
              {computed.allocations.length.toLocaleString('pt-BR')}
            </div>
            <div className="text-xs text-[#A5B1C5] mt-1 tabular-nums">
              {eligibleAllocations.length} com ao menos 1 bilhete
            </div>
          </div>
          <div className="w-10 h-10 rounded-xl bg-[#0131CD] border border-[#0131CD] flex items-center justify-center text-[#FFFFFF] shrink-0">
            <Users className="w-5 h-5" />
          </div>
        </div>

        <div className="gio-card p-5 flex items-start justify-between gap-3">
          <div>
            <span className="text-xs font-medium text-[#A5B1C5]">
              Total de moedas
            </span>
            <div className="font-bold text-3xl text-[#FFFFFF] mt-1 tabular-nums">
              {totalCoins.toLocaleString('pt-BR')}
            </div>
            <div className="text-xs text-[#A5B1C5] mt-1 tabular-nums">
              Média de {averageCoins.toLocaleString('pt-BR')} por pessoa
            </div>
          </div>
          <div className="w-10 h-10 rounded-xl bg-[#0131CD] border border-[#0131CD] flex items-center justify-center text-[#FFFFFF] shrink-0">
            <Coins className="w-5 h-5" />
          </div>
        </div>

        <div className="gio-card p-5 flex items-start justify-between gap-3">
          <div>
            <span className="text-xs font-medium text-[#A5B1C5]">
              Bilhetes entregues
            </span>
            <div className="font-bold text-3xl text-[#FFFFFF] mt-1 tabular-nums">
              {totalTickets.toLocaleString('pt-BR')}{' '}
              <span className="text-sm font-normal text-[#A5B1C5]">
                / {capacity.toLocaleString('pt-BR')}
              </span>
            </div>
            <div className="text-xs text-[#A6C957] mt-1 tabular-nums font-medium">
              {remainingInPool.toLocaleString('pt-BR')} bilhetes disponíveis
            </div>
          </div>
          <div className="w-10 h-10 rounded-xl bg-[#A6C957]/15 border border-[#A6C957]/35 flex items-center justify-center text-[#A6C957] shrink-0">
            <Ticket className="w-5 h-5" />
          </div>
        </div>

        <div className="gio-card p-5 flex items-start justify-between gap-3">
          <div>
            <span className="text-xs font-medium text-[#A5B1C5]">
              Moedas em sobra
            </span>
            <div className="font-bold text-3xl text-[#FFFFFF] mt-1 tabular-nums">
              {totalRemainderCoins.toLocaleString('pt-BR')}
            </div>
            <div className="text-xs text-[#A5B1C5] mt-1 tabular-nums">
              Abaixo de {settings.rate} moedas/bilhete
            </div>
          </div>
          <div className="w-10 h-10 rounded-xl bg-[#0131CD] border border-[#0131CD] flex items-center justify-center text-[#FFFFFF] shrink-0">
            <Percent className="w-5 h-5" />
          </div>
        </div>
      </div>

      {/* 2. 12-Column Analytical Grid: Series Occupancy (Left 4 cols) + Probability Leaderboard (Right 8 cols) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left (4 cols): Pool Capacity & Series Metadata */}
        <div className="lg:col-span-4 gio-card p-5 sm:p-6 space-y-4">
          <div className="flex items-center justify-between">
            <span className="font-bold text-sm text-[#FFFFFF] flex items-center gap-2">
              <PieChart className="w-4 h-4 text-[#A5B1C5]" />
              <span>Ocupação da Série</span>
            </span>
            <span className="px-2.5 py-0.5 rounded-md bg-[#0131CD] border border-[#0131CD] text-xs font-semibold text-[#FFFFFF] tabular-nums">
              {capacityPercent}% preenchido
            </span>
          </div>

          <div className="w-full h-3 bg-[#080D18] rounded-full overflow-hidden border border-[var(--gio-border-subtle)]">
            <div
              className="h-full transition-all duration-500 rounded-full bg-[#0131CD]"
              style={{ width: `${capacityPercent}%` }}
            />
          </div>

          <div className="grid grid-cols-2 gap-2.5 pt-2">
            <div className="p-3 rounded-xl bg-[#080D18] border border-[var(--gio-border-subtle)]">
              <span className="block text-[11px] font-medium text-[#A5B1C5]">
                Início da série
              </span>
              <span className="font-bold text-sm text-[#FFFFFF] tabular-nums">
                #{settings.start}
              </span>
            </div>
            <div className="p-3 rounded-xl bg-[#080D18] border border-[var(--gio-border-subtle)]">
              <span className="block text-[11px] font-medium text-[#A5B1C5]">
                Fim da série
              </span>
              <span className="font-bold text-sm text-[#FFFFFF] tabular-nums">
                #{settings.start + settings.total - 1}
              </span>
            </div>
            <div className="p-3 rounded-xl bg-[#080D18] border border-[var(--gio-border-subtle)]">
              <span className="block text-[11px] font-medium text-[#A5B1C5]">
                Distribuídos
              </span>
              <span className="font-bold text-sm text-[#FFFFFF] tabular-nums">
                {totalTickets.toLocaleString('pt-BR')}
              </span>
            </div>
            <div className="p-3 rounded-xl bg-[#080D18] border border-[var(--gio-border-subtle)]">
              <span className="block text-[11px] font-medium text-[#A5B1C5]">
                Vencedores
              </span>
              <span className="font-bold text-sm text-[#A6C957] tabular-nums">
                {winners.length.toLocaleString('pt-BR')}
              </span>
            </div>
          </div>
        </div>

        {/* Right (8 cols): Probability Leaderboard */}
        <div className="lg:col-span-8 gio-card p-5 sm:p-6 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-3 border-b border-[var(--gio-border-subtle)]">
            <div className="flex items-center gap-2.5">
              <div className="w-9 h-9 rounded-xl bg-[#0131CD] border border-[#0131CD] flex items-center justify-center text-[#FFFFFF]">
                <BarChart3 className="w-4 h-4" />
              </div>
              <div>
                <h3 className="font-bold text-base text-[#FFFFFF]">
                  Ranking de Probabilidades por Participante
                </h3>
                <p className="text-xs text-[#A5B1C5]">
                  Classificação matemática proporcional ao número de bilhetes emitidos
                </p>
              </div>
            </div>
            <span className="text-xs text-[#A5B1C5] tabular-nums">
              {topContenders.length} elegíveis
            </span>
          </div>

          {topContenders.length === 0 ? (
            <div className="py-10 text-center rounded-xl bg-[#080D18] border border-dashed border-[var(--gio-border-subtle)] text-xs text-[#A5B1C5]">
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
                        ? 'bg-[#080D18] border-[#A6C957]/45'
                        : 'bg-[#080D18] border-[var(--gio-border-subtle)] hover:border-[#0131CD]/50'
                    }`}
                  >
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-2 text-xs">
                      <div className="flex items-center gap-2.5 min-w-0">
                        <span
                          className={`w-6 h-6 rounded-lg font-bold text-xs flex items-center justify-center shrink-0 tabular-nums ${
                            idx === 0
                              ? 'bg-[#A6C957] text-[#080D18] border border-[#A6C957]'
                              : idx === 1
                              ? 'bg-[#0131CD] text-[#FFFFFF] border border-[#0131CD]'
                              : idx === 2
                              ? 'bg-[#A6C957]/15 text-[#A6C957] border border-[#A6C957]/35'
                              : 'bg-[#111B30] text-[#A5B1C5] border border-[var(--gio-border-subtle)]'
                          }`}
                        >
                          {idx + 1}
                        </span>
                        <span className="font-semibold text-sm text-[#FFFFFF] truncate">
                          {alloc.participant.name}
                        </span>
                        <span className="text-[#A5B1C5] tabular-nums">
                          ({alloc.participant.coins.toLocaleString('pt-BR')} moedas)
                        </span>
                        {hasWon && (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-semibold bg-[#A6C957]/15 text-[#A6C957] border border-[#A6C957]/35 shrink-0">
                            <Award className="w-3 h-3" />
                            Premiado
                          </span>
                        )}
                      </div>

                      <div className="flex items-center gap-3 shrink-0 tabular-nums">
                        <span className="text-[#FFFFFF] font-semibold">
                          {alloc.assignedTickets.toLocaleString('pt-BR')}{' '}
                          {alloc.assignedTickets === 1 ? 'bilhete' : 'bilhetes'}
                        </span>
                        <span className="px-2 py-0.5 rounded-md bg-[#0131CD] border border-[#0131CD] font-semibold text-[#FFFFFF] w-16 text-right">
                          {alloc.winProbability}%
                        </span>
                      </div>
                    </div>

                    <div className="w-full h-2 bg-[#111B30] rounded-full overflow-hidden border border-[var(--gio-border-subtle)]">
                      <div
                        className={`h-full rounded-full ${
                          hasWon
                            ? 'bg-[#A6C957]'
                            : 'bg-[#0131CD]'
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
