import React, { useState } from 'react';
import { X, Plus, Trash2, Trophy, ArrowUp, ArrowDown } from 'lucide-react';
import { RaffleSettings, PrizeTier, Winner } from '../types';
import { generateUid } from '../utils/raffle';

interface PrizeQueueModalProps {
  isOpen: boolean;
  onClose: () => void;
  settings: RaffleSettings;
  winners: Winner[];
  onUpdateSettings: (patch: Partial<RaffleSettings>) => void;
  onSetCurrentPrize: (prizeName: string) => void;
}

export const PrizeQueueModal: React.FC<PrizeQueueModalProps> = ({
  isOpen,
  onClose,
  settings,
  winners,
  onUpdateSettings,
  onSetCurrentPrize,
}) => {
  const [newPrizeName, setNewPrizeName] = useState('');

  if (!isOpen) return null;

  const prizes = settings.prizes || [];

  const handleAddPrize = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newPrizeName.trim()) return;

    const newTier: PrizeTier = {
      id: generateUid(),
      name: newPrizeName.trim(),
      rank: prizes.length + 1,
    };

    const updated = [...prizes, newTier];
    onUpdateSettings({ prizes: updated });
    setNewPrizeName('');
  };

  const handleRemovePrize = (id: string) => {
    const updated = prizes.filter((p) => p.id !== id).map((p, idx) => ({ ...p, rank: idx + 1 }));
    onUpdateSettings({ prizes: updated });
  };

  const handleMove = (index: number, direction: 'up' | 'down') => {
    const targetIdx = direction === 'up' ? index - 1 : index + 1;
    if (targetIdx < 0 || targetIdx >= prizes.length) return;

    const copy = [...prizes];
    const temp = copy[index];
    copy[index] = copy[targetIdx];
    copy[targetIdx] = temp;

    const reordered = copy.map((p, idx) => ({ ...p, rank: idx + 1 }));
    onUpdateSettings({ prizes: reordered });
  };

  const firstPlace = winners[0];
  const secondPlace = winners[1];
  const thirdPlace = winners[2];

  return (
    <div className="fixed inset-0 z-50 bg-[#080D18]/85 backdrop-blur-md flex items-center justify-center p-4 animate-fade-in">
      <div className="bg-[#111B30] border border-[var(--gio-border-subtle)] rounded-2xl max-w-2xl w-full max-h-[90vh] flex flex-col shadow-2xl overflow-hidden animate-slide-up">
        {/* Header */}
        <div className="p-5 border-b border-[var(--gio-border-subtle)] flex items-center justify-between bg-[#111B30]">
          <div className="flex items-center gap-2">
            <Trophy className="w-5 h-5 text-[#A6C957]" />
            <h3 className="font-bold text-lg text-[#FFFFFF]">Fila de Prêmios & Pódio · GIO DA SORTE</h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 text-[#A5B1C5] hover:text-[#FFFFFF] rounded-lg transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 overflow-y-auto space-y-6">
          {/* Visual Podium if winners exist */}
          {winners.length > 0 && (
            <div className="bg-[#080D18] border border-[var(--gio-border-subtle)] rounded-2xl p-5 space-y-3">
              <span className="text-xs font-bold uppercase tracking-wide text-[#A6C957] block text-center">
                Pódio Oficial dos Ganhadores
              </span>

              <div className="grid grid-cols-3 gap-2 items-end pt-4 min-h-[160px]">
                {/* 2nd Place */}
                <div className="flex flex-col items-center">
                  {secondPlace ? (
                    <div className="text-center mb-2">
                      <div className="text-xs font-bold text-[#FFFFFF] truncate max-w-[90px]">{secondPlace.name}</div>
                      <div className="text-[10px] text-[#A5B1C5] tabular-nums">#{secondPlace.number}</div>
                    </div>
                  ) : (
                    <div className="text-[11px] text-[#A5B1C5] mb-2">Aguardando</div>
                  )}
                  <div className="w-full bg-[#111B30] h-20 rounded-t-xl flex flex-col items-center justify-center border-t-2 border-[#0131CD]">
                    <span className="font-extrabold text-xl text-[#FFFFFF] tabular-nums">2º</span>
                    <span className="text-[10px] text-[#A5B1C5] font-semibold">Prata</span>
                  </div>
                </div>

                {/* 1st Place (Tallest) */}
                <div className="flex flex-col items-center">
                  {firstPlace ? (
                    <div className="text-center mb-2">
                      <div className="text-xs font-bold text-[#A6C957] truncate max-w-[100px]">{firstPlace.name}</div>
                      <div className="text-[10px] text-[#FFFFFF] font-bold tabular-nums">#{firstPlace.number}</div>
                    </div>
                  ) : (
                    <div className="text-[11px] text-[#A5B1C5] mb-2">Aguardando</div>
                  )}
                  <div className="w-full bg-[#0131CD] h-28 rounded-t-xl flex flex-col items-center justify-center shadow-lg text-[#FFFFFF] border-t-2 border-[#A6C957]">
                    <Trophy className="w-5 h-5 text-[#A6C957] mb-0.5" />
                    <span className="font-extrabold text-2xl leading-none tabular-nums">1º</span>
                    <span className="text-[10px] font-bold uppercase tracking-wide text-[#A6C957]">Campeão</span>
                  </div>
                </div>

                {/* 3rd Place */}
                <div className="flex flex-col items-center">
                  {thirdPlace ? (
                    <div className="text-center mb-2">
                      <div className="text-xs font-bold text-[#FFFFFF] truncate max-w-[90px]">{thirdPlace.name}</div>
                      <div className="text-[10px] text-[#A5B1C5] tabular-nums">#{thirdPlace.number}</div>
                    </div>
                  ) : (
                    <div className="text-[11px] text-[#A5B1C5] mb-2">Aguardando</div>
                  )}
                  <div className="w-full bg-[#111B30] h-14 rounded-t-xl flex flex-col items-center justify-center border-t-2 border-[#A6C957]/50">
                    <span className="font-extrabold text-lg text-[#A6C957] tabular-nums">3º</span>
                    <span className="text-[10px] text-[#A5B1C5] font-semibold">Bronze</span>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Add Prize Form */}
          <form onSubmit={handleAddPrize} className="space-y-2">
            <label className="block text-xs font-semibold text-[#FFFFFF]">
              Cadastrar Prêmios para Rodadas Sequenciais
            </label>
            <div className="flex gap-2">
              <input
                type="text"
                value={newPrizeName}
                onChange={(e) => setNewPrizeName(e.target.value)}
                placeholder="Ex.: 1º Lugar - Smartphone, 2º Lugar - Fone de Ouvido..."
                className="flex-1 bg-[#080D18] border border-[var(--gio-border-subtle)] rounded-xl px-3.5 py-2.5 text-sm text-[#FFFFFF] placeholder:text-[#A5B1C5]/50 focus:outline-none focus:border-[#A6C957] focus:ring-2 focus:ring-[#A6C957]/30"
              />
              <button
                type="submit"
                className="px-4 py-2.5 bg-[#0131CD] hover:brightness-110 text-[#FFFFFF] font-bold text-xs sm:text-sm rounded-xl transition flex items-center gap-1.5 shrink-0 shadow-md"
              >
                <Plus className="w-4 h-4" />
                <span>Adicionar Prêmio</span>
              </button>
            </div>
          </form>

          {/* Prize Queue List */}
          <div className="space-y-2">
            <span className="text-xs font-semibold text-[#A5B1C5] block">Fila de Prêmios Cadastrados:</span>
            {prizes.length === 0 ? (
              <div className="p-4 bg-[#080D18] border border-dashed border-[var(--gio-border-subtle)] rounded-xl text-center text-xs text-[#A5B1C5]">
                Nenhum prêmio cadastrado na fila ainda.
              </div>
            ) : (
              <div className="space-y-2">
                {prizes.map((prize, idx) => (
                  <div
                    key={prize.id}
                    className="p-3 bg-[#080D18] border border-[var(--gio-border-subtle)] rounded-xl flex items-center justify-between gap-3"
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <span className="w-6 h-6 rounded-full bg-[#111B30] border border-[#0131CD]/40 text-[#A6C957] font-bold text-xs flex items-center justify-center shrink-0 tabular-nums">
                        {idx + 1}
                      </span>
                      <span className="text-sm font-bold text-[#FFFFFF] truncate">{prize.name}</span>
                    </div>

                    <div className="flex items-center gap-1.5 shrink-0">
                      <button
                        type="button"
                        onClick={() => {
                          onSetCurrentPrize(prize.name);
                          onClose();
                        }}
                        className="px-2.5 py-1 text-xs font-semibold bg-[#0131CD] text-[#FFFFFF] hover:brightness-110 border border-[#0131CD] rounded-lg transition"
                      >
                        Usar Agora
                      </button>

                      <button
                        type="button"
                        disabled={idx === 0}
                        onClick={() => handleMove(idx, 'up')}
                        className="p-1 text-[#A5B1C5] hover:text-[#FFFFFF] disabled:opacity-30 rounded"
                      >
                        <ArrowUp className="w-4 h-4" />
                      </button>

                      <button
                        type="button"
                        disabled={idx === prizes.length - 1}
                        onClick={() => handleMove(idx, 'down')}
                        className="p-1 text-[#A5B1C5] hover:text-[#FFFFFF] disabled:opacity-30 rounded"
                      >
                        <ArrowDown className="w-4 h-4" />
                      </button>

                      <button
                        type="button"
                        onClick={() => handleRemovePrize(prize.id)}
                        className="p-1 text-[#A5B1C5] hover:text-[#F05262] rounded"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
