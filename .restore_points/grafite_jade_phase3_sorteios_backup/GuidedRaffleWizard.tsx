import React, { useState } from 'react';
import {
  Radio,
  MessageSquare,
  Ticket,
  Settings,
  Users,
  Play,
  Trophy,
  CheckCircle2,
  ArrowRight,
  ArrowLeft,
  Lock,
  Crown,
  ChevronDown,
  ChevronUp,
  HelpCircle,
  UserPlus,
  FileSpreadsheet,
  Copy,
  Check,
  Award,
  FileText,
  Sparkles,
} from 'lucide-react';
import {
  Participant,
  RaffleSettings,
  Winner,
  ComputedRaffle,
  ProPlanEntitlement,
} from '../types';
import { parseRawTextList } from '../utils/raffle';

export type GuidedRaffleModality = 'traditional' | 'tiktok_comments' | 'tiktok_live_pro';

interface GuidedRaffleWizardProps {
  settings: RaffleSettings;
  participants: Participant[];
  winners: Winner[];
  computed: ComputedRaffle;
  entitlement: ProPlanEntitlement;
  isDrawing: boolean;
  currentDisplayNumber: number | string;
  onUpdateSettings: (patch: Partial<RaffleSettings>) => void;
  onAddParticipant: (name: string, coins: number) => void;
  onBulkAdd: (list: { name: string; coins: number }[], replace: boolean) => void;
  onTriggerDraw: (mode: 'drum' | 'wheel') => void;
  onOpenVictoryCard: (winner: Winner) => void;
  onOpenAuditReport: () => void;
  onOpenLivePro: (subTab?: 'feed' | 'motor1' | 'motor2' | 'audit' | 'monitor') => void;
  onOpenCommentsSorter: () => void;
  onOpenSubscription: () => void;
  onCloseWizard?: () => void;
}

const WIZARD_STEPS = [
  { number: 1, title: 'Escolher Modalidade', shortLabel: 'Modalidade' },
  { number: 2, title: 'Configurar Regras', shortLabel: 'Regras' },
  { number: 3, title: 'Carregar ou Conectar', shortLabel: 'Entrada' },
  { number: 4, title: 'Conferir Participantes', shortLabel: 'Conferir' },
  { number: 5, title: 'Iniciar o Sorteio', shortLabel: 'Sortear' },
  { number: 6, title: 'Resultado & Salvar', shortLabel: 'Resultado' },
];

