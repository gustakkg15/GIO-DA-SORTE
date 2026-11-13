import React, { useState, useEffect, useRef } from 'react';
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
  const dialogRef = useRef<HTMLDivElement>(null);
  const previousActiveElementRef = useRef<HTMLElement | null>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    if (!isOpen) return;

    const currentActive = document.activeElement as HTMLElement | null;
    if (currentActive && currentActive !== document.body) {
      previousActiveElementRef.current = currentActive;
    }

    const focusTimer = window.setTimeout(() => {
      if (!dialogRef.current) return;
      const focusables = dialogRef.current.querySelectorAll<HTMLElement>(
        'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
      );
      if (focusables.length > 0 && !dialogRef.current.contains(document.activeElement)) {
        focusables[0].focus();
      }
    }, 30);

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        onCloseRef.current();
        return;
      }

      if (e.key === 'Tab' && dialogRef.current) {
        const focusables = Array.from(
          dialogRef.current.querySelectorAll<HTMLElement>(
            'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
          )
        ).filter((el) => el.offsetWidth > 0 || el.offsetHeight > 0 || el.getClientRects().length > 0);

        if (focusables.length === 0) return;

        const firstEl = focusables[0];
        const lastEl = focusables[focusables.length - 1];
        const activeEl = document.activeElement as HTMLElement | null;

        if (!activeEl || !dialogRef.current.contains(activeEl)) {
          e.preventDefault();
          (e.shiftKey ? lastEl : firstEl).focus();
          return;
        }

        if (e.shiftKey && activeEl === firstEl) {
          e.preventDefault();
          lastEl.focus();
        } else if (!e.shiftKey && activeEl === lastEl) {
          e.preventDefault();
          firstEl.focus();
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.clearTimeout(focusTimer);
      window.removeEventListener('keydown', handleKeyDown);
      const prev = previousActiveElementRef.current;
      if (prev && document.body.contains(prev)) {
        window.setTimeout(() => {
          if (document.body.contains(prev)) {
            prev.focus();
          }
        }, 0);
      }
    };
  }, [isOpen]);

  if (!isOpen) return null;

  const stepData = ONBOARDING_STEPS[currentStep];
  const StepIcon = stepData.icon;
  const isLastStep = currentStep === ONBOARDING_STEPS.length - 1;

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-[#080D18]/85 backdrop-blur-md animate-fade-in"
      role="dialog"
      aria-modal="true"
      aria-labelledby="onboarding-title"
    >
      <div
        ref={dialogRef}
        className="relative w-full max-w-xl rounded-2xl bg-[#111B30] border border-[var(--gio-border-active)] shadow-[0_24px_60px_rgba(8,13,24,0.85)] overflow-hidden animate-slide-up"
      >
        {/* Top brand bar */}
        <div className="h-1.5 w-full bg-gradient-to-r from-[#0131CD] via-[#0131CD] to-[#A6C957]" />

        <div className="p-6 sm:p-8 space-y-6">
          {/* Header */}
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-center gap-3.5 min-w-0">
              <div className="w-12 h-12 rounded-xl bg-[#080D18] border border-[#0131CD]/40 flex items-center justify-center p-1 shadow-[0_6px_18px_rgba(1,49,205,0.28)] shrink-0">
                <img
                  src="/icon.svg"
                  alt="GIO DA SORTE"
                  className="w-full h-full object-contain"
                />
              </div>
              <div className="min-w-0">
                <span className="text-xs font-semibold text-[#A6C957] inline-flex items-center gap-1.5">
                  <StepIcon className="w-3.5 h-3.5 text-[#A6C957] shrink-0" />
                  <span className="tabular-nums">
                    {stepData.badge} · Passo {stepData.step} de {ONBOARDING_STEPS.length}
                  </span>
                </span>
                <h2
                  id="onboarding-title"
                  className="text-lg sm:text-xl font-bold text-[#FFFFFF] leading-snug mt-0.5"
                >
                  {stepData.title}
                </h2>
              </div>
            </div>

            <button
              type="button"
              onClick={onClose}
              aria-label="Fechar guia inicial"
              className="w-9 h-9 rounded-xl bg-[#080D18] hover:bg-[#111B30] text-[#A5B1C5] hover:text-[#FFFFFF] border border-[var(--gio-border-subtle)] flex items-center justify-center transition shrink-0"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Description */}
          <p className="text-sm sm:text-base text-[#A5B1C5] leading-relaxed">{stepData.description}</p>

          {/* Highlights */}
          <div className="space-y-2.5 bg-[#080D18] border border-[var(--gio-border-subtle)] rounded-xl p-4">
            {stepData.highlights.map((item, idx) => (
              <div key={idx} className="flex items-start gap-2.5 text-xs sm:text-sm text-[#FFFFFF]">
                <CheckCircle2 className="w-4 h-4 text-[#A6C957] shrink-0 mt-0.5" />
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
                      ? 'w-7 bg-[#0131CD] shadow-[0_0_8px_rgba(1,49,205,0.6)]'
                      : 'w-2 bg-[#080D18] hover:bg-[#A5B1C5]'
                  }`}
                />
              ))}
            </div>

            <div className="flex flex-wrap items-center justify-end gap-2.5">
              {currentStep > 0 ? (
                <button
                  type="button"
                  onClick={() => setCurrentStep((s) => s - 1)}
                  className="min-h-[42px] px-4 py-2 rounded-xl bg-[#080D18] hover:bg-[#111B30] text-[#FFFFFF] border border-[var(--gio-border-subtle)] text-xs font-semibold flex items-center gap-1.5 transition"
                >
                  <ArrowLeft className="w-3.5 h-3.5" />
                  <span>Anterior</span>
                </button>
              ) : (
                <button
                  type="button"
                  onClick={onClose}
                  className="min-h-[42px] px-3 py-2 rounded-xl text-[#A5B1C5] hover:text-[#FFFFFF] text-xs font-medium transition"
                >
                  Pular introdução
                </button>
              )}

              {!isLastStep ? (
                <button
                  type="button"
                  onClick={() => setCurrentStep((s) => s + 1)}
                  className="min-h-[42px] px-5 py-2 rounded-xl bg-gradient-to-r from-[#0131CD] to-[#0131CD] text-[#FFFFFF] font-bold text-xs flex items-center gap-1.5 shadow-[0_6px_18px_rgba(1,49,205,0.35)] hover:brightness-110 transition"
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
                    className="min-h-[42px] px-4 py-2 rounded-xl bg-[#A6C957]/15 hover:bg-[#A6C957]/25 text-[#A6C957] border border-[#A6C957]/40 font-bold text-xs flex items-center gap-1.5 transition"
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
                    className="min-h-[42px] px-5 py-2 rounded-xl bg-gradient-to-r from-[#0131CD] to-[#0131CD] text-[#FFFFFF] font-extrabold text-xs flex items-center gap-1.5 shadow-[0_8px_22px_rgba(1,49,205,0.4)] hover:brightness-110 transition"
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
