import React, { useState } from 'react';
import { X, Award, Plus, Trash2, Trophy, ArrowUp, ArrowDown, CheckCircle2 } from 'lucide-react';
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
    <div className="fixed inset-0 z-50 bg-slate-950/85 backdrop-blur-md flex items-center justify-center p-4 animate-fade-in">
      <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-2xl w-full max-h-[90vh] flex flex-col shadow-2xl overflow-hidden animate-slide-up">
        {/* Header */}
        <div className="p-5 border-b border-slate-800 flex items-center justify-between bg-slate-950">
          <div className="flex items-center gap-2">
            <Trophy className="w-5 h-5 text-sky-400" />
            <h3 className="font-display font-bold text-lg text-white">Fila de Prêmios & Pódio · GIO DA SORTE</h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-white rounded-lg transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 overflow-y-auto space-y-6">
          {/* Visual Podium if winners exist */}
          {winners.length > 0 && (
            <div className="bg-slate-950 border border-slate-800 rounded-2xl p-5 space-y-3">
              <span className="text-xs font-bold uppercase tracking-wider text-sky-400 block text-center">
                Pódio Oficial dos Ganhadores
              </span>

              <div className="grid grid-cols-3 gap-2 items-end pt-4 min-h-[160px]">
                {/* 2nd Place */}
                <div className="flex flex-col items-center">
                  {secondPlace ? (
                    <div className="text-center mb-2">
                      <div className="text-xs font-bold text-white truncate max-w-[90px]">{secondPlace.name}</div>
                      <div className="text-[10px] text-slate-400">#{secondPlace.number}</div>
                    </div>
                  ) : (
                    <div className="text-[11px] text-slate-600 mb-2">Aguardando</div>
                  )}
                  <div className="w-full bg-slate-800 h-20 rounded-t-xl flex flex-col items-center justify-center border-t-2 border-slate-400">
                    <span className="font-display font-black text-xl text-slate-300">2º</span>
                    <span className="text-[10px] text-slate-400 font-semibold">Prata</span>
                  </div>
                </div>

                {/* 1st Place (Tallest) */}
                <div className="flex flex-col items-center">
                  {firstPlace ? (
                    <div className="text-center mb-2">
                      <div className="text-xs font-black text-sky-300 truncate max-w-[100px]">{firstPlace.name}</div>
                      <div className="text-[10px] text-sky-200 font-bold">#{firstPlace.number}</div>
                    </div>
                  ) : (
                    <div className="text-[11px] text-slate-600 mb-2">Aguardando</div>
                  )}
                  <div className="w-full bg-gradient-to-t from-blue-700 via-sky-600 to-sky-400 h-28 rounded-t-xl flex flex-col items-center justify-center shadow-lg shadow-blue-500/25 text-white border-t-2 border-sky-200">
                    <Trophy className="w-5 h-5 fill-white mb-0.5" />
                    <span className="font-display font-black text-2xl leading-none">1º</span>
                    <span className="text-[10px] font-bold uppercase tracking-wider">Ouro</span>
                  </div>
                </div>

                {/* 3rd Place */}
                <div className="flex flex-col items-center">
                  {thirdPlace ? (
                    <div className="text-center mb-2">
                      <div className="text-xs font-bold text-white truncate max-w-[90px]">{thirdPlace.name}</div>
                      <div className="text-[10px] text-slate-400">#{thirdPlace.number}</div>
                    </div>
                  ) : (
                    <div className="text-[11px] text-slate-600 mb-2">Aguardando</div>
                  )}
                  <div className="w-full bg-slate-900 h-14 rounded-t-xl flex flex-col items-center justify-center border-t-2 border-amber-700">
                    <span className="font-display font-black text-lg text-amber-600">3º</span>
                    <span className="text-[10px] text-slate-500 font-semibold">Bronze</span>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Add Prize Form */}
          <form onSubmit={handleAddPrize} className="space-y-2">
            <label className="block text-xs font-semibold text-slate-300">
              Cadastrar Prêmios para Rodadas Sequenciais
            </label>
            <div className="flex gap-2">
              <input
                type="text"
                value={newPrizeName}
                onChange={(e) => setNewPrizeName(e.target.value)}
                placeholder="Ex.: 1º Lugar - Smartphone, 2º Lugar - Fone de Ouvido..."
                className="flex-1 bg-slate-950 border border-slate-700 rounded-xl px-3.5 py-2.5 text-sm text-white placeholder:text-slate-600 focus:outline-none focus:border-blue-400"
              />
              <button
                type="submit"
                className="px-4 py-2.5 bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs sm:text-sm rounded-xl transition flex items-center gap-1.5 shrink-0 shadow-md shadow-blue-600/30"
              >
                <Plus className="w-4 h-4" />
                <span>Adicionar Prêmio</span>
              </button>
            </div>
          </form>

          {/* Prize Queue List */}
          <div className="space-y-2">
            <span className="text-xs font-semibold text-slate-400 block">Fila de Prêmios Cadastrados:</span>
            {prizes.length === 0 ? (
              <div className="p-4 bg-slate-950 border border-dashed border-slate-800 rounded-xl text-center text-xs text-slate-500">
                Nenhum prêmio cadastrado na fila ainda.
              </div>
            ) : (
              <div className="space-y-2">
                {prizes.map((prize, idx) => (
                  <div
                    key={prize.id}
                    className="p-3 bg-slate-950 border border-slate-800 rounded-xl flex items-center justify-between gap-3"
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <span className="w-6 h-6 rounded-full bg-blue-950 border border-blue-800 text-sky-400 font-bold text-xs flex items-center justify-center shrink-0">
                        {idx + 1}
                      </span>
                      <span className="text-sm font-bold text-white truncate">{prize.name}</span>
                    </div>

                    <div className="flex items-center gap-1.5 shrink-0">
                      <button
                        type="button"
                        onClick={() => {
                          onSetCurrentPrize(prize.name);
                          onClose();
                        }}
                        className="px-2.5 py-1 text-xs font-semibold bg-blue-600/20 text-sky-300 hover:bg-blue-600/30 border border-blue-500/30 rounded-lg transition"
                      >
                        Usar Agora
                      </button>

                      <button
                        type="button"
                        disabled={idx === 0}
                        onClick={() => handleMove(idx, 'up')}
                        className="p-1 text-slate-400 hover:text-white disabled:opacity-30 rounded"
                      >
                        <ArrowUp className="w-4 h-4" />
                      </button>

                      <button
                        type="button"
                        disabled={idx === prizes.length - 1}
                        onClick={() => handleMove(idx, 'down')}
                        className="p-1 text-slate-400 hover:text-white disabled:opacity-30 rounded"
                      >
                        <ArrowDown className="w-4 h-4" />
                      </button>

                      <button
                        type="button"
                        onClick={() => handleRemovePrize(prize.id)}
                        className="p-1 text-slate-500 hover:text-red-400 rounded"
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
