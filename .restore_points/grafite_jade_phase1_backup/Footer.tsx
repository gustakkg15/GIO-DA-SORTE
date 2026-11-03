import React from 'react';
import {
  ShieldCheck,
  Scale,
  Cookie,
  HelpCircle,
  Lock,
  ExternalLink,
  CheckCircle2,
  Radio,
  Trophy,
  Crown,
} from 'lucide-react';
import { LegalDocumentSlug } from '../types';

interface FooterProps {
  onNavigateTab?: (tab: any) => void;
  onOpenLegalDocument?: (slug: LegalDocumentSlug) => void;
  onOpenPrivacyPortal?: () => void;
  onOpenSupportPortal?: () => void;
  onOpenCookieSettings?: () => void;
}

export const Footer: React.FC<FooterProps> = ({
  onNavigateTab,
  onOpenLegalDocument,
  onOpenPrivacyPortal,
  onOpenSupportPortal,
  onOpenCookieSettings,
}) => {
  const handleLegalClick = (slug: LegalDocumentSlug) => {
    if (onOpenLegalDocument) {
      onOpenLegalDocument(slug);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  };

  return (
    <footer className="mt-16 border-t border-[#E11D48]/30 bg-gradient-to-b from-[#0A1128] to-[#050814] text-slate-300 print:hidden">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12 space-y-10">
        {/* Top Brand + 4 Institutional Columns (Fase 5.3) */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-12 gap-8">
          {/* Brand & Official Logo Column */}
          <div className="lg:col-span-4 space-y-4">
            <div className="flex items-center gap-3.5">
              <img
                src="/logo.png"
                alt="GIO DA SORTE PRO"
                className="w-14 h-14 object-contain shrink-0 drop-shadow-[0_0_12px_rgba(225,29,72,0.35)]"
              />
              <div>
                <span className="text-lg font-display font-black text-white tracking-tight block">
                  GIO DA SORTE <span className="text-[#FDA4AF]">PRO</span>
                </span>
                <span className="text-[11px] font-mono text-blue-300/80 block">
                  Automação de Sorteios, Moedas & Bilhetes Auditáveis
                </span>
              </div>
            </div>

            <p className="text-xs text-slate-400 leading-relaxed">
              Plataforma profissional para contabilização automática de moedas enviadas em presentes, emissão atômica de bilhetes e realização de sorteios com prova criptográfica SHA-256 e CSPRNG.
            </p>

            <div className="flex flex-wrap items-center gap-2 pt-1">
              <button
                type="button"
                onClick={() => handleLegalClick('sobre-nos')}
                className="px-3 py-1.5 rounded-lg bg-[#050814] hover:bg-blue-950 text-xs font-semibold text-[#FDA4AF] border border-blue-900/70 transition"
              >
                Sobre Nós
              </button>
              {onOpenCookieSettings && (
                <button
                  type="button"
                  onClick={onOpenCookieSettings}
                  className="px-3 py-1.5 rounded-lg bg-[#050814] hover:bg-blue-950 text-xs font-semibold text-blue-200 border border-blue-900/70 transition flex items-center gap-1.5"
                >
                  <Cookie className="w-3.5 h-3.5 text-[#FDA4AF]" />
                  <span>Configurações de Cookies</span>
                </button>
              )}
            </div>
          </div>

          {/* Column 1: PLATAFORMA */}
          <div className="lg:col-span-2 space-y-3">
            <h3 className="text-xs font-display font-black uppercase tracking-wider text-[#FDA4AF]">
              PLATAFORMA
            </h3>
            <ul className="space-y-2 text-xs">
              <li>
                <button
                  type="button"
                  onClick={() => {
                    onNavigateTab?.('dashboard');
                    window.scrollTo({ top: 0, behavior: 'smooth' });
                  }}
                  className="text-slate-300 hover:text-white transition text-left"
                >
                  Início / Visão Geral
                </button>
              </li>
              <li>
                <button
                  type="button"
                  onClick={() => {
                    onNavigateTab?.('raffle');
                    window.scrollTo({ top: 0, behavior: 'smooth' });
                  }}
                  className="text-slate-300 hover:text-white transition text-left"
                >
                  Sorteios Proporcionais
                </button>
              </li>
              <li>
                <button
                  type="button"
                  onClick={() => {
                    onNavigateTab?.('tiktok');
                    window.scrollTo({ top: 0, behavior: 'smooth' });
                  }}
                  className="text-slate-300 hover:text-[#FDA4AF] font-semibold transition text-left flex items-center gap-1"
                >
                  <Radio className="w-3 h-3 text-[#F43F5E]" />
                  <span>TikTok LIVE Pro</span>
                </button>
              </li>
              <li>
                <button
                  type="button"
                  onClick={() => {
                    onNavigateTab?.('plans');
                    window.scrollTo({ top: 0, behavior: 'smooth' });
                  }}
                  className="text-slate-300 hover:text-white transition text-left flex items-center gap-1"
                >
                  <Crown className="w-3 h-3 text-[#FDA4AF]" />
                  <span>Planos e Assinaturas</span>
                </button>
              </li>
              <li>
                <button
                  type="button"
                  onClick={() => handleLegalClick('sobre-nos')}
                  className="text-slate-300 hover:text-white transition text-left"
                >
                  Sobre Nós
                </button>
              </li>
            </ul>
          </div>

          {/* Column 2: SUPORTE */}
          <div className="lg:col-span-2 space-y-3">
            <h3 className="text-xs font-display font-black uppercase tracking-wider text-[#FDA4AF]">
              SUPORTE
            </h3>
            <ul className="space-y-2 text-xs">
              <li>
                <button
                  type="button"
                  onClick={() => handleLegalClick('central-de-ajuda')}
                  className="text-slate-300 hover:text-white transition text-left"
                >
                  Central de Ajuda
                </button>
              </li>
              <li>
                <button
                  type="button"
                  onClick={() => {
                    onOpenSupportPortal?.();
                    window.scrollTo({ top: 0, behavior: 'smooth' });
                  }}
                  className="text-slate-300 hover:text-white transition text-left"
                >
                  Perguntas Frequentes (FAQ)
                </button>
              </li>
              <li>
                <button
                  type="button"
                  onClick={() => handleLegalClick('contato-e-suporte')}
                  className="text-slate-300 hover:text-white transition text-left"
                >
                  Contato e Suporte
                </button>
              </li>
              <li>
                <button
                  type="button"
                  onClick={() => {
                    onOpenSupportPortal?.();
                    window.scrollTo({ top: 0, behavior: 'smooth' });
                  }}
                  className="text-slate-300 hover:text-[#FDA4AF] transition text-left"
                >
                  Relatar um Problema
                </button>
              </li>
            </ul>
          </div>

          {/* Column 3: LEGAL */}
          <div className="lg:col-span-2 space-y-3">
            <h3 className="text-xs font-display font-black uppercase tracking-wider text-[#FDA4AF]">
              LEGAL
            </h3>
            <ul className="space-y-2 text-xs">
              <li>
                <button
                  type="button"
                  onClick={() => handleLegalClick('termos-de-uso')}
                  className="text-slate-300 hover:text-white transition text-left"
                >
                  Termos de Uso
                </button>
              </li>
              <li>
                <button
                  type="button"
                  onClick={() => handleLegalClick('politica-de-privacidade')}
                  className="text-slate-300 hover:text-white transition text-left"
                >
                  Política de Privacidade
                </button>
              </li>
              <li>
                <button
                  type="button"
                  onClick={() => handleLegalClick('politica-de-cookies')}
                  className="text-slate-300 hover:text-white transition text-left"
                >
                  Política de Cookies
                </button>
              </li>
              <li>
                <button
                  type="button"
                  onClick={() => handleLegalClick('politica-de-assinaturas-e-pagamentos')}
                  className="text-slate-300 hover:text-white transition text-left"
                >
                  Política de Assinaturas e Pagamentos
                </button>
              </li>
              <li>
                <button
                  type="button"
                  onClick={() => handleLegalClick('politica-de-cancelamento-e-reembolso')}
                  className="text-slate-300 hover:text-white transition text-left"
                >
                  Política de Cancelamento e Reembolso
                </button>
              </li>
              <li>
                <button
                  type="button"
                  onClick={() => handleLegalClick('regulamento-de-sorteios-e-campanhas')}
                  className="text-slate-300 hover:text-white transition text-left"
                >
                  Regulamento de Sorteios e Campanhas
                </button>
              </li>
              <li>
                <button
                  type="button"
                  onClick={() => handleLegalClick('politica-de-exclusao-de-conta-e-dados')}
                  className="text-slate-300 hover:text-white transition text-left"
                >
                  Política de Exclusão de Conta e Dados
                </button>
              </li>
            </ul>
          </div>

          {/* Column 4: TRANSPARÊNCIA */}
          <div className="lg:col-span-2 space-y-3">
            <h3 className="text-xs font-display font-black uppercase tracking-wider text-[#FDA4AF]">
              TRANSPARÊNCIA
            </h3>
            <ul className="space-y-2 text-xs">
              <li>
                <button
                  type="button"
                  onClick={() => handleLegalClick('politica-antifraude')}
                  className="text-slate-300 hover:text-white transition text-left"
                >
                  Política Antifraude
                </button>
              </li>
              <li>
                <button
                  type="button"
                  onClick={() => handleLegalClick('aviso-de-independencia-do-tiktok')}
                  className="text-slate-300 hover:text-white transition text-left"
                >
                  Aviso de Independência do TikTok
                </button>
              </li>
              <li>
                <button
                  type="button"
                  onClick={() => handleLegalClick('aviso-legal-e-isencao-de-responsabilidade')}
                  className="text-slate-300 hover:text-white transition text-left"
                >
                  Aviso Legal e Isenção de Responsabilidade
                </button>
              </li>
              <li>
                <button
                  type="button"
                  onClick={() => handleLegalClick('politica-de-uso-aceitavel')}
                  className="text-slate-300 hover:text-white transition text-left"
                >
                  Política de Uso Aceitável
                </button>
              </li>
              <li>
                <button
                  type="button"
                  onClick={() => handleLegalClick('politica-de-seguranca')}
                  className="text-slate-300 hover:text-white transition text-left"
                >
                  Política de Segurança
                </button>
              </li>
              <li>
                <button
                  type="button"
                  onClick={() => {
                    onOpenPrivacyPortal?.();
                    window.scrollTo({ top: 0, behavior: 'smooth' });
                  }}
                  className="text-[#FDA4AF] hover:text-white font-semibold transition text-left flex items-center gap-1"
                >
                  <ShieldCheck className="w-3.5 h-3.5" />
                  <span>Minha Privacidade (LGPD)</span>
                </button>
              </li>
            </ul>
          </div>
        </div>

        {/* TikTok Independence Notice & Legal Disclaimer Box (Fase 13) */}
        <div className="p-4 rounded-2xl bg-[#050814]/90 border border-blue-900/60 text-[11px] text-slate-400 space-y-1.5 leading-relaxed">
          <p>
            <strong className="text-slate-200">Aviso de Independência do TikTok:</strong> O GIO DA SORTE PRO é uma plataforma tecnológica independente e não é afiliada, patrocinada, administrada ou endossada pelo TikTok Inc. ou ByteDance Ltd. A autenticação via TikTok Login Kit (OAuth 2.0) identifica o organizador mediante autorização explícita, enquanto a leitura de eventos públicos da transmissão ao vivo ocorre de forma separada via sala pública Webcast.
          </p>
          <p>
            <strong className="text-slate-200">Responsabilidade Promocional:</strong> O GIO DA SORTE PRO fornece infraestrutura tecnológica de contabilização e sorteio auditável SHA-256. A definição das regras da campanha, eventual autorização regulatória exigida e a entrega dos prêmios são de responsabilidade exclusiva do organizador de cada campanha.
          </p>
        </div>

        {/* Bottom Copyright & Quick Links Bar */}
        <div className="pt-4 border-t border-blue-950 flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-slate-500">
          <div className="flex items-center gap-2">
            <span>© {new Date().getFullYear()} GIO DA SORTE PRO. Todos os direitos reservados.</span>
          </div>
          <div className="flex flex-wrap items-center gap-4">
            <button
              type="button"
              onClick={() => handleLegalClick('termos-de-uso')}
              className="hover:text-[#FDA4AF] transition"
            >
              Termos de Uso
            </button>
            <button
              type="button"
              onClick={() => handleLegalClick('politica-de-privacidade')}
              className="hover:text-[#FDA4AF] transition"
            >
              Privacidade (LGPD)
            </button>
            {onOpenCookieSettings && (
              <button
                type="button"
                onClick={onOpenCookieSettings}
                className="hover:text-[#FDA4AF] transition font-semibold text-slate-300"
              >
                Configurações de Cookies
              </button>
            )}
          </div>
        </div>
      </div>
    </footer>
  );
};
