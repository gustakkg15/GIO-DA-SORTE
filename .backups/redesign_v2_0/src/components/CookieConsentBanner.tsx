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
        <div className="fixed bottom-0 inset-x-0 z-50 p-3 sm:p-4 pointer-events-none">
          <div className="max-w-5xl mx-auto p-4 sm:p-5 rounded-2xl bg-[#050814]/95 backdrop-blur-xl border border-[#E11D48]/50 shadow-2xl pointer-events-auto flex flex-col lg:flex-row items-start lg:items-center justify-between gap-4">
            <div className="flex items-start gap-3.5">
              <div className="w-10 h-10 rounded-xl bg-[#E11D48]/20 border border-[#E11D48]/40 flex items-center justify-center shrink-0 text-[#FDA4AF]">
                <Cookie className="w-5 h-5" />
              </div>
              <div className="space-y-1">
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="text-xs sm:text-sm font-display font-bold text-white">
                    Privacidade, Cookies e Transparência (LGPD)
                  </h3>
                  <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-blue-950 text-blue-300 border border-blue-800">
                    Aviso v{CURRENT_COOKIE_NOTICE_VERSION}
                  </span>
                </div>
                <p className="text-xs text-slate-300 leading-relaxed max-w-2xl">
                  Utilizamos cookies essenciais para segurança da sessão (OAuth 2.0, proteção CSRF e integridade de sorteios) e cookies opcionais para preferências, estatísticas e comunicação. Você pode aceitar todos, rejeitar os não essenciais ou personalizar sua escolha. Consulte nossa{' '}
                  {onOpenLegalDocument ? (
                    <button
                      type="button"
                      onClick={() => onOpenLegalDocument('politica-de-cookies')}
                      className="text-[#FDA4AF] underline hover:text-white font-semibold"
                    >
                      Política de Cookies
                    </button>
                  ) : (
                    <span className="text-[#FDA4AF] font-semibold">Política de Cookies</span>
                  )}{' '}
                  e{' '}
                  {onOpenLegalDocument ? (
                    <button
                      type="button"
                      onClick={() => onOpenLegalDocument('politica-de-privacidade')}
                      className="text-[#FDA4AF] underline hover:text-white font-semibold"
                    >
                      Política de Privacidade
                    </button>
                  ) : (
                    <span className="text-[#FDA4AF] font-semibold">Política de Privacidade</span>
                  )}
                  .
                </p>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2 w-full lg:w-auto shrink-0">
              <button
                type="button"
                onClick={() => setShowModal(true)}
                className="flex-1 lg:flex-initial px-3.5 py-2.5 rounded-xl bg-[#0A1128] hover:bg-blue-950 text-slate-200 border border-blue-800/80 text-xs font-semibold transition flex items-center justify-center gap-1.5"
              >
                <Sliders className="w-3.5 h-3.5 text-[#FDA4AF]" />
                <span>Personalizar preferências</span>
              </button>

              <button
                type="button"
                onClick={() => handleSave('REJECT_NON_ESSENTIAL')}
                className="flex-1 lg:flex-initial px-3.5 py-2.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-slate-200 border border-slate-700 text-xs font-semibold transition"
              >
                Rejeitar não essenciais
              </button>

              <button
                type="button"
                onClick={() => handleSave('ACCEPT_ALL')}
                className="w-full sm:w-auto px-4 py-2.5 rounded-xl bg-gradient-to-r from-[#E11D48] to-[#BE123C] hover:brightness-110 text-white text-xs font-bold shadow-lg shadow-[#E11D48]/25 transition flex items-center justify-center gap-1.5"
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
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/85 backdrop-blur-md">
          <div className="w-full max-w-xl rounded-2xl bg-[#050814] border border-[#E11D48]/50 shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
            <div className="p-5 bg-[#0A1128] border-b border-blue-900/60 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <img
                  src="/logo.png"
                  alt="GIO DA SORTE PRO"
                  className="w-9 h-9 object-contain shrink-0"
                />
                <div>
                  <h2 className="text-base font-display font-bold text-white">
                    Configurações e Preferências de Cookies
                  </h2>
                  <p className="text-[11px] text-slate-400">
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
                className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800/60"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-5 space-y-3 overflow-y-auto text-xs">
              <p className="text-slate-300 leading-relaxed">
                Gerencie abaixo o uso de cookies e armazenamento local por categoria. Os cookies essenciais permanecem sempre ativos por garantirem segurança, autenticação e prevenção à fraude nos sorteios.
              </p>

              {/* Category 1: Essenciais */}
              <div className="p-3.5 rounded-xl bg-[#0A1128]/90 border border-emerald-700/40 flex items-start justify-between gap-3">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <ShieldCheck className="w-4 h-4 text-emerald-400" />
                    <span className="font-bold text-white">1. Cookies Essenciais (Obrigatórios)</span>
                    <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-emerald-950 text-emerald-300 border border-emerald-700/50">
                      Sempre Ativos
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-400">
                    Necessários para funcionamento básico do site, sessão criptografada OAuth 2.0 (HttpOnly, Secure, SameSite=None), proteção CSRF e integridade de transações de sorteio.
                  </p>
                </div>
                <input
                  type="checkbox"
                  checked={true}
                  disabled
                  className="mt-1 w-4 h-4 accent-emerald-500 cursor-not-allowed"
                />
              </div>

              {/* Category 2: Preferências */}
              <label className="p-3.5 rounded-xl bg-[#0A1128]/70 border border-blue-900/60 hover:border-[#E11D48]/40 transition flex items-start justify-between gap-3 cursor-pointer">
                <div className="space-y-1">
                  <span className="font-bold text-white block">2. Cookies de Preferências</span>
                  <p className="text-[11px] text-slate-400">
                    Memorizam escolhas de interface, ativação de efeitos sonoros, modo de apresentação e última sessão consultada.
                  </p>
                </div>
                <input
                  type="checkbox"
                  checked={categories.preferences}
                  onChange={(e) =>
                    setCategories((prev) => ({ ...prev, preferences: e.target.checked }))
                  }
                  className="mt-1 w-4 h-4 accent-[#E11D48]"
                />
              </label>

              {/* Category 3: Estatísticas */}
              <label className="p-3.5 rounded-xl bg-[#0A1128]/70 border border-blue-900/60 hover:border-[#E11D48]/40 transition flex items-start justify-between gap-3 cursor-pointer">
                <div className="space-y-1">
                  <span className="font-bold text-white block">3. Cookies de Estatísticas e Desempenho</span>
                  <p className="text-[11px] text-slate-400">
                    Auxiliam na medição agregada de latência de eventos SSE, estabilidade da conexão e diagnóstico técnico da plataforma.
                  </p>
                </div>
                <input
                  type="checkbox"
                  checked={categories.statistics}
                  onChange={(e) =>
                    setCategories((prev) => ({ ...prev, statistics: e.target.checked }))
                  }
                  className="mt-1 w-4 h-4 accent-[#E11D48]"
                />
              </label>

              {/* Category 4: Marketing */}
              <label className="p-3.5 rounded-xl bg-[#0A1128]/70 border border-blue-900/60 hover:border-[#E11D48]/40 transition flex items-start justify-between gap-3 cursor-pointer">
                <div className="space-y-1">
                  <span className="font-bold text-white block">4. Cookies de Marketing e Comunicação</span>
                  <p className="text-[11px] text-slate-400">
                    Utilizados apenas para apresentar novidades sobre recursos do plano PRO e campanhas institucionais.
                  </p>
                </div>
                <input
                  type="checkbox"
                  checked={categories.marketing}
                  onChange={(e) =>
                    setCategories((prev) => ({ ...prev, marketing: e.target.checked }))
                  }
                  className="mt-1 w-4 h-4 accent-[#E11D48]"
                />
              </label>

              {onOpenLegalDocument && (
                <div className="pt-1 flex items-center gap-3 text-[11px]">
                  <button
                    type="button"
                    onClick={() => {
                      setShowModal(false);
                      onOpenLegalDocument('politica-de-cookies');
                    }}
                    className="text-[#FDA4AF] hover:underline flex items-center gap-1 font-semibold"
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
                    className="text-blue-300 hover:underline flex items-center gap-1 font-semibold"
                  >
                    <FileText className="w-3.5 h-3.5" />
                    <span>Ler Política de Privacidade</span>
                  </button>
                </div>
              )}
            </div>

            <div className="p-4 bg-[#0A1128] border-t border-blue-900/60 flex flex-wrap items-center justify-between gap-2">
              <button
                type="button"
                onClick={() => handleSave('REJECT_NON_ESSENTIAL')}
                className="px-3.5 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-slate-300 border border-slate-700 text-xs font-semibold transition"
              >
                Rejeitar não essenciais
              </button>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => handleSave('CUSTOM', categories)}
                  className="px-4 py-2 rounded-xl bg-blue-950 hover:bg-blue-900 text-white border border-blue-700 text-xs font-bold transition"
                >
                  Salvar Preferências Selecionadas
                </button>
                <button
                  type="button"
                  onClick={() => handleSave('ACCEPT_ALL')}
                  className="px-4 py-2 rounded-xl bg-gradient-to-r from-[#E11D48] to-[#BE123C] hover:brightness-110 text-white text-xs font-bold shadow-md transition"
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
