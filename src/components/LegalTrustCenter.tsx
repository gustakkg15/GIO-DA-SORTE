import React, { useState, useEffect, useMemo } from 'react';
import {
  Scale,
  ShieldCheck,
  FileText,
  Printer,
  Clock,
  CheckCircle2,
  AlertTriangle,
  HelpCircle,
  MessageSquare,
  Lock,
  Building2,
  CreditCard,
  History,
  Cookie,
  BookOpen,
  ChevronRight,
  Send,
  Edit3,
  Eye,
  Save,
  UploadCloud,
  UserCheck,
  ExternalLink,
  Search,
} from 'lucide-react';
import {
  LegalDocument,
  LegalDocumentSlug,
  LegalDocumentVersion,
  DocumentAcceptanceRecord,
  CookieConsentRecord,
  LgpdRequestRecord,
  LgpdRequestType,
  LgpdRequestStatus,
  SupportTicketRecord,
  SupportTicketCategory,
  SupportTicketStatus,
  CompanyLegalSettings,
  CommercialSubscriptionConfig,
} from '../types';
import {
  fetchAllLegalDocuments,
  saveLegalDocumentDraft,
  publishLegalDocumentVersion,
  fetchDocumentVersionHistory,
  recordDocumentAcceptance,
  fetchAllDocumentAcceptances,
  fetchAllCookieConsentLogs,
  createLgpdRequest,
  fetchLgpdRequests,
  updateLgpdRequestStatusAdmin,
  createSupportTicket,
  fetchSupportTickets,
  updateSupportTicketAdmin,
  fetchCompanyLegalSettings,
  saveCompanyLegalSettings,
  getPendingCompanyFields,
  fetchCommercialSubscriptionConfig,
  saveCommercialSubscriptionConfig,
  HELP_FAQ_ITEMS,
} from '../utils/legalAndComplianceService';
import { getAuthBearerHeaders } from '../utils/tiktokLiveService';

interface LegalTrustCenterProps {
  initialSlug?: LegalDocumentSlug;
  initialPortalTab?: 'documents' | 'privacy_lgpd' | 'help_support' | 'admin_legal';
  userId?: string;
  userEmail?: string;
  userName?: string;
  isAdminAuthorized?: boolean;
  onOpenCookieSettings?: () => void;
}

const DOCUMENT_ORDER: LegalDocumentSlug[] = [
  'sobre-nos',
  'termos-de-uso',
  'politica-de-privacidade',
  'politica-de-cookies',
  'politica-de-assinaturas-e-pagamentos',
  'politica-de-cancelamento-e-reembolso',
  'regulamento-de-sorteios-e-campanhas',
  'politica-antifraude',
  'politica-de-exclusao-de-conta-e-dados',
  'aviso-de-independencia-do-tiktok',
  'aviso-legal-e-isencao-de-responsabilidade',
  'politica-de-uso-aceitavel',
  'politica-de-seguranca',
  'central-de-ajuda',
  'contato-e-suporte',
];

