import React, { useState } from 'react';
import {
  Sparkles,
  Radio,
  Ticket,
  Trophy,
  CheckCircle2,
  ArrowRight,
  ArrowLeft,
  X,
  Compass,
  ShieldCheck,
} from 'lucide-react';

interface OnboardingTourModalProps {
  isOpen: boolean;
  onClose: () => void;
  onStartGuidedWizard: () => void;
  onGoToLivePro: () => void;
}

const ONBOARDING_STEPS = [
  {
    step: 1,
    badge: 'Bem-vindo ao GIO DA SORTE',
    title: 'Sorteios profissionais em poucos cliques, sem complicação técnica',
    description:
      'Organize sorteios por moedas, listas de participantes, comentários ou presentes da TikTok LIVE em tempo real. Tudo foi desenhado para você configurar e sortear com segurança em menos de 1 minuto.',
    highlights: [
      'Painel principal com resumo claro de participantes, bilhetes e últimos ganhadores',
      'Botão "+ Criar Novo Sorteio" com passo a passo guiado do início ao fim',
      'Funciona perfeitamente no computador, tablet ou celular',
    ],
    icon: Compass,
  },
  {
    step: 2,
    badge: 'Automação TikTok LIVE PRO',
    title: 'Adeus trabalho manual durante suas transmissões ao vivo',
    description:
      'No plano PRO, basta digitar o @usuario da sua LIVE. O sistema identifica quem enviou presentes, soma as moedas automaticamente e emite os bilhetes numerados na hora.',
    highlights: [
      'Contabilização automática de moedas enviadas em presentes e combos',
      'Emissão instantânea de bilhetes (#1, #2, #3...) sem risco de duplicidade',
      'Campanhas acumuladas para juntar bilhetes de várias LIVES diferentes',
    ],
    icon: Radio,
  },
  {
    step: 3,
    badge: 'Transparência Total',
    title: 'Resultados auditáveis com certificado PDF e cartão do ganhador',
    description:
      'Cada sorteio gera um código de verificação antifraude (SHA-256). Ao final, você pode exibir o Modo Telão ao vivo, gerar o cartão para redes sociais e baixar o relatório em PDF.',
    highlights: [
      'Pesquisa rápida por @usuário ou número do bilhete (#bilhete)',
      'Histórico completo de sorteios e exportação em planilha (CSV/Excel)',
      'Seus dados e históricos ficam sempre salvos e acessíveis',
    ],
    icon: ShieldCheck,
  },
];

