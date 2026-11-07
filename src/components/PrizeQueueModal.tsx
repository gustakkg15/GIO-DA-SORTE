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
    <div className="fixed inset-0 z-50 bg-[#050D20]/85 backdrop-blur-md flex items-center justify-center p-4 animate-fade-in">
      <div className="bg-[#101F3D] border border-[#182943] rounded-2xl max-w-2xl w-full max-h-[90vh] flex flex-col shadow-2xl overflow-hidden animate-slide-up">
        {/* Header */}
        <div className="p-5 border-b border-[#182943] flex items-center justify-between bg-[#0B1730]">
          <div className="flex items-center gap-2">
            <Trophy className="w-5 h-5 text-[#F5B942]" />
            <h3 className="font-display font-bold text-lg text-[#F8FAFC]">Fila de Prêmios & Pódio · GIO DA SORTE</h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 text-[#94A3B8] hover:text-[#F8FAFC] rounded-lg transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 overflow-y-auto space-y-6">
          {/* Visual Podium if winners exist */}
          {winners.length > 0 && (
            <div className="bg-[#0B1730] border border-[#182943] rounded-2xl p-5 space-y-3">
              <span className="text-xs font-bold uppercase tracking-wider text-[#00A9FF] block text-center">
                Pódio Oficial dos Ganhadores
              </span>

              <div className="grid grid-cols-3 gap-2 items-end pt-4 min-h-[160px]">
                {/* 2nd Place */}
                <div className="flex flex-col items-center">
                  {secondPlace ? (
                    <div className="text-center mb-2">
                      <div className="text-xs font-bold text-[#F8FAFC] truncate max-w-[90px]">{secondPlace.name}</div>
                      <div className="text-[10px] text-[#94A3B8] font-mono tabular-nums">#{secondPlace.number}</div>
                    </div>
                  ) : (
                    <div className="text-[11px] text-[#94A3B8] mb-2">Aguardando</div>
                  )}
                  <div className="w-full bg-[#182943] h-20 rounded-t-xl flex flex-col items-center justify-center border-t-2 border-[#35B9F5]">
                    <span className="font-display font-black text-xl text-[#F8FAFC]">2º</span>
                    <span className="text-[10px] text-[#94A3B8] font-semibold">Prata</span>
                  </div>
                </div>

                {/* 1st Place (Tallest) */}
                <div className="flex flex-col items-center">
                  {firstPlace ? (
                    <div className="text-center mb-2">
                      <div className="text-xs font-black text-[#F5B942] truncate max-w-[100px]">{firstPlace.name}</div>
                      <div className="text-[10px] text-[#F8FAFC] font-mono font-bold tabular-nums">#{firstPlace.number}</div>
                    </div>
                  ) : (
                    <div className="text-[11px] text-[#94A3B8] mb-2">Aguardando</div>
                  )}
                  <div className="w-full bg-gradient-to-t from-[#0866F5] via-[#00A9FF] to-[#35B9F5] h-28 rounded-t-xl flex flex-col items-center justify-center shadow-lg text-[#F8FAFC] border-t-2 border-[#F5B942]">
                    <Trophy className="w-5 h-5 text-[#F5B942] mb-0.5" />
                    <span className="font-display font-black text-2xl leading-none">1º</span>
                    <span className="text-[10px] font-bold uppercase tracking-wider">Ouro</span>
                  </div>
                </div>

                {/* 3rd Place */}
                <div className="flex flex-col items-center">
                  {thirdPlace ? (
                    <div className="text-center mb-2">
                      <div className="text-xs font-bold text-[#F8FAFC] truncate max-w-[90px]">{thirdPlace.name}</div>
                      <div className="text-[10px] text-[#94A3B8] font-mono tabular-nums">#{thirdPlace.number}</div>
                    </div>
                  ) : (
                    <div className="text-[11px] text-[#94A3B8] mb-2">Aguardando</div>
                  )}
                  <div className="w-full bg-[#101F3D] h-14 rounded-t-xl flex flex-col items-center justify-center border-t-2 border-[#F5B942]/60">
                    <span className="font-display font-black text-lg text-[#F5B942]">3º</span>
                    <span className="text-[10px] text-[#94A3B8] font-semibold">Bronze</span>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Add Prize Form */}
          <form onSubmit={handleAddPrize} className="space-y-2">
            <label className="block text-xs font-semibold text-[#F8FAFC]">
              Cadastrar Prêmios para Rodadas Sequenciais
            </label>
            <div className="flex gap-2">
              <input
                type="text"
                value={newPrizeName}
                onChange={(e) => setNewPrizeName(e.target.value)}
                placeholder="Ex.: 1º Lugar - Smartphone, 2º Lugar - Fone de Ouvido..."
                className="flex-1 bg-[#0B1730] border border-[#182943] rounded-xl px-3.5 py-2.5 text-sm text-[#F8FAFC] placeholder:text-[#94A3B8]/50 focus:outline-none focus:border-[#00A9FF]"
              />
              <button
                type="submit"
                className="px-4 py-2.5 bg-[#0866F5] hover:bg-[#00A9FF] text-[#F8FAFC] font-bold text-xs sm:text-sm rounded-xl transition flex items-center gap-1.5 shrink-0 shadow-md"
              >
                <Plus className="w-4 h-4" />
                <span>Adicionar Prêmio</span>
              </button>
            </div>
          </form>

          {/* Prize Queue List */}
          <div className="space-y-2">
            <span className="text-xs font-semibold text-[#94A3B8] block">Fila de Prêmios Cadastrados:</span>
            {prizes.length === 0 ? (
              <div className="p-4 bg-[#0B1730] border border-dashed border-[#182943] rounded-xl text-center text-xs text-[#94A3B8]">
                Nenhum prêmio cadastrado na fila ainda.
              </div>
            ) : (
              <div className="space-y-2">
                {prizes.map((prize, idx) => (
                  <div
                    key={prize.id}
                    className="p-3 bg-[#0B1730] border border-[#182943] rounded-xl flex items-center justify-between gap-3"
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <span className="w-6 h-6 rounded-full bg-[#182943] border border-[#00A9FF]/40 text-[#00A9FF] font-mono font-bold text-xs flex items-center justify-center shrink-0 tabular-nums">
                        {idx + 1}
                      </span>
                      <span className="text-sm font-bold text-[#F8FAFC] truncate">{prize.name}</span>
                    </div>

                    <div className="flex items-center gap-1.5 shrink-0">
                      <button
                        type="button"
                        onClick={() => {
                          onSetCurrentPrize(prize.name);
                          onClose();
                        }}
                        className="px-2.5 py-1 text-xs font-semibold bg-[#0866F5]/20 text-[#35B9F5] hover:bg-[#0866F5]/30 border border-[#00A9FF]/30 rounded-lg transition"
                      >
                        Usar Agora
                      </button>

                      <button
                        type="button"
                        disabled={idx === 0}
                        onClick={() => handleMove(idx, 'up')}
                        className="p-1 text-[#94A3B8] hover:text-[#F8FAFC] disabled:opacity-30 rounded"
                      >
                        <ArrowUp className="w-4 h-4" />
                      </button>

                      <button
                        type="button"
                        disabled={idx === prizes.length - 1}
                        onClick={() => handleMove(idx, 'down')}
                        className="p-1 text-[#94A3B8] hover:text-[#F8FAFC] disabled:opacity-30 rounded"
                      >
                        <ArrowDown className="w-4 h-4" />
                      </button>

                      <button
                        type="button"
                        onClick={() => handleRemovePrize(prize.id)}
                        className="p-1 text-[#94A3B8] hover:text-[#F05262] rounded"
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
