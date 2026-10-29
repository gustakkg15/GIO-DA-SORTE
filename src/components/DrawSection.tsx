import React, { useState } from 'react';
import {
  Play,
  RotateCcw,
  Trash2,
  CheckCircle2,
  Copy,
  Sparkles,
  Clock,
  Flame,
  Award,
  BarChart2,
  Image as ImageIcon,
  Disc,
  Ticket,
  Settings,
  Gift,
  Upload,
  Edit3,
  FileText,
} from 'lucide-react';
import { TicketDisplay } from './TicketDisplay';
import { FortuneWheel } from './FortuneWheel';
import { SettingsBackup } from './SettingsBackup';
import { PrizeConfigModal } from './PrizeConfigModal';
import { RaffleSettings, Winner, ComputedRaffle, Participant } from '../types';
import { formatDateTime } from '../utils/raffle';

interface DrawSectionProps {
  computed: ComputedRaffle;
  settings: RaffleSettings;
  winners: Winner[];
  participants?: Participant[];
  isDrawing: boolean;
  currentDisplayNumber: number | string;
  onDraw: () => void;
  onWheelSpinEnd: (winnerTicket: { number: number; participantId: string; name: string }) => void;
  onUpdateSettings: (patch: Partial<RaffleSettings>) => void;
  onRemoveWinner: (winnerId: string) => void;
  onClearWinners: () => void;
  onOpenBattleRoyale: () => void;
  onOpenVictoryCard: (winner: Winner) => void;
  onOpenMonteCarlo: () => void;
  onOpenPrizeQueue: () => void;
  onOpenCelebration?: (winner: Winner) => void;
  onOpenAuditReport?: () => void;
  rosterHash?: string;
  onRequestWheelSpin?: () => void;
  wheelSpinSignal?: number;
  onRestoreState?: (state: { settings: RaffleSettings; participants: Participant[]; winners: Winner[] }) => void;
  onResetToSample?: () => void;
  onResetCoinsOnly?: () => void;
}