export const OnboardingTourModal: React.FC<OnboardingTourModalProps> = ({
  isOpen,
  onClose,
  onStartGuidedWizard,
  onGoToLivePro,
}) => {
  const [currentStep, setCurrentStep] = useState(0);

  if (!isOpen) return null;

  const stepData = ONBOARDING_STEPS[currentStep];
  const StepIcon = stepData.icon;
  const isLastStep = currentStep === ONBOARDING_STEPS.length - 1;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#050D20]/85 backdrop-blur-md animate-fade-in"
      role="dialog"
      aria-modal="true"
      aria-labelledby="onboarding-title"
    >
      <div className="relative w-full max-w-xl rounded-2xl bg-[#101F3D] border border-[var(--gio-border-active)] shadow-[0_24px_60px_rgba(2,8,23,0.75)] overflow-hidden animate-slide-up">
        {/* Top electric blue & violet PRO bar */}
        <div className="h-1.5 w-full bg-gradient-to-r from-[#0866F5] via-[#00A9FF] to-[#8B7CFF]" />

        <div className="p-6 sm:p-8 space-y-6">
          {/* Header */}
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-center gap-3.5 min-w-0">
              <div className="w-12 h-12 rounded-xl bg-[#050D20] border border-[#00A9FF]/40 flex items-center justify-center p-1 shadow-[0_6px_18px_rgba(8,102,245,0.28)] shrink-0">
                <img
                  src="/logo.png"
                  alt="GIO DA SORTE"
                  className="w-full h-full object-contain"
                />
              </div>
              <div className="min-w-0">
                <span className="text-xs font-semibold text-[#00A9FF] inline-flex items-center gap-1.5">
                  <StepIcon className="w-3.5 h-3.5 text-[#35B9F5] shrink-0" />
                  <span className="tabular-nums">
                    {stepData.badge} · Passo {stepData.step} de {ONBOARDING_STEPS.length}
                  </span>
                </span>
                <h2
                  id="onboarding-title"
                  className="text-lg sm:text-xl font-display font-bold text-[#F8FAFC] leading-snug mt-0.5"
                >
                  {stepData.title}
                </h2>
              </div>
            </div>

            <button
              type="button"
              onClick={onClose}
              aria-label="Fechar guia inicial"
              className="w-9 h-9 rounded-xl bg-[#0B1730] hover:bg-[#182943] text-[#94A3B8] hover:text-[#F8FAFC] border border-[var(--gio-border-subtle)] flex items-center justify-center transition shrink-0"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Description */}
          <p className="text-sm sm:text-base text-[#94A3B8] leading-relaxed">{stepData.description}</p>

          {/* Highlights */}
          <div className="space-y-2.5 bg-[#0B1730] border border-[var(--gio-border-subtle)] rounded-xl p-4">
            {stepData.highlights.map((item, idx) => (
              <div key={idx} className="flex items-start gap-2.5 text-xs sm:text-sm text-[#F8FAFC]">
                <CheckCircle2 className="w-4 h-4 text-[#20C997] shrink-0 mt-0.5" />
                <span>{item}</span>
              </div>
            ))}
          </div>

          {/* Progress Dots & Actions */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pt-3 border-t border-[var(--gio-border-subtle)]">
            <div className="flex items-center gap-2">
              {ONBOARDING_STEPS.map((_, idx) => (
                <button
                  key={idx}
                  type="button"
                  onClick={() => setCurrentStep(idx)}
                  aria-label={`Ir para o passo ${idx + 1}`}
                  className={`h-2 rounded-full transition-all ${
                    idx === currentStep
                      ? 'w-7 bg-[#00A9FF] shadow-[0_0_8px_rgba(0,169,255,0.6)]'
                      : 'w-2 bg-[#182943] hover:bg-[#94A3B8]'
                  }`}
                />
              ))}
            </div>

            <div className="flex flex-wrap items-center justify-end gap-2.5">
              {currentStep > 0 ? (
                <button
                  type="button"
                  onClick={() => setCurrentStep((s) => s - 1)}
                  className="min-h-[42px] px-4 py-2 rounded-xl bg-[#0B1730] hover:bg-[#182943] text-[#F8FAFC] border border-[var(--gio-border-subtle)] text-xs font-semibold flex items-center gap-1.5 transition"
                >
                  <ArrowLeft className="w-3.5 h-3.5" />
                  <span>Anterior</span>
                </button>
              ) : (
                <button
                  type="button"
                  onClick={onClose}
                  className="min-h-[42px] px-3 py-2 rounded-xl text-[#94A3B8] hover:text-[#F8FAFC] text-xs font-medium transition"
                >
                  Pular introdução
                </button>
              )}

              {!isLastStep ? (
                <button
                  type="button"
                  onClick={() => setCurrentStep((s) => s + 1)}
                  className="min-h-[42px] px-5 py-2 rounded-xl bg-gradient-to-r from-[#0866F5] to-[#00A9FF] text-white font-bold text-xs flex items-center gap-1.5 shadow-[0_6px_18px_rgba(8,102,245,0.35)] hover:brightness-110 transition"
                >
                  <span>Próximo</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </button>
              ) : (
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      onClose();
                      onGoToLivePro();
                    }}
                    className="min-h-[42px] px-4 py-2 rounded-xl bg-[#8B7CFF]/15 hover:bg-[#8B7CFF]/25 text-[#C4B5FD] border border-[#8B7CFF]/45 font-bold text-xs flex items-center gap-1.5 transition"
                  >
                    <Radio className="w-3.5 h-3.5" />
                    <span>Abrir LIVE PRO</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      onClose();
                      onStartGuidedWizard();
                    }}
                    className="min-h-[42px] px-5 py-2 rounded-xl bg-gradient-to-r from-[#0866F5] to-[#00A9FF] text-white font-extrabold text-xs flex items-center gap-1.5 shadow-[0_8px_22px_rgba(8,102,245,0.4)] hover:brightness-110 transition"
                  >
                    <Sparkles className="w-3.5 h-3.5" />
                    <span>Criar Meu 1º Sorteio</span>
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
