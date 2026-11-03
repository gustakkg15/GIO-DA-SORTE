import React, { useState } from 'react';
import {
  Sparkles,
  Trophy,
  Users,
  Settings,
  Play,
  CheckCircle2,
  ArrowRight,
  ArrowLeft,
  Radio,
  MessageSquare,
  Ticket,
  FileText,
  Award,
  Copy,
  Check,
  UserPlus,
  FileSpreadsheet,
  ChevronDown,
  ChevronUp,
  Lock,
  Crown,
} from 'lucide-react';
import {
  ComputedRaffle,
  Participant,
  ProPlanEntitlement,
  RaffleSettings,
  Winner,
} from '../types';
import { parseRawTextList } from '../utils/raffle';

export type WizardModality = 'traditional' | 'tiktok_comments' | 'tiktok_live_pro';

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
  onBulkAdd: (items: { name: string; coins: number }[], replace: boolean) => void;
  onTriggerDraw: (mode?: 'drum' | 'wheel') => void;
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
  { number: 3, title: 'Carregar Participantes', shortLabel: 'Entrada' },
  { number: 4, title: 'Conferir Lista', shortLabel: 'Participantes' },
  { number: 5, title: 'Realizar Sorteio', shortLabel: 'Sortear' },
  { number: 6, title: 'Resultado e Certificado', shortLabel: 'Resultado' },
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
  const [modality, setModality] = useState<WizardModality>('traditional');
  const [showAdvancedRules, setShowAdvancedRules] = useState(false);

  // Step 3 quick inputs — initialized from real persisted settings.rate
  const [quickName, setQuickName] = useState('');
  const [quickCoins, setQuickCoins] = useState(String(settings.rate || 100));
  const [bulkListText, setBulkListText] = useState('');
  const [stepFeedback, setStepFeedback] = useState<string | null>(null);

  // Step 4 search
  const [searchParticipant, setSearchParticipant] = useState('');
  const [copiedWinnerId, setCopiedWinnerId] = useState<string | null>(null);

  const isPro = entitlement.active && entitlement.tier === 'PRO';
  const eligibleTicketsCount = computed.eligibleTickets.length;
  const eligibleParticipantsCount = computed.allocations.filter((a) => a.assignedTickets > 0).length;
  const latestWinner = winners.length > 0 ? winners[0] : null;

  const notifyFeedback = (msg: string) => {
    setStepFeedback(msg);
    setTimeout(() => setStepFeedback(null), 3500);
  };

  const handleAddSingleQuick = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = quickName.trim();
    if (!trimmed) return;
    const coins = Math.max(1, parseInt(quickCoins, 10) || settings.rate || 100);
    onAddParticipant(trimmed, coins);
    setQuickName('');
    notifyFeedback(`Participante "${trimmed}" adicionado com ${coins} moedas.`);
  };

  const handlePasteListQuick = () => {
    if (!bulkListText.trim()) return;
    const lines = bulkListText
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter(Boolean);

    const parsed = parseRawTextList(bulkListText);
    if (parsed.length > 0) {
      onBulkAdd(parsed, false);
      setBulkListText('');
      notifyFeedback(`${parsed.length} participantes carregados na lista!`);
      return;
    }

    // Fallback: 1 name per line = 1 ticket (settings.rate coins)
    const fallbackItems = lines.map((name) => ({
      name,
      coins: settings.rate || 100,
    }));
    if (fallbackItems.length > 0) {
      onBulkAdd(fallbackItems, false);
      setBulkListText('');
      notifyFeedback(`${fallbackItems.length} nomes adicionados com 1 bilhete cada!`);
    }
  };

  const filteredAllocations = computed.allocations.filter((a) =>
    a.participant.name.toLowerCase().includes(searchParticipant.trim().toLowerCase())
  );

  const handleCopyResult = (w: Winner) => {
    const text = `RESULTADO OFICIAL - GIO DA SORTE PRO\nPrêmio: ${w.prize || settings.prizeName || 'Prêmio Principal'}\nVencedor(a): ${w.name}\nBilhete Sorteado: #${w.number}`;
    navigator.clipboard.writeText(text).then(() => {
      setCopiedWinnerId(w.id);
      setTimeout(() => setCopiedWinnerId(null), 2000);
    });
  };

  return (
    <div className="rounded-xl bg-[#222B28] border border-[#313D39] shadow-xl overflow-hidden animate-fade-in">
      {/* Header & Progress Bar */}
      <div className="p-5 sm:p-6 bg-[#171D1C] border-b border-[#313D39] space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <div className="flex items-center gap-2 text-xs text-[#6EAA90] font-semibold">
              <Sparkles className="w-3.5 h-3.5 text-[#C6A56A]" />
              <span>Assistente Guiado Opcional</span>
              <span aria-hidden="true">·</span>
              <span className="tabular-nums">Etapa {step} de 6</span>
            </div>
            <h2 className="text-lg sm:text-xl font-semibold text-[#EAE7DE] mt-0.5">
              Etapa {step} — {WIZARD_STEPS[step - 1].title}
            </h2>
          </div>

          {onCloseWizard && (
            <button
              type="button"
              onClick={onCloseWizard}
              className="self-start sm:self-auto min-h-[38px] px-3.5 py-1.5 rounded-lg bg-[#222B28] hover:bg-[#2B3632] text-[#EAE7DE] border border-[#313D39] text-xs font-semibold transition"
            >
              Ir Direto para Roleta e Globo
            </button>
          )}
        </div>

        {/* Clickable Stepper */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2" role="navigation" aria-label="Etapas do sorteio">
          {WIZARD_STEPS.map((s) => {
            const isActive = s.number === step;
            const isCompleted = s.number < step;
            return (
              <button
                key={s.number}
                type="button"
                onClick={() => setStep(s.number)}
                className={`min-h-[40px] px-2.5 py-2 rounded-lg text-left border transition flex items-center gap-2 ${
                  isActive
                    ? 'bg-[#2B3632] border-[#6EAA90] text-[#EAE7DE] font-semibold'
                    : isCompleted
                    ? 'bg-[#222B28] border-[#6EAA90]/40 text-[#6EAA90] font-medium hover:bg-[#2B3632]'
                    : 'bg-[#222B28] border-[#313D39] text-[#9BA8A3] hover:text-[#EAE7DE]'
                }`}
              >
                <span
                  className={`w-5 h-5 rounded-full text-[11px] font-mono font-bold flex items-center justify-center shrink-0 tabular-nums ${
                    isActive
                      ? 'bg-[#6EAA90] text-[#171D1C]'
                      : isCompleted
                      ? 'bg-[#6EAA90]/20 text-[#6EAA90]'
                      : 'bg-[#171D1C] text-[#9BA8A3]'
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
      <div className="p-5 sm:p-6 space-y-6">
        {stepFeedback && (
          <div className="p-3 rounded-lg bg-[#6EAA90]/15 border border-[#6EAA90]/40 text-[#EAE7DE] text-xs font-medium flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-[#6EAA90] shrink-0" />
            <span>{stepFeedback}</span>
          </div>
        )}

        {/* ETAPA 1 — ESCOLHER MODALIDADE */}
        {step === 1 && (
          <div className="space-y-5">
            <p className="text-sm text-[#9BA8A3]">
              Escolha como você deseja conduzir o seu sorteio. Você pode avançar livremente ou voltar à mesa principal a qualquer momento.
            </p>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {/* Option 1: Traditional Coins / Globo / Wheel */}
              <button
                type="button"
                onClick={() => setModality('traditional')}
                className={`p-5 rounded-xl border text-left transition flex flex-col justify-between gap-4 ${
                  modality === 'traditional'
                    ? 'bg-[#2B3632] border-[#6EAA90] ring-1 ring-[#6EAA90]/50'
                    : 'bg-[#171D1C] border-[#313D39] hover:border-[#6EAA90]/40'
                }`}
              >
                <div className="space-y-2.5">
                  <div className="flex items-center justify-between">
                    <div className="w-10 h-10 rounded-lg bg-[#222B28] border border-[#313D39] flex items-center justify-center text-[#6EAA90]">
                      <Ticket className="w-5 h-5" />
                    </div>
                    <span className="text-[11px] font-semibold text-[#6EAA90]">Livre</span>
                  </div>
                  <h3 className="text-base font-semibold text-[#EAE7DE]">
                    1. Roleta e Globo (Moedas ou Nomes)
                  </h3>
                  <p className="text-xs text-[#9BA8A3] leading-relaxed">
                    Ideal para listas manuais, planilhas CSV/Excel ou apoiadores onde você define quantas moedas valem 1 bilhete.
                  </p>
                </div>
                <div className="text-xs font-semibold text-[#6EAA90] flex items-center gap-1">
                  <span>{modality === 'traditional' ? 'Modalidade selecionada ✓' : 'Selecionar esta modalidade'}</span>
                </div>
              </button>

              {/* Option 2: TikTok Comments Sorter */}
              <button
                type="button"
                onClick={() => setModality('tiktok_comments')}
                className={`p-5 rounded-xl border text-left transition flex flex-col justify-between gap-4 ${
                  modality === 'tiktok_comments'
                    ? 'bg-[#2B3632] border-[#6EAA90] ring-1 ring-[#6EAA90]/50'
                    : 'bg-[#171D1C] border-[#313D39] hover:border-[#6EAA90]/40'
                }`}
              >
                <div className="space-y-2.5">
                  <div className="flex items-center justify-between">
                    <div className="w-10 h-10 rounded-lg bg-[#222B28] border border-[#313D39] flex items-center justify-center text-[#C6A56A]">
                      <MessageSquare className="w-5 h-5" />
                    </div>
                    <span className="text-[11px] font-semibold text-[#6EAA90]">Livre</span>
                  </div>
                  <h3 className="text-base font-semibold text-[#EAE7DE]">
                    2. Sorteio por Comentários
                  </h3>
                  <p className="text-xs text-[#9BA8A3] leading-relaxed">
                    Carregue comentários de vídeo do TikTok ou cole @arrobas para sortear com filtros de palavra-chave e menções.
                  </p>
                </div>
                <div className="text-xs font-semibold text-[#6EAA90] flex items-center gap-1">
                  <span>{modality === 'tiktok_comments' ? 'Modalidade selecionada ✓' : 'Selecionar esta modalidade'}</span>
                </div>
              </button>

              {/* Option 3: TikTok LIVE PRO (Automatic Gifts) */}
              <button
                type="button"
                onClick={() => setModality('tiktok_live_pro')}
                className={`p-5 rounded-xl border text-left transition flex flex-col justify-between gap-4 ${
                  modality === 'tiktok_live_pro'
                    ? 'bg-[#2B3632] border-[#C6A56A] ring-1 ring-[#C6A56A]/50'
                    : 'bg-[#171D1C] border-[#313D39] hover:border-[#C6A56A]/40'
                }`}
              >
                <div className="space-y-2.5">
                  <div className="flex items-center justify-between">
                    <div className="w-10 h-10 rounded-lg bg-[#222B28] border border-[#313D39] flex items-center justify-center text-[#C6A56A]">
                      <Radio className="w-5 h-5" />
                    </div>
                    <span className="text-[11px] font-semibold text-[#C6A56A] flex items-center gap-1">
                      {isPro ? <Crown className="w-3.5 h-3.5" /> : <Lock className="w-3.5 h-3.5" />}
                      <span>Plano PRO</span>
                    </span>
                  </div>
                  <h3 className="text-base font-semibold text-[#EAE7DE]">
                    3. Sorteio por Presentes LIVE
                  </h3>
                  <p className="text-xs text-[#9BA8A3] leading-relaxed">
                    Utiliza os participantes e bilhetes gerados automaticamente durante a sua transmissão no TikTok LIVE.
                  </p>
                </div>
                <div className="text-xs font-semibold text-[#C6A56A] flex items-center gap-1">
                  <span>{modality === 'tiktok_live_pro' ? 'Modalidade selecionada ✓' : 'Selecionar esta modalidade'}</span>
                </div>
              </button>
            </div>
          </div>
        )}

        {/* ETAPA 2 — CONFIGURAR AS REGRAS */}
        {step === 2 && (
          <div className="space-y-5">
            <p className="text-sm text-[#9BA8A3]">
              Defina o prêmio e a regra de conversão deste sorteio. Os valores abaixo refletem e atualizam sua configuração persistida.
            </p>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-[#EAE7DE] mb-1.5">
                  Qual é o prêmio deste sorteio?
                </label>
                <input
                  type="text"
                  value={settings.prizeName || settings.currentPrize || ''}
                  onChange={(e) =>
                    onUpdateSettings({ prizeName: e.target.value, currentPrize: e.target.value })
                  }
                  placeholder="Ex: PIX R$ 500,00 ou Prêmio Principal"
                  className="w-full px-3.5 py-2.5 rounded-lg bg-[#171D1C] border border-[#313D39] text-sm text-[#EAE7DE] focus:border-[#6EAA90] outline-none"
                />
                <span className="text-[11px] text-[#9BA8A3] mt-1 block">
                  Aparecerá na mesa, no Cartão VIP e no Certificado PDF.
                </span>
              </div>

              <div>
                <label className="block text-xs font-semibold text-[#EAE7DE] mb-1.5">
                  Quantas moedas valem 1 bilhete?
                </label>
                <input
                  type="number"
                  min={1}
                  value={settings.rate}
                  onChange={(e) =>
                    onUpdateSettings({ rate: Math.max(1, parseInt(e.target.value, 10) || 1) })
                  }
                  className="w-full px-3.5 py-2.5 rounded-lg bg-[#171D1C] border border-[#313D39] text-sm text-[#C6A56A] font-mono font-bold focus:border-[#6EAA90] outline-none tabular-nums"
                />
                <span className="text-[11px] text-[#9BA8A3] mt-1 block">
                  Configuração ativa persistida: cada {settings.rate} moedas geram 1 bilhete numerado.
                </span>
              </div>
            </div>

            {/* Progressive Disclosure: Advanced Options */}
            <div className="border border-[#313D39] rounded-xl bg-[#171D1C] overflow-hidden">
              <button
                type="button"
                onClick={() => setShowAdvancedRules(!showAdvancedRules)}
                className="w-full px-4 py-3 flex items-center justify-between text-xs font-semibold text-[#EAE7DE] hover:bg-[#2B3632] transition"
              >
                <span className="flex items-center gap-2">
                  <Settings className="w-4 h-4 text-[#6EAA90]" />
                  <span>Opções Avançadas (Capacidade de Bilhetes, Contagem Regressiva e Repetição)</span>
                </span>
                {showAdvancedRules ? <ChevronUp className="w-4 h-4 text-[#9BA8A3]" /> : <ChevronDown className="w-4 h-4 text-[#9BA8A3]" />}
              </button>

              {showAdvancedRules && (
                <div className="p-4 pt-3 border-t border-[#313D39] grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div>
                    <label className="block text-xs font-medium text-[#EAE7DE] mb-1">
                      Capacidade Máxima de Bilhetes
                    </label>
                    <input
                      type="number"
                      min={10}
                      max={100000}
                      value={settings.total}
                      onChange={(e) =>
                        onUpdateSettings({ total: Math.max(10, parseInt(e.target.value, 10) || 100) })
                      }
                      className="w-full px-3 py-2 rounded-lg bg-[#222B28] border border-[#313D39] text-xs text-[#EAE7DE] font-mono tabular-nums"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-[#EAE7DE] mb-1">
                      Contagem regressiva (segundos)
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
                      className="w-full px-3 py-2 rounded-lg bg-[#222B28] border border-[#313D39] text-xs text-[#EAE7DE] font-mono tabular-nums"
                    />
                  </div>

                  <div className="flex flex-col justify-center">
                    <label className="flex items-center gap-2 text-xs font-medium text-[#EAE7DE] cursor-pointer">
                      <input
                        type="checkbox"
                        checked={!settings.exclude}
                        onChange={(e) => onUpdateSettings({ exclude: !e.target.checked })}
                        className="rounded border-[#313D39] bg-[#222B28] text-[#6EAA90]"
                      />
                      <span>Permitir que a mesma pessoa ganhe mais de 1 vez</span>
                    </label>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ETAPA 3 — CONECTAR A LIVE OU CARREGAR PARTICIPANTES */}
        {step === 3 && (
          <div className="space-y-5">
            {modality === 'tiktok_live_pro' ? (
              <div className="p-6 rounded-xl bg-[#171D1C] border border-[#313D39] space-y-4">
                <div className="flex items-start gap-3.5">
                  <div className="w-11 h-11 rounded-xl bg-[#2B3632] border border-[#C6A56A]/40 flex items-center justify-center text-[#C6A56A] shrink-0">
                    <Radio className="w-5 h-5" />
                  </div>
                  <div className="space-y-1">
                    <h3 className="text-base font-semibold text-[#EAE7DE]">
                      Conectar Transmissão no TikTok LIVE
                    </h3>
                    <p className="text-xs text-[#9BA8A3] leading-relaxed">
                      Na modalidade LIVE, os participantes e bilhetes são contabilizados em tempo real pelo motor oficial conforme os presentes são enviados.
                    </p>
                  </div>
                </div>

                {isPro ? (
                  <div className="flex flex-wrap items-center gap-3 pt-2">
                    <button
                      type="button"
                      onClick={() => onOpenLivePro('feed')}
                      className="min-h-[42px] px-5 py-2 rounded-lg bg-[#6EAA90] hover:bg-[#5E9980] text-[#171D1C] font-semibold text-xs flex items-center gap-2 transition"
                    >
                      <Radio className="w-4 h-4" />
                      <span>Abrir Painel de Conexão TikTok LIVE</span>
                    </button>
                  </div>
                ) : (
                  <div className="p-4 rounded-xl bg-[#D96B6B]/10 border border-[#D96B6B]/30 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div className="flex items-center gap-2.5 text-xs text-[#EAE7DE]">
                      <Lock className="w-4 h-4 text-[#C6A56A] shrink-0" />
                      <span>
                        A captura automática de presentes da LIVE requer o plano PRO ativo.
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={onOpenSubscription}
                      className="min-h-[36px] px-4 py-1.5 rounded-lg bg-[#C6A56A] text-[#171D1C] font-semibold text-xs shrink-0"
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
                  className="p-5 rounded-xl bg-[#171D1C] border border-[#313D39] space-y-4"
                >
                  <div className="flex items-center gap-2 text-sm font-semibold text-[#EAE7DE]">
                    <UserPlus className="w-4 h-4 text-[#6EAA90]" />
                    <span>Adicionar Participante Individualmente</span>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <div className="sm:col-span-2">
                      <label className="block text-[11px] font-medium text-[#9BA8A3] mb-1">
                        Nome ou @usuário
                      </label>
                      <input
                        type="text"
                        value={quickName}
                        onChange={(e) => setQuickName(e.target.value)}
                        placeholder="Ex: @maria_silva"
                        className="w-full px-3 py-2 rounded-lg bg-[#222B28] border border-[#313D39] text-xs text-[#EAE7DE]"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-medium text-[#9BA8A3] mb-1">
                        Moedas
                      </label>
                      <input
                        type="number"
                        min={1}
                        value={quickCoins}
                        onChange={(e) => setQuickCoins(e.target.value)}
                        className="w-full px-3 py-2 rounded-lg bg-[#222B28] border border-[#313D39] text-xs text-[#C6A56A] font-mono font-bold tabular-nums"
                      />
                    </div>
                  </div>
                  <button
                    type="submit"
                    className="w-full min-h-[40px] py-2 rounded-lg bg-[#6EAA90] hover:bg-[#5E9980] text-[#171D1C] font-semibold text-xs transition"
                  >
                    + Adicionar à Lista
                  </button>
                </form>

                {/* Bulk / Comments Paste */}
                <div className="p-5 rounded-xl bg-[#171D1C] border border-[#313D39] space-y-3">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 text-sm font-semibold text-[#EAE7DE]">
                      <FileSpreadsheet className="w-4 h-4 text-[#C6A56A]" />
                      <span>Colar Lista de Nomes</span>
                    </div>
                    {modality === 'tiktok_comments' && (
                      <button
                        type="button"
                        onClick={onOpenCommentsSorter}
                        className="text-[11px] font-semibold text-[#6EAA90] hover:underline"
                      >
                        Abrir Sorteio por Comentários
                      </button>
                    )}
                  </div>
                  <textarea
                    rows={3}
                    value={bulkListText}
                    onChange={(e) => setBulkListText(e.target.value)}
                    placeholder={`Cole 1 por linha. Exemplo:\n@joao_oficial ${settings.rate * 2}\n@ana_carolina ${settings.rate}\nou apenas os nomes`}
                    className="w-full p-3 rounded-lg bg-[#222B28] border border-[#313D39] text-xs text-[#EAE7DE] font-mono"
                  />
                  <button
                    type="button"
                    onClick={handlePasteListQuick}
                    className="w-full min-h-[40px] py-2 rounded-lg bg-[#2B3632] hover:bg-[#313D39] text-[#EAE7DE] border border-[#313D39] font-semibold text-xs transition"
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
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-[#171D1C] p-4 rounded-xl border border-[#313D39]">
              <div className="flex flex-wrap items-center gap-4 text-xs tabular-nums">
                <div>
                  <span className="text-[#9BA8A3]">Participantes Cadastrados:</span>{' '}
                  <strong className="text-[#EAE7DE] font-mono text-sm">{participants.length}</strong>
                </div>
                <span aria-hidden="true" className="text-[#313D39]">·</span>
                <div>
                  <span className="text-[#9BA8A3]">Com Bilhetes Elegíveis:</span>{' '}
                  <strong className="text-[#6EAA90] font-mono text-sm">{eligibleParticipantsCount}</strong>
                </div>
                <span aria-hidden="true" className="text-[#313D39]">·</span>
                <div>
                  <span className="text-[#9BA8A3]">Total de Bilhetes:</span>{' '}
                  <strong className="text-[#C6A56A] font-mono text-sm">{eligibleTicketsCount}</strong>
                </div>
              </div>

              <input
                type="search"
                value={searchParticipant}
                onChange={(e) => setSearchParticipant(e.target.value)}
                placeholder="Pesquisar participante..."
                className="px-3 py-1.5 rounded-lg bg-[#222B28] border border-[#313D39] text-xs text-[#EAE7DE]"
              />
            </div>

            {filteredAllocations.length === 0 ? (
              <div className="p-8 rounded-xl bg-[#171D1C] border border-[#313D39] text-center space-y-2">
                <Users className="w-7 h-7 text-[#9BA8A3] mx-auto" />
                <p className="text-sm font-semibold text-[#EAE7DE]">Nenhum participante encontrado</p>
                <p className="text-xs text-[#9BA8A3]">
                  Volte para a Etapa 3 para adicionar participantes ou cole uma lista.
                </p>
              </div>
            ) : (
              <div className="max-h-64 overflow-y-auto rounded-xl border border-[#313D39] divide-y divide-[#313D39] bg-[#171D1C]">
                {filteredAllocations.slice(0, 50).map((alloc) => (
                  <div
                    key={alloc.participant.id}
                    className="px-4 py-2.5 flex items-center justify-between gap-3 text-xs"
                  >
                    <div className="font-semibold text-[#EAE7DE] truncate">{alloc.participant.name}</div>
                    <div className="flex items-center gap-4 shrink-0 font-mono tabular-nums">
                      <span className="text-[#9BA8A3]">{alloc.participant.coins} moedas</span>
                      <span className="text-[#C6A56A] font-bold">{alloc.assignedTickets} bilhete(s)</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ETAPA 5 — INICIAR O SORTEIO */}
        {step === 5 && (
          <div className="p-6 sm:p-8 rounded-xl bg-[#171D1C] border border-[#313D39] text-center space-y-5">
            <div className="inline-flex items-center justify-center w-20 h-20 rounded-xl bg-[#222B28] border border-[#C6A56A]/50 text-[#EAE7DE] font-mono font-bold text-3xl tabular-nums">
              {currentDisplayNumber === '?' ? '—' : `#${currentDisplayNumber}`}
            </div>

            <div className="space-y-1 max-w-md mx-auto">
              <h3 className="text-lg sm:text-xl font-semibold text-[#EAE7DE]">
                Prêmio em disputa: <span className="text-[#C6A56A]">{settings.prizeName || settings.currentPrize || 'Prêmio Principal'}</span>
              </h3>
              <p className="text-xs text-[#9BA8A3] tabular-nums">
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
                className="min-h-[46px] px-6 py-3 rounded-xl bg-[#6EAA90] hover:bg-[#5E9980] text-[#171D1C] font-semibold text-sm flex items-center gap-2 transition disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <Play className="w-4 h-4 fill-current" />
                <span>{isDrawing ? 'Sorteando...' : 'Sortear Agora no Globo'}</span>
              </button>

              <button
                type="button"
                disabled={eligibleTicketsCount === 0 || isDrawing}
                onClick={() => {
                  onUpdateSettings({ drawMode: 'wheel' });
                  onTriggerDraw('wheel');
                  setTimeout(() => setStep(6), 1200);
                }}
                className="min-h-[46px] px-5 py-3 rounded-xl bg-[#222B28] hover:bg-[#2B3632] text-[#EAE7DE] border border-[#313D39] font-semibold text-xs sm:text-sm flex items-center gap-2 transition disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <Sparkles className="w-4 h-4 text-[#C6A56A]" />
                <span>Girar Roleta Visual</span>
              </button>
            </div>
          </div>
        )}

        {/* ETAPA 6 — VISUALIZAR E SALVAR O RESULTADO */}
        {step === 6 && (
          <div className="space-y-5">
            {latestWinner ? (
              <div className="p-6 rounded-xl bg-[#171D1C] border border-[#C6A56A]/50 space-y-5">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                  <div className="flex items-center gap-4">
                    <div className="w-14 h-14 rounded-xl bg-[#222B28] border border-[#C6A56A] text-[#C6A56A] flex items-center justify-center font-mono font-bold text-xl tabular-nums">
                      #{latestWinner.number}
                    </div>
                    <div>
                      <span className="text-xs font-medium text-[#6EAA90]">
                        Último Ganhador Oficial · Registrado
                      </span>
                      <h3 className="text-xl sm:text-2xl font-semibold text-[#EAE7DE]">
                        {latestWinner.name}
                      </h3>
                      <p className="text-xs text-[#9BA8A3]">
                        Prêmio: <strong className="text-[#C6A56A]">{latestWinner.prize || settings.prizeName || 'Prêmio Principal'}</strong>
                      </p>
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-2.5">
                    <button
                      type="button"
                      onClick={() => onOpenVictoryCard(latestWinner)}
                      className="min-h-[40px] px-4 py-2 rounded-lg bg-[#6EAA90] hover:bg-[#5E9980] text-[#171D1C] font-semibold text-xs flex items-center gap-1.5"
                    >
                      <Award className="w-4 h-4" />
                      <span>Cartão do Ganhador</span>
                    </button>
                    <button
                      type="button"
                      onClick={onOpenAuditReport}
                      className="min-h-[40px] px-4 py-2 rounded-lg bg-[#222B28] hover:bg-[#2B3632] text-[#EAE7DE] border border-[#313D39] font-semibold text-xs flex items-center gap-1.5"
                    >
                      <FileText className="w-4 h-4 text-[#C6A56A]" />
                      <span>Certificado PDF</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => handleCopyResult(latestWinner)}
                      className="min-h-[40px] px-3.5 py-2 rounded-lg bg-[#222B28] hover:bg-[#2B3632] text-[#EAE7DE] border border-[#313D39] font-medium text-xs flex items-center gap-1.5"
                    >
                      {copiedWinnerId === latestWinner.id ? (
                        <Check className="w-3.5 h-3.5 text-[#6EAA90]" />
                      ) : (
                        <Copy className="w-3.5 h-3.5 text-[#9BA8A3]" />
                      )}
                      <span>{copiedWinnerId === latestWinner.id ? 'Copiado!' : 'Copiar Texto'}</span>
                    </button>
                  </div>
                </div>
              </div>
            ) : (
              <div className="p-8 rounded-xl bg-[#171D1C] border border-[#313D39] text-center space-y-3">
                <Trophy className="w-8 h-8 text-[#C6A56A] mx-auto" />
                <h3 className="text-base font-semibold text-[#EAE7DE]">Nenhum sorteio realizado ainda nesta sessão</h3>
                <p className="text-xs text-[#9BA8A3]">
                  Volte para a Etapa 5 e clique em &ldquo;Sortear Agora&rdquo; para revelar o ganhador.
                </p>
              </div>
            )}
          </div>
        )}

        {/* Bottom Wizard Navigation Controls */}
        <div className="pt-4 border-t border-[#313D39] flex items-center justify-between gap-3">
          <button
            type="button"
            disabled={step === 1}
            onClick={() => setStep((s) => Math.max(1, s - 1))}
            className="min-h-[40px] px-4 py-2 rounded-lg bg-[#171D1C] hover:bg-[#2B3632] disabled:opacity-40 text-[#EAE7DE] border border-[#313D39] text-xs font-semibold flex items-center gap-1.5 transition"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>Etapa Anterior</span>
          </button>

          {step < 6 ? (
            <button
              type="button"
              onClick={() => setStep((s) => Math.min(6, s + 1))}
              className="min-h-[40px] px-5 py-2 rounded-lg bg-[#6EAA90] hover:bg-[#5E9980] text-[#171D1C] font-semibold text-xs flex items-center gap-1.5 transition"
            >
              <span>Avançar para Etapa {step + 1}</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          ) : (
            <button
              type="button"
              onClick={() => setStep(1)}
              className="min-h-[40px] px-5 py-2 rounded-lg bg-[#2B3632] hover:bg-[#313D39] text-[#EAE7DE] border border-[#313D39] font-semibold text-xs transition"
            >
              Reiniciar Assistente
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