export const DrawSection: React.FC<DrawSectionProps> = ({
  computed,
  settings,
  winners,
  participants = [],
  isDrawing,
  currentDisplayNumber,
  onDraw,
  onWheelSpinEnd,
  onUpdateSettings,
  onRemoveWinner,
  onClearWinners,
  onOpenBattleRoyale,
  onOpenVictoryCard,
  onOpenMonteCarlo,
  onOpenPrizeQueue,
  onOpenCelebration,
  onOpenAuditReport,
  rosterHash,
  onRequestWheelSpin,
  wheelSpinSignal,
  onRestoreState,
  onResetToSample,
  onResetCoinsOnly,
}) => {
  const [subTab, setSubTab] = useState<'arena' | 'settings'>('arena');
  const [isPrizeModalOpen, setIsPrizeModalOpen] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const latestWinner = winners.length > 0 ? winners[0] : null;
  const eligibleCount = computed.eligibleTickets.length;
  const canDraw = eligibleCount > 0 && !isDrawing;

  const currentPrizeName = settings.prizeName || settings.currentPrize || 'Prêmio Principal';

  const handleCopyWinner = (winner: Winner) => {
    const text = `🎉 GIO DA SORTE: Parabéns a ${winner.name} com o bilhete #${winner.number}! (${winner.prize || currentPrizeName})`;
    navigator.clipboard.writeText(text).then(() => {
      setCopiedId(winner.id);
      setTimeout(() => setCopiedId(null), 2000);
    });
  };

  return (
    <div className="space-y-5">
      {/* Prize Configuration Modal */}
      <PrizeConfigModal
        isOpen={isPrizeModalOpen}
        onClose={() => setIsPrizeModalOpen(false)}
        currentPrizeName={currentPrizeName}
        currentPrizeImage={settings.prizeImage}
        onSavePrize={(name, image) => {
          onUpdateSettings({
            prizeName: name,
            currentPrize: name,
            prizeImage: image,
          });
        }}
      />

      {/* Sorteio & Configurações Sub-Navigation Bar */}
      <div className="flex items-center p-1 bg-slate-950 border border-slate-800 rounded-2xl shadow-md">
        <button
          type="button"
          onClick={() => setSubTab('arena')}
          className={`flex-1 py-2 px-3.5 rounded-xl text-xs font-bold transition flex items-center justify-center gap-2 ${
            subTab === 'arena'
              ? 'bg-blue-600 text-white shadow-md shadow-blue-600/30'
              : 'text-slate-400 hover:text-white'
          }`}
        >
          <Ticket className="w-4 h-4" />
          <span>Mesa de Sorteio</span>
        </button>

        <button
          type="button"
          onClick={() => setSubTab('settings')}
          className={`flex-1 py-2 px-3.5 rounded-xl text-xs font-bold transition flex items-center justify-center gap-2 ${
            subTab === 'settings'
              ? 'bg-blue-600 text-white shadow-md shadow-blue-600/30'
              : 'text-slate-400 hover:text-white'
          }`}
        >
          <Settings className="w-4 h-4" />
          <span>Configurações & Regras</span>
        </button>
      </div>

      {/* VIEW 1: Full Embedded Settings & Backup inside Sorteio Tab */}
      {subTab === 'settings' && (
        <div className="space-y-6 animate-in fade-in duration-200">
          <SettingsBackup
            settings={settings}
            participants={participants}
            winners={winners}
            computed={computed}
            onUpdateSettings={onUpdateSettings}
            onOpenAuditReport={onOpenAuditReport}
            rosterHash={rosterHash}
            onRestoreState={
              onRestoreState ||
              (() => {
                /* fallback */
              })
            }
            onResetToSample={
              onResetToSample ||
              (() => {
                /* fallback */
              })
            }
            onResetCoinsOnly={
              onResetCoinsOnly ||
              (() => {
                /* fallback */
              })
            }
          />
        </div>
      )}

      {/* VIEW 2: Arena & Drawing Operations */}
      {subTab === 'arena' && (
        <div className="space-y-6 animate-in fade-in duration-200">
          {/* Card de Destaque do Prêmio (Nome do Prêmio + Imagem do Prêmio) */}
          <div className="bg-gradient-to-r from-blue-950/70 via-slate-900 to-indigo-950/70 border-2 border-blue-500/40 rounded-2xl p-4 shadow-xl relative overflow-hidden animate-card-enter neon-card">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
              <div className="flex items-center gap-3.5 min-w-0">
                {/* Prize Image Thumbnail with Glow */}
                <div
                  onClick={() => setIsPrizeModalOpen(true)}
                  className="w-16 h-16 rounded-2xl bg-slate-950 border-2 border-amber-400/80 flex items-center justify-center overflow-hidden shrink-0 shadow-lg shadow-amber-500/20 cursor-pointer group hover:scale-105 transition"
                  title="Clique para alterar a foto do prêmio"
                >
                  {settings.prizeImage ? (
                    <img
                      src={settings.prizeImage}
                      alt={currentPrizeName}
                      className="w-full h-full object-cover group-hover:opacity-90"
                    />
                  ) : (
                    <div className="flex flex-col items-center justify-center text-amber-400 p-1">
                      <Gift className="w-7 h-7" />
                      <span className="text-[9px] font-bold text-amber-300 uppercase tracking-tighter">Sem Foto</span>
                    </div>
                  )}
                </div>

                <div className="min-w-0 space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] font-extrabold uppercase tracking-widest text-amber-400 bg-amber-950/80 border border-amber-500/40 px-2 py-0.5 rounded-full">
                      🎁 Prêmio em Disputa
                    </span>
                    {settings.prizeImage && (
                      <span className="text-[10px] font-semibold text-emerald-400 bg-emerald-950/80 border border-emerald-500/40 px-2 py-0.5 rounded-full flex items-center gap-1">
                        <CheckCircle2 className="w-3 h-3" />
                        <span>Foto Ativa</span>
                      </span>
                    )}
                  </div>

                  <h3 className="font-display font-black text-lg sm:text-xl text-white truncate drop-shadow-sm">
                    {currentPrizeName}
                  </h3>

                  <p className="text-xs text-slate-400 truncate">
                    {settings.prizeImage ? 'A imagem será exibida no telão, bilhete e certificado!' : 'Adicione uma foto do prêmio para animar os participantes!'}
                  </p>
                </div>
              </div>

              {/* Action Button to Open Prize Config */}
              <button
                type="button"
                onClick={() => setIsPrizeModalOpen(true)}
                className="w-full sm:w-auto min-h-[44px] px-4 py-2.5 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white font-bold text-xs flex items-center justify-center gap-2 shadow-md shadow-blue-600/30 transition shrink-0 active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400"
              >
                <Edit3 className="w-3.5 h-3.5 text-sky-200" />
                <span>Configurar Prêmio & Imagem</span>
              </button>
            </div>
          </div>

          {/* Visual Arena Card (Drum or Fortune Wheel) */}
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 sm:p-7 shadow-xl space-y-5 animate-card-enter neon-card">
            {/* Arena Mode Switcher */}
            <div className="flex flex-wrap items-center justify-between gap-2.5 pb-3 border-b border-slate-800">
              <div className="flex items-center p-1 bg-slate-950 border border-slate-800 rounded-xl text-xs font-semibold">
                <button
                  type="button"
                  onClick={() => onUpdateSettings({ drawMode: 'drum' })}
                  className={`min-h-[36px] flex items-center gap-1.5 px-3 py-1.5 rounded-lg transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400 ${
                    settings.drawMode === 'drum'
                      ? 'bg-blue-600 text-white shadow-md shadow-blue-600/30 font-bold'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  <Ticket className="w-3.5 h-3.5" />
                  <span>Bilhete Azul</span>
                </button>
                <button
                  type="button"
                  onClick={() => onUpdateSettings({ drawMode: 'wheel' })}
                  className={`min-h-[36px] flex items-center gap-1.5 px-3 py-1.5 rounded-lg transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400 ${
                    settings.drawMode === 'wheel'
                      ? 'bg-blue-600 text-white shadow-md shadow-blue-600/30 font-bold'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  <Disc className="w-3.5 h-3.5" />
                  <span>Roleta da Fortuna</span>
                </button>
              </div>

              {/* Quick Innovative Triggers */}
              <button
                type="button"
                onClick={onOpenBattleRoyale}
                className="min-h-[36px] flex items-center gap-1 px-3 py-1.5 text-xs font-bold text-sky-300 hover:text-white bg-blue-950/50 hover:bg-blue-900/60 border border-blue-800/60 rounded-xl transition shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400"
              >
                <Flame className="w-3.5 h-3.5 text-sky-400" />
                <span className="hidden sm:inline">Modo Battle Royale</span>
                <span className="sm:hidden">Eliminatória</span>
              </button>
            </div>

            {/* Display: Ticket or Wheel */}
            {settings.drawMode === 'wheel' ? (
              <FortuneWheel
                computed={computed}
                isDrawing={isDrawing}
                onSpinStart={onDraw}
                onSpinEnd={onWheelSpinEnd}
                latestWinner={latestWinner}
                onRequestSpin={onRequestWheelSpin || onDraw}
                spinSignal={wheelSpinSignal}
              />
            ) : (
              <TicketDisplay
                currentNumber={currentDisplayNumber}
                isDrawing={isDrawing}
                latestWinner={latestWinner}
                currentPrize={currentPrizeName}
                prizeImage={settings.prizeImage}
                eligibleCount={eligibleCount}
                totalCapacity={settings.total}
              />
            )}

            {/* Countdown Duration Quick Selector */}
            <div className="max-w-lg mx-auto flex flex-wrap items-center justify-between gap-2 p-2.5 rounded-xl bg-slate-950/70 border border-slate-800 text-xs">
              <div className="flex items-center gap-1.5 text-slate-300 font-semibold">
                <Clock className="w-3.5 h-3.5 text-sky-400" />
                <span>Contagem regressiva do sorteio:</span>
              </div>
              <div className="flex items-center gap-1 p-0.5 bg-slate-900 border border-slate-800 rounded-lg">
                {[
                  { label: '10s (Padrão)', val: 10 },
                  { label: '5s', val: 5 },
                  { label: '3s', val: 3 },
                  { label: 'Desativada', val: 0 },
                ].map((opt) => {
                  const active = (settings.countdownSeconds ?? 10) === opt.val;
                  return (
                    <button
                      key={opt.val}
                      type="button"
                      onClick={() => onUpdateSettings({ countdownSeconds: opt.val })}
                      className={`px-2.5 py-1 rounded-md text-[11px] font-bold transition focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-sky-400 ${
                        active
                          ? 'bg-blue-600 text-white shadow-sm shadow-blue-600/30'
                          : 'text-slate-400 hover:text-slate-200'
                      }`}
                    >
                      {opt.label}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Primary Draw Button (Only for Drum mode, Wheel has its own button) */}
            {settings.drawMode === 'drum' && (
              <div className="max-w-lg mx-auto space-y-4">
                <button
                  type="button"
                  disabled={!canDraw}
                  onClick={onDraw}
                  className={`w-full py-4 px-6 rounded-xl font-display font-black text-xl tracking-wide flex items-center justify-center gap-3 transition-all duration-200 active:scale-98 ${
                    canDraw
                      ? 'neon-btn-primary neon-draw-glow bg-gradient-to-r from-blue-600 via-sky-500 to-indigo-600 text-white shadow-lg shadow-blue-600/30 hover:shadow-blue-600/50 hover:brightness-105 cursor-pointer ring-1 ring-sky-300/30'
                      : 'bg-slate-800 text-slate-500 border border-slate-700/50 cursor-not-allowed opacity-60'
                  }`}
                >
                  {isDrawing ? (
                    <>
                      <Sparkles className="w-6 h-6 animate-spin text-white" />
                      <span>Sorteando Número...</span>
                    </>
                  ) : (
                    <div className="flex items-center gap-2.5">
                      <Play className="w-6 h-6 fill-white" />
                      <span>Sortear Agora</span>
                      {(settings.countdownSeconds ?? 10) > 0 && (
                        <span className="text-xs font-mono font-semibold bg-white/20 px-2 py-0.5 rounded-full text-white/90">
                          ⏱️ {(settings.countdownSeconds ?? 10)}s
                        </span>
                      )}
                    </div>
                  )}
                </button>
              </div>
            )}

            {/* Innovation Toolbar (Podium, Card, Monte Carlo) */}
            <div className="pt-2 border-t border-slate-800/80 flex flex-wrap items-center justify-between gap-2 text-xs">
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={onOpenPrizeQueue}
                  className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-slate-950 hover:bg-slate-800 border border-slate-800 text-slate-300 hover:text-white transition"
                >
                  <Award className="w-3.5 h-3.5 text-sky-400" />
                  <span>Pódio & Prêmios</span>
                </button>

                <button
                  type="button"
                  onClick={onOpenMonteCarlo}
                  className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-slate-950 hover:bg-slate-800 border border-slate-800 text-slate-300 hover:text-white transition"
                >
                  <BarChart2 className="w-3.5 h-3.5 text-emerald-400" />
                  <span>Auditoria (10k)</span>
                </button>
              </div>

              {latestWinner && (
                <div className="flex flex-wrap items-center gap-2">
                  {onOpenCelebration && (
                    <button
                      type="button"
                      onClick={() => onOpenCelebration(latestWinner)}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-gradient-to-r from-amber-500 via-yellow-400 to-amber-500 hover:brightness-105 text-slate-950 font-bold transition shadow-md shadow-amber-500/25 active:scale-95 text-xs"
                      title="Ver animação comemorativa do prêmio e ganhador na tela toda"
                      aria-label="Ver animação comemorativa do prêmio e ganhador na tela toda"
                    >
                      <Sparkles className="w-3.5 h-3.5 fill-slate-950" />
                      <span>Ver Celebração na Tela Toda</span>
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => onOpenVictoryCard(latestWinner)}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white font-bold transition shadow-md shadow-blue-600/30 text-xs active:scale-95"
                  >
                    <ImageIcon className="w-3.5 h-3.5" />
                    <span>Card de Vitória</span>
                  </button>
                  {onOpenAuditReport && (
                    <button
                      type="button"
                      onClick={onOpenAuditReport}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-sky-300 font-bold transition border border-slate-700 text-xs active:scale-95"
                      title="Exportar Laudo Oficial em PDF com Hash de Integridade"
                    >
                      <FileText className="w-3.5 h-3.5 text-sky-400" />
                      <span>Laudo PDF</span>
                    </button>
                  )}
                </div>
              )}
            </div>

            {/* Quick Config Toggles */}
            <div className="bg-slate-800/60 border border-slate-700/60 rounded-xl p-3.5 space-y-3 text-xs sm:text-sm">
              <label className="flex items-center gap-2.5 cursor-pointer text-slate-200 select-none">
                <input
                  type="checkbox"
                  checked={settings.exclude}
                  onChange={(e) => onUpdateSettings({ exclude: e.target.checked })}
                  className="w-4 h-4 rounded text-blue-600 focus:ring-blue-500 bg-slate-700 border-slate-600 accent-blue-600"
                />
                <span className="font-medium">Quem já ganhou não concorre de novo</span>
              </label>

              <div className="pt-2 border-t border-slate-700/60 flex flex-col sm:flex-row sm:items-center gap-2">
                <span className="text-slate-400 text-xs shrink-0">Prêmio desta rodada:</span>
                <div className="flex-1 flex gap-2">
                  <input
                    type="text"
                    value={settings.currentPrize || settings.prizeName || ''}
                    onChange={(e) =>
                      onUpdateSettings({
                        currentPrize: e.target.value,
                        prizeName: e.target.value,
                      })
                    }
                    placeholder="Ex.: Smartphone, Pix R$ 100, Fone..."
                    className="w-full bg-slate-900 border border-slate-700 rounded-md px-2.5 py-1 text-xs text-white placeholder:text-slate-600 focus:outline-none focus:border-blue-400"
                  />
                  <button
                    type="button"
                    onClick={() => setIsPrizeModalOpen(true)}
                    className="px-2.5 py-1 bg-slate-950 hover:bg-slate-800 border border-slate-700 rounded-md text-sky-400 text-xs font-bold transition whitespace-nowrap shrink-0 flex items-center gap-1"
                  >
                    <Upload className="w-3 h-3" />
                    <span>{settings.prizeImage ? 'Trocar Foto' : '+ Foto'}</span>
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* Winners History Podium */}
          {winners.length > 0 && (
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-lg space-y-4 animate-card-enter neon-card">
              <div className="flex items-center justify-between pb-3 border-b border-slate-800">
                <div className="flex items-center gap-2">
                  <span className="font-display font-bold text-base text-white">Ganhadores Anteriores</span>
                  <span className="text-xs font-bold bg-blue-500/20 text-sky-300 border border-blue-500/30 px-2 py-0.5 rounded-full tabular-nums">
                    {winners.length} {winners.length === 1 ? 'sorteado' : 'sorteados'}
                  </span>
                </div>

                <div className="flex items-center gap-2">
                  {onOpenAuditReport && (
                    <button
                      type="button"
                      onClick={onOpenAuditReport}
                      className="px-3 py-1.5 bg-gradient-to-r from-blue-600 to-sky-500 hover:from-blue-500 hover:to-sky-400 text-white font-bold text-xs rounded-xl shadow-md shadow-blue-600/20 transition flex items-center gap-1.5 active:scale-95"
                    >
                      <FileText className="w-3.5 h-3.5" />
                      <span>Exportar Laudo PDF</span>
                    </button>
                  )}

                  <button
                    type="button"
                    onClick={onClearWinners}
                    className="text-xs text-slate-400 hover:text-red-400 flex items-center gap-1 transition px-2 py-1.5 rounded-lg hover:bg-slate-800"
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                    <span>Limpar histórico</span>
                  </button>
                </div>
              </div>

              <div className="divide-y divide-slate-800/70 max-h-72 overflow-y-auto pr-1">
                {winners.map((winner, index) => (
                  <div key={winner.id} className="py-2.5 flex items-center justify-between gap-3">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="w-7 h-7 rounded-full bg-slate-800 border border-slate-700 flex items-center justify-center text-xs font-bold text-slate-300 shrink-0">
                        {index + 1}º
                      </div>

                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-sm text-white truncate">{winner.name}</span>
                          <span className="bg-blue-600 text-white font-mono font-bold text-xs px-1.5 py-0.2 rounded tabular-nums shrink-0">
                            #{winner.number}
                          </span>
                        </div>
                        <div className="flex items-center gap-2 text-xs text-slate-400 mt-0.5">
                          <span>{winner.prize || 'Sorteio padrão'}</span>
                          <span>·</span>
                          <span className="flex items-center gap-1 text-slate-500">
                            <Clock className="w-3 h-3" />
                            {formatDateTime(winner.drawnAt)}
                          </span>
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-1 shrink-0">
                      {onOpenCelebration && (
                        <button
                          type="button"
                          onClick={() => onOpenCelebration(winner)}
                          title={`Ver animação na tela toda de ${winner.name}`}
                          aria-label={`Ver animação na tela toda de ${winner.name}`}
                          className="min-w-[36px] min-h-[36px] p-2 flex items-center justify-center text-amber-400 hover:text-white hover:bg-slate-800 rounded-lg transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400"
                        >
                          <Sparkles className="w-4 h-4" />
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => onOpenVictoryCard(winner)}
                        title={`Gerar card de vitória para ${winner.name}`}
                        aria-label={`Gerar card de vitória para ${winner.name}`}
                        className="min-w-[36px] min-h-[36px] p-2 flex items-center justify-center text-sky-400 hover:text-white hover:bg-slate-800 rounded-lg transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400"
                      >
                        <ImageIcon className="w-4 h-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() => handleCopyWinner(winner)}
                        title={`Copiar resultado de ${winner.name}`}
                        aria-label={`Copiar resultado de ${winner.name}`}
                        className="min-w-[36px] min-h-[36px] p-2 flex items-center justify-center text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400"
                      >
                        {copiedId === winner.id ? (
                          <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                        ) : (
                          <Copy className="w-4 h-4" />
                        )}
                      </button>
                      <button
                        type="button"
                        onClick={() => onRemoveWinner(winner.id)}
                        title={`Remover sorteio de ${winner.name}`}
                        aria-label={`Remover sorteio de ${winner.name}`}
                        className="min-w-[36px] min-h-[36px] p-2 flex items-center justify-center text-slate-500 hover:text-red-400 hover:bg-slate-800 rounded-lg transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-400"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
