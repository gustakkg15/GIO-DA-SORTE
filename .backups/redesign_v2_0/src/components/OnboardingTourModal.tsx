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
    badge: 'Bem-vindo ao GIO DA SORTE PRO',
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
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-fade-in"
      role="dialog"
      aria-modal="true"
      aria-labelledby="onboarding-title"
    >
      <div className="relative w-full max-w-xl rounded-2xl bg-gradient-to-b from-[#0A1128] via-[#0F172A] to-[#050814] border border-[#E11D48]/45 shadow-2xl overflow-hidden animate-slide-up">
        {/* Top metallic red bar */}
        <div className="h-1.5 w-full bg-gradient-to-r from-[#1E3A8A] via-[#E11D48] to-[#F43F5E]" />

        <div className="p-6 sm:p-8 space-y-6">
          {/* Header */}
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-xl bg-[#050814] border border-[#E11D48]/45 flex items-center justify-center p-1 shadow-lg shadow-[#E11D48]/20 shrink-0">
                <img
                  src="/logo.png"
                  alt="GIO DA SORTE PRO"
                  className="w-full h-full object-contain"
                />
              </div>
              <div>
                <span className="text-xs font-semibold text-[#FDA4AF] inline-flex items-center gap-1.5">
                  <StepIcon className="w-3.5 h-3.5 text-[#F43F5E]" />
                  <span>{stepData.badge} · Passo {stepData.step} de {ONBOARDING_STEPS.length}</span>
                </span>
                <h2
                  id="onboarding-title"
                  className="text-lg sm:text-xl font-display font-bold text-white leading-snug mt-0.5"
                >
                  {stepData.title}
                </h2>
              </div>
            </div>

            <button
              type="button"
              onClick={onClose}
              aria-label="Fechar guia inicial"
              className="w-9 h-9 rounded-xl bg-slate-900/90 hover:bg-slate-800 text-slate-400 hover:text-white border border-slate-800 flex items-center justify-center transition shrink-0"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Description */}
          <p className="text-sm text-slate-300 leading-relaxed">{stepData.description}</p>

          {/* Highlights */}
          <div className="space-y-2.5 bg-[#050814]/80 border border-blue-900/50 rounded-xl p-4">
            {stepData.highlights.map((item, idx) => (
              <div key={idx} className="flex items-start gap-2.5 text-xs sm:text-sm text-slate-200">
                <CheckCircle2 className="w-4 h-4 text-[#F43F5E] shrink-0 mt-0.5" />
                <span>{item}</span>
              </div>
            ))}
          </div>

          {/* Progress Dots */}
          <div className="flex items-center justify-between pt-2 border-t border-slate-800/80">
            <div className="flex items-center gap-2">
              {ONBOARDING_STEPS.map((_, idx) => (
                <button
                  key={idx}
                  type="button"
                  onClick={() => setCurrentStep(idx)}
                  aria-label={`Ir para o passo ${idx + 1}`}
                  className={`h-2 rounded-full transition-all ${
                    idx === currentStep
                      ? 'w-7 bg-[#E11D48]'
                      : 'w-2 bg-slate-700 hover:bg-slate-500'
                  }`}
                />
              ))}
            </div>

            <div className="flex items-center gap-2.5">
              {currentStep > 0 ? (
                <button
                  type="button"
                  onClick={() => setCurrentStep((s) => s - 1)}
                  className="min-h-[42px] px-4 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-slate-200 border border-slate-700 text-xs font-semibold flex items-center gap-1.5 transition"
                >
                  <ArrowLeft className="w-3.5 h-3.5" />
                  <span>Anterior</span>
                </button>
              ) : (
                <button
                  type="button"
                  onClick={onClose}
                  className="min-h-[42px] px-3 py-2 rounded-xl text-slate-400 hover:text-white text-xs font-medium transition"
                >
                  Pular introdução
                </button>
              )}

              {!isLastStep ? (
                <button
                  type="button"
                  onClick={() => setCurrentStep((s) => s + 1)}
                  className="min-h-[42px] px-5 py-2 rounded-xl bg-gradient-to-r from-[#E11D48] to-[#BE123C] text-white font-bold text-xs flex items-center gap-1.5 shadow-md shadow-[#E11D48]/30 hover:brightness-110 transition"
                >
                  <span>Próximo</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </button>
              ) : (
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      onClose();
                      onGoToLivePro();
                    }}
                    className="min-h-[42px] px-4 py-2 rounded-xl bg-[#1E3A8A]/70 hover:bg-[#1E3A8A] text-[#FDA4AF] border border-[#E11D48]/45 font-bold text-xs flex items-center gap-1.5 transition"
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
                    className="min-h-[42px] px-5 py-2 rounded-xl bg-gradient-to-r from-[#E11D48] via-[#F43F5E] to-[#BE123C] text-white font-black text-xs flex items-center gap-1.5 shadow-lg shadow-[#E11D48]/30 hover:brightness-110 transition"
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
