import React from 'react';
import {
  ShieldCheck,
  Scale,
  Cookie,
  Radio,
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
    <footer className="mt-16 border-t border-[var(--gio-border-subtle)] bg-[#111B30] text-[#A5B1C5] print:hidden">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10 space-y-8">
        {/* Colunas Institucionais e de Navegação */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-12 gap-8">
          {/* Coluna Marca & Logo Original */}
          <div className="lg:col-span-4 space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-11 h-11 rounded-xl bg-[#080D18] border border-[var(--gio-border-subtle)] flex items-center justify-center p-1.5 shrink-0 shadow-[0_4px_14px_rgba(2,8,23,0.4)]">
                <img
                  src="/icon.svg"
                  alt="GIO DA SORTE"
                  className="w-full h-full object-contain"
                />
              </div>
              <div>
                <div className="flex items-center gap-1.5">
                  <span className="text-base font-bold text-[#FFFFFF] tracking-tight">
                    GIO DA SORTE
                  </span>
                </div>
                <span className="text-xs text-[#A5B1C5] block">
                  Sorteios, Moedas & Bilhetes Auditáveis
                </span>
              </div>
            </div>

            <p className="text-xs sm:text-sm text-[#A5B1C5] leading-relaxed">
              Plataforma profissional para contabilização automática de presentes em transmissões ao vivo, emissão de bilhetes e sorteios com verificação criptográfica SHA-256.
            </p>

            <div className="flex flex-wrap items-center gap-2 pt-1">
              <button
                type="button"
                onClick={() => {
                  onNavigateTab?.('legal');
                  window.scrollTo({ top: 0, behavior: 'smooth' });
                }}
                className="px-3.5 py-2 rounded-xl bg-[#080D18] hover:bg-white/[0.06] text-xs font-semibold text-[#FFFFFF] border border-[var(--gio-border-subtle)] hover:border-[var(--gio-border-active)] transition inline-flex items-center gap-1.5"
              >
                <Scale className="w-3.5 h-3.5 text-[#A6C957]" />
                <span>Central Legal e LGPD</span>
              </button>

              {onOpenCookieSettings && (
                <button
                  type="button"
                  onClick={onOpenCookieSettings}
                  className="px-3.5 py-2 rounded-xl bg-[#080D18] hover:bg-white/[0.06] text-xs font-semibold text-[#A5B1C5] hover:text-[#FFFFFF] border border-[var(--gio-border-subtle)] hover:border-[var(--gio-border-active)] transition inline-flex items-center gap-1.5"
                >
                  <Cookie className="w-3.5 h-3.5 text-[#A6C957]" />
                  <span>Preferências de Cookies</span>
                </button>
              )}
            </div>
          </div>

          {/* Coluna 1: PLATAFORMA */}
          <div className="lg:col-span-2 space-y-3">
            <h3 className="text-xs font-semibold text-[#FFFFFF]">
              Plataforma
            </h3>
            <ul className="space-y-1.5 text-xs sm:text-sm">
              <li>
                <button
                  type="button"
                  onClick={() => {
                    onNavigateTab?.('dashboard');
                    window.scrollTo({ top: 0, behavior: 'smooth' });
                  }}
                  className="min-h-[24px] py-0.5 inline-flex items-center text-[#A5B1C5] hover:text-[#FFFFFF] transition text-left"
                >
                  Painel Principal
                </button>
              </li>
              <li>
                <button
                  type="button"
                  onClick={() => {
                    onNavigateTab?.('draw');
                    window.scrollTo({ top: 0, behavior: 'smooth' });
                  }}
                  className="min-h-[24px] py-0.5 inline-flex items-center text-[#A5B1C5] hover:text-[#FFFFFF] transition text-left"
                >
                  Sorteios e Roleta
                </button>
              </li>
              <li>
                <button
                  type="button"
                  onClick={() => {
                    onNavigateTab?.('tiktok');
                    window.scrollTo({ top: 0, behavior: 'smooth' });
                  }}
                  className="min-h-[24px] py-0.5 text-[#A5B1C5] hover:text-[#A6C957] font-medium transition text-left inline-flex items-center gap-1.5"
                >
                  <Radio className="w-3.5 h-3.5 text-[#A6C957]" />
                  <span>TikTok LIVE</span>
                </button>
              </li>
              <li>
                <button
                  type="button"
                  onClick={() => {
                    onNavigateTab?.('subscription');
                    window.scrollTo({ top: 0, behavior: 'smooth' });
                  }}
                  className="min-h-[24px] py-0.5 text-[#A5B1C5] hover:text-[#FFFFFF] transition text-left inline-flex items-center gap-1.5"
                >
                  <Crown className="w-3.5 h-3.5 text-[#A6C957]" />
                  <span>Assinatura e Planos</span>
                </button>
              </li>
              <li>
                <button
                  type="button"
                  onClick={() => handleLegalClick('sobre-nos')}
                  className="min-h-[24px] py-0.5 inline-flex items-center text-[#A5B1C5] hover:text-[#FFFFFF] transition text-left"
                >
                  Sobre Nós
                </button>
              </li>
            </ul>
          </div>

          {/* Coluna 2: SUPORTE */}
          <div className="lg:col-span-2 space-y-3">
            <h3 className="text-xs font-semibold text-[#FFFFFF]">
              Suporte
            </h3>
            <ul className="space-y-1.5 text-xs">
              <li>
                <button
                  type="button"
                  onClick={() => handleLegalClick('central-de-ajuda')}
                  className="min-h-[24px] py-0.5 inline-flex items-center text-[#A5B1C5] hover:text-[#FFFFFF] transition text-left"
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
                  className="min-h-[24px] py-0.5 inline-flex items-center text-[#A5B1C5] hover:text-[#FFFFFF] transition text-left"
                >
                  Perguntas Frequentes (FAQ)
                </button>
              </li>
              <li>
                <button
                  type="button"
                  onClick={() => handleLegalClick('contato-e-suporte')}
                  className="min-h-[24px] py-0.5 inline-flex items-center text-[#A5B1C5] hover:text-[#FFFFFF] transition text-left"
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
                  className="min-h-[24px] py-0.5 inline-flex items-center text-[#A5B1C5] hover:text-[#A6C957] transition text-left"
                >
                  Relatar um Problema
                </button>
              </li>
            </ul>
          </div>

          {/* Coluna 3: LEGAL */}
          <div className="lg:col-span-2 space-y-3">
            <h3 className="text-xs font-semibold text-[#FFFFFF]">
              Documentos Legais
            </h3>
            <ul className="space-y-1.5 text-xs">
              <li>
                <button
                  type="button"
                  onClick={() => handleLegalClick('termos-de-uso')}
                  className="min-h-[24px] py-0.5 inline-flex items-center text-[#A5B1C5] hover:text-[#FFFFFF] transition text-left"
                >
                  Termos de Uso
                </button>
              </li>
              <li>
                <button
                  type="button"
                  onClick={() => handleLegalClick('politica-de-privacidade')}
                  className="min-h-[24px] py-0.5 inline-flex items-center text-[#A5B1C5] hover:text-[#FFFFFF] transition text-left"
                >
                  Política de Privacidade
                </button>
              </li>
              <li>
                <button
                  type="button"
                  onClick={() => handleLegalClick('politica-de-cookies')}
                  className="min-h-[24px] py-0.5 inline-flex items-center text-[#A5B1C5] hover:text-[#FFFFFF] transition text-left"
                >
                  Política de Cookies
                </button>
              </li>
              <li>
                <button
                  type="button"
                  onClick={() => handleLegalClick('politica-de-assinaturas-e-pagamentos')}
                  className="min-h-[24px] py-0.5 inline-flex items-center text-[#A5B1C5] hover:text-[#FFFFFF] transition text-left"
                >
                  Assinaturas e Pagamentos
                </button>
              </li>
              <li>
                <button
                  type="button"
                  onClick={() => handleLegalClick('politica-de-cancelamento-e-reembolso')}
                  className="min-h-[24px] py-0.5 inline-flex items-center text-[#A5B1C5] hover:text-[#FFFFFF] transition text-left"
                >
                  Cancelamento e Reembolso
                </button>
              </li>
              <li>
                <button
                  type="button"
                  onClick={() => handleLegalClick('regulamento-de-sorteios-e-campanhas')}
                  className="min-h-[24px] py-0.5 inline-flex items-center text-[#A5B1C5] hover:text-[#FFFFFF] transition text-left"
                >
                  Regulamento de Sorteios
                </button>
              </li>
              <li>
                <button
                  type="button"
                  onClick={() => handleLegalClick('politica-de-exclusao-de-conta-e-dados')}
                  className="min-h-[24px] py-0.5 inline-flex items-center text-[#A5B1C5] hover:text-[#FFFFFF] transition text-left"
                >
                  Exclusão de Conta e Dados
                </button>
              </li>
            </ul>
          </div>

          {/* Coluna 4: TRANSPARÊNCIA */}
          <div className="lg:col-span-2 space-y-3">
            <h3 className="text-xs font-semibold text-[#FFFFFF]">
              Transparência
            </h3>
            <ul className="space-y-1.5 text-xs">
              <li>
                <button
                  type="button"
                  onClick={() => handleLegalClick('politica-antifraude')}
                  className="min-h-[24px] py-0.5 inline-flex items-center text-[#A5B1C5] hover:text-[#FFFFFF] transition text-left"
                >
                  Política Antifraude
                </button>
              </li>
              <li>
                <button
                  type="button"
                  onClick={() => handleLegalClick('aviso-de-independencia-do-tiktok')}
                  className="min-h-[24px] py-0.5 inline-flex items-center text-[#A5B1C5] hover:text-[#FFFFFF] transition text-left"
                >
                  Independência do TikTok
                </button>
              </li>
              <li>
                <button
                  type="button"
                  onClick={() => handleLegalClick('aviso-legal-e-isencao-de-responsabilidade')}
                  className="min-h-[24px] py-0.5 inline-flex items-center text-[#A5B1C5] hover:text-[#FFFFFF] transition text-left"
                >
                  Isenção de Responsabilidade
                </button>
              </li>
              <li>
                <button
                  type="button"
                  onClick={() => handleLegalClick('politica-de-uso-aceitavel')}
                  className="min-h-[24px] py-0.5 inline-flex items-center text-[#A5B1C5] hover:text-[#FFFFFF] transition text-left"
                >
                  Uso Aceitável
                </button>
              </li>
              <li>
                <button
                  type="button"
                  onClick={() => handleLegalClick('politica-de-seguranca')}
                  className="min-h-[24px] py-0.5 inline-flex items-center text-[#A5B1C5] hover:text-[#FFFFFF] transition text-left"
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
                  className="min-h-[24px] py-0.5 text-[#A6C957] hover:text-[#FFFFFF] font-semibold transition text-left inline-flex items-center gap-1"
                >
                  <ShieldCheck className="w-3.5 h-3.5" />
                  <span>Portal de Privacidade (LGPD)</span>
                </button>
              </li>
            </ul>
          </div>
        </div>

        {/* Nota de Independência e Responsabilidade */}
        <div className="p-4 rounded-2xl bg-[#080D18] border border-[var(--gio-border-subtle)] text-[11px] text-[#A5B1C5] space-y-1.5 leading-relaxed">
          <p>
            <strong className="text-[#FFFFFF]">Aviso de Independência do TikTok:</strong> O GIO DA SORTE é uma plataforma tecnológica independente e não é afiliada, patrocinada, administrada ou endossada pelo TikTok Inc. ou ByteDance Ltd. A autenticação via TikTok Login Kit (OAuth 2.0) identifica o organizador mediante autorização explícita, enquanto a leitura de eventos públicos da transmissão ao vivo ocorre de forma separada via sala pública Webcast.
          </p>
          <p>
            <strong className="text-[#FFFFFF]">Responsabilidade Promocional:</strong> O GIO DA SORTE fornece infraestrutura tecnológica de contabilização e sorteio auditável SHA-256. A definição das regras da campanha, eventual autorização regulatória exigida e a entrega dos prêmios são de responsabilidade exclusiva do organizador.
          </p>
        </div>

        {/* Barra Inferior Fixa de Direitos e Acesso Rápido à Central Legal */}
        <div className="pt-4 border-t border-[var(--gio-border-subtle)] flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-[#A5B1C5]">
          <div className="flex items-center gap-2">
            <span>© {new Date().getFullYear()} GIO DA SORTE. Todos os direitos reservados.</span>
          </div>
          <div className="flex flex-wrap items-center gap-4 text-[#A5B1C5]">
            <button
              type="button"
              onClick={() => {
                onNavigateTab?.('legal');
                window.scrollTo({ top: 0, behavior: 'smooth' });
              }}
              className="min-h-[24px] py-0.5 inline-flex items-center text-[#FFFFFF] hover:text-[#A6C957] font-semibold transition"
            >
              Central Legal
            </button>
            <button
              type="button"
              onClick={() => handleLegalClick('termos-de-uso')}
              className="min-h-[24px] py-0.5 inline-flex items-center hover:text-[#FFFFFF] transition"
            >
              Termos de Uso
            </button>
            <button
              type="button"
              onClick={() => handleLegalClick('politica-de-privacidade')}
              className="min-h-[24px] py-0.5 inline-flex items-center hover:text-[#FFFFFF] transition"
            >
              Privacidade (LGPD)
            </button>
            {onOpenCookieSettings && (
              <button
                type="button"
                onClick={onOpenCookieSettings}
                className="min-h-[24px] py-0.5 inline-flex items-center hover:text-[#FFFFFF] transition"
              >
                Cookies
              </button>
            )}
          </div>
        </div>
      </div>
    </footer>
  );
};
