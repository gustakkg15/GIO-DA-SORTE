import React, { useState, useEffect } from 'react';
import { Cookie, ShieldCheck, Sliders, Check, X, FileText } from 'lucide-react';
import {
  getSavedCookieConsent,
  saveCookieConsentChoice,
  CURRENT_COOKIE_NOTICE_VERSION,
} from '../utils/legalAndComplianceService';
import { CookieConsentCategories, CookieConsentRecord, LegalDocumentSlug } from '../types';

interface CookieConsentBannerProps {
  userId?: string;
  forceOpenPreferences?: boolean;
  onClosePreferences?: () => void;
  onOpenLegalDocument?: (slug: LegalDocumentSlug) => void;
  onConsentSaved?: (record: CookieConsentRecord) => void;
}

export const CookieConsentBanner: React.FC<CookieConsentBannerProps> = ({
  userId = 'visitante',
  forceOpenPreferences = false,
  onClosePreferences,
  onOpenLegalDocument,
  onConsentSaved,
}) => {
  const [savedConsent, setSavedConsent] = useState<CookieConsentRecord | null>(() =>
    getSavedCookieConsent()
  );
  const [showBanner, setShowBanner] = useState<boolean>(() => !getSavedCookieConsent());
  const [showModal, setShowModal] = useState<boolean>(false);

  const [categories, setCategories] = useState<CookieConsentCategories>(() => {
    const existing = getSavedCookieConsent();
    return (
      existing?.categories || {
        essential: true,
        preferences: true,
        statistics: false,
        marketing: false,
      }
    );
  });

  useEffect(() => {
    if (forceOpenPreferences) {
      const existing = getSavedCookieConsent();
      if (existing) {
        setCategories(existing.categories);
      }
      setShowModal(true);
    }
  }, [forceOpenPreferences]);

  const handleSave = async (
    choiceType: CookieConsentRecord['choiceType'],
    customCats?: CookieConsentCategories
  ) => {
    const targetCats = customCats || categories;
    const record = await saveCookieConsentChoice(userId, choiceType, targetCats);
    setSavedConsent(record);
    setCategories(record.categories);
    setShowBanner(false);
    setShowModal(false);
    if (onClosePreferences) onClosePreferences();
    if (onConsentSaved) onConsentSaved(record);
  };

  if (!showBanner && !showModal) {
    return null;
  }

  return (
    <>
      {/* Bottom Cookie Consent Banner */}
      {showBanner && !showModal && (
        <div className="fixed bottom-0 inset-x-0 z-40 p-3 sm:p-4 pointer-events-none">
          <div className="max-w-5xl mx-auto p-4 sm:p-5 rounded-2xl bg-[#10141E]/95 backdrop-blur-xl border border-[var(--gio-border-active)] shadow-[0_20px_50px_rgba(2,8,23,0.75)] pointer-events-auto flex flex-col lg:flex-row items-start lg:items-center justify-between gap-4">
            <div className="flex items-start gap-3.5">
              <div className="w-10 h-10 rounded-xl bg-[#0131CD]/15 border border-[#0131CD]/35 flex items-center justify-center shrink-0 text-[#FFFFFF]">
                <Cookie className="w-5 h-5" />
              </div>
              <div className="space-y-1">
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="text-xs sm:text-sm font-display font-bold text-[#FFFFFF]">
                    Privacidade, Cookies e Transparência (LGPD)
                  </h3>
                  <span className="text-[10px] font-mono px-2 py-0.5 rounded-md bg-[#080A0F] text-[#B9FC01] border border-[var(--gio-border-subtle)]">
                    Aviso v{CURRENT_COOKIE_NOTICE_VERSION}
                  </span>
                </div>
                <p className="text-xs text-[#94A3B8] leading-relaxed max-w-2xl">
                  Utilizamos cookies essenciais para segurança da sessão (OAuth 2.0, proteção CSRF e integridade de sorteios) e cookies opcionais para preferências, estatísticas e comunicação. Você pode aceitar todos, rejeitar os não essenciais ou personalizar sua escolha. Consulte nossa{' '}
                  {onOpenLegalDocument ? (
                    <button
                      type="button"
                      onClick={() => onOpenLegalDocument('politica-de-cookies')}
                      className="text-[#B9FC01] underline hover:text-[#FFFFFF] font-semibold"
                    >
                      Política de Cookies
                    </button>
                  ) : (
                    <span className="text-[#B9FC01] font-semibold">Política de Cookies</span>
                  )}{' '}
                  e{' '}
                  {onOpenLegalDocument ? (
                    <button
                      type="button"
                      onClick={() => onOpenLegalDocument('politica-de-privacidade')}
                      className="text-[#B9FC01] underline hover:text-[#FFFFFF] font-semibold"
                    >
                      Política de Privacidade
                    </button>
                  ) : (
                    <span className="text-[#B9FC01] font-semibold">Política de Privacidade</span>
                  )}
                  .
                </p>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2 w-full lg:w-auto shrink-0">
              <button
                type="button"
                onClick={() => setShowModal(true)}
                className="flex-1 lg:flex-initial px-3.5 py-2.5 rounded-xl bg-[#161C2C] hover:bg-[#0131CD]/25 text-[#FFFFFF] border border-[var(--gio-border-subtle)] hover:border-[var(--gio-border-active)] text-xs font-semibold transition flex items-center justify-center gap-1.5"
              >
                <Sliders className="w-3.5 h-3.5 text-[#B9FC01]" />
                <span>Personalizar preferências</span>
              </button>

              <button
                type="button"
                onClick={() => handleSave('REJECT_NON_ESSENTIAL')}
                className="flex-1 lg:flex-initial px-3.5 py-2.5 rounded-xl bg-[#080A0F] hover:bg-[#10141E] text-[#94A3B8] hover:text-[#FFFFFF] border border-[var(--gio-border-subtle)] text-xs font-semibold transition"
              >
                Rejeitar não essenciais
              </button>

              <button
                type="button"
                onClick={() => handleSave('ACCEPT_ALL')}
                className="w-full sm:w-auto px-4 py-2.5 rounded-xl bg-gradient-to-r from-[#0131CD] to-[#0131CD] hover:brightness-110 text-white text-xs font-bold shadow-[0_6px_20px_rgba(1, 49, 205,0.35)] transition flex items-center justify-center gap-1.5"
              >
                <Check className="w-3.5 h-3.5" />
                <span>Aceitar todos</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Detailed Cookie Preferences Modal */}
      {showModal && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Configurações e Preferências de Cookies"
          className="fixed inset-0 z-[70] flex items-center justify-center p-4 bg-[#080A0F]/85 backdrop-blur-md"
        >
          <div className="w-full max-w-xl rounded-2xl bg-[#10141E] border border-[var(--gio-border-active)] shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
            <div className="p-5 bg-[#10141E] border-b border-[var(--gio-border-subtle)] flex items-center justify-between">
              <div className="flex items-center gap-3">
                <img
                  src="/icon.svg"
                  alt="GIO DA SORTE"
                  className="w-9 h-9 object-contain shrink-0"
                />
                <div>
                  <h2 className="text-base font-display font-bold text-[#FFFFFF]">
                    Configurações e Preferências de Cookies
                  </h2>
                  <p className="text-[11px] text-[#94A3B8]">
                    Versão do Aviso: {CURRENT_COOKIE_NOTICE_VERSION}{' '}
                    {savedConsent
                      ? `• Última decisão em ${new Date(savedConsent.decidedAt).toLocaleString('pt-BR')}`
                      : ''}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => {
                  setShowModal(false);
                  if (onClosePreferences) onClosePreferences();
                }}
                className="p-1.5 rounded-lg text-[#94A3B8] hover:text-[#FFFFFF] hover:bg-[#161C2C] transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-5 space-y-3 overflow-y-auto text-xs">
              <p className="text-[#94A3B8] leading-relaxed">
                Gerencie abaixo o uso de cookies e armazenamento local por categoria. Os cookies essenciais permanecem sempre ativos por garantirem segurança, autenticação e prevenção à fraude nos sorteios.
              </p>

              {/* Category 1: Essenciais */}
              <div className="p-3.5 rounded-xl bg-[#080A0F] border border-[#20C997]/40 flex items-start justify-between gap-3">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <ShieldCheck className="w-4 h-4 text-[#20C997]" />
                    <span className="font-bold text-[#FFFFFF]">1. Cookies Essenciais (Obrigatórios)</span>
                    <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-[#20C997]/15 text-[#20C997] border border-[#20C997]/40">
                      Sempre Ativos
                    </span>
                  </div>
                  <p className="text-[11px] text-[#94A3B8]">
                    Necessários para funcionamento básico do site, sessão criptografada OAuth 2.0 (HttpOnly, Secure, SameSite=None), proteção CSRF e integridade de transações de sorteio.
                  </p>
                </div>
                <input
                  type="checkbox"
                  checked={true}
                  disabled
                  className="mt-1 w-4 h-4 accent-[#20C997] cursor-not-allowed"
                />
              </div>

              {/* Category 2: Preferências */}
              <label className="p-3.5 rounded-xl bg-[#080A0F] hover:bg-[#161C2C]/60 border border-[var(--gio-border-subtle)] hover:border-[var(--gio-border-active)] transition flex items-start justify-between gap-3 cursor-pointer">
                <div className="space-y-1">
                  <span className="font-bold text-[#FFFFFF] block">2. Cookies de Preferências</span>
                  <p className="text-[11px] text-[#94A3B8]">
                    Memorizam escolhas de interface, ativação de efeitos sonoros, modo de apresentação e última sessão consultada.
                  </p>
                </div>
                <input
                  type="checkbox"
                  checked={categories.preferences}
                  onChange={(e) =>
                    setCategories((prev) => ({ ...prev, preferences: e.target.checked }))
                  }
                  className="mt-1 w-4 h-4 accent-[#0131CD]"
                />
              </label>

              {/* Category 3: Estatísticas */}
              <label className="p-3.5 rounded-xl bg-[#080A0F] hover:bg-[#161C2C]/60 border border-[var(--gio-border-subtle)] hover:border-[var(--gio-border-active)] transition flex items-start justify-between gap-3 cursor-pointer">
                <div className="space-y-1">
                  <span className="font-bold text-[#FFFFFF] block">3. Cookies de Estatísticas e Desempenho</span>
                  <p className="text-[11px] text-[#94A3B8]">
                    Auxiliam na medição agregada de latência de eventos SSE, estabilidade da conexão e diagnóstico técnico da plataforma.
                  </p>
                </div>
                <input
                  type="checkbox"
                  checked={categories.statistics}
                  onChange={(e) =>
                    setCategories((prev) => ({ ...prev, statistics: e.target.checked }))
                  }
                  className="mt-1 w-4 h-4 accent-[#0131CD]"
                />
              </label>

              {/* Category 4: Marketing */}
              <label className="p-3.5 rounded-xl bg-[#080A0F] hover:bg-[#161C2C]/60 border border-[var(--gio-border-subtle)] hover:border-[var(--gio-border-active)] transition flex items-start justify-between gap-3 cursor-pointer">
                <div className="space-y-1">
                  <span className="font-bold text-[#FFFFFF] block">4. Cookies de Marketing e Comunicação</span>
                  <p className="text-[11px] text-[#94A3B8]">
                    Utilizados apenas para apresentar novidades sobre recursos do plano PRO e campanhas institucionais.
                  </p>
                </div>
                <input
                  type="checkbox"
                  checked={categories.marketing}
                  onChange={(e) =>
                    setCategories((prev) => ({ ...prev, marketing: e.target.checked }))
                  }
                  className="mt-1 w-4 h-4 accent-[#0131CD]"
                />
              </label>

              {onOpenLegalDocument && (
                <div className="pt-1 flex flex-wrap items-center gap-4 text-[11px]">
                  <button
                    type="button"
                    onClick={() => {
                      setShowModal(false);
                      onOpenLegalDocument('politica-de-cookies');
                    }}
                    className="text-[#B9FC01] hover:underline flex items-center gap-1 font-semibold"
                  >
                    <FileText className="w-3.5 h-3.5" />
                    <span>Ler Política de Cookies Completa</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setShowModal(false);
                      onOpenLegalDocument('politica-de-privacidade');
                    }}
                    className="text-[#B9FC01] hover:underline flex items-center gap-1 font-semibold"
                  >
                    <FileText className="w-3.5 h-3.5" />
                    <span>Ler Política de Privacidade</span>
                  </button>
                </div>
              )}
            </div>

            <div className="p-4 bg-[#10141E] border-t border-[var(--gio-border-subtle)] flex flex-wrap items-center justify-between gap-2">
              <button
                type="button"
                onClick={() => handleSave('REJECT_NON_ESSENTIAL')}
                className="px-3.5 py-2 rounded-xl bg-[#080A0F] hover:bg-[#161C2C] text-[#94A3B8] hover:text-[#FFFFFF] border border-[var(--gio-border-subtle)] text-xs font-semibold transition"
              >
                Rejeitar não essenciais
              </button>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => handleSave('CUSTOM', categories)}
                  className="px-4 py-2 rounded-xl bg-[#161C2C] hover:bg-[#161C2C] text-[#FFFFFF] border border-[#0131CD]/45 text-xs font-bold transition"
                >
                  Salvar Preferências Selecionadas
                </button>
                <button
                  type="button"
                  onClick={() => handleSave('ACCEPT_ALL')}
                  className="px-4 py-2 rounded-xl bg-gradient-to-r from-[#0131CD] to-[#0131CD] hover:brightness-110 text-white text-xs font-bold shadow-[0_6px_18px_rgba(1, 49, 205,0.32)] transition"
                >
                  Aceitar todos
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
};