export const LegalTrustCenter: React.FC<LegalTrustCenterProps> = ({
  initialSlug = 'termos-de-uso',
  initialPortalTab = 'documents',
  userId = 'visitante',
  userEmail = '',
  userName = '',
  isAdminAuthorized = false,
  onOpenCookieSettings,
}) => {
  const [portalTab, setPortalTab] = useState<'documents' | 'privacy_lgpd' | 'help_support' | 'admin_legal'>(
    initialPortalTab
  );
  const [selectedSlug, setSelectedSlug] = useState<LegalDocumentSlug>(initialSlug);
  const [documents, setDocuments] = useState<LegalDocument[]>([]);
  const [versionHistory, setVersionHistory] = useState<LegalDocumentVersion[]>([]);
  const [acceptances, setAcceptances] = useState<DocumentAcceptanceRecord[]>([]);
  const [cookieLogs, setCookieLogs] = useState<CookieConsentRecord[]>([]);
  const [lgpdRequests, setLgpdRequests] = useState<LgpdRequestRecord[]>([]);
  const [supportTickets, setSupportTickets] = useState<SupportTicketRecord[]>([]);
  const [companySettings, setCompanySettings] = useState<CompanyLegalSettings | null>(null);
  const [commercialConfig, setCommercialConfig] = useState<CommercialSubscriptionConfig | null>(null);
  const [feedbackBanner, setFeedbackBanner] = useState<{
    type: 'success' | 'warning' | 'error';
    text: string;
  } | null>(null);

  // LGPD Form State
  const [lgpdName, setLgpdName] = useState(userName || '');
  const [lgpdEmail, setLgpdEmail] = useState(userEmail || '');
  const [lgpdType, setLgpdType] = useState<LgpdRequestType>('ACESSO_DADOS');
  const [lgpdDescription, setLgpdDescription] = useState('');
  const [isSubmittingLgpd, setIsSubmittingLgpd] = useState(false);

  // Support Ticket Form State
  const [supName, setSupName] = useState(userName || '');
  const [supEmail, setSupEmail] = useState(userEmail || '');
  const [supCategory, setSupCategory] = useState<SupportTicketCategory>('INTEGRACAO_TIKTOK');
  const [supSubject, setSupSubject] = useState('');
  const [supMessage, setSupMessage] = useState('');
  const [faqQuery, setFaqQuery] = useState('');
  const [isSubmittingSupport, setIsSubmittingSupport] = useState(false);

  // Admin Legal Sub-tab State
  const [adminSubTab, setAdminSubTab] = useState<
    'editor' | 'company' | 'commercial' | 'lgpd_admin' | 'support_admin' | 'consents_log'
  >('editor');
  const [editSlug, setEditSlug] = useState<LegalDocumentSlug>('termos-de-uso');
  const [editVersion, setEditVersion] = useState('1.1.0');
  const [editSummary, setEditSummary] = useState('');
  const [editMandatory, setEditMandatory] = useState(true);
  const [editEffectiveDate, setEditEffectiveDate] = useState(() =>
    new Date().toISOString().slice(0, 10)
  );
  const [editSections, setEditSections] = useState<{ id: string; title: string; content: string }[]>([]);
  const [previewMode, setPreviewMode] = useState(false);
  const [compareVersionId, setCompareVersionId] = useState<string>('');

  // Admin LGPD & Support response inputs
  const [adminLgpdReplyMap, setAdminLgpdReplyMap] = useState<Record<string, string>>({});
  const [adminLgpdStatusMap, setAdminLgpdStatusMap] = useState<Record<string, LgpdRequestStatus>>({});
  const [adminSupportReplyMap, setAdminSupportReplyMap] = useState<Record<string, string>>({});
  const [adminSupportStatusMap, setAdminSupportStatusMap] = useState<Record<string, SupportTicketStatus>>({});

  useEffect(() => {
    if (initialSlug) {
      setSelectedSlug(initialSlug);
      if (initialSlug === 'central-de-ajuda' || initialSlug === 'contato-e-suporte') {
        // Keep documents view accessible, or user can switch to interactive support tab
      }
    }
  }, [initialSlug]);

  useEffect(() => {
    setPortalTab(initialPortalTab);
  }, [initialPortalTab]);

  const loadAllComplianceData = async () => {
    const [docs, vers, accs, cLogs, lgpds, sups, comp, comm] = await Promise.all([
      fetchAllLegalDocuments(),
      fetchDocumentVersionHistory(),
      fetchAllDocumentAcceptances(),
      fetchAllCookieConsentLogs(),
      fetchLgpdRequests(),
      fetchSupportTickets(),
      fetchCompanyLegalSettings(),
      fetchCommercialSubscriptionConfig(),
    ]);
    setDocuments(docs);
    setVersionHistory(vers);
    setAcceptances(accs);
    setCookieLogs(cLogs);
    setLgpdRequests(lgpds);
    setSupportTickets(sups);
    setCompanySettings(comp);
    setCommercialConfig(comm);
  };

  useEffect(() => {
    loadAllComplianceData();
  }, []);

  // Sync admin editor fields when editSlug or documents change
  useEffect(() => {
    const target = documents.find((d) => d.slug === editSlug);
    if (target) {
      const source = target.draftContent || target;
      setEditVersion(source.version);
      setEditSummary(source.summary);
      setEditMandatory(target.isMandatoryAcceptance);
      setEditSections(source.sections.map((s) => ({ ...s })));
    }
  }, [editSlug, documents]);

  const orderedDocuments = useMemo(() => {
    const map = new Map(documents.map((d) => [d.slug, d]));
    return DOCUMENT_ORDER.map((slug) => map.get(slug)).filter(Boolean) as LegalDocument[];
  }, [documents]);

  const activeDocument = useMemo(() => {
    return (
      orderedDocuments.find((d) => d.slug === selectedSlug) ||
      orderedDocuments[0] ||
      null
    );
  }, [orderedDocuments, selectedSlug]);

  const pendingCompanyFields = useMemo(() => {
    if (!companySettings) return [];
    return getPendingCompanyFields(companySettings);
  }, [companySettings]);

  const userHasAcceptedActiveDoc = useMemo(() => {
    if (!activeDocument) return false;
    return acceptances.some(
      (a) =>
        a.documentId === activeDocument.slug &&
        a.version === activeDocument.version &&
        (a.userId === userId || (userEmail && a.userEmail === userEmail))
    );
  }, [acceptances, activeDocument, userId, userEmail]);

  const handleAcceptActiveDocument = async () => {
    if (!activeDocument) return;
    await recordDocumentAcceptance({
      userId,
      userEmail,
      documentId: activeDocument.slug,
      version: activeDocument.version,
      context: 'PAINEL_LEGAL',
    });
    const updated = await fetchAllDocumentAcceptances();
    setAcceptances(updated);
    setFeedbackBanner({
      type: 'success',
      text: `Aceite registrado com sucesso para "${activeDocument.title}" (versão ${activeDocument.version})!`,
    });
  };

  const handleSubmitLgpdRequest = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!lgpdName.trim() || !lgpdEmail.trim() || !lgpdDescription.trim()) {
      setFeedbackBanner({
        type: 'warning',
        text: 'Preencha seu nome, e-mail de contato e a descrição detalhada da solicitação LGPD.',
      });
      return;
    }
    setIsSubmittingLgpd(true);
    try {
      const created = await createLgpdRequest({
        userId,
        requesterName: lgpdName,
        requesterEmail: lgpdEmail,
        requestType: lgpdType,
        description: lgpdDescription,
      });
      setLgpdDescription('');
      await loadAllComplianceData();
      setFeedbackBanner({
        type: 'success',
        text: `Solicitação LGPD registrada com sucesso! Protocolo de acompanhamento: ${created.protocol}`,
      });
    } finally {
      setIsSubmittingLgpd(false);
    }
  };

  const handleSubmitSupportTicket = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!supName.trim() || !supEmail.trim() || !supSubject.trim() || !supMessage.trim()) {
      setFeedbackBanner({
        type: 'warning',
        text: 'Preencha todos os campos do chamado de suporte para gerar seu protocolo.',
      });
      return;
    }
    setIsSubmittingSupport(true);
    try {
      const created = await createSupportTicket({
        userId,
        name: supName,
        email: supEmail,
        category: supCategory,
        subject: supSubject,
        message: supMessage,
      });
      setSupSubject('');
      setSupMessage('');
      await loadAllComplianceData();
      setFeedbackBanner({
        type: 'success',
        text: `Chamado registrado com sucesso! Seu número de protocolo é: ${created.protocol}`,
      });
    } finally {
      setIsSubmittingSupport(false);
    }
  };

  const handleSaveDraftAdmin = async () => {
    await saveLegalDocumentDraft(editSlug, editVersion, editSummary, editSections);
    await loadAllComplianceData();
    setFeedbackBanner({
      type: 'success',
      text: `Rascunho salvo para "${editSlug}" (versão proposta: ${editVersion}).`,
    });
  };

  const handlePublishNewVersionAdmin = async () => {
    const effTs = editEffectiveDate ? new Date(editEffectiveDate).getTime() : Date.now();
    await publishLegalDocumentVersion(
      editSlug,
      editVersion,
      editSummary,
      editSections,
      effTs,
      editMandatory,
      userEmail || 'admin'
    );
    await loadAllComplianceData();
    setFeedbackBanner({
      type: 'success',
      text: `Nova versão imutável (${editVersion}) publicada com sucesso para "${editSlug}"! A versão anterior foi arquivada no histórico.`,
    });
  };

  const handleSaveCompanySettingsAdmin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!companySettings) return;
    await saveCompanyLegalSettings(companySettings, userEmail || 'admin');
    await loadAllComplianceData();
    setFeedbackBanner({
      type: 'success',
      text: 'Dados empresariais e de identificação do organizador atualizados no banco de dados!',
    });
  };

  const handleSaveCommercialConfigAdmin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!commercialConfig) return;
    await saveCommercialSubscriptionConfig(commercialConfig);
    await loadAllComplianceData();
    setFeedbackBanner({
      type: 'success',
      text: 'Configurações comerciais de assinatura e pagamento salvas com sucesso!',
    });
  };

  const filteredFaqs = useMemo(() => {
    const q = faqQuery.trim().toLowerCase();
    if (!q) return HELP_FAQ_ITEMS;
    return HELP_FAQ_ITEMS.filter(
      (item) =>
        item.question.toLowerCase().includes(q) ||
        item.answer.toLowerCase().includes(q) ||
        item.category.toLowerCase().includes(q)
    );
  }, [faqQuery]);

  return (
    <div className="space-y-6 min-w-0 animate-fade-in">
      {/* Official Header Banner with Clean Vector Emblem */}
      <div className="p-6 sm:p-7 rounded-2xl bg-[#081226] border border-white/[0.08] shadow-xl flex flex-col lg:flex-row lg:items-center justify-between gap-5">
        <div className="flex items-center gap-4">
          <img
            src="/icon.svg"
            alt="GIO DA SORTE"
            className="w-14 h-14 object-contain shrink-0 drop-shadow-[0_0_12px_rgba(0,169,255,0.35)]"
          />
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-[10px] font-mono font-bold uppercase tracking-widest px-2.5 py-0.5 rounded bg-[#0866F5]/20 text-[#35B9F5] border border-[#0866F5]/40">
                Acesso Público • Transparência & Conformidade
              </span>
              <span className="text-[10px] font-mono text-[#20C997] bg-[#20C997]/15 border border-[#20C997]/40 px-2 py-0.5 rounded">
                15 Documentos Institucionais Ativos
              </span>
            </div>
            <h1 className="text-lg sm:text-2xl font-display font-black text-[#F8FAFC] mt-1">
              Central Legal, Privacidade (LGPD) e Confiança — GIO DA SORTE
            </h1>
            <p className="text-xs text-[#94A3B8] mt-0.5">
              Consulte nossos termos, regulamentos de sorteios, política de privacidade, aviso de independência do TikTok, suporte com protocolo e portal do titular de dados.
            </p>
          </div>
        </div>

        {/* Top Portal Mode Tabs */}
        <div className="flex flex-wrap items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={() => setPortalTab('documents')}
            className={`px-3.5 py-2.5 rounded-xl text-xs font-bold transition flex items-center gap-2 cursor-pointer ${
              portalTab === 'documents'
                ? 'gio-btn-primary shadow-xs'
                : 'bg-[#101F3D] text-[#94A3B8] hover:text-[#F8FAFC] border border-white/[0.08]'
            }`}
          >
            <Scale className="w-4 h-4" />
            <span>Documentos & Políticas (15)</span>
          </button>

          <button
            type="button"
            onClick={() => setPortalTab('privacy_lgpd')}
            className={`px-3.5 py-2.5 rounded-xl text-xs font-bold transition flex items-center gap-2 cursor-pointer ${
              portalTab === 'privacy_lgpd'
                ? 'gio-btn-primary shadow-xs'
                : 'bg-[#101F3D] text-[#94A3B8] hover:text-[#F8FAFC] border border-white/[0.08]'
            }`}
          >
            <ShieldCheck className="w-4 h-4" />
            <span>Minha Privacidade (LGPD)</span>
          </button>

          <button
            type="button"
            onClick={() => setPortalTab('help_support')}
            className={`px-3.5 py-2.5 rounded-xl text-xs font-bold transition flex items-center gap-2 cursor-pointer ${
              portalTab === 'help_support'
                ? 'gio-btn-primary shadow-xs'
                : 'bg-[#101F3D] text-[#94A3B8] hover:text-[#F8FAFC] border border-white/[0.08]'
            }`}
          >
            <HelpCircle className="w-4 h-4" />
            <span>Ajuda, FAQ & Suporte</span>
          </button>

          {isAdminAuthorized && (
            <button
              type="button"
              onClick={() => setPortalTab('admin_legal')}
              className={`px-3.5 py-2.5 rounded-xl text-xs font-bold transition flex items-center gap-2 cursor-pointer ${
                portalTab === 'admin_legal'
                  ? 'bg-gradient-to-r from-[#F5B942] to-[#E5A932] text-[#050D20] shadow-md'
                  : 'bg-[#101F3D] text-[#F5B942] hover:text-[#F8FAFC] border border-[#F5B942]/40'
              }`}
            >
              <Lock className="w-4 h-4" />
              <span>ADMINISTRAÇÃO JURÍDICA</span>
            </button>
          )}
        </div>
      </div>

      {/* Feedback Notice */}
      {feedbackBanner && (
        <div
          className={`p-3.5 rounded-xl border text-xs flex items-center justify-between gap-3 ${
            feedbackBanner.type === 'success'
              ? 'bg-[#20C997]/15 border-[#20C997]/50 text-[#F8FAFC]'
              : feedbackBanner.type === 'warning'
              ? 'bg-[#F5B942]/15 border-[#F5B942]/50 text-[#F8FAFC]'
              : 'bg-[#F05262]/15 border-[#F05262]/50 text-[#F8FAFC]'
          }`}
        >
          <span>{feedbackBanner.text}</span>
          <button
            type="button"
            onClick={() => setFeedbackBanner(null)}
            className="text-[#94A3B8] hover:text-[#F8FAFC] px-2 py-0.5 cursor-pointer"
          >
            ✕
          </button>
        </div>
      )}

      {/* =========================================================
          PORTAL TAB 1: 15 PUBLIC LEGAL & INSTITUTIONAL DOCUMENTS
         ========================================================= */}
      {portalTab === 'documents' && activeDocument && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          {/* Mobile Document Selector & Table of Contents */}
          <div className="lg:hidden space-y-3 p-4 rounded-2xl bg-[#101F3D] border border-[#182943]">
            <label className="block text-[11px] font-bold uppercase tracking-wider text-[#35B9F5]">
              Selecionar Documento Institucional (15 páginas públicas):
            </label>
            <select
              value={selectedSlug}
              onChange={(e) => setSelectedSlug(e.target.value as LegalDocumentSlug)}
              className="w-full px-3 py-2.5 rounded-xl bg-[#050D20] border border-[#182943] text-xs font-bold text-[#F8FAFC]"
            >
              {orderedDocuments.map((docItem, idx) => (
                <option key={docItem.slug} value={docItem.slug}>
                  {idx + 1}. {docItem.title} (v{docItem.version})
                </option>
              ))}
            </select>

            <div className="pt-2 border-t border-[#182943]">
              <span className="block text-[10px] font-bold uppercase tracking-wider text-[#94A3B8] mb-1.5">
                Índice Rápido desta Página:
              </span>
              <div className="flex flex-wrap gap-1.5">
                {activeDocument.sections.map((sec) => (
                  <a
                    key={sec.id}
                    href={`#sec-${sec.id}`}
                    className="text-[11px] px-2.5 py-1 rounded-lg bg-[#050D20] text-[#35B9F5] border border-[#182943] hover:border-[#00A9FF]"
                  >
                    {sec.title}
                  </a>
                ))}
              </div>
            </div>
          </div>

          {/* Desktop Left Sidebar: 15 Pages Navigation + Section TOC */}
          <aside className="hidden lg:block lg:col-span-4 space-y-4 sticky top-20">
            <div className="p-4 rounded-2xl gio-card space-y-2">
              <div className="flex items-center justify-between pb-2 border-b border-white/[0.08]">
                <span className="text-xs font-bold uppercase tracking-wider text-[#35B9F5]">
                  15 Páginas Institucionais
                </span>
                <span className="text-[10px] font-mono text-[#94A3B8]">Público</span>
              </div>
              <div className="space-y-1 max-h-[440px] overflow-y-auto pr-1">
                {orderedDocuments.map((docItem, idx) => {
                  const isSelected = docItem.slug === selectedSlug;
                  return (
                    <button
                      key={docItem.slug}
                      type="button"
                      onClick={() => setSelectedSlug(docItem.slug)}
                      className={`w-full text-left px-3 py-2 rounded-xl text-xs transition flex items-center justify-between gap-2 cursor-pointer ${
                        isSelected
                          ? 'bg-[#0866F5] text-white font-bold shadow-xs'
                          : 'text-[#94A3B8] hover:text-[#F8FAFC] hover:bg-white/[0.05]'
                      }`}
                    >
                      <span className="truncate">
                        {idx + 1}. {docItem.title}
                      </span>
                      <span className="text-[10px] font-mono opacity-75 shrink-0">
                        v{docItem.version}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Desktop Section Anchor Index */}
            <div className="p-4 rounded-2xl gio-card space-y-2">
              <span className="text-xs font-bold uppercase tracking-wider text-[#35B9F5] block">
                Sumário da Página Atual
              </span>
              <div className="space-y-1.5 text-xs">
                {activeDocument.sections.map((sec) => (
                  <a
                    key={sec.id}
                    href={`#sec-${sec.id}`}
                    className="block px-2.5 py-1.5 rounded-lg text-[#94A3B8] hover:text-[#35B9F5] hover:bg-white/[0.05] transition"
                  >
                    {sec.title}
                  </a>
                ))}
              </div>
            </div>
          </aside>

          {/* Main Document Content Reader */}
          <article className="lg:col-span-8 p-6 sm:p-8 rounded-2xl gio-card space-y-6">
            {/* Document Metadata Header */}
            <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4 border-b border-white/[0.08] pb-5">
              <div className="space-y-1.5">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-[10px] font-mono font-bold uppercase px-2.5 py-0.5 rounded bg-[#0866F5]/20 text-[#35B9F5] border border-[#0866F5]/40">
                    Categoria: {activeDocument.category}
                  </span>
                  <span className="text-[10px] font-mono px-2.5 py-0.5 rounded bg-[#081226] text-[#35B9F5] border border-white/[0.08]">
                    Versão {activeDocument.version}
                  </span>
                  {activeDocument.isMandatoryAcceptance && (
                    <span className="text-[10px] font-mono px-2.5 py-0.5 rounded bg-[#F5B942]/15 text-[#F5B942] border border-[#F5B942]/40">
                      Aceite Obrigatório
                    </span>
                  )}
                </div>
                <h2 className="text-xl sm:text-2xl font-display font-black text-[#F8FAFC]">
                  {activeDocument.title}
                </h2>
                <p className="text-xs sm:text-sm text-[#94A3B8]">{activeDocument.subtitle}</p>
                <div className="flex flex-wrap items-center gap-4 pt-1 text-[11px] font-mono text-[#64748B]">
                  <span>
                    Publicado em: {new Date(activeDocument.publishedAt).toLocaleDateString('pt-BR')}
                  </span>
                  <span>
                    Última atualização: {new Date(activeDocument.updatedAt).toLocaleDateString('pt-BR')}
                  </span>
                  <span>
                    Vigência: {new Date(activeDocument.effectiveAt).toLocaleDateString('pt-BR')}
                  </span>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2 shrink-0">
                <button
                  type="button"
                  onClick={() => window.print()}
                  className="px-3 py-2 rounded-xl bg-[#0B1730] hover:bg-[#182943] text-[#F8FAFC] border border-[#182943] text-xs font-semibold transition flex items-center gap-1.5 cursor-pointer"
                >
                  <Printer className="w-3.5 h-3.5 text-[#35B9F5]" />
                  <span>Imprimir / PDF</span>
                </button>
                {activeDocument.slug === 'politica-de-cookies' && onOpenCookieSettings && (
                  <button
                    type="button"
                    onClick={onOpenCookieSettings}
                    className="px-3 py-2 rounded-xl bg-[#0866F5]/20 hover:bg-[#0866F5]/30 text-[#35B9F5] border border-[#00A9FF]/40 text-xs font-bold transition flex items-center gap-1.5 cursor-pointer"
                  >
                    <Cookie className="w-3.5 h-3.5" />
                    <span>Configurações de Cookies</span>
                  </button>
                )}
              </div>
            </div>

            {/* Executive Summary Box */}
            <div className="p-4 rounded-xl bg-[#0B1730] border border-[#182943] text-xs text-[#F8FAFC] leading-relaxed">
              <strong className="text-[#35B9F5] block mb-1 uppercase tracking-wider text-[10px]">
                Resumo Executivo do Documento:
              </strong>
              {activeDocument.summary}
            </div>

            {/* Document Sections */}
            <div className="space-y-6">
              {activeDocument.sections.map((section) => (
                <section
                  key={section.id}
                  id={`sec-${section.id}`}
                  className="p-5 rounded-xl bg-[#0B1730] border border-[#182943] space-y-2 scroll-mt-24"
                >
                  <h3 className="text-sm sm:text-base font-display font-bold text-[#F8FAFC]">
                    {section.title}
                  </h3>
                  <p className="text-xs sm:text-sm text-[#94A3B8] leading-relaxed whitespace-pre-line">
                    {section.content}
                  </p>
                </section>
              ))}
            </div>

            {/* Configurable Company Identification Footer inside Legal Documents */}
            {companySettings && (
              <div className="p-4 rounded-xl bg-[#0B1730] border border-[#182943] text-xs space-y-2">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-[#35B9F5] flex items-center gap-1.5">
                    <Building2 className="w-4 h-4" />
                    <span>Identificação Institucional e Canais Oficiais</span>
                  </span>
                  <span className="text-[10px] font-mono text-[#64748B]">
                    Configurável no Painel Administrativo
                  </span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-[11px] text-[#F8FAFC]">
                  <div>
                    <strong className="text-[#94A3B8]">Nome Fantasia / Plataforma:</strong>{' '}
                    {companySettings.nomeFantasia || 'GIO DA SORTE'}
                  </div>
                  <div>
                    <strong className="text-[#94A3B8]">Razão Social:</strong>{' '}
                    {companySettings.razaoSocial || 'Pendente de preenchimento administrativo'}
                  </div>
                  <div>
                    <strong className="text-[#94A3B8]">CNPJ / Identificação Fiscal:</strong>{' '}
                    {companySettings.cnpj || companySettings.vatOrTaxId || 'Pendente de preenchimento administrativo'}
                  </div>
                  <div>
                    <strong className="text-[#94A3B8]">E-mail de Atendimento:</strong>{' '}
                    {companySettings.emailAtendimento || 'Utilize o formulário oficial na aba Suporte'}
                  </div>
                  <div>
                    <strong className="text-[#94A3B8]">Encarregado de Dados (DPO):</strong>{' '}
                    {companySettings.dpoEncarregado || 'Canal disponível na aba Minha Privacidade (LGPD)'}
                  </div>
                  <div>
                    <strong className="text-[#94A3B8]">Endereço Empresarial:</strong>{' '}
                    {companySettings.enderecoEmpresarial || 'Pendente de preenchimento administrativo'}
                  </div>
                </div>
              </div>
            )}

            {/* Explicit Acceptance Box (Fase 11) */}
            <div className="p-4 rounded-xl bg-gradient-to-r from-[#050D20] to-[#0B1730] border border-[#00A9FF]/40 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <CheckCircle2
                    className={`w-4 h-4 ${
                      userHasAcceptedActiveDoc ? 'text-[#20C997]' : 'text-[#35B9F5]'
                    }`}
                  />
                  <span className="text-xs font-bold text-[#F8FAFC]">
                    {userHasAcceptedActiveDoc
                      ? `Você já registrou aceite para a versão atual (${activeDocument.version}) deste documento.`
                      : `Registro de Ciência e Aceite Explícito (Versão ${activeDocument.version})`}
                  </span>
                </div>
                <p className="text-[11px] text-[#94A3B8]">
                  O aceite registra data, hora, versão do documento e evidência técnica para fins de conformidade.
                </p>
              </div>
              <button
                type="button"
                onClick={handleAcceptActiveDocument}
                className="px-4 py-2.5 rounded-xl bg-gradient-to-r from-[#0866F5] to-[#00A9FF] hover:brightness-110 text-[#F8FAFC] text-xs font-bold shadow-[0_6px_18px_rgba(8,102,245,0.35)] transition shrink-0 cursor-pointer"
              >
                {userHasAcceptedActiveDoc ? 'Reconfirmar Aceite Desta Versão' : 'Registrar Meu Aceite Agora'}
              </button>
            </div>

            {/* Related Documents Links */}
            {activeDocument.relatedSlugs && activeDocument.relatedSlugs.length > 0 && (
              <div className="pt-4 border-t border-[#182943] space-y-2">
                <span className="text-xs font-bold uppercase tracking-wider text-[#94A3B8] block">
                  Documentos Relacionados:
                </span>
                <div className="flex flex-wrap gap-2">
                  {activeDocument.relatedSlugs.map((relSlug) => {
                    const relDoc = orderedDocuments.find((d) => d.slug === relSlug);
                    if (!relDoc) return null;
                    return (
                      <button
                        key={relSlug}
                        type="button"
                        onClick={() => setSelectedSlug(relSlug)}
                        className="px-3 py-1.5 rounded-xl bg-[#0B1730] hover:bg-[#182943] text-[#35B9F5] border border-[#182943] text-xs font-semibold transition flex items-center gap-1.5 cursor-pointer"
                      >
                        <FileText className="w-3.5 h-3.5" />
                        <span>{relDoc.title}</span>
                        <ChevronRight className="w-3.5 h-3.5" />
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </article>
        </div>
      )}

      {/* =========================================================
          PORTAL TAB 2: MINHA PRIVACIDADE — LGPD PORTAL (FASE 6)
         ========================================================= */}
      {portalTab === 'privacy_lgpd' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          <div className="lg:col-span-7 space-y-6">
            <div className="p-6 rounded-2xl bg-[#101F3D] border border-[#182943] shadow-[0_12px_32px_rgba(2,8,23,0.45)] space-y-4">
              <div className="flex items-center gap-3 border-b border-[#182943] pb-4">
                <div className="w-10 h-10 rounded-xl bg-[#0866F5]/20 border border-[#00A9FF]/40 flex items-center justify-center text-[#35B9F5]">
                  <ShieldCheck className="w-5 h-5" />
                </div>
                <div>
                  <h2 className="text-base sm:text-lg font-display font-bold text-[#F8FAFC]">
                    Minha Privacidade — Direitos do Titular (LGPD)
                  </h2>
                  <p className="text-xs text-[#94A3B8]">
                    Exerça seus direitos previstos na Lei Geral de Proteção de Dados (Lei nº 13.709/2018) com protocolo auditável.
                  </p>
                </div>
              </div>

              <form onSubmit={handleSubmitLgpdRequest} className="space-y-4 text-xs">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block font-semibold text-[#94A3B8] mb-1">
                      Nome do Titular *
                    </label>
                    <input
                      type="text"
                      value={lgpdName}
                      onChange={(e) => setLgpdName(e.target.value)}
                      placeholder="Seu nome ou @usuário"
                      className="w-full px-3.5 py-2.5 rounded-xl bg-[#050D20] border border-[#182943] text-[#F8FAFC] focus:outline-none focus:border-[#00A9FF]"
                    />
                  </div>
                  <div>
                    <label className="block font-semibold text-[#94A3B8] mb-1">
                      E-mail para Retorno e Protocolo *
                    </label>
                    <input
                      type="email"
                      value={lgpdEmail}
                      onChange={(e) => setLgpdEmail(e.target.value)}
                      placeholder="seuemail@exemplo.com"
                      className="w-full px-3.5 py-2.5 rounded-xl bg-[#050D20] border border-[#182943] text-[#F8FAFC] focus:outline-none focus:border-[#00A9FF]"
                    />
                  </div>
                </div>

                <div>
                  <label className="block font-semibold text-[#94A3B8] mb-1">
                    Tipo de Solicitação LGPD *
                  </label>
                  <select
                    value={lgpdType}
                    onChange={(e) => setLgpdType(e.target.value as LgpdRequestType)}
                    className="w-full px-3.5 py-2.5 rounded-xl bg-[#050D20] border border-[#182943] text-[#F8FAFC] focus:outline-none focus:border-[#00A9FF]"
                  >
                    <option value="ACESSO_DADOS">1. Acesso aos meus dados pessoais tratados</option>
                    <option value="CORRECAO_DADOS">2. Correção de dados incompletos, inexatos ou desatualizados</option>
                    <option value="EXCLUSAO_DADOS">3. Exclusão de dados pessoais (quando legalmente cabível)</option>
                    <option value="PORTABILIDADE">4. Portabilidade dos dados em formato estruturado</option>
                    <option value="REVOGACAO_CONSENTIMENTO">5. Revogação de consentimento</option>
                    <option value="INFORMACOES_COMPARTILHAMENTO">6. Informações sobre compartilhamento e finalidade</option>
                  </select>
                </div>

                <div>
                  <label className="block font-semibold text-[#94A3B8] mb-1">
                    Detalhes da Solicitação *
                  </label>
                  <textarea
                    rows={4}
                    value={lgpdDescription}
                    onChange={(e) => setLgpdDescription(e.target.value)}
                    placeholder="Informe os detalhes do seu pedido (ex: @username do TikTok, e-mail da conta ou sessão específica)..."
                    className="w-full px-3.5 py-2.5 rounded-xl bg-[#050D20] border border-[#182943] text-[#F8FAFC] focus:outline-none focus:border-[#00A9FF]"
                  />
                </div>

                <div className="p-3.5 rounded-xl bg-[#0B1730] border border-[#182943] text-[11px] text-[#94A3B8] leading-relaxed">
                  <strong className="text-[#35B9F5]">Nota sobre Preservação Legal:</strong> Pedidos de exclusão são processados pelo fluxo administrativo respeitando a retenção de registros obrigatórios para auditoria pública de sorteios já realizados (art. 16 da LGPD).
                </div>

                <button
                  type="submit"
                  disabled={isSubmittingLgpd}
                  className="w-full py-3 rounded-xl bg-gradient-to-r from-[#0866F5] to-[#00A9FF] hover:brightness-110 text-[#F8FAFC] font-bold text-xs shadow-[0_8px_20px_rgba(8,102,245,0.35)] transition flex items-center justify-center gap-2 cursor-pointer"
                >
                  <Send className="w-4 h-4" />
                  <span>Protocolar Solicitação de Privacidade (LGPD)</span>
                </button>
              </form>
            </div>
          </div>

          {/* Right Column: Transparency Summary + User LGPD History */}
          <div className="lg:col-span-5 space-y-6">
            <div className="p-5 rounded-2xl bg-[#101F3D] border border-[#182943] space-y-3 text-xs shadow-[0_12px_32px_rgba(2,8,23,0.45)]">
              <h3 className="text-sm font-display font-bold text-[#F8FAFC] flex items-center gap-2">
                <UserCheck className="w-4 h-4 text-[#00A9FF]" />
                <span>Dados da Integração TikTok & Cookies</span>
              </h3>
              <p className="text-[#94A3B8] leading-relaxed">
                • <strong className="text-[#F8FAFC]">TikTok Login Kit (OAuth 2.0):</strong> Coleta apenas <code className="text-[#35B9F5] font-mono">open_id</code>, <code className="text-[#35B9F5] font-mono">display_name</code> e <code className="text-[#35B9F5] font-mono">avatar_url</code> mediante sua autorização explícita. Você pode revogar a conexão a qualquer instante na aba TikTok LIVE Pro.
              </p>
              <p className="text-[#94A3B8] leading-relaxed">
                • <strong className="text-[#F8FAFC]">Eventos Públicos da LIVE:</strong> Durante transmissões conectadas, o sistema registra o ID do remetente, apelido público, @username (quando disponível), moedas enviadas e bilhetes emitidos para garantir a auditabilidade SHA-256 do sorteio.
              </p>
              {onOpenCookieSettings && (
                <button
                  type="button"
                  onClick={onOpenCookieSettings}
                  className="w-full py-2.5 rounded-xl bg-[#0B1730] hover:bg-[#182943] text-[#35B9F5] border border-[#00A9FF]/40 font-bold text-xs transition flex items-center justify-center gap-1.5 cursor-pointer"
                >
                  <Cookie className="w-4 h-4" />
                  <span>Gerenciar Consentimento de Cookies</span>
                </button>
              )}
            </div>

            <div className="p-5 rounded-2xl bg-[#101F3D] border border-[#182943] space-y-3 shadow-[0_12px_32px_rgba(2,8,23,0.45)]">
              <h3 className="text-sm font-display font-bold text-[#F8FAFC] flex items-center gap-2">
                <History className="w-4 h-4 text-[#00A9FF]" />
                <span>Histórico de Solicitações LGPD ({lgpdRequests.length})</span>
              </h3>
              {lgpdRequests.length === 0 ? (
                <p className="text-xs text-[#94A3B8] py-4 text-center">
                  Nenhuma solicitação LGPD protocolada ainda.
                </p>
              ) : (
                <div className="space-y-2.5 max-h-80 overflow-y-auto pr-1">
                  {lgpdRequests.map((req) => (
                    <div
                      key={req.requestId}
                      className="p-3 rounded-xl bg-[#0B1730] border border-[#182943] space-y-1 text-xs"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-mono font-bold text-[#35B9F5]">{req.protocol}</span>
                        <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-[#050D20] text-[#35B9F5] border border-[#182943]">
                          {req.status}
                        </span>
                      </div>
                      <p className="font-semibold text-[#F8FAFC]">{req.requestType}</p>
                      <p className="text-[#94A3B8] text-[11px]">{req.description}</p>
                      {req.adminResponse && (
                        <div className="mt-1.5 p-2 rounded-lg bg-[#20C997]/15 border border-[#20C997]/40 text-[11px] text-[#F8FAFC]">
                          <strong className="text-[#20C997]">Resposta do Encarregado (DPO):</strong> {req.adminResponse}
                        </div>
                      )}
                      <span className="block text-[10px] font-mono text-[#64748B]">
                        {new Date(req.createdAt).toLocaleString('pt-BR')}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* =========================================================
          PORTAL TAB 3: CENTRAL DE AJUDA, FAQ & SUPORTE (FASE 14)
         ========================================================= */}
      {portalTab === 'help_support' && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            {/* FAQ & Guides */}
            <div className="lg:col-span-7 p-6 rounded-2xl bg-[#101F3D] border border-[#182943] space-y-4 shadow-[0_12px_32px_rgba(2,8,23,0.45)]">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-[#182943] pb-4">
                <div>
                  <h2 className="text-base sm:text-lg font-display font-bold text-[#F8FAFC] flex items-center gap-2">
                    <BookOpen className="w-5 h-5 text-[#00A9FF]" />
                    <span>Perguntas Frequentes (FAQ) e Guias Rápidos</span>
                  </h2>
                  <p className="text-xs text-[#94A3B8]">
                    Tire dúvidas sobre TikTok LIVE, conversão de moedas em bilhetes, campanhas acumuladas e assinatura.
                  </p>
                </div>
                <div className="relative w-full sm:w-64">
                  <Search className="w-3.5 h-3.5 text-[#35B9F5] absolute left-3 top-2.5" />
                  <input
                    type="text"
                    value={faqQuery}
                    onChange={(e) => setFaqQuery(e.target.value)}
                    placeholder="Buscar dúvida ou tutorial..."
                    className="w-full pl-8 pr-3 py-1.5 rounded-xl bg-[#050D20] border border-[#182943] text-xs text-[#F8FAFC] focus:outline-none focus:border-[#00A9FF]"
                  />
                </div>
              </div>

              <div className="space-y-3">
                {filteredFaqs.map((faq) => (
                  <div
                    key={faq.id}
                    className="p-4 rounded-xl bg-[#0B1730] border border-[#182943] space-y-1.5"
                  >
                    <span className="text-[10px] font-mono font-bold uppercase text-[#35B9F5]">
                      {faq.category}
                    </span>
                    <h3 className="text-xs sm:text-sm font-bold text-[#F8FAFC]">{faq.question}</h3>
                    <p className="text-xs text-[#94A3B8] leading-relaxed">{faq.answer}</p>
                  </div>
                ))}
              </div>
            </div>

            {/* Support Ticket Form & Protocol History */}
            <div className="lg:col-span-5 space-y-6">
              <div className="p-6 rounded-2xl bg-[#101F3D] border border-[#182943] shadow-[0_12px_32px_rgba(2,8,23,0.45)] space-y-4">
                <h2 className="text-base font-display font-bold text-[#F8FAFC] flex items-center gap-2">
                  <MessageSquare className="w-5 h-5 text-[#00A9FF]" />
                  <span>Abrir Chamado de Suporte / Relatar Problema</span>
                </h2>
                <form onSubmit={handleSubmitSupportTicket} className="space-y-3 text-xs">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block font-semibold text-[#94A3B8] mb-1">Seu Nome *</label>
                      <input
                        type="text"
                        value={supName}
                        onChange={(e) => setSupName(e.target.value)}
                        placeholder="Nome ou @usuário"
                        className="w-full px-3 py-2 rounded-xl bg-[#050D20] border border-[#182943] focus:border-[#00A9FF] focus:outline-none text-[#F8FAFC]"
                      />
                    </div>
                    <div>
                      <label className="block font-semibold text-[#94A3B8] mb-1">Seu E-mail *</label>
                      <input
                        type="email"
                        value={supEmail}
                        onChange={(e) => setSupEmail(e.target.value)}
                        placeholder="voce@exemplo.com"
                        className="w-full px-3 py-2 rounded-xl bg-[#050D20] border border-[#182943] focus:border-[#00A9FF] focus:outline-none text-[#F8FAFC]"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block font-semibold text-[#94A3B8] mb-1">Categoria *</label>
                    <select
                      value={supCategory}
                      onChange={(e) => setSupCategory(e.target.value as SupportTicketCategory)}
                      className="w-full px-3 py-2 rounded-xl bg-[#050D20] border border-[#182943] focus:border-[#00A9FF] focus:outline-none text-[#F8FAFC]"
                    >
                      <option value="INTEGRACAO_TIKTOK">Integração TikTok LIVE / OAuth 2.0</option>
                      <option value="SORTEIO_E_BILHETES">Sorteios, Moedas e Emissão de Bilhetes</option>
                      <option value="CAMPANHAS_ACUMULADAS">Campanhas Acumuladas Multi-LIVE</option>
                      <option value="ASSINATURA_E_PAGAMENTO">Planos FREE / PRO e Pagamentos</option>
                      <option value="RELATO_DE_ERRO">Relato de Erro Técnico (Bug Report)</option>
                      <option value="PRIVACIDADE_E_JURIDICO">Dúvida Jurídica ou Regulamentar</option>
                      <option value="OUTROS">Outros Assuntos</option>
                    </select>
                  </div>

                  <div>
                    <label className="block font-semibold text-[#94A3B8] mb-1">Assunto *</label>
                    <input
                      type="text"
                      value={supSubject}
                      onChange={(e) => setSupSubject(e.target.value)}
                      placeholder="Resumo da solicitação ou problema"
                      className="w-full px-3 py-2 rounded-xl bg-[#050D20] border border-[#182943] focus:border-[#00A9FF] focus:outline-none text-[#F8FAFC]"
                    />
                  </div>

                  <div>
                    <label className="block font-semibold text-[#94A3B8] mb-1">Mensagem / Descrição *</label>
                    <textarea
                      rows={4}
                      value={supMessage}
                      onChange={(e) => setSupMessage(e.target.value)}
                      placeholder="Descreva sua dúvida ou o comportamento observado..."
                      className="w-full px-3 py-2 rounded-xl bg-[#050D20] border border-[#182943] focus:border-[#00A9FF] focus:outline-none text-[#F8FAFC]"
                    />
                  </div>

                  <button
                    type="submit"
                    disabled={isSubmittingSupport}
                    className="w-full py-3 rounded-xl bg-gradient-to-r from-[#0866F5] to-[#00A9FF] hover:brightness-110 text-[#F8FAFC] font-bold text-xs shadow-[0_8px_20px_rgba(8,102,245,0.35)] transition flex items-center justify-center gap-2 cursor-pointer"
                  >
                    <Send className="w-4 h-4" />
                    <span>Enviar Solicitação e Gerar Protocolo</span>
                  </button>
                </form>
              </div>

              {/* Support Ticket History */}
              <div className="p-5 rounded-2xl bg-[#101F3D] border border-[#182943] space-y-3 shadow-[0_12px_32px_rgba(2,8,23,0.45)]">
                <h3 className="text-sm font-display font-bold text-[#F8FAFC]">
                  Meus Chamados e Protocolos ({supportTickets.length})
                </h3>
                {supportTickets.length === 0 ? (
                  <p className="text-xs text-[#94A3B8] py-4 text-center">
                    Nenhum chamado registrado ainda.
                  </p>
                ) : (
                  <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
                    {supportTickets.map((t) => (
                      <div
                        key={t.ticketId}
                        className="p-3 rounded-xl bg-[#0B1730] border border-[#182943] space-y-1 text-xs"
                      >
                        <div className="flex items-center justify-between">
                          <span className="font-mono font-bold text-[#35B9F5]">{t.protocol}</span>
                          <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-[#050D20] text-[#35B9F5] border border-[#182943]">
                            {t.status}
                          </span>
                        </div>
                        <p className="font-bold text-[#F8FAFC]">{t.subject}</p>
                        <p className="text-[11px] text-[#94A3B8]">{t.message}</p>
                        {t.adminReply && (
                          <div className="mt-1 p-2 rounded-lg bg-[#20C997]/15 border border-[#20C997]/40 text-[11px] text-[#F8FAFC]">
                            <strong className="text-[#20C997]">Resposta do Suporte:</strong> {t.adminReply}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* =========================================================
          PORTAL TAB 4: ADMINISTRAÇÃO JURÍDICA (PROTECTED ADMIN PANEL)
         ========================================================= */}
      {portalTab === 'admin_legal' && (
        <div className="space-y-6">
          {!isAdminAuthorized ? (
            <div className="p-8 rounded-2xl bg-[#101F3D] border border-[#F05262]/60 text-center space-y-3 shadow-[0_12px_32px_rgba(2,8,23,0.45)]">
              <Lock className="w-10 h-10 text-[#F05262] mx-auto" />
              <h2 className="text-lg font-bold text-[#F8FAFC]">Acesso Restrito ao Administrador</h2>
              <p className="text-xs text-[#94A3B8] max-w-md mx-auto">
                A área de Administração Jurídica exige autenticação com a conta de administrador autorizada no backend.
              </p>
            </div>
          ) : (
            <div className="space-y-6">
              {/* Pending Company Fields Warning Alert (Fase 12) */}
              {pendingCompanyFields.length > 0 && (
                <div className="p-4 rounded-2xl bg-[#F5B942]/15 border border-[#F5B942]/50 flex items-start gap-3 text-xs text-[#F8FAFC]">
                  <AlertTriangle className="w-5 h-5 text-[#F5B942] shrink-0 mt-0.5" />
                  <div className="space-y-1">
                    <strong className="text-[#F8FAFC] block">
                      Aviso Administrativo: Campos Empresariais Obrigatórios Pendentes de Preenchimento ({pendingCompanyFields.length})
                    </strong>
                    <p className="text-[#94A3B8]">
                      Conforme as diretrizes de conformidade (Fase 12), o sistema jamais inventa dados empresariais fictícios. Preencha na aba <strong className="text-[#F8FAFC]">&quot;Dados Empresariais&quot;</strong> os seguintes campos pendentes:{' '}
                      <span className="font-mono text-[#F5B942]">{pendingCompanyFields.join(', ')}</span>.
                    </p>
                  </div>
                </div>
              )}

              {/* Admin Legal Sub-navigation */}
              <div className="flex flex-wrap items-center gap-2 border-b border-[#182943] pb-3">
                <button
                  type="button"
                  onClick={() => setAdminSubTab('editor')}
                  className={`px-3.5 py-2 rounded-xl text-xs font-bold transition flex items-center gap-1.5 cursor-pointer ${
                    adminSubTab === 'editor'
                      ? 'bg-[#0866F5] text-[#F8FAFC]'
                      : 'bg-[#101F3D] text-[#94A3B8] hover:text-[#F8FAFC] border border-[#182943]'
                  }`}
                >
                  <Edit3 className="w-3.5 h-3.5" />
                  <span>1. Editor & Versões de Documentos</span>
                </button>

                <button
                  type="button"
                  onClick={() => setAdminSubTab('company')}
                  className={`px-3.5 py-2 rounded-xl text-xs font-bold transition flex items-center gap-1.5 cursor-pointer ${
                    adminSubTab === 'company'
                      ? 'bg-[#0866F5] text-[#F8FAFC]'
                      : 'bg-[#101F3D] text-[#94A3B8] hover:text-[#F8FAFC] border border-[#182943]'
                  }`}
                >
                  <Building2 className="w-3.5 h-3.5" />
                  <span>2. Dados Empresariais ({pendingCompanyFields.length} pendentes)</span>
                </button>

                <button
                  type="button"
                  onClick={() => setAdminSubTab('commercial')}
                  className={`px-3.5 py-2 rounded-xl text-xs font-bold transition flex items-center gap-1.5 cursor-pointer ${
                    adminSubTab === 'commercial'
                      ? 'bg-[#0866F5] text-[#F8FAFC]'
                      : 'bg-[#101F3D] text-[#94A3B8] hover:text-[#F8FAFC] border border-[#182943]'
                  }`}
                >
                  <CreditCard className="w-3.5 h-3.5" />
                  <span>3. Parâmetros Comerciais (Planos)</span>
                </button>

                <button
                  type="button"
                  onClick={() => setAdminSubTab('lgpd_admin')}
                  className={`px-3.5 py-2 rounded-xl text-xs font-bold transition flex items-center gap-1.5 cursor-pointer ${
                    adminSubTab === 'lgpd_admin'
                      ? 'bg-[#0866F5] text-[#F8FAFC]'
                      : 'bg-[#101F3D] text-[#94A3B8] hover:text-[#F8FAFC] border border-[#182943]'
                  }`}
                >
                  <ShieldCheck className="w-3.5 h-3.5" />
                  <span>4. Solicitações LGPD ({lgpdRequests.length})</span>
                </button>

                <button
                  type="button"
                  onClick={() => setAdminSubTab('support_admin')}
                  className={`px-3.5 py-2 rounded-xl text-xs font-bold transition flex items-center gap-1.5 cursor-pointer ${
                    adminSubTab === 'support_admin'
                      ? 'bg-[#0866F5] text-[#F8FAFC]'
                      : 'bg-[#101F3D] text-[#94A3B8] hover:text-[#F8FAFC] border border-[#182943]'
                  }`}
                >
                  <MessageSquare className="w-3.5 h-3.5" />
                  <span>5. Chamados de Suporte ({supportTickets.length})</span>
                </button>

                <button
                  type="button"
                  onClick={() => setAdminSubTab('consents_log')}
                  className={`px-3.5 py-2 rounded-xl text-xs font-bold transition flex items-center gap-1.5 cursor-pointer ${
                    adminSubTab === 'consents_log'
                      ? 'bg-[#0866F5] text-[#F8FAFC]'
                      : 'bg-[#101F3D] text-[#94A3B8] hover:text-[#F8FAFC] border border-[#182943]'
                  }`}
                >
                  <History className="w-3.5 h-3.5" />
                  <span>6. Aceites & Logs de Consentimento ({acceptances.length + cookieLogs.length})</span>
                </button>
              </div>

              {/* SUB-TAB 1: DOCUMENT EDITOR & IMMUTABLE VERSIONING */}
              {adminSubTab === 'editor' && (
                <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
                  <div className="lg:col-span-7 p-6 rounded-2xl bg-[#101F3D] border border-[#182943] space-y-4 text-xs shadow-[0_12px_32px_rgba(2,8,23,0.45)]">
                    <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#182943] pb-3">
                      <h3 className="text-sm font-display font-bold text-[#F8FAFC]">
                        Editor de Documentos Jurídicos (Versionamento Imutável)
                      </h3>
                      <button
                        type="button"
                        onClick={() => setPreviewMode((v) => !v)}
                        className="px-3 py-1.5 rounded-lg bg-[#0B1730] text-[#35B9F5] border border-[#00A9FF]/40 font-semibold flex items-center gap-1.5 cursor-pointer"
                      >
                        <Eye className="w-3.5 h-3.5" />
                        <span>{previewMode ? 'Voltar para Edição' : 'Pré-visualizar Documento'}</span>
                      </button>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                      <div className="sm:col-span-2">
                        <label className="block font-semibold text-[#94A3B8] mb-1">
                          Documento Institucional
                        </label>
                        <select
                          value={editSlug}
                          onChange={(e) => setEditSlug(e.target.value as LegalDocumentSlug)}
                          className="w-full px-3 py-2 rounded-xl bg-[#050D20] border border-[#182943] text-[#F8FAFC] font-bold"
                        >
                          {orderedDocuments.map((d) => (
                            <option key={d.slug} value={d.slug}>
                              {d.title} (Atual: v{d.version})
                            </option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label className="block font-semibold text-[#94A3B8] mb-1">
                          Nova Versão
                        </label>
                        <input
                          type="text"
                          value={editVersion}
                          onChange={(e) => setEditVersion(e.target.value)}
                          placeholder="Ex: 1.1.0"
                          className="w-full px-3 py-2 rounded-xl bg-[#050D20] border border-[#182943] text-[#F8FAFC] font-mono"
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <label className="block font-semibold text-[#94A3B8] mb-1">
                          Data de Início de Vigência
                        </label>
                        <input
                          type="date"
                          value={editEffectiveDate}
                          onChange={(e) => setEditEffectiveDate(e.target.value)}
                          className="w-full px-3 py-2 rounded-xl bg-[#050D20] border border-[#182943] text-[#F8FAFC]"
                        />
                      </div>
                      <label className="flex items-center gap-2 pt-5 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={editMandatory}
                          onChange={(e) => setEditMandatory(e.target.checked)}
                          className="w-4 h-4 accent-[#00A9FF]"
                        />
                        <span className="font-semibold text-[#F8FAFC]">
                          Exigir novo aceite obrigatório dos usuários
                        </span>
                      </label>
                    </div>

                    <div>
                      <label className="block font-semibold text-[#94A3B8] mb-1">
                        Resumo Executivo da Versão
                      </label>
                      <textarea
                        rows={2}
                        value={editSummary}
                        onChange={(e) => setEditSummary(e.target.value)}
                        className="w-full px-3 py-2 rounded-xl bg-[#050D20] border border-[#182943] text-[#F8FAFC]"
                      />
                    </div>

                    {previewMode ? (
                      <div className="p-4 rounded-xl bg-[#0B1730] border border-[#20C997]/50 space-y-3">
                        <span className="text-[10px] font-mono uppercase text-[#20C997]">
                          Modo Pré-visualização (v{editVersion})
                        </span>
                        <p className="text-[#94A3B8]">{editSummary}</p>
                        {editSections.map((s) => (
                          <div key={s.id} className="space-y-1 border-t border-[#182943] pt-2">
                            <h4 className="font-bold text-[#F8FAFC]">{s.title}</h4>
                            <p className="text-[#94A3B8] whitespace-pre-line">{s.content}</p>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="space-y-3 max-h-96 overflow-y-auto pr-1">
                        {editSections.map((sec, idx) => (
                          <div
                            key={sec.id}
                            className="p-3.5 rounded-xl bg-[#0B1730] border border-[#182943] space-y-2"
                          >
                            <input
                              type="text"
                              value={sec.title}
                              onChange={(e) => {
                                const val = e.target.value;
                                setEditSections((prev) =>
                                  prev.map((item, i) => (i === idx ? { ...item, title: val } : item))
                                );
                              }}
                              className="w-full px-2.5 py-1.5 rounded-lg bg-[#050D20] border border-[#182943] text-[#F8FAFC] font-bold"
                            />
                            <textarea
                              rows={3}
                              value={sec.content}
                              onChange={(e) => {
                                const val = e.target.value;
                                setEditSections((prev) =>
                                  prev.map((item, i) => (i === idx ? { ...item, content: val } : item))
                                );
                              }}
                              className="w-full px-2.5 py-1.5 rounded-lg bg-[#050D20] border border-[#182943] text-[#F8FAFC]"
                            />
                          </div>
                        ))}
                      </div>
                    )}

                    <div className="flex flex-wrap items-center gap-3 pt-2">
                      <button
                        type="button"
                        onClick={handleSaveDraftAdmin}
                        className="px-4 py-2.5 rounded-xl bg-[#0B1730] hover:bg-[#182943] text-[#F8FAFC] border border-[#182943] font-bold transition flex items-center gap-1.5 cursor-pointer"
                      >
                        <Save className="w-4 h-4 text-[#35B9F5]" />
                        <span>Salvar Rascunho</span>
                      </button>

                      <button
                        type="button"
                        onClick={handlePublishNewVersionAdmin}
                        className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-[#0866F5] to-[#00A9FF] hover:brightness-110 text-[#F8FAFC] font-bold shadow-[0_6px_18px_rgba(8,102,245,0.35)] transition flex items-center gap-1.5 cursor-pointer"
                      >
                        <UploadCloud className="w-4 h-4" />
                        <span>Publicar Nova Versão Imutável</span>
                      </button>
                    </div>
                  </div>

                  {/* Version Comparison & Archived Versions */}
                  <div className="lg:col-span-5 p-6 rounded-2xl bg-[#101F3D] border border-[#182943] space-y-4 text-xs shadow-[0_12px_32px_rgba(2,8,23,0.45)]">
                    <h3 className="text-sm font-display font-bold text-[#F8FAFC]">
                      Histórico e Comparação de Versões Publicadas
                    </h3>
                    <p className="text-[#94A3B8]">
                      Versões publicadas nunca são sobrescritas sem histórico: toda nova publicação arquiva a versão anterior de forma imutável.
                    </p>
                    <div className="space-y-2 max-h-96 overflow-y-auto pr-1">
                      {versionHistory
                        .filter((v) => v.documentId === editSlug)
                        .map((ver) => (
                          <div
                            key={ver.versionId}
                            onClick={() =>
                              setCompareVersionId(
                                compareVersionId === ver.versionId ? '' : ver.versionId
                              )
                            }
                            className="p-3 rounded-xl bg-[#0B1730] border border-[#182943] hover:border-[#00A9FF]/50 cursor-pointer space-y-1"
                          >
                            <div className="flex items-center justify-between">
                              <span className="font-mono font-bold text-[#35B9F5]">
                                Versão {ver.version}
                              </span>
                              <span
                                className={`text-[10px] font-mono px-2 py-0.5 rounded ${
                                  ver.archived
                                    ? 'bg-[#050D20] text-[#94A3B8] border border-[#182943]'
                                    : 'bg-[#20C997]/15 text-[#20C997] border border-[#20C997]/40'
                                }`}
                              >
                                {ver.archived ? 'ARQUIVADA' : 'VIGENTE'}
                              </span>
                            </div>
                            <p className="text-[11px] text-[#94A3B8]">{ver.summary}</p>
                            <span className="block text-[10px] font-mono text-[#64748B]">
                              Publicada em {new Date(ver.publishedAt).toLocaleString('pt-BR')} por{' '}
                              {ver.publishedBy}
                            </span>
                            {compareVersionId === ver.versionId && (
                              <div className="mt-2 pt-2 border-t border-[#182943] space-y-1.5 text-[11px] text-[#94A3B8]">
                                {ver.sections.map((s) => (
                                  <div key={s.id}>
                                    <strong className="text-[#F8FAFC]">{s.title}:</strong> {s.content}
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        ))}
                      {versionHistory.filter((v) => v.documentId === editSlug).length === 0 && (
                        <p className="text-[#64748B] py-4 text-center">
                          Documento na versão inicial v1.0.0. Publique uma nova versão ao lado para testar o arquivamento e comparação.
                        </p>
                      )}
                    </div>
                  </div>
                </div>
              )}

              {/* SUB-TAB 2: CONFIGURABLE COMPANY DATA (FASE 12) */}
              {adminSubTab === 'company' && companySettings && (
                <form
                  onSubmit={handleSaveCompanySettingsAdmin}
                  className="p-6 rounded-2xl bg-[#101F3D] border border-[#182943] space-y-4 text-xs shadow-[0_12px_32px_rgba(2,8,23,0.45)]"
                >
                  <div className="border-b border-[#182943] pb-3">
                    <h3 className="text-sm sm:text-base font-display font-bold text-[#F8FAFC]">
                      Dados Empresariais e Identificação Oficial do Organizador (Fase 12)
                    </h3>
                    <p className="text-[#94A3B8]">
                      Estes campos alimentam automaticamente os documentos jurídicos, rodapé e regulamentos sem jamais inventar CNPJ ou endereços falsos.
                    </p>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                    <div>
                      <label className="block font-semibold text-[#94A3B8] mb-1">Razão Social</label>
                      <input
                        type="text"
                        value={companySettings.razaoSocial}
                        onChange={(e) =>
                          setCompanySettings({ ...companySettings, razaoSocial: e.target.value })
                        }
                        placeholder="Informe a razão social oficial"
                        className="w-full px-3 py-2 rounded-xl bg-[#050D20] border border-[#182943] focus:border-[#00A9FF] focus:outline-none text-[#F8FAFC]"
                      />
                    </div>
                    <div>
                      <label className="block font-semibold text-[#94A3B8] mb-1">Nome Fantasia</label>
                      <input
                        type="text"
                        value={companySettings.nomeFantasia}
                        onChange={(e) =>
                          setCompanySettings({ ...companySettings, nomeFantasia: e.target.value })
                        }
                        placeholder="GIO DA SORTE"
                        className="w-full px-3 py-2 rounded-xl bg-[#050D20] border border-[#182943] focus:border-[#00A9FF] focus:outline-none text-[#F8FAFC]"
                      />
                    </div>
                    <div>
                      <label className="block font-semibold text-[#94A3B8] mb-1">CNPJ</label>
                      <input
                        type="text"
                        value={companySettings.cnpj}
                        onChange={(e) =>
                          setCompanySettings({ ...companySettings, cnpj: e.target.value })
                        }
                        placeholder="00.000.000/0000-00"
                        className="w-full px-3 py-2 rounded-xl bg-[#050D20] border border-[#182943] focus:border-[#00A9FF] focus:outline-none text-[#F8FAFC] font-mono"
                      />
                    </div>
                    <div>
                      <label className="block font-semibold text-[#94A3B8] mb-1">
                        VAT / Número Fiscal Internacional
                      </label>
                      <input
                        type="text"
                        value={companySettings.vatOrTaxId}
                        onChange={(e) =>
                          setCompanySettings({ ...companySettings, vatOrTaxId: e.target.value })
                        }
                        placeholder="Opcional"
                        className="w-full px-3 py-2 rounded-xl bg-[#050D20] border border-[#182943] focus:border-[#00A9FF] focus:outline-none text-[#F8FAFC] font-mono"
                      />
                    </div>
                    <div className="sm:col-span-2">
                      <label className="block font-semibold text-[#94A3B8] mb-1">
                        Endereço Empresarial Completo
                      </label>
                      <input
                        type="text"
                        value={companySettings.enderecoEmpresarial}
                        onChange={(e) =>
                          setCompanySettings({
                            ...companySettings,
                            enderecoEmpresarial: e.target.value,
                          })
                        }
                        placeholder="Logradouro, número, complemento, cidade, UF, CEP"
                        className="w-full px-3 py-2 rounded-xl bg-[#050D20] border border-[#182943] focus:border-[#00A9FF] focus:outline-none text-[#F8FAFC]"
                      />
                    </div>
                    <div>
                      <label className="block font-semibold text-[#94A3B8] mb-1">
                        E-mail Oficial de Atendimento
                      </label>
                      <input
                        type="email"
                        value={companySettings.emailAtendimento}
                        onChange={(e) =>
                          setCompanySettings({
                            ...companySettings,
                            emailAtendimento: e.target.value,
                          })
                        }
                        placeholder="contato@seudominio.com"
                        className="w-full px-3 py-2 rounded-xl bg-[#050D20] border border-[#182943] focus:border-[#00A9FF] focus:outline-none text-[#F8FAFC]"
                      />
                    </div>
                    <div>
                      <label className="block font-semibold text-[#94A3B8] mb-1">
                        Canal de Privacidade (LGPD)
                      </label>
                      <input
                        type="text"
                        value={companySettings.canalPrivacidade}
                        onChange={(e) =>
                          setCompanySettings({
                            ...companySettings,
                            canalPrivacidade: e.target.value,
                          })
                        }
                        placeholder="privacidade@seudominio.com"
                        className="w-full px-3 py-2 rounded-xl bg-[#050D20] border border-[#182943] focus:border-[#00A9FF] focus:outline-none text-[#F8FAFC]"
                      />
                    </div>
                    <div>
                      <label className="block font-semibold text-[#94A3B8] mb-1">
                        Representante Legal
                      </label>
                      <input
                        type="text"
                        value={companySettings.representanteLegal}
                        onChange={(e) =>
                          setCompanySettings({
                            ...companySettings,
                            representanteLegal: e.target.value,
                          })
                        }
                        placeholder="Nome completo do representante"
                        className="w-full px-3 py-2 rounded-xl bg-[#050D20] border border-[#182943] focus:border-[#00A9FF] focus:outline-none text-[#F8FAFC]"
                      />
                    </div>
                    <div>
                      <label className="block font-semibold text-[#94A3B8] mb-1">
                        Responsável pelo Tratamento de Dados (DPO)
                      </label>
                      <input
                        type="text"
                        value={companySettings.dpoEncarregado}
                        onChange={(e) =>
                          setCompanySettings({
                            ...companySettings,
                            dpoEncarregado: e.target.value,
                          })
                        }
                        placeholder="Nome e contato do Encarregado DPO"
                        className="w-full px-3 py-2 rounded-xl bg-[#050D20] border border-[#182943] focus:border-[#00A9FF] focus:outline-none text-[#F8FAFC]"
                      />
                    </div>
                    <div>
                      <label className="block font-semibold text-[#94A3B8] mb-1">
                        Telefone / Informações de Contato
                      </label>
                      <input
                        type="text"
                        value={companySettings.telefoneOuContato}
                        onChange={(e) =>
                          setCompanySettings({
                            ...companySettings,
                            telefoneOuContato: e.target.value,
                          })
                        }
                        placeholder="+55 (00) 00000-0000"
                        className="w-full px-3 py-2 rounded-xl bg-[#050D20] border border-[#182943] focus:border-[#00A9FF] focus:outline-none text-[#F8FAFC]"
                      />
                    </div>
                    <div>
                      <label className="block font-semibold text-[#94A3B8] mb-1">
                        Identificação Padrão do Organizador
                      </label>
                      <input
                        type="text"
                        value={companySettings.identificacaoOrganizador}
                        onChange={(e) =>
                          setCompanySettings({
                            ...companySettings,
                            identificacaoOrganizador: e.target.value,
                          })
                        }
                        placeholder="Identificação exibida nos regulamentos"
                        className="w-full px-3 py-2 rounded-xl bg-[#050D20] border border-[#182943] focus:border-[#00A9FF] focus:outline-none text-[#F8FAFC]"
                      />
                    </div>
                  </div>

                  <button
                    type="submit"
                    className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-[#0866F5] to-[#00A9FF] text-[#F8FAFC] font-bold shadow-[0_6px_18px_rgba(8,102,245,0.35)] transition flex items-center gap-2 cursor-pointer"
                  >
                    <Save className="w-4 h-4" />
                    <span>Salvar Dados Empresariais no Firestore</span>
                  </button>
                </form>
              )}

              {/* SUB-TAB 3: COMMERCIAL SUBSCRIPTION SETTINGS (FASE 8 & ASSINATURAS RECORRENTES MP) */}
              {adminSubTab === 'commercial' && commercialConfig && (
                <form
                  onSubmit={async (e) => {
                    await handleSaveCommercialConfigAdmin(e);
                    try {
                      const authHeaders = await getAuthBearerHeaders({
                        'Content-Type': 'application/json',
                        'x-gio-admin-access': 'authorized',
                      });
                      await fetch('/api/subscriptions/admin/plans', {
                        method: 'POST',
                        headers: authHeaders,
                        body: JSON.stringify({
                          monthlyPrice: Number(commercialConfig.monthlyPrice ?? 29.9),
                          annualPrice: Number(commercialConfig.annualPrice ?? 199.9),
                          trialOfferEnabled: Boolean(commercialConfig.trialOfferEnabled ?? true),
                          adminEmail: userEmail || 'gustakkg15@gmail.com',
                        }),
                      });
                    } catch {
                      // ignore
                    }
                  }}
                  className="p-6 rounded-2xl bg-[#101F3D] border border-[#00A9FF]/40 space-y-5 text-xs shadow-[0_12px_32px_rgba(2,8,23,0.45)]"
                >
                  <div className="border-b border-[#182943] pb-3 flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <span className="text-[10px] font-mono font-bold uppercase tracking-wider text-[#F5B942]">
                        Planos Oficiais Mercado Pago & Regras Comerciais
                      </span>
                      <h3 className="text-sm sm:text-base font-display font-bold text-[#F8FAFC] mt-0.5">
                        Parâmetros Comerciais — GIO DA SORTE PRO Mensal (R$ 29,90) & Anual (R$ 199,90)
                      </h3>
                      <p className="text-[#94A3B8]">
                        Alterações de preço geram uma nova versão comercial (atual:{' '}
                        <strong className="font-mono text-[#35B9F5]">
                          {commercialConfig.priceVersion || 'v1.0.0'}
                        </strong>
                        ) e aplicam-se apenas a novas contratações, preservando o valor das assinaturas vigentes.
                      </p>
                    </div>
                    <span className="px-3 py-1 rounded-lg bg-[#050D20] border border-[#F5B942]/40 font-mono text-[11px] text-[#F5B942]">
                      Homologação MP: {commercialConfig.mpHomologationStatus || 'PENDING_CREDENTIALS'}
                    </span>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
                    <div>
                      <label className="block font-semibold text-[#35B9F5] mb-1">
                        PRO Mensal (BRL / 1 mês)
                      </label>
                      <input
                        type="number"
                        step="0.01"
                        value={commercialConfig.monthlyPrice ?? 29.9}
                        onChange={(e) =>
                          setCommercialConfig({
                            ...commercialConfig,
                            monthlyPrice: Number(e.target.value),
                          })
                        }
                        className="w-full px-3 py-2 rounded-xl bg-[#050D20] border border-[#182943] focus:border-[#00A9FF] focus:outline-none text-[#F8FAFC] font-mono tabular-nums"
                      />
                    </div>
                    <div>
                      <label className="block font-semibold text-[#F5B942] mb-1">
                        PRO Anual Integral (BRL / 12 meses)
                      </label>
                      <input
                        type="number"
                        step="0.01"
                        value={commercialConfig.annualPrice ?? 199.9}
                        onChange={(e) =>
                          setCommercialConfig({
                            ...commercialConfig,
                            annualPrice: Number(e.target.value),
                          })
                        }
                        className="w-full px-3 py-2 rounded-xl bg-[#050D20] border border-[#182943] focus:border-[#F5B942] focus:outline-none text-[#F5B942] font-mono tabular-nums"
                      />
                    </div>
                    <div>
                      <label className="block font-semibold text-[#20C997] mb-1">
                        Teste Gratuito (Dias)
                      </label>
                      <input
                        type="number"
                        value={commercialConfig.freeTrialDays ?? 3}
                        onChange={(e) =>
                          setCommercialConfig({
                            ...commercialConfig,
                            freeTrialDays: Number(e.target.value),
                          })
                        }
                        className="w-full px-3 py-2 rounded-xl bg-[#050D20] border border-[#182943] focus:border-[#20C997] focus:outline-none text-[#F8FAFC] font-mono tabular-nums"
                      />
                    </div>
                    <div className="flex items-end pb-1">
                      <label className="flex items-center gap-2 text-[#F8FAFC] cursor-pointer">
                        <input
                          type="checkbox"
                          checked={commercialConfig.trialOfferEnabled ?? true}
                          onChange={(e) =>
                            setCommercialConfig({
                              ...commercialConfig,
                              trialOfferEnabled: e.target.checked,
                            })
                          }
                          className="w-4 h-4 accent-[#00A9FF]"
                        />
                        <span>Oferta 3 Dias Grátis Ativa</span>
                      </label>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                    <div>
                      <label className="block font-semibold text-[#94A3B8] mb-1">
                        Resumo Oficial de Preços Exibido
                      </label>
                      <input
                        type="text"
                        value={commercialConfig.priceDisplay}
                        onChange={(e) =>
                          setCommercialConfig({
                            ...commercialConfig,
                            priceDisplay: e.target.value,
                          })
                        }
                        className="w-full px-3 py-2 rounded-xl bg-[#050D20] border border-[#182943] focus:border-[#00A9FF] focus:outline-none text-[#F8FAFC] font-mono"
                      />
                    </div>
                    <div>
                      <label className="block font-semibold text-[#94A3B8] mb-1">
                        Periodicidade / Ciclos Oficiais
                      </label>
                      <input
                        type="text"
                        value={commercialConfig.billingCycle}
                        onChange={(e) =>
                          setCommercialConfig({
                            ...commercialConfig,
                            billingCycle: e.target.value,
                          })
                        }
                        className="w-full px-3 py-2 rounded-xl bg-[#050D20] border border-[#182943] focus:border-[#00A9FF] focus:outline-none text-[#F8FAFC]"
                      />
                    </div>
                    <div>
                      <label className="block font-semibold text-[#94A3B8] mb-1">
                        Meios de Pagamento Aceitos
                      </label>
                      <input
                        type="text"
                        value={commercialConfig.paymentMethodsInfo}
                        onChange={(e) =>
                          setCommercialConfig({
                            ...commercialConfig,
                            paymentMethodsInfo: e.target.value,
                          })
                        }
                        className="w-full px-3 py-2 rounded-xl bg-[#050D20] border border-[#182943] focus:border-[#00A9FF] focus:outline-none text-[#F8FAFC]"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="block font-semibold text-[#94A3B8] mb-1">
                        Regra de Renovação Automática e Teste de 3 Dias
                      </label>
                      <textarea
                        rows={2}
                        value={commercialConfig.renewalPolicy}
                        onChange={(e) =>
                          setCommercialConfig({
                            ...commercialConfig,
                            renewalPolicy: e.target.value,
                          })
                        }
                        className="w-full px-3 py-2 rounded-xl bg-[#050D20] border border-[#182943] focus:border-[#00A9FF] focus:outline-none text-[#F8FAFC]"
                      />
                    </div>
                    <div>
                      <label className="block font-semibold text-[#94A3B8] mb-1">
                        Regra de Cancelamento (&quot;canceled&quot;) e Retenção de Acesso
                      </label>
                      <textarea
                        rows={2}
                        value={commercialConfig.refundPolicySummary}
                        onChange={(e) =>
                          setCommercialConfig({
                            ...commercialConfig,
                            refundPolicySummary: e.target.value,
                          })
                        }
                        className="w-full px-3 py-2 rounded-xl bg-[#050D20] border border-[#182943] focus:border-[#00A9FF] focus:outline-none text-[#F8FAFC]"
                      />
                    </div>
                  </div>

                  <button
                    type="submit"
                    className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-[#0866F5] to-[#00A9FF] text-[#F8FAFC] font-black shadow-[0_6px_18px_rgba(8,102,245,0.35)] transition flex items-center gap-2 cursor-pointer"
                  >
                    <Save className="w-4 h-4" />
                    <span>Salvar Parâmetros Comerciais e Atualizar Versão</span>
                  </button>
                </form>
              )}

              {/* SUB-TAB 4: ADMIN LGPD REQUESTS WORKFLOW */}
              {adminSubTab === 'lgpd_admin' && (
                <div className="p-6 rounded-2xl bg-[#101F3D] border border-[#182943] space-y-4 text-xs shadow-[0_12px_32px_rgba(2,8,23,0.45)]">
                  <h3 className="text-sm font-display font-bold text-[#F8FAFC]">
                    Gestão Administrativa de Solicitações LGPD ({lgpdRequests.length})
                  </h3>
                  {lgpdRequests.length === 0 ? (
                    <p className="text-[#94A3B8] py-6 text-center">
                      Nenhuma solicitação LGPD recebida.
                    </p>
                  ) : (
                    <div className="space-y-3">
                      {lgpdRequests.map((req) => (
                        <div
                          key={req.requestId}
                          className="p-4 rounded-xl bg-[#0B1730] border border-[#182943] space-y-3"
                        >
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <div>
                              <span className="font-mono font-bold text-[#35B9F5]">
                                {req.protocol}
                              </span>{' '}
                              • <strong className="text-[#F8FAFC]">{req.requesterName}</strong> (
                              {req.requesterEmail})
                            </div>
                            <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-[#050D20] text-[#35B9F5] border border-[#182943]">
                              {req.status}
                            </span>
                          </div>
                          <p className="text-[#94A3B8]">
                            <strong className="text-[#F8FAFC]">Tipo:</strong> {req.requestType} — {req.description}
                          </p>
                          <div className="grid grid-cols-1 sm:grid-cols-12 gap-2 items-center">
                            <select
                              value={adminLgpdStatusMap[req.requestId] || req.status}
                              onChange={(e) =>
                                setAdminLgpdStatusMap((prev) => ({
                                  ...prev,
                                  [req.requestId]: e.target.value as LgpdRequestStatus,
                                }))
                              }
                              className="sm:col-span-4 px-3 py-2 rounded-lg bg-[#050D20] border border-[#182943] text-[#F8FAFC]"
                            >
                              <option value="RECEBIDA">RECEBIDA</option>
                              <option value="EM_ANALISE">EM_ANALISE</option>
                              <option value="ATENDIDA">ATENDIDA</option>
                              <option value="PARCIALMENTE_ATENDIDA_RETENCAO_LEGAL">
                                PARCIALMENTE ATENDIDA (RETENÇÃO LEGAL DE AUDITORIA)
                              </option>
                              <option value="REJEITADA_JUSTIFICADA">REJEITADA (JUSTIFICADA)</option>
                            </select>
                            <input
                              type="text"
                              value={adminLgpdReplyMap[req.requestId] ?? req.adminResponse ?? ''}
                              onChange={(e) =>
                                setAdminLgpdReplyMap((prev) => ({
                                  ...prev,
                                  [req.requestId]: e.target.value,
                                }))
                              }
                              placeholder="Parecer / resposta do DPO ao titular..."
                              className="sm:col-span-6 px-3 py-2 rounded-lg bg-[#050D20] border border-[#182943] text-[#F8FAFC]"
                            />
                            <button
                              type="button"
                              onClick={async () => {
                                await updateLgpdRequestStatusAdmin(
                                  req.requestId,
                                  adminLgpdStatusMap[req.requestId] || req.status,
                                  adminLgpdReplyMap[req.requestId] ?? req.adminResponse ?? '',
                                  userEmail || 'admin'
                                );
                                await loadAllComplianceData();
                                setFeedbackBanner({
                                  type: 'success',
                                  text: `Solicitação ${req.protocol} atualizada!`,
                                });
                              }}
                              className="sm:col-span-2 py-2 px-3 rounded-lg bg-[#0866F5] hover:bg-[#00A9FF] text-[#F8FAFC] font-bold cursor-pointer transition"
                            >
                              Atualizar
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* SUB-TAB 5: ADMIN SUPPORT TICKETS */}
              {adminSubTab === 'support_admin' && (
                <div className="p-6 rounded-2xl bg-[#101F3D] border border-[#182943] space-y-4 text-xs shadow-[0_12px_32px_rgba(2,8,23,0.45)]">
                  <h3 className="text-sm font-display font-bold text-[#F8FAFC]">
                    Gestão de Chamados de Suporte ({supportTickets.length})
                  </h3>
                  {supportTickets.length === 0 ? (
                    <p className="text-[#94A3B8] py-6 text-center">
                      Nenhum chamado de suporte registrado.
                    </p>
                  ) : (
                    <div className="space-y-3">
                      {supportTickets.map((t) => (
                        <div
                          key={t.ticketId}
                          className="p-4 rounded-xl bg-[#0B1730] border border-[#182943] space-y-3"
                        >
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <div>
                              <span className="font-mono font-bold text-[#35B9F5]">{t.protocol}</span>{' '}
                              • <strong className="text-[#F8FAFC]">{t.subject}</strong> ({t.name} -{' '}
                              {t.email})
                            </div>
                            <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-[#050D20] text-[#35B9F5] border border-[#182943]">
                              {t.status}
                            </span>
                          </div>
                          <p className="text-[#94A3B8]">{t.message}</p>
                          <div className="grid grid-cols-1 sm:grid-cols-12 gap-2 items-center">
                            <select
                              value={adminSupportStatusMap[t.ticketId] || t.status}
                              onChange={(e) =>
                                setAdminSupportStatusMap((prev) => ({
                                  ...prev,
                                  [t.ticketId]: e.target.value as SupportTicketStatus,
                                }))
                              }
                              className="sm:col-span-3 px-3 py-2 rounded-lg bg-[#050D20] border border-[#182943] text-[#F8FAFC]"
                            >
                              <option value="ABERTO">ABERTO</option>
                              <option value="EM_ATENDIMENTO">EM_ATENDIMENTO</option>
                              <option value="RESOLVIDO">RESOLVIDO</option>
                              <option value="FECHADO">FECHADO</option>
                            </select>
                            <input
                              type="text"
                              value={adminSupportReplyMap[t.ticketId] ?? t.adminReply ?? ''}
                              onChange={(e) =>
                                setAdminSupportReplyMap((prev) => ({
                                  ...prev,
                                  [t.ticketId]: e.target.value,
                                }))
                              }
                              placeholder="Resposta técnica ao usuário..."
                              className="sm:col-span-7 px-3 py-2 rounded-lg bg-[#050D20] border border-[#182943] text-[#F8FAFC]"
                            />
                            <button
                              type="button"
                              onClick={async () => {
                                await updateSupportTicketAdmin(
                                  t.ticketId,
                                  adminSupportStatusMap[t.ticketId] || t.status,
                                  adminSupportReplyMap[t.ticketId] ?? t.adminReply ?? ''
                                );
                                await loadAllComplianceData();
                                setFeedbackBanner({
                                  type: 'success',
                                  text: `Chamado ${t.protocol} respondido!`,
                                });
                              }}
                              className="sm:col-span-2 py-2 px-3 rounded-lg bg-[#0866F5] hover:bg-[#00A9FF] text-[#F8FAFC] font-bold cursor-pointer transition"
                            >
                              Responder
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* SUB-TAB 6: DOCUMENT ACCEPTANCES & COOKIE CONSENT LOGS */}
              {adminSubTab === 'consents_log' && (
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 text-xs">
                  <div className="p-5 rounded-2xl bg-[#101F3D] border border-[#182943] space-y-3 shadow-[0_12px_32px_rgba(2,8,23,0.45)]">
                    <h3 className="text-sm font-display font-bold text-[#F8FAFC]">
                      Registros de Aceite de Documentos por Versão ({acceptances.length})
                    </h3>
                    <div className="space-y-2 max-h-80 overflow-y-auto pr-1">
                      {acceptances.map((acc) => (
                        <div
                          key={acc.acceptanceId}
                          className="p-3 rounded-xl bg-[#0B1730] border border-[#182943] space-y-1"
                        >
                          <div className="flex items-center justify-between">
                            <span className="font-bold text-[#F8FAFC]">{acc.documentId}</span>
                            <span className="font-mono text-[#35B9F5]">v{acc.version}</span>
                          </div>
                          <p className="text-[11px] text-[#94A3B8]">
                            Usuário: {acc.userEmail || acc.userId} • Contexto: {acc.context}
                          </p>
                          <span className="block text-[10px] font-mono text-[#64748B]">
                            {new Date(acc.acceptedAt).toLocaleString('pt-BR')}
                          </span>
                        </div>
                      ))}
                      {acceptances.length === 0 && (
                        <p className="text-[#64748B] py-4 text-center">
                          Nenhum aceite registrado ainda.
                        </p>
                      )}
                    </div>
                  </div>

                  <div className="p-5 rounded-2xl bg-[#101F3D] border border-[#182943] space-y-3 shadow-[0_12px_32px_rgba(2,8,23,0.45)]">
                    <h3 className="text-sm font-display font-bold text-[#F8FAFC]">
                      Logs de Consentimento de Cookies ({cookieLogs.length})
                    </h3>
                    <div className="space-y-2 max-h-80 overflow-y-auto pr-1">
                      {cookieLogs.map((c) => (
                        <div
                          key={c.consentId}
                          className="p-3 rounded-xl bg-[#0B1730] border border-[#182943] space-y-1"
                        >
                          <div className="flex items-center justify-between">
                            <span className="font-bold text-[#F8FAFC]">{c.choiceType}</span>
                            <span className="font-mono text-[#35B9F5]">Aviso v{c.noticeVersion}</span>
                          </div>
                          <p className="text-[11px] text-[#94A3B8] font-mono">
                            Essenciais: Sim | Preferências: {c.categories.preferences ? 'Sim' : 'Não'} |
                            Estatísticas: {c.categories.statistics ? 'Sim' : 'Não'} | Marketing:{' '}
                            {c.categories.marketing ? 'Sim' : 'Não'}
                          </p>
                          <span className="block text-[10px] font-mono text-[#64748B]">
                            {new Date(c.decidedAt).toLocaleString('pt-BR')}
                          </span>
                        </div>
                      ))}
                      {cookieLogs.length === 0 && (
                        <p className="text-[#64748B] py-4 text-center">
                          Nenhum log de cookie registrado ainda.
                        </p>
                      )}
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
};