export const GuidedRaffleWizard: React.FC<GuidedRaffleWizardProps> = ({
  settings,
  participants,
  winners,
  computed,
  entitlement,
  isDrawing,
  currentDisplayNumber,
  onUpdateSettings,
  onAddParticipant,
  onBulkAdd,
  onTriggerDraw,
  onOpenVictoryCard,
  onOpenAuditReport,
  onOpenLivePro,
  onOpenCommentsSorter,
  onOpenSubscription,
  onCloseWizard,
}) => {
  const [step, setStep] = useState<number>(1);
  const [modality, setModality] = useState<GuidedRaffleModality>('traditional');
  const [showAdvancedRules, setShowAdvancedRules] = useState(false);

  // Step 3 Quick Input State
  const [quickName, setQuickName] = useState('');
  const [quickCoins, setQuickCoins] = useState(String(settings.rate || 100));
  const [bulkListText, setBulkListText] = useState('');
  const [stepFeedback, setStepFeedback] = useState<string | null>(null);

  // Step 4 Search State
  const [searchParticipant, setSearchParticipant] = useState('');
  const [copiedWinnerId, setCopiedWinnerId] = useState<string | null>(null);

  const isPro = entitlement.active && entitlement.tier === 'PRO';
  const latestWinner = winners.length > 0 ? winners[0] : null;
  const eligibleTicketsCount = computed.eligibleTickets.length;
  const eligibleParticipantsCount = computed.allocations.filter((a) => a.assignedTickets > 0).length;

  const notify = (msg: string) => {
    setStepFeedback(msg);
    setTimeout(() => setStepFeedback(null), 3500);
  };

  const handleAddSingleQuick = (e: React.FormEvent) => {
    e.preventDefault();
    const clean = quickName.trim();
    const coinsNum = Math.max(1, parseInt(quickCoins, 10) || settings.rate || 100);
    if (!clean) {
      notify('Digite o nome ou @usuário do participante.');
      return;
    }
    onAddParticipant(clean, coinsNum);
    setQuickName('');
    notify(`${clean} adicionado(a) com ${coinsNum} moedas!`);
  };

  const handlePasteListQuick = () => {
    if (!bulkListText.trim()) {
      notify('Cole os nomes ou comentários antes de processar.');
      return;
    }
    const parsed = parseRawTextList(bulkListText);
    if (parsed.length > 0) {
      onBulkAdd(parsed, false);
      setBulkListText('');
      notify(`${parsed.length} participantes carregados com sucesso!`);
      return;
    }
    // If user pasted plain names without numbers (e.g. comments/names 1 per line), give each 1 ticket worth of coins
    const lines = bulkListText
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter(Boolean);
    if (lines.length > 0) {
      const unitCoins = Math.max(1, settings.rate || 100);
      onBulkAdd(
        lines.map((line) => ({ name: line.replace(/^@/, '@'), coins: unitCoins })),
        false
      );
      setBulkListText('');
      notify(`${lines.length} nomes carregados (1 bilhete para cada)!`);
    }
  };

  const filteredAllocations = computed.allocations.filter((a) =>
    a.participant.name.toLowerCase().includes(searchParticipant.toLowerCase())
  );

  const handleCopyResult = (winner: Winner) => {
    const text = `🏆 RESULTADO GIO DA SORTE PRO: Ganhador(a) ${winner.name} — Bilhete #${winner.number} | Prêmio: ${
      winner.prize || settings.prizeName || 'Prêmio Oficial'
    }`;
    navigator.clipboard.writeText(text).then(() => {
      setCopiedWinnerId(winner.id);
      setTimeout(() => setCopiedWinnerId(null), 2000);
    });
  };

  return (
    <div className="rounded-2xl bg-gradient-to-b from-[#0A1128] via-[#0F172A] to-[#050814] border border-[#E11D48]/45 shadow-2xl overflow-hidden animate-fade-in">
      {/* Header & Progress Bar */}
      <div className="p-5 sm:p-6 bg-[#050814]/90 border-b border-blue-900/60 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <div className="flex items-center gap-2 text-xs text-[#FDA4AF] font-semibold">
              <Sparkles className="w-3.5 h-3.5 text-[#F43F5E]" />
              <span>Assistente Guiado de Sorteio</span>
              <span aria-hidden="true">·</span>
              <span>Etapa {step} de 6</span>
            </div>
            <h2 className="text-lg sm:text-xl font-display font-black text-white mt-0.5">
              ETAPA {step} — {WIZARD_STEPS[step - 1].title}
            </h2>
          </div>

          {onCloseWizard && (
            <button
              type="button"
              onClick={onCloseWizard}
              className="self-start sm:self-auto px-3 py-1.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-slate-300 border border-slate-700 text-xs font-semibold transition"
            >
              Modo Completo (Avançado)
            </button>
          )}
        </div>

        {/* Clickable Stepper */}
        <div className="grid grid-cols-3 sm:grid-cols-6 gap-2" role="navigation" aria-label="Etapas do sorteio">
          {WIZARD_STEPS.map((s) => {
            const isActive = s.number === step;
            const isCompleted = s.number < step;
            return (
              <button
                key={s.number}
                type="button"
                onClick={() => setStep(s.number)}
                className={`min-h-[42px] px-2.5 py-2 rounded-xl text-left border transition flex items-center gap-2 ${
                  isActive
                    ? 'bg-gradient-to-r from-[#1E3A8A] to-[#E11D48]/35 border-[#E11D48] text-white font-bold shadow-sm'
                    : isCompleted
                    ? 'bg-emerald-950/40 border-emerald-500/40 text-emerald-300 font-semibold hover:bg-emerald-950/60'
                    : 'bg-[#0A1128]/70 border-blue-900/40 text-slate-400 hover:text-slate-200'
                }`}
              >
                <span
                  className={`w-5 h-5 rounded-full text-[11px] font-mono font-bold flex items-center justify-center shrink-0 ${
                    isActive
                      ? 'bg-[#E11D48] text-white'
                      : isCompleted
                      ? 'bg-emerald-500 text-slate-950'
                      : 'bg-slate-800 text-slate-400'
                  }`}
                >
                  {isCompleted ? '✓' : s.number}
                </span>
                <span className="text-[11px] truncate">{s.shortLabel}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Step Content Area */}
      <div className="p-5 sm:p-7 space-y-6">
        {stepFeedback && (
          <div className="p-3 rounded-xl bg-emerald-950/80 border border-emerald-500/40 text-emerald-200 text-xs font-semibold flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
            <span>{stepFeedback}</span>
          </div>
        )}

        {/* ETAPA 1 — ESCOLHER MODALIDADE */}
        {step === 1 && (
          <div className="space-y-5">
            <p className="text-sm text-slate-300">
              Escolha como você deseja realizar o seu sorteio hoje. Você pode voltar e alterar essa opção a qualquer momento.
            </p>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {/* Option 1: Traditional Coins / Drum / Wheel */}
              <button
                type="button"
                onClick={() => setModality('traditional')}
                className={`p-5 rounded-2xl border text-left transition flex flex-col justify-between gap-4 ${
                  modality === 'traditional'
                    ? 'bg-[#1E3A8A]/40 border-[#E11D48] ring-1 ring-[#E11D48]/60 shadow-lg'
                    : 'bg-[#0A1128]/70 border-blue-900/50 hover:border-blue-700'
                }`}
              >
                <div className="space-y-2.5">
                  <div className="flex items-center justify-between">
                    <div className="w-10 h-10 rounded-xl bg-sky-500/15 border border-sky-400/30 flex items-center justify-center text-sky-300">
                      <Ticket className="w-5 h-5" />
                    </div>
                    <span className="text-[11px] font-semibold text-emerald-400">Gratuito · Livre</span>
                  </div>
                  <h3 className="text-base font-display font-bold text-white">
                    1. Sorteio por Moedas ou Nomes (Tambor / Roleta)
                  </h3>
                  <p className="text-xs text-slate-300 leading-relaxed">
                    Perfeito para listas manuais, planilhas Excel/CSV ou apoiadores onde você define quantas moedas valem 1 bilhete.
                  </p>
                </div>
                <div className="text-xs font-bold text-[#FDA4AF] flex items-center gap-1">
                  <span>{modality === 'traditional' ? 'Selecionado ✓' : 'Selecionar esta modalidade'}</span>
                </div>
              </button>

              {/* Option 2: TikTok Comments Sorter */}
              <button
                type="button"
                onClick={() => setModality('tiktok_comments')}
                className={`p-5 rounded-2xl border text-left transition flex flex-col justify-between gap-4 ${
                  modality === 'tiktok_comments'
                    ? 'bg-[#1E3A8A]/40 border-[#E11D48] ring-1 ring-[#E11D48]/60 shadow-lg'
                    : 'bg-[#0A1128]/70 border-blue-900/50 hover:border-blue-700'
                }`}
              >
                <div className="space-y-2.5">
                  <div className="flex items-center justify-between">
                    <div className="w-10 h-10 rounded-xl bg-cyan-500/15 border border-cyan-400/30 flex items-center justify-center text-cyan-300">
                      <MessageSquare className="w-5 h-5" />
                    </div>
                    <span className="text-[11px] font-semibold text-emerald-400">Gratuito · Livre</span>
                  </div>
                  <h3 className="text-base font-display font-bold text-white">
                    2. Sorteador de Comentários do TikTok
                  </h3>
                  <p className="text-xs text-slate-300 leading-relaxed">
                    Cole a lista de comentários ou @arrobas do seu vídeo ou transmissão e sorteie rapidamente com filtro de palavras-chave.
                  </p>
                </div>
                <div className="text-xs font-bold text-[#FDA4AF] flex items-center gap-1">
                  <span>{modality === 'tiktok_comments' ? 'Selecionado ✓' : 'Selecionar esta modalidade'}</span>
                </div>
              </button>

              {/* Option 3: TikTok LIVE PRO (Automatic Gifts) */}
              <button
                type="button"
                onClick={() => setModality('tiktok_live_pro')}
                className={`p-5 rounded-2xl border text-left transition flex flex-col justify-between gap-4 ${
                  modality === 'tiktok_live_pro'
                    ? 'bg-gradient-to-b from-[#1E3A8A]/60 to-[#0A1128] border-[#E11D48] ring-1 ring-[#E11D48] shadow-lg'
                    : 'bg-[#0A1128]/70 border-[#E11D48]/35 hover:border-[#F43F5E]/80'
                }`}
              >
                <div className="space-y-2.5">
                  <div className="flex items-center justify-between">
                    <div className="w-10 h-10 rounded-xl bg-[#E11D48]/20 border border-[#E11D48]/50 flex items-center justify-center text-[#FDA4AF]">
                      <Radio className="w-5 h-5" />
                    </div>
                    <span className="text-[11px] font-bold text-[#FDA4AF] flex items-center gap-1">
                      {isPro ? <Crown className="w-3.5 h-3.5 text-[#F43F5E]" /> : <Lock className="w-3.5 h-3.5 text-[#F43F5E]" />}
                      <span>Exclusivo PRO</span>
                    </span>
                  </div>
                  <h3 className="text-base font-display font-bold text-white">
                    3. Sorteio por Presentes da LIVE (Automático)
                  </h3>
                  <p className="text-xs text-slate-300 leading-relaxed">
                    Conecta na sua TikTok LIVE em tempo real, soma as moedas dos presentes recebidos e emite os bilhetes sozinho.
                  </p>
                </div>
                <div className="text-xs font-bold text-[#FDA4AF] flex items-center gap-1">
                  <span>{modality === 'tiktok_live_pro' ? 'Selecionado ✓' : 'Selecionar esta modalidade'}</span>
                </div>
              </button>
            </div>
          </div>
        )}

        {/* ETAPA 2 — CONFIGURAR AS REGRAS */}
        {step === 2 && (
          <div className="space-y-5">
            <p className="text-sm text-slate-300">
              Defina o prêmio e a regra principal. Já preenchemos valores padrão inteligentes para você não perder tempo.
            </p>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-bold text-slate-200 mb-1.5">
                  Qual é o prêmio deste sorteio?
                </label>
                <input
                  type="text"
                  value={settings.prizeName || settings.currentPrize || ''}
                  onChange={(e) =>
                    onUpdateSettings({ prizeName: e.target.value, currentPrize: e.target.value })
                  }
                  placeholder="Ex: PIX R$ 500,00 ou iPhone 16"
                  className="w-full px-3.5 py-2.5 rounded-xl bg-[#050814] border border-blue-900/70 text-sm text-white focus:border-[#E11D48] outline-none"
                />
                <span className="text-[11px] text-slate-400 mt-1 block">
                  Aparecerá no telão, no cartão do ganhador e no certificado PDF.
                </span>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-200 mb-1.5">
                  Quantas moedas valem 1 bilhete?
                </label>
                <input
                  type="number"
                  min={1}
                  value={settings.rate || 100}
                  onChange={(e) =>
                    onUpdateSettings({ rate: Math.max(1, parseInt(e.target.value, 10) || 1) })
                  }
                  className="w-full px-3.5 py-2.5 rounded-xl bg-[#050814] border border-blue-900/70 text-sm text-[#FDA4AF] font-mono font-bold focus:border-[#E11D48] outline-none"
                />
                <span className="text-[11px] text-slate-400 mt-1 block">
                  Dica: Se quiser 1 bilhete por pessoa, deixe 100 e adicione 100 moedas para cada nome.
                </span>
              </div>
            </div>

            {/* Progressive Disclosure: Advanced Options */}
            <div className="border border-blue-900/50 rounded-xl bg-[#050814]/60 overflow-hidden">
              <button
                type="button"
                onClick={() => setShowAdvancedRules(!showAdvancedRules)}
                className="w-full px-4 py-3 flex items-center justify-between text-xs font-bold text-slate-300 hover:text-white transition"
              >
                <span className="flex items-center gap-2">
                  <Settings className="w-4 h-4 text-[#F43F5E]" />
                  <span>Opções Avançadas (Opcional — Contagem Regressiva, Limite de Bilhetes e Repetição)</span>
                </span>
                {showAdvancedRules ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
              </button>

              {showAdvancedRules && (
                <div className="p-4 pt-2 border-t border-blue-900/40 grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div>
                    <label className="block text-xs font-semibold text-slate-300 mb-1">
                      Capacidade Máxima de Bilhetes
                    </label>
                    <input
                      type="number"
                      min={10}
                      max={100000}
                      value={settings.total || 1000}
                      onChange={(e) =>
                        onUpdateSettings({ total: Math.max(10, parseInt(e.target.value, 10) || 1000) })
                      }
                      className="w-full px-3 py-2 rounded-lg bg-[#0A1128] border border-slate-700 text-xs text-white font-mono"
                    />
                    <span className="text-[10px] text-slate-400">Padrão recomendado: 1000 bilhetes.</span>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-300 mb-1">
                      Suspense antes de sortear (segundos)
                    </label>
                    <input
                      type="number"
                      min={0}
                      max={30}
                      value={settings.countdownSeconds ?? 10}
                      onChange={(e) =>
                        onUpdateSettings({
                          countdownSeconds: Math.max(0, Math.min(30, parseInt(e.target.value, 10) || 0)),
                        })
                      }
                      className="w-full px-3 py-2 rounded-lg bg-[#0A1128] border border-slate-700 text-xs text-white font-mono"
                    />
                    <span className="text-[10px] text-slate-400">Use 0 para sortear sem contagem regressiva.</span>
                  </div>

                  <div className="flex flex-col justify-center">
                    <label className="flex items-center gap-2 text-xs font-semibold text-slate-200 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={!settings.exclude}
                        onChange={(e) => onUpdateSettings({ exclude: !e.target.checked })}
                        className="rounded border-slate-600 text-[#E11D48]"
                      />
                      <span>Permitir que a mesma pessoa ganhe mais de 1 vez</span>
                    </label>
                    <span className="text-[10px] text-slate-400 mt-1">
                      Se desmarcado, quem já ganhou não repete no próximo prêmio.
                    </span>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ETAPA 3 — CONECTAR A LIVE OU CARREGAR COMENTÁRIOS / PARTICIPANTES */}
        {step === 3 && (
          <div className="space-y-5">
            {modality === 'tiktok_live_pro' ? (
              <div className="p-6 rounded-2xl bg-[#050814] border border-[#E11D48]/45 space-y-4">
                <div className="flex items-start gap-3.5">
                  <div className="w-11 h-11 rounded-xl bg-[#E11D48]/20 border border-[#E11D48]/50 flex items-center justify-center text-[#FDA4AF] shrink-0">
                    <Radio className="w-5 h-5" />
                  </div>
                  <div className="space-y-1">
                    <h3 className="text-base font-display font-bold text-white">
                      Conectar Transmissão no TikTok LIVE PRO
                    </h3>
                    <p className="text-xs text-slate-300 leading-relaxed">
                      No modo LIVE PRO, os participantes e bilhetes são gerados automaticamente conforme os presentes caem na sua transmissão.
                    </p>
                  </div>
                </div>

                {isPro ? (
                  <div className="flex flex-wrap items-center gap-3 pt-2">
                    <button
                      type="button"
                      onClick={() => onOpenLivePro('feed')}
                      className="min-h-[44px] px-5 py-2.5 rounded-xl bg-gradient-to-r from-[#E11D48] via-[#F43F5E] to-[#BE123C] text-white font-black text-xs flex items-center gap-2 shadow-lg shadow-[#E11D48]/30 hover:brightness-110 transition"
                    >
                      <Radio className="w-4 h-4" />
                      <span>Abrir Painel de Conexão TikTok LIVE PRO</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => onOpenLivePro('motor1')}
                      className="min-h-[44px] px-4 py-2.5 rounded-xl bg-[#1E3A8A]/60 hover:bg-[#1E3A8A] text-[#FDA4AF] border border-[#E11D48]/45 font-bold text-xs transition"
                    >
                      Ir Direto para Sorteio da LIVE (Motor 1)
                    </button>
                  </div>
                ) : (
                  <div className="p-4 rounded-xl bg-rose-950/40 border border-rose-500/40 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div className="flex items-center gap-2.5 text-xs text-rose-200">
                      <Lock className="w-4 h-4 text-[#F43F5E] shrink-0" />
                      <span>
                        A captura automática de presentes da LIVE é exclusiva do plano PRO. Ative o plano PRO ou escolha a modalidade gratuita.
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={onOpenSubscription}
                      className="min-h-[38px] px-4 py-2 rounded-lg bg-[#E11D48] text-white font-bold text-xs shrink-0"
                    >
                      Ver Plano PRO
                    </button>
                  </div>
                )}
              </div>
            ) : (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
                {/* Individual Add */}
                <form
                  onSubmit={handleAddSingleQuick}
                  className="p-5 rounded-2xl bg-[#050814]/90 border border-blue-900/60 space-y-4"
                >
                  <div className="flex items-center gap-2 text-sm font-bold text-white">
                    <UserPlus className="w-4 h-4 text-sky-400" />
                    <span>Adicionar Participante Um por Um</span>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <div className="sm:col-span-2">
                      <label className="block text-[11px] font-semibold text-slate-300 mb-1">
                        Nome ou @usuário
                      </label>
                      <input
                        type="text"
                        value={quickName}
                        onChange={(e) => setQuickName(e.target.value)}
                        placeholder="Ex: @maria_silva"
                        className="w-full px-3 py-2 rounded-xl bg-[#0A1128] border border-slate-700 text-xs text-white"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-semibold text-slate-300 mb-1">
                        Moedas
                      </label>
                      <input
                        type="number"
                        min={1}
                        value={quickCoins}
                        onChange={(e) => setQuickCoins(e.target.value)}
                        className="w-full px-3 py-2 rounded-xl bg-[#0A1128] border border-slate-700 text-xs text-[#FDA4AF] font-mono font-bold"
                      />
                    </div>
                  </div>
                  <button
                    type="submit"
                    className="w-full min-h-[42px] py-2.5 rounded-xl bg-sky-600 hover:bg-sky-500 text-white font-bold text-xs transition"
                  >
                    + Adicionar à Lista Agora
                  </button>
                </form>

                {/* Bulk / Comments Paste */}
                <div className="p-5 rounded-2xl bg-[#050814]/90 border border-blue-900/60 space-y-3">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 text-sm font-bold text-white">
                      <FileSpreadsheet className="w-4 h-4 text-[#F43F5E]" />
                      <span>Colar Lista de Nomes ou Comentários</span>
                    </div>
                    {modality === 'tiktok_comments' && (
                      <button
                        type="button"
                        onClick={onOpenCommentsSorter}
                        className="text-[11px] font-semibold text-sky-400 hover:underline"
                      >
                        Abrir Sorteador Completo
                      </button>
                    )}
                  </div>
                  <textarea
                    rows={3}
                    value={bulkListText}
                    onChange={(e) => setBulkListText(e.target.value)}
                    placeholder={'Cole 1 por linha. Exemplo:\n@joao_oficial 200\n@ana_carolina 100\nou apenas os nomes/arrobas'}
                    className="w-full p-3 rounded-xl bg-[#0A1128] border border-slate-700 text-xs text-white font-mono"
                  />
                  <button
                    type="button"
                    onClick={handlePasteListQuick}
                    className="w-full min-h-[42px] py-2.5 rounded-xl bg-[#1E3A8A] hover:bg-blue-800 text-[#FDA4AF] border border-[#E11D48]/45 font-bold text-xs transition"
                  >
                    Carregar Lista de Participantes
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ETAPA 4 — CONFERIR PARTICIPANTES */}
        {step === 4 && (
          <div className="space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-[#050814]/90 p-4 rounded-xl border border-blue-900/50">
              <div className="flex flex-wrap items-center gap-4 text-xs">
                <div>
                  <span className="text-slate-400">Participantes Cadastrados:</span>{' '}
                  <strong className="text-white font-mono text-sm">{participants.length}</strong>
                </div>
                <span aria-hidden="true" className="text-slate-700">·</span>
                <div>
                  <span className="text-slate-400">Com Direito a Bilhetes:</span>{' '}
                  <strong className="text-emerald-400 font-mono text-sm">{eligibleParticipantsCount}</strong>
                </div>
                <span aria-hidden="true" className="text-slate-700">·</span>
                <div>
                  <span className="text-slate-400">Total de Bilhetes Emitidos:</span>{' '}
                  <strong className="text-[#FDA4AF] font-mono text-sm">{eligibleTicketsCount}</strong>
                </div>
              </div>

              <input
                type="search"
                value={searchParticipant}
                onChange={(e) => setSearchParticipant(e.target.value)}
                placeholder="Pesquisar participante..."
                className="px-3 py-1.5 rounded-lg bg-[#0A1128] border border-slate-700 text-xs text-white"
              />
            </div>

            {filteredAllocations.length === 0 ? (
              <div className="p-8 rounded-xl bg-[#050814]/60 border border-slate-800 text-center space-y-2">
                <Users className="w-7 h-7 text-slate-500 mx-auto" />
                <p className="text-sm font-bold text-white">Nenhum participante encontrado</p>
                <p className="text-xs text-slate-400">
                  Volte para a Etapa 3 para adicionar participantes ou cole uma lista.
                </p>
              </div>
            ) : (
              <div className="max-h-64 overflow-y-auto rounded-xl border border-blue-900/50 divide-y divide-slate-800/80 bg-[#050814]/80">
                {filteredAllocations.slice(0, 50).map((alloc) => (
                  <div
                    key={alloc.participant.id}
                    className="px-4 py-2.5 flex items-center justify-between gap-3 text-xs"
                  >
                    <div className="font-bold text-white truncate">{alloc.participant.name}</div>
                    <div className="flex items-center gap-4 shrink-0 font-mono">
                      <span className="text-slate-300">{alloc.participant.coins} moedas</span>
                      <span className="text-[#FDA4AF] font-bold">{alloc.assignedTickets} bilhete(s)</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ETAPA 5 — INICIAR O SORTEIO */}
        {step === 5 && (
          <div className="p-6 sm:p-8 rounded-2xl bg-[#050814]/90 border border-[#E11D48]/45 text-center space-y-5">
            <div className="inline-flex items-center justify-center w-20 h-20 rounded-2xl bg-gradient-to-tr from-[#1E3A8A] to-[#E11D48] text-white font-display font-black text-3xl shadow-xl">
              {currentDisplayNumber}
            </div>

            <div className="space-y-1 max-w-md mx-auto">
              <h3 className="text-xl font-display font-black text-white">
                Tudo pronto para sortear: <span className="text-[#FDA4AF]">{settings.prizeName || 'Prêmio Principal'}</span>
              </h3>
              <p className="text-xs text-slate-300">
                {eligibleTicketsCount} bilhetes concorrendo entre {eligibleParticipantsCount} participantes elegíveis.
              </p>
            </div>

            <div className="flex flex-wrap items-center justify-center gap-3 pt-2">
              <button
                type="button"
                disabled={eligibleTicketsCount === 0 || isDrawing}
                onClick={() => {
                  onTriggerDraw('drum');
                  setTimeout(() => setStep(6), 1200);
                }}
                className="min-h-[48px] px-7 py-3 rounded-xl bg-gradient-to-r from-[#E11D48] via-[#F43F5E] to-[#BE123C] text-white font-black text-sm flex items-center gap-2 shadow-xl shadow-[#E11D48]/30 hover:brightness-110 transition disabled:opacity-40"
              >
                <Play className="w-4 h-4 fill-current" />
                <span>{isDrawing ? 'Sorteando...' : 'SORTEAR AGORA (TAMBOR)'}</span>
              </button>

              <button
                type="button"
                disabled={eligibleTicketsCount === 0 || isDrawing}
                onClick={() => {
                  onUpdateSettings({ drawMode: 'wheel' });
                  onTriggerDraw('wheel');
                  setTimeout(() => setStep(6), 1200);
                }}
                className="min-h-[48px] px-5 py-3 rounded-xl bg-[#1E3A8A] hover:bg-blue-800 text-white border border-sky-400/30 font-bold text-xs sm:text-sm flex items-center gap-2 transition disabled:opacity-40"
              >
                <Sparkles className="w-4 h-4 text-[#FDA4AF]" />
                <span>Girar Roleta da Fortuna</span>
              </button>
            </div>
          </div>
        )}

        {/* ETAPA 6 — VISUALIZAR E SALVAR O RESULTADO */}
        {step === 6 && (
          <div className="space-y-5">
            {latestWinner ? (
              <div className="p-6 rounded-2xl bg-gradient-to-r from-[#050814] via-[#0A1128] to-[#1E3A8A]/40 border border-[#E11D48] space-y-5">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                  <div className="flex items-center gap-4">
                    <div className="w-14 h-14 rounded-2xl bg-gradient-to-tr from-[#E11D48] to-[#F43F5E] text-white flex items-center justify-center font-display font-black text-xl shadow-lg">
                      #{latestWinner.number}
                    </div>
                    <div>
                      <span className="text-xs font-bold text-[#FDA4AF]">
                        Último Ganhador Oficial · Salvo Automaticamente
                      </span>
                      <h3 className="text-xl sm:text-2xl font-display font-black text-white">
                        {latestWinner.name}
                      </h3>
                      <p className="text-xs text-slate-300">
                        Prêmio: <strong>{latestWinner.prize || settings.prizeName || 'Prêmio Principal'}</strong>
                      </p>
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-2.5">
                    <button
                      type="button"
                      onClick={() => onOpenVictoryCard(latestWinner)}
                      className="min-h-[42px] px-4 py-2 rounded-xl bg-gradient-to-r from-[#E11D48] to-[#F43F5E] text-white font-black text-xs flex items-center gap-1.5"
                    >
                      <Award className="w-4 h-4" />
                      <span>Gerar Cartão do Ganhador</span>
                    </button>
                    <button
                      type="button"
                      onClick={onOpenAuditReport}
                      className="min-h-[42px] px-4 py-2 rounded-xl bg-[#1E3A8A] text-white border border-sky-400/30 font-bold text-xs flex items-center gap-1.5"
                    >
                      <FileText className="w-4 h-4 text-[#FDA4AF]" />
                      <span>Baixar Certificado PDF</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => handleCopyResult(latestWinner)}
                      className="min-h-[42px] px-3.5 py-2 rounded-xl bg-slate-900 text-slate-200 border border-slate-700 font-semibold text-xs flex items-center gap-1.5"
                    >
                      {copiedWinnerId === latestWinner.id ? (
                        <Check className="w-3.5 h-3.5 text-emerald-400" />
                      ) : (
                        <Copy className="w-3.5 h-3.5" />
                      )}
                      <span>{copiedWinnerId === latestWinner.id ? 'Copiado!' : 'Copiar Texto'}</span>
                    </button>
                  </div>
                </div>
              </div>
            ) : (
              <div className="p-8 rounded-2xl bg-[#050814]/80 border border-slate-800 text-center space-y-3">
                <Trophy className="w-8 h-8 text-[#F43F5E] mx-auto" />
                <h3 className="text-base font-bold text-white">Nenhum sorteio realizado ainda nesta sessão</h3>
                <p className="text-xs text-slate-400">
                  Volte para a Etapa 5 e clique em &ldquo;Sortear Agora&rdquo; para revelar o ganhador.
                </p>
              </div>
            )}
          </div>
        )}

        {/* Bottom Wizard Navigation Controls */}
        <div className="pt-4 border-t border-blue-900/50 flex items-center justify-between gap-3">
          <button
            type="button"
            disabled={step === 1}
            onClick={() => setStep((s) => Math.max(1, s - 1))}
            className="min-h-[42px] px-4 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 disabled:opacity-40 text-slate-200 border border-slate-700 text-xs font-semibold flex items-center gap-1.5 transition"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>Voltar Etapa Anterior</span>
          </button>

          {step < 6 ? (
            <button
              type="button"
              onClick={() => setStep((s) => Math.min(6, s + 1))}
              className="min-h-[42px] px-5 py-2 rounded-xl bg-gradient-to-r from-[#E11D48] to-[#BE123C] text-white font-black text-xs flex items-center gap-1.5 shadow-md shadow-[#E11D48]/30 hover:brightness-110 transition"
            >
              <span>Avançar para Etapa {step + 1}</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          ) : (
            <button
              type="button"
              onClick={() => setStep(1)}
              className="min-h-[42px] px-5 py-2 rounded-xl bg-[#1E3A8A] hover:bg-blue-800 text-[#FDA4AF] border border-[#E11D48]/45 font-bold text-xs transition"
            >
              Iniciar Novo Ciclo Guiado
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
