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
    <footer className="mt-16 border-t border-[#313D39] bg-[#171D1C] text-[#9BA8A3] print:hidden">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10 space-y-8">
        {/* Colunas Institucionais e de Navegação */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-12 gap-8">
          {/* Coluna Marca & Logo Original */}
          <div className="lg:col-span-4 space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-11 h-11 rounded-xl bg-[#222B28] border border-[#313D39] flex items-center justify-center p-1.5 shrink-0">
                <img
                  src="/logo.png"
                  alt="GIO DA SORTE PRO"
                  className="w-full h-full object-contain"
                />
              </div>
              <div>
                <div className="flex items-center gap-1.5">
                  <span className="text-base font-semibold text-[#EAE7DE] tracking-tight">
                    GIO DA SORTE
                  </span>
                  <span className="text-[10px] font-semibold tracking-wider uppercase px-1.5 py-0.5 rounded bg-[#C6A56A]/15 text-[#C6A56A] border border-[#C6A56A]/35">
                    PRO
                  </span>
                </div>
                <span className="text-xs text-[#9BA8A3] block">
                  Sorteios, Moedas & Bilhetes Auditáveis
                </span>
              </div>
            </div>

            <p className="text-xs text-[#9BA8A3] leading-relaxed">
              Plataforma profissional para contabilização automática de presentes em transmissões ao vivo, emissão de bilhetes e sorteios com verificação criptográfica SHA-256.
            </p>

            <div className="flex flex-wrap items-center gap-2 pt-1">
              <button
                type="button"
                onClick={() => {
                  onNavigateTab?.('legal');
                  window.scrollTo({ top: 0, behavior: 'smooth' });
                }}
                className="px-3 py-1.5 rounded-lg bg-[#222B28] hover:bg-[#2A3531] text-xs font-medium text-[#EAE7DE] border border-[#313D39] transition inline-flex items-center gap-1.5"
              >
                <Scale className="w-3.5 h-3.5 text-[#6EAA90]" />
                <span>Central Legal e LGPD</span>
              </button>

              {onOpenCookieSettings && (
                <button
                  type="button"
                  onClick={onOpenCookieSettings}
                  className="px-3 py-1.5 rounded-lg bg-[#222B28] hover:bg-[#2A3531] text-xs font-medium text-[#9BA8A3] hover:text-[#EAE7DE] border border-[#313D39] transition inline-flex items-center gap-1.5"
                >
                  <Cookie className="w-3.5 h-3.5 text-[#C6A56A]" />
                  <span>Preferências de Cookies</span>
                </button>
              )}
            </div>
          </div>

          {/* Coluna 1: PLATAFORMA */}
          <div className="lg:col-span-2 space-y-3">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-[#EAE7DE]">
              Plataforma
            </h3>
            <ul className="space-y-2 text-xs">
              <li>
                <button
                  type="button"
                  onClick={() => {
                    onNavigateTab?.('dashboard');
                    window.scrollTo({ top: 0, behavior: 'smooth' });
                  }}
                  className="text-[#9BA8A3] hover:text-[#EAE7DE] transition text-left"
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
                  className="text-[#9BA8A3] hover:text-[#EAE7DE] transition text-left"
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
                  className="text-[#9BA8A3] hover:text-[#6EAA90] font-medium transition text-left flex items-center gap-1.5"
                >
                  <Radio className="w-3 h-3 text-[#6EAA90]" />
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
                  className="text-[#9BA8A3] hover:text-[#EAE7DE] transition text-left flex items-center gap-1.5"
                >
                  <Crown className="w-3 h-3 text-[#C6A56A]" />
                  <span>Assinatura e Planos</span>
                </button>
              </li>
              <li>
                <button
                  type="button"
                  onClick={() => handleLegalClick('sobre-nos')}
                  className="text-[#9BA8A3] hover:text-[#EAE7DE] transition text-left"
                >
                  Sobre Nós
                </button>
              </li>
            </ul>
          </div>

          {/* Coluna 2: SUPORTE */}
          <div className="lg:col-span-2 space-y-3">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-[#EAE7DE]">
              Suporte
            </h3>
            <ul className="space-y-2 text-xs">
              <li>
                <button
                  type="button"
                  onClick={() => handleLegalClick('central-de-ajuda')}
                  className="text-[#9BA8A3] hover:text-[#EAE7DE] transition text-left"
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
                  className="text-[#9BA8A3] hover:text-[#EAE7DE] transition text-left"
                >
                  Perguntas Frequentes (FAQ)
                </button>
              </li>
              <li>
                <button
                  type="button"
                  onClick={() => handleLegalClick('contato-e-suporte')}
                  className="text-[#9BA8A3] hover:text-[#EAE7DE] transition text-left"
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
                  className="text-[#9BA8A3] hover:text-[#6EAA90] transition text-left"
                >
                  Relatar um Problema
                </button>
              </li>
            </ul>
          </div>

          {/* Coluna 3: LEGAL */}
          <div className="lg:col-span-2 space-y-3">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-[#EAE7DE]">
              Documentos Legais
            </h3>
            <ul className="space-y-2 text-xs">
              <li>
                <button
                  type="button"
                  onClick={() => handleLegalClick('termos-de-uso')}
                  className="text-[#9BA8A3] hover:text-[#EAE7DE] transition text-left"
                >
                  Termos de Uso
                </button>
              </li>
              <li>
                <button
                  type="button"
                  onClick={() => handleLegalClick('politica-de-privacidade')}
                  className="text-[#9BA8A3] hover:text-[#EAE7DE] transition text-left"
                >
                  Política de Privacidade
                </button>
              </li>
              <li>
                <button
                  type="button"
                  onClick={() => handleLegalClick('politica-de-cookies')}
                  className="text-[#9BA8A3] hover:text-[#EAE7DE] transition text-left"
                >
                  Política de Cookies
                </button>
              </li>
              <li>
                <button
                  type="button"
                  onClick={() => handleLegalClick('politica-de-assinaturas-e-pagamentos')}
                  className="text-[#9BA8A3] hover:text-[#EAE7DE] transition text-left"
                >
                  Assinaturas e Pagamentos
                </button>
              </li>
              <li>
                <button
                  type="button"
                  onClick={() => handleLegalClick('politica-de-cancelamento-e-reembolso')}
                  className="text-[#9BA8A3] hover:text-[#EAE7DE] transition text-left"
                >
                  Cancelamento e Reembolso
                </button>
              </li>
              <li>
                <button
                  type="button"
                  onClick={() => handleLegalClick('regulamento-de-sorteios-e-campanhas')}
                  className="text-[#9BA8A3] hover:text-[#EAE7DE] transition text-left"
                >
                  Regulamento de Sorteios
                </button>
              </li>
              <li>
                <button
                  type="button"
                  onClick={() => handleLegalClick('politica-de-exclusao-de-conta-e-dados')}
                  className="text-[#9BA8A3] hover:text-[#EAE7DE] transition text-left"
                >
                  Exclusão de Conta e Dados
                </button>
              </li>
            </ul>
          </div>

          {/* Coluna 4: TRANSPARÊNCIA */}
          <div className="lg:col-span-2 space-y-3">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-[#EAE7DE]">
              Transparência
            </h3>
            <ul className="space-y-2 text-xs">
              <li>
                <button
                  type="button"
                  onClick={() => handleLegalClick('politica-antifraude')}
                  className="text-[#9BA8A3] hover:text-[#EAE7DE] transition text-left"
                >
                  Política Antifraude
                </button>
              </li>
              <li>
                <button
                  type="button"
                  onClick={() => handleLegalClick('aviso-de-independencia-do-tiktok')}
                  className="text-[#9BA8A3] hover:text-[#EAE7DE] transition text-left"
                >
                  Independência do TikTok
                </button>
              </li>
              <li>
                <button
                  type="button"
                  onClick={() => handleLegalClick('aviso-legal-e-isencao-de-responsabilidade')}
                  className="text-[#9BA8A3] hover:text-[#EAE7DE] transition text-left"
                >
                  Isenção de Responsabilidade
                </button>
              </li>
              <li>
                <button
                  type="button"
                  onClick={() => handleLegalClick('politica-de-uso-aceitavel')}
                  className="text-[#9BA8A3] hover:text-[#EAE7DE] transition text-left"
                >
                  Uso Aceitável
                </button>
              </li>
              <li>
                <button
                  type="button"
                  onClick={() => handleLegalClick('politica-de-seguranca')}
                  className="text-[#9BA8A3] hover:text-[#EAE7DE] transition text-left"
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
                  className="text-[#6EAA90] hover:text-[#EAE7DE] font-medium transition text-left flex items-center gap-1"
                >
                  <ShieldCheck className="w-3.5 h-3.5" />
                  <span>Portal de Privacidade (LGPD)</span>
                </button>
              </li>
            </ul>
          </div>
        </div>

        {/* Nota de Independência e Responsabilidade */}
        <div className="p-4 rounded-xl bg-[#222B28] border border-[#313D39] text-[11px] text-[#9BA8A3] space-y-1.5 leading-relaxed">
          <p>
            <strong className="text-[#EAE7DE]">Aviso de Independência do TikTok:</strong> O GIO DA SORTE PRO é uma plataforma tecnológica independente e não é afiliada, patrocinada, administrada ou endossada pelo TikTok Inc. ou ByteDance Ltd. A autenticação via TikTok Login Kit (OAuth 2.0) identifica o organizador mediante autorização explícita, enquanto a leitura de eventos públicos da transmissão ao vivo ocorre de forma separada via sala pública Webcast.
          </p>
          <p>
            <strong className="text-[#EAE7DE]">Responsabilidade Promocional:</strong> O GIO DA SORTE PRO fornece infraestrutura tecnológica de contabilização e sorteio auditável SHA-256. A definição das regras da campanha, eventual autorização regulatória exigida e a entrega dos prêmios são de responsabilidade exclusiva do organizador.
          </p>
        </div>

        {/* Barra Inferior Fixa de Direitos e Acesso Rápido à Central Legal */}
        <div className="pt-4 border-t border-[#313D39] flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-[#9BA8A3]">
          <div className="flex items-center gap-2">
            <span>© {new Date().getFullYear()} GIO DA SORTE PRO. Todos os direitos reservados.</span>
          </div>
          <div className="flex flex-wrap items-center gap-4">
            <button
              type="button"
              onClick={() => {
                onNavigateTab?.('legal');
                window.scrollTo({ top: 0, behavior: 'smooth' });
              }}
              className="text-[#EAE7DE] hover:text-[#6EAA90] font-medium transition"
            >
              Central Legal
            </button>
            <button
              type="button"
              onClick={() => handleLegalClick('termos-de-uso')}
              className="hover:text-[#EAE7DE] transition"
            >
              Termos de Uso
            </button>
            <button
              type="button"
              onClick={() => handleLegalClick('politica-de-privacidade')}
              className="hover:text-[#EAE7DE] transition"
            >
              Privacidade (LGPD)
            </button>
            {onOpenCookieSettings && (
              <button
                type="button"
                onClick={onOpenCookieSettings}
                className="hover:text-[#EAE7DE] transition"
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
