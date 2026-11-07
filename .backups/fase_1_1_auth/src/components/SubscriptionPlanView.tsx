import React, { useState, useEffect, useCallback } from 'react';
import {
  Crown,
  Check,
  Lock,
  Radio,
  Gift,
  Ticket,
  Layers,
  ShieldCheck,
  Database,
  ArrowRight,
  RotateCw,
  AlertTriangle,
  CreditCard,
  XCircle,
  CheckCircle2,
  Sparkles,
  Settings,
  ExternalLink,
  RefreshCw,
  UserCheck,
  Info,
} from 'lucide-react';
import {
  ProPlanEntitlement,
  SubscriptionPlanTier,
  SubscriptionStatusState,
  CommercialSubscriptionConfig,
  LegalDocumentSlug,
  OfficialSubscriptionPlanDefinition,
  UserSubscriptionRecord,
  MercadoPagoHomologationReport,
} from '../types';
import {
  recordDocumentAcceptance,
  getLocalSubscriptionState,
  setLocalSubscriptionState,
} from '../utils/legalAndComplianceService';
import { getAuthBearerHeaders } from '../utils/tiktokLiveService';

interface SubscriptionPlanViewProps {
  entitlement: ProPlanEntitlement;
  onSwitchPlan: (tier: SubscriptionPlanTier, statusState?: SubscriptionStatusState) => Promise<void>;
  onNavigateToLivePro: () => void;
  onNavigateToParticipants: () => void;
  onOpenLegalDocument?: (slug: LegalDocumentSlug) => void;
  userId?: string;
  userEmail?: string;
  emailVerified?: boolean;
}

interface AdminSummaryPayload {
  metrics: {
    totalSubscribersCount: number;
    subscribersInTrialCount: number;
    activeSubscribersCount: number;
    canceledSubscribersCount: number;
    pendingOrRejectedCount: number;
    revenueByModality: {
      pro_monthly: number;
      pro_annual: number;
      totalBrl: number;
    };
  };
  homologationReport?: MercadoPagoHomologationReport | null;
}

const SUBSCRIPTION_STATES: {
  state: SubscriptionStatusState;
  label: string;
  tier: SubscriptionPlanTier;
  badgeClass: string;
  description: string;
}[] = [
  {
    state: 'ACTIVE',
    label: 'ACTIVE (PRO Ativo)',
    tier: 'PRO',
    badgeClass: 'bg-[#20C997]/15 text-[#20C997] border-[#20C997]/50',
    description: 'Todas as automações TikTok LIVE PRO, captura de presentes e emissão de bilhetes liberadas.',
  },
  {
    state: 'FREE',
    label: 'FREE (Plano Gratuito)',
    tier: 'FREE',
    badgeClass: 'bg-[#0866F5]/20 text-[#35B9F5] border-[#0866F5]/50',
    description: 'Sorteadores manuais liberados e histórico salvo disponível para consulta e exportação.',
  },
  {
    state: 'PENDING',
    label: 'PENDING (Aguardando Confirmação)',
    tier: 'FREE',
    badgeClass: 'bg-[#F5B942]/15 text-[#F5B942] border-[#F5B942]/50',
    description: 'Assinatura individual criada. Automações ao vivo aguardam autorização no Mercado Pago.',
  },
  {
    state: 'PAST_DUE',
    label: 'PAST_DUE (Pagamento em Atraso)',
    tier: 'FREE',
    badgeClass: 'bg-[#F05262]/15 text-[#F05262] border-[#F05262]/50',
    description: 'Renovação pendente de regularização. Dados históricos permanecem 100% preservados.',
  },
  {
    state: 'CANCELED',
    label: 'CANCELED (Cancelada — Ciclo Encerrado)',
    tier: 'FREE',
    badgeClass: 'bg-[#101F3D] text-[#94A3B8] border-[#182943]',
    description: 'Renovações futuras interrompidas ("status": "canceled"). Histórico de participantes e sorteios mantido.',
  },
  {
    state: 'EXPIRED',
    label: 'EXPIRED (Ciclo Expirado)',
    tier: 'FREE',
    badgeClass: 'bg-[#101F3D] text-[#64748B] border-[#182943]',
    description: 'Período PRO encerrado. Consulta e exportação de sorteios anteriores continuam ativas.',
  },
];

function formatBrl(value: number): string {
  return value.toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL',
    minimumFractionDigits: 2,
  });
}

function formatDatePtBr(isoOrTs: string | number | null | undefined): string {
  if (!isoOrTs) return 'A confirmar pela API do Mercado Pago (next_payment_date)';
  const d = new Date(isoOrTs);
  if (Number.isNaN(d.getTime())) return String(isoOrTs);
  return d.toLocaleString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export const SubscriptionPlanView: React.FC<SubscriptionPlanViewProps> = ({
  entitlement,
  onSwitchPlan,
  onNavigateToLivePro,
  onNavigateToParticipants,
  onOpenLegalDocument,
  userId = '',
  userEmail = '',
  emailVerified = false,
}) => {
  const [activeViewTab, setActiveViewTab] = useState<'plans' | 'admin'>('plans');
  const [isUpdating, setIsUpdating] = useState(false);
  const [statusState, setStatusState] = useState<SubscriptionStatusState>(() =>
    entitlement.active ? 'ACTIVE' : getLocalSubscriptionState() || 'FREE'
  );
  const [commercialConfig, setCommercialConfig] = useState<CommercialSubscriptionConfig | null>(null);
  const [officialPlans, setOfficialPlans] = useState<{
    monthly: OfficialSubscriptionPlanDefinition;
    annual: OfficialSubscriptionPlanDefinition;
  } | null>(null);
  const [userSubscription, setUserSubscription] = useState<UserSubscriptionRecord | null>(null);
  const [homologationReport, setHomologationReport] = useState<MercadoPagoHomologationReport | null>(null);
  const [adminSummary, setAdminSummary] = useState<AdminSummaryPayload | null>(null);

  // Pre-checkout confirmation modal state
  const [selectedPlanForCheckout, setSelectedPlanForCheckout] = useState<OfficialSubscriptionPlanDefinition | null>(null);
  const [confirmedEmailInput, setConfirmedEmailInput] = useState(userEmail || '');
  const [confirmEmailOwnership, setConfirmEmailOwnership] = useState(Boolean(emailVerified));
  const [acceptedCommercialTerms, setAcceptedCommercialTerms] = useState(true);
  const [checkoutError, setCheckoutError] = useState<string | null>(null);
  const [checkoutPayloadPreview, setCheckoutPayloadPreview] = useState<Record<string, unknown> | null>(null);
  const [isSubmittingCheckout, setIsSubmittingCheckout] = useState(false);

  // Manual preapproval verification / cancellation state
  const [verifyPreapprovalInput, setVerifyPreapprovalInput] = useState('');
  const [isVerifyingPreapproval, setIsVerifyingPreapproval] = useState(false);
  const [isCancelingSubscription, setIsCancelingSubscription] = useState(false);
  const [notice, setNotice] = useState<{ type: 'info' | 'success' | 'warning'; text: string } | null>(null);

  // Admin Plan Editor State
  const [editMonthlyPrice, setEditMonthlyPrice] = useState('29.90');
  const [editAnnualPrice, setEditAnnualPrice] = useState('199.90');
  const [editTrialEnabled, setEditTrialEnabled] = useState(true);
  const [isSavingAdminPlans, setIsSavingAdminPlans] = useState(false);
  const [isRunningHomologation, setIsRunningHomologation] = useState(false);

  const effectiveUid = userId && userId !== 'organizador' ? userId : '';
  const isPro = entitlement.active && entitlement.tier === 'PRO' && statusState === 'ACTIVE';

  const loadSubscriptionData = useCallback(async () => {
    try {
      const authHeaders = await getAuthBearerHeaders();
      const query = effectiveUid ? `?uid=${encodeURIComponent(effectiveUid)}` : '';
      const res = await fetch(`/api/subscriptions/plans${query}`, {
        headers: { ...authHeaders },
      });
      if (res.ok) {
        const data = await res.json();
        if (data.config) {
          setCommercialConfig(data.config);
          setEditMonthlyPrice(String(data.config.monthlyPrice ?? 29.9));
          setEditAnnualPrice(String(data.config.annualPrice ?? 199.9));
          setEditTrialEnabled(Boolean(data.config.trialOfferEnabled ?? true));
        }
        if (data.plans) {
          setOfficialPlans(data.plans);
        }
        if (data.homologationReport) {
          setHomologationReport(data.homologationReport);
        }
        if (data.userSubscription) {
          setUserSubscription(data.userSubscription);
        }
      }
    } catch {
      // ignore
    }
  }, [effectiveUid]);

  const loadAdminSummary = useCallback(async () => {
    try {
      const res = await fetch('/api/subscriptions/admin/summary', {
        headers: { 'x-gio-admin-access': 'authorized' },
      });
      if (res.ok) {
        const data = await res.json();
        if (data.summary) {
          setAdminSummary(data.summary);
          if (data.summary.homologationReport) {
            setHomologationReport(data.summary.homologationReport);
          }
        }
      }
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    loadSubscriptionData();
    loadAdminSummary();
  }, [loadSubscriptionData, loadAdminSummary]);

  useEffect(() => {
    if (userEmail) {
      setConfirmedEmailInput(userEmail);
    }
    if (emailVerified) {
      setConfirmEmailOwnership(true);
    }
  }, [userEmail, emailVerified]);

  useEffect(() => {
    if (entitlement.active && entitlement.tier === 'PRO') {
      setStatusState('ACTIVE');
    } else if (statusState === 'ACTIVE') {
      setStatusState('FREE');
    }
  }, [entitlement.active, entitlement.tier, statusState]);

  const handleVerifyPreapproval = useCallback(
    async (preapprovalIdToVerify?: string) => {
      const targetId = (preapprovalIdToVerify || verifyPreapprovalInput).trim();
      if (!targetId) {
        setNotice({
          type: 'warning',
          text: 'Informe o ID da assinatura (preapproval_id) para verificar no backend.',
        });
        return;
      }
      if (!effectiveUid) {
        setNotice({
          type: 'warning',
          text: 'Faça login na sua conta Firebase para validar a titularidade (external_reference === uid).',
        });
        return;
      }

      setIsVerifyingPreapproval(true);
      try {
        const authHeaders = await getAuthBearerHeaders();
        const res = await fetch('/api/subscriptions/verify', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-firebase-uid': effectiveUid,
            'x-firebase-email': userEmail,
            ...authHeaders,
          },
          body: JSON.stringify({
            uid: effectiveUid,
            email: userEmail,
            preapprovalId: targetId,
          }),
        });
        const data = await res.json();
        if (data.subscription) {
          setUserSubscription(data.subscription);
          setStatusState(data.subscription.statusState);
        }
        if (!res.ok || !data.success) {
          setNotice({
            type: 'warning',
            text: data.error || 'Não foi possível validar a assinatura no Mercado Pago.',
          });
        } else {
          setNotice({
            type: 'success',
            text: data.message || 'Assinatura verificada e sincronizada com sucesso.',
          });
          if (data.subscription?.statusState === 'ACTIVE') {
            await onSwitchPlan('PRO', 'ACTIVE');
          }
        }
        await loadSubscriptionData();
      } catch (err: unknown) {
        setNotice({
          type: 'warning',
          text: err instanceof Error ? err.message : String(err),
        });
      } finally {
        setIsVerifyingPreapproval(false);
      }
    },
    [effectiveUid, loadSubscriptionData, onSwitchPlan, userEmail, verifyPreapprovalInput]
  );

  // Check URL return from Mercado Pago checkout (?preapproval_id=...)
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const returnedPreapprovalId = params.get('preapproval_id');
    if (returnedPreapprovalId && effectiveUid) {
      setVerifyPreapprovalInput(returnedPreapprovalId);
      handleVerifyPreapproval(returnedPreapprovalId);
    }
  }, [effectiveUid, handleVerifyPreapproval]);

  const handleOpenCheckoutModal = (plan: OfficialSubscriptionPlanDefinition) => {
    setSelectedPlanForCheckout(plan);
    setCheckoutError(null);
    setCheckoutPayloadPreview(null);
    setConfirmedEmailInput(userEmail || '');
    setConfirmEmailOwnership(Boolean(emailVerified));
  };

  const handleInitiateCheckout = async () => {
    if (!selectedPlanForCheckout) return;

    if (!effectiveUid) {
      setCheckoutError(
        'Autenticação obrigatória: faça login na sua conta organizadora (Firebase Auth) antes de iniciar os 3 dias grátis para vincular o external_reference ao seu UID.'
      );
      return;
    }

    const cleanEmail = confirmedEmailInput.trim();
    if (!cleanEmail || !cleanEmail.includes('@')) {
      setCheckoutError('Informe um e-mail válido e verificado para o payer_email da assinatura.');
      return;
    }

    if (!emailVerified && !confirmEmailOwnership) {
      setCheckoutError(
        'Confirme que o e-mail informado está verificado e pertence à sua conta antes de prosseguir.'
      );
      return;
    }

    if (!acceptedCommercialTerms) {
      setCheckoutError(
        'Confirme a leitura e o aceite da Política de Assinaturas e Pagamentos e da Política de Cancelamento e Reembolso.'
      );
      return;
    }

    setIsSubmittingCheckout(true);
    setCheckoutError(null);

    try {
      await Promise.all([
        recordDocumentAcceptance({
          userId: effectiveUid,
          userEmail: cleanEmail,
          documentId: 'politica-de-assinaturas-e-pagamentos',
          version: commercialConfig?.priceVersion || 'v1.0.0',
          context: 'ATIVACAO_PRO',
        }),
        recordDocumentAcceptance({
          userId: effectiveUid,
          userEmail: cleanEmail,
          documentId: 'politica-de-cancelamento-e-reembolso',
          version: commercialConfig?.priceVersion || 'v1.0.0',
          context: 'ATIVACAO_PRO',
        }),
      ]).catch(() => {});

      const authHeaders = await getAuthBearerHeaders();
      const res = await fetch('/api/subscriptions/checkout', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-firebase-uid': effectiveUid,
          'x-firebase-email': cleanEmail,
          'x-firebase-email-verified': String(emailVerified || confirmEmailOwnership),
          ...authHeaders,
        },
        body: JSON.stringify({
          uid: effectiveUid,
          email: cleanEmail,
          emailVerified: emailVerified || confirmEmailOwnership,
          emailConfirmedByUser: confirmEmailOwnership,
          planId: selectedPlanForCheckout.planId,
          acceptedTerms: acceptedCommercialTerms,
        }),
      });

      const data = await res.json();
      if (data.payloadPreview) {
        setCheckoutPayloadPreview(data.payloadPreview);
      }

      if (!res.ok || !data.success) {
        setCheckoutError(
          data.error ||
            'Contratação bloqueada preventivamente até a conclusão da homologação na API do Mercado Pago.'
        );
        return;
      }

      if (data.subscription) {
        setUserSubscription(data.subscription);
      }

      setNotice({
        type: 'success',
        text: data.message || 'Checkout individual criado com sucesso no Mercado Pago. Redirecionando...',
      });
      setSelectedPlanForCheckout(null);
      await loadSubscriptionData();

      if (data.initPoint) {
        window.location.href = data.initPoint;
      }
    } catch (err: unknown) {
      setCheckoutError(err instanceof Error ? err.message : String(err));
    } finally {
      setIsSubmittingCheckout(false);
    }
  };

  const handleCancelSubscription = async () => {
    if (!effectiveUid) return;
    setIsCancelingSubscription(true);
    try {
      const authHeaders = await getAuthBearerHeaders();
      const res = await fetch('/api/subscriptions/cancel', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-firebase-uid': effectiveUid,
          'x-firebase-email': userEmail,
          ...authHeaders,
        },
        body: JSON.stringify({
          uid: effectiveUid,
          email: userEmail,
        }),
      });
      const data = await res.json();
      if (data.subscription) {
        setUserSubscription(data.subscription);
        setStatusState(data.subscription.statusState);
      }
      if (!res.ok || !data.success) {
        setNotice({
          type: 'warning',
          text: data.error || 'Não foi possível processar o cancelamento da assinatura.',
        });
      } else {
        setNotice({
          type: 'success',
          text:
            data.message ||
            'Renovação futura cancelada com status "canceled". Seu acesso PRO permanece ativo até o término do período concedido.',
        });
      }
      await loadSubscriptionData();
      await loadAdminSummary();
    } catch (err: unknown) {
      setNotice({
        type: 'warning',
        text: err instanceof Error ? err.message : String(err),
      });
    } finally {
      setIsCancelingSubscription(false);
    }
  };

  const handleAdminSimulateState = async (
    target: SubscriptionPlanTier,
    targetState?: SubscriptionStatusState
  ) => {
    setIsUpdating(true);
    setNotice(null);
    try {
      const nextState: SubscriptionStatusState =
        targetState || (target === 'PRO' ? 'ACTIVE' : 'FREE');

      setStatusState(nextState);
      setLocalSubscriptionState(nextState);

      await fetch('/api/tiktok/plan/tier', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-gio-admin-access': 'authorized',
        },
        body: JSON.stringify({ tier: target, statusState: nextState }),
      }).catch(() => {});

      await onSwitchPlan(target, nextState);
      setNotice({
        type: 'info',
        text: `[Simulador Admin] Estado de permissão atualizado no servidor: ${nextState} (Plano ${target}).`,
      });
    } finally {
      setIsUpdating(false);
    }
  };

  const handleSaveAdminPlans = async () => {
    setIsSavingAdminPlans(true);
    try {
      const res = await fetch('/api/subscriptions/admin/plans', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-gio-admin-access': 'authorized',
        },
        body: JSON.stringify({
          monthlyPrice: Number(editMonthlyPrice),
          annualPrice: Number(editAnnualPrice),
          trialOfferEnabled: editTrialEnabled,
          adminEmail: userEmail || 'gustakkg15@gmail.com',
        }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setNotice({
          type: 'success',
          text: data.message || 'Configuração comercial atualizada com sucesso.',
        });
        await loadSubscriptionData();
        await loadAdminSummary();
      } else {
        setNotice({
          type: 'warning',
          text: data.error || 'Erro ao atualizar configuração comercial.',
        });
      }
    } finally {
      setIsSavingAdminPlans(false);
    }
  };

  const handleRunHomologationCheck = async () => {
    setIsRunningHomologation(true);
    try {
      const res = await fetch('/api/subscriptions/admin/homologation/verify', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-gio-admin-access': 'authorized',
        },
      });
      const data = await res.json();
      if (data.report) {
        setHomologationReport(data.report);
        setNotice({
          type: data.report.status === 'VERIFIED' ? 'success' : 'warning',
          text:
            data.report.status === 'VERIFIED'
              ? 'Homologação de 10 etapas aprovada na API do Mercado Pago!'
              : `Verificação executada (${data.report.status}): ${data.report.blockReason || 'Credenciais de homologação ausentes.'}`,
        });
      }
      await loadAdminSummary();
    } finally {
      setIsRunningHomologation(false);
    }
  };

  const monthlyPlan: OfficialSubscriptionPlanDefinition = officialPlans?.monthly || {
    planId: 'pro_monthly',
    name: 'GIO DA SORTE PRO Mensal',
    price: commercialConfig?.monthlyPrice ?? 29.9,
    currency: 'BRL',
    frequency: 1,
    frequencyType: 'months',
    freeTrial: {
      frequency: 3,
      frequencyType: 'days',
    },
    monthlyEquivalent: commercialConfig?.monthlyPrice ?? 29.9,
    annualSavingsAmount: 0,
    annualDiscountPercent: 0,
    priceVersion: commercialConfig?.priceVersion || 'v1.0.0',
  };

  const annualPlan: OfficialSubscriptionPlanDefinition = officialPlans?.annual || {
    planId: 'pro_annual',
    name: 'GIO DA SORTE PRO Anual',
    price: commercialConfig?.annualPrice ?? 199.9,
    currency: 'BRL',
    frequency: 12,
    frequencyType: 'months',
    freeTrial: {
      frequency: 3,
      frequencyType: 'days',
    },
    monthlyEquivalent: 16.66,
    annualSavingsAmount: 158.9,
    annualDiscountPercent: 44.3,
    priceVersion: commercialConfig?.priceVersion || 'v1.0.0',
  };

  const activeStateInfo =
    SUBSCRIPTION_STATES.find((s) => s.state === statusState) || SUBSCRIPTION_STATES[0];

  const isContractingBlocked =
    !homologationReport || homologationReport.status !== 'VERIFIED';

  const userHasUsedTrial = Boolean(userSubscription?.hasUsedFreeTrial);

  return (
    <div className="space-y-6 animate-fade-in min-w-0">
      {/* Top Hero Banner — Official GIO DA SORTE SaaS Billing Identity */}
      <div className="relative overflow-hidden p-6 sm:p-8 rounded-2xl bg-[#081226] border border-white/[0.08] shadow-xl flex flex-col lg:flex-row lg:items-center justify-between gap-6">
        <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-[#0866F5] via-[#00A9FF] to-[#8B7CFF]" />

        <div className="flex items-start sm:items-center gap-4">
          {/* Official Clean Brand Emblem */}
          <div className="w-14 h-14 rounded-2xl bg-[#101F3D] p-0.5 border border-white/[0.1] shadow-md flex items-center justify-center shrink-0">
            <div className="w-full h-full rounded-[14px] bg-[#081226] flex items-center justify-center relative">
              <Ticket className="w-7 h-7 text-[#00A9FF] transform -rotate-12" />
              <Sparkles className="w-3.5 h-3.5 text-[#C4B5FD] absolute top-2 right-2" />
            </div>
          </div>

          <div className="space-y-2 max-w-2xl">
            <div className="flex flex-wrap items-center gap-2.5">
              <span className="gio-badge-pro">
                <Crown className="w-3.5 h-3.5 text-[#C4B5FD]" />
                <span>Planos Oficiais & Assinatura PRO</span>
              </span>
              <span
                className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-md text-xs font-mono font-bold border ${
                  isPro
                    ? 'bg-[#20C997]/15 text-[#20C997] border-[#20C997]/40'
                    : 'bg-[#081226] text-[#35B9F5] border-white/[0.1]'
                }`}
              >
                <span
                  className={`w-2 h-2 rounded-full ${
                    isPro ? 'bg-[#20C997] animate-pulse' : 'bg-[#35B9F5]'
                  }`}
                />
                <span>ACESSO DA CONTA: {activeStateInfo.label}</span>
              </span>
            </div>

            <h1 className="text-2xl sm:text-3xl font-display font-extrabold text-[#F8FAFC] tracking-tight">
              GIO DA SORTE — Planos Comerciais & 3 Dias de Teste Grátis
            </h1>
            <p className="text-xs sm:text-sm text-[#94A3B8] leading-relaxed">
              Utilize o Plano FREE gratuito ou ative o <strong className="text-[#C4B5FD]">Plano PRO</strong> com 3 dias de avaliação sem custo, captura em tempo real do TikTok LIVE, sorteador de comentários e campanhas Multi-LIVE.
            </p>
          </div>
        </div>

        {/* View Switcher Tabs (Planos do Usuário vs Painel Admin Comercial) */}
        <div className="flex flex-col sm:flex-row lg:flex-col gap-2 shrink-0 bg-[#101F3D] p-2 rounded-xl border border-white/[0.08]">
          <button
            type="button"
            onClick={() => setActiveViewTab('plans')}
            className={`px-4 py-2.5 rounded-lg text-xs font-bold transition flex items-center justify-center gap-2 ${
              activeViewTab === 'plans'
                ? 'gio-btn-primary shadow-xs'
                : 'text-[#94A3B8] hover:text-[#F8FAFC] bg-transparent'
            }`}
          >
            <CreditCard className="w-4 h-4" />
            <span>Planos & Minha Assinatura</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveViewTab('admin')}
            className={`px-4 py-2.5 rounded-lg text-xs font-bold transition flex items-center justify-center gap-2 ${
              activeViewTab === 'admin'
                ? 'gio-btn-pro shadow-xs'
                : 'text-[#C4B5FD] hover:bg-white/[0.05] border border-[#8B7CFF]/30'
            }`}
          >
            <Settings className="w-4 h-4" />
            <span>Diagnóstico & Homologação MP</span>
          </button>
        </div>
      </div>

      {/* Notice Banner */}
      {notice && (
        <div
          className={`p-4 rounded-xl border text-xs flex items-center justify-between gap-4 ${
            notice.type === 'success'
              ? 'bg-[#20C997]/15 border-[#20C997]/50 text-[#F8FAFC]'
              : notice.type === 'warning'
              ? 'bg-[#F5B942]/15 border-[#F5B942]/50 text-[#F8FAFC]'
              : 'bg-[#0866F5]/15 border-[#00A9FF]/50 text-[#F8FAFC]'
          }`}
        >
          <div className="flex items-center gap-2.5">
            <Info className="w-4 h-4 shrink-0 text-[#00A9FF]" />
            <span>{notice.text}</span>
          </div>
          <button
            type="button"
            onClick={() => setNotice(null)}
            className="text-[#94A3B8] hover:text-[#F8FAFC] px-2 font-bold"
          >
            ✕
          </button>
        </div>
      )}

      {/* Harmonized Gateway & Entitlement Status Banner (Non-Contradictory) */}
      {isContractingBlocked && (
        <div
          className={`p-4 sm:p-5 rounded-2xl border flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 ${
            isPro
              ? 'bg-[#101F3D] border-[#8B7CFF]/45'
              : 'bg-[#101F3D] border-[#182943]'
          }`}
        >
          <div className="flex items-start gap-3">
            {isPro ? (
              <CheckCircle2 className="w-5 h-5 text-[#20C997] shrink-0 mt-0.5" />
            ) : (
              <ShieldCheck className="w-5 h-5 text-[#00A9FF] shrink-0 mt-0.5" />
            )}
            <div className="space-y-1">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-xs font-bold uppercase tracking-wider text-[#F8FAFC]">
                  {isPro
                    ? 'Recursos PRO Liberados nesta Sessão · Checkout Externo em Homologação'
                    : 'Proteção de Pagamento Ativa · Checkout Mercado Pago em Homologação'}
                </span>
                <span className="px-2 py-0.5 rounded text-[10px] font-mono font-semibold bg-[#0B1730] text-[#94A3B8] border border-[#182943]">
                  Gateway: {homologationReport?.status || 'PENDING_CREDENTIALS'}
                </span>
              </div>
              <p className="text-xs text-[#94A3B8] leading-relaxed">
                {isPro
                  ? 'Seu acesso aos módulos TikTok LIVE PRO e Sorteador de Comentários já está ativo. Novas contratações externas via Mercado Pago permanecem em modo seguro de homologação (nenhuma cobrança externa é gerada).'
                  : homologationReport?.blockReason ||
                    'A contratação financeira automática aguarda a conclusão das etapas de homologação da API do Mercado Pago. Nenhuma cobrança é realizada ou simulada.'}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setActiveViewTab('admin')}
            className="px-3.5 py-2 rounded-xl bg-[#0B1730] hover:bg-[#182943] text-[#C4B5FD] border border-[#8B7CFF]/35 text-xs font-semibold shrink-0 transition"
          >
            Ver Status Técnico MP
          </button>
        </div>
      )}

      {activeViewTab === 'plans' ? (
        <>
          {/* 3-Column Commercial Plans Grid: FREE | PRO MENSAL | PRO ANUAL */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-stretch">
            {/* 1. PLANO FREE */}
            <div className="p-6 sm:p-7 rounded-2xl bg-[#081226] border border-white/[0.08] flex flex-col justify-between space-y-6 shadow-md transition-all hover:border-white/[0.15]">
              <div className="space-y-4">
                <div className="flex items-center justify-between gap-2">
                  <div>
                    <span className="text-[11px] font-bold uppercase tracking-wider text-[#35B9F5]">
                      Mesa Oficial & Gestão Local
                    </span>
                    <h2 className="text-xl font-display font-extrabold text-[#F8FAFC] mt-0.5">
                      Plano FREE
                    </h2>
                  </div>
                  <span className="gio-badge-free">Gratuito</span>
                </div>

                <div className="pt-3 border-t border-white/[0.08]">
                  <div className="flex items-baseline gap-1.5">
                    <span className="text-3xl font-mono font-extrabold text-[#F8FAFC] tabular-nums">
                      R$ 0,00
                    </span>
                    <span className="text-xs text-[#94A3B8] font-mono">/ sempre</span>
                  </div>
                  <p className="text-xs text-[#94A3B8] mt-1.5">
                    Sem cartão de crédito • Uso livre da Mesa Oficial de Sorteio
                  </p>
                </div>

                <div className="space-y-2.5 pt-3 border-t border-white/[0.08] text-xs">
                  <div className="flex items-center gap-2.5 text-[#F8FAFC]">
                    <Check className="w-4 h-4 text-[#20C997] shrink-0" />
                    <span>Sorteio Proporcional por Moedas e Bilhetes</span>
                  </div>
                  <div className="flex items-center gap-2.5 text-[#F8FAFC]">
                    <Check className="w-4 h-4 text-[#20C997] shrink-0" />
                    <span>Globo Digital, Roleta Proporcional e Battle Royale</span>
                  </div>
                  <div className="flex items-center gap-2.5 text-[#F8FAFC]">
                    <Database className="w-4 h-4 text-[#00A9FF] shrink-0" />
                    <span>
                      <strong>Histórico e Certificados SHA-256:</strong> Laudos PDF e consulta
                    </span>
                  </div>
                  <div className="flex items-center gap-2.5 text-[#94A3B8]/70">
                    <Lock className="w-4 h-4 text-[#C4B5FD] shrink-0" />
                    <span>Conexão TikTok LIVE em Tempo Real (Exclusivo PRO)</span>
                  </div>
                  <div className="flex items-center gap-2.5 text-[#94A3B8]/70">
                    <Lock className="w-4 h-4 text-[#C4B5FD] shrink-0" />
                    <span>Sorteador de Comentários do TikTok (Exclusivo PRO)</span>
                  </div>
                  <div className="flex items-center gap-2.5 text-[#94A3B8]/70">
                    <Lock className="w-4 h-4 text-[#C4B5FD] shrink-0" />
                    <span>Campanhas Acumuladas Multi-LIVE (Exclusivo PRO)</span>
                  </div>
                </div>
              </div>

              <div className="pt-4 border-t border-white/[0.08]">
                <button
                  type="button"
                  onClick={onNavigateToParticipants}
                  className="gio-btn-secondary w-full py-3.5 px-4 text-xs font-semibold justify-center"
                >
                  <span>Consultar Participantes e Histórico</span>
                  <ArrowRight className="w-4 h-4 text-[#00A9FF]" />
                </button>
              </div>
            </div>

            {/* 2. PLANO PRO MENSAL */}
            <div className="p-6 sm:p-7 rounded-2xl bg-[#101F3D] border border-[#0866F5]/60 shadow-xl flex flex-col justify-between space-y-6 relative transition-all hover:border-[#0866F5]">
              <div className="space-y-4">
                <div className="flex items-center justify-between gap-2">
                  <div>
                    <span className="text-[11px] font-bold uppercase tracking-wider text-[#00A9FF]">
                      Flexibilidade Mensal
                    </span>
                    <h2 className="text-xl font-display font-extrabold text-[#F8FAFC] mt-0.5">
                      {monthlyPlan.name}
                    </h2>
                  </div>
                  <span className="px-2.5 py-1 rounded-md text-[10px] font-bold uppercase bg-[#20C997]/15 text-[#20C997] border border-[#20C997]/40 shadow-xs">
                    3 Dias Grátis
                  </span>
                </div>

                <div className="pt-3 border-t border-white/[0.08] space-y-2">
                  <div className="flex items-baseline gap-1.5">
                    <span className="text-3xl font-mono font-extrabold text-[#F8FAFC] tabular-nums">
                      {formatBrl(monthlyPlan.price)}
                    </span>
                    <span className="text-xs text-[#94A3B8] font-mono">/ mês</span>
                  </div>
                  <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-[#20C997]/12 border border-[#20C997]/30 text-xs font-bold text-[#20C997] font-mono tabular-nums">
                    <Sparkles className="w-3.5 h-3.5" />
                    <span>R$ 0,00 hoje • 3 dias de teste grátis</span>
                  </div>
                  <p className="text-[11px] text-[#94A3B8] leading-relaxed">
                    Cobrança recorrente mensal somente após o término dos 3 dias de teste gratuito. Cancele quando quiser.
                  </p>
                </div>

                <div className="space-y-2.5 pt-3 border-t border-white/[0.08] text-xs">
                  <div className="flex items-center gap-2.5 text-[#F8FAFC]">
                    <Radio className="w-4 h-4 text-[#00A9FF] shrink-0" />
                    <span>
                      <strong>Conexão TikTok LIVE em Tempo Real:</strong> Webcast + OAuth 2.0
                    </span>
                  </div>
                  <div className="flex items-center gap-2.5 text-[#F8FAFC]">
                    <Gift className="w-4 h-4 text-[#00A9FF] shrink-0" />
                    <span>
                      <strong>Captura Automática de Presentes:</strong> Controle de combos sem duplicidade
                    </span>
                  </div>
                  <div className="flex items-center gap-2.5 text-[#F8FAFC]">
                    <Ticket className="w-4 h-4 text-[#00A9FF] shrink-0" />
                    <span>
                      <strong>Sorteador de Comentários PRO:</strong> Extração automática e filtros
                    </span>
                  </div>
                  <div className="flex items-center gap-2.5 text-[#F8FAFC]">
                    <Layers className="w-4 h-4 text-[#00A9FF] shrink-0" />
                    <span>
                      <strong>Campanhas Acumuladas Multi-LIVE:</strong> Ranking unificado
                    </span>
                  </div>
                  <div className="flex items-center gap-2.5 text-[#F8FAFC]">
                    <ShieldCheck className="w-4 h-4 text-[#20C997] shrink-0" />
                    <span>
                      <strong>Cancelamento Livre:</strong> Cancele no teste sem cobrança
                    </span>
                  </div>
                </div>
              </div>

              <div className="pt-4 border-t border-white/[0.08] space-y-2">
                <button
                  type="button"
                  onClick={() => handleOpenCheckoutModal(monthlyPlan)}
                  className="gio-btn-primary w-full py-3.5 px-5 text-xs font-bold justify-center shadow-md"
                >
                  <Sparkles className="w-4 h-4" />
                  <span>
                    {userHasUsedTrial
                      ? `Assinar PRO Mensal (${formatBrl(monthlyPlan.price)}/mês)`
                      : 'Começar 3 dias grátis'}
                  </span>
                  <ArrowRight className="w-4 h-4" />
                </button>
                <p className="text-[11px] text-center text-[#94A3B8] font-mono tabular-nums">
                  Após 3 dias: {formatBrl(monthlyPlan.price)}/mês • Cancele quando quiser
                </p>
              </div>
            </div>

            {/* 3. PLANO PRO ANUAL (MAIS ECONÔMICO — VIOLET PRO #8B7CFF / #C4B5FD) */}
            <div className="p-6 sm:p-7 rounded-2xl gio-card-pro border-2 border-[#8B7CFF]/85 flex flex-col justify-between space-y-6 relative shadow-2xl transition-all hover:border-[#8B7CFF]">
              <div className="space-y-4">
                <div className="flex items-center justify-between gap-2">
                  <div>
                    <span className="inline-flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-[#C4B5FD]">
                      <Crown className="w-3.5 h-3.5 text-[#8B7CFF]" />
                      <span>Mais Econômico • Melhor Valor</span>
                    </span>
                    <h2 className="text-xl font-display font-extrabold text-[#F8FAFC] mt-0.5">
                      {annualPlan.name}
                    </h2>
                  </div>
                  <span className="px-2.5 py-1 rounded-md text-[11px] font-mono font-extrabold uppercase bg-[#20C997] text-[#050D20] shadow-sm tabular-nums">
                    ~{annualPlan.annualDiscountPercent}% OFF
                  </span>
                </div>

                <div className="pt-3 border-t border-[#8B7CFF]/30 space-y-2">
                  <div className="flex items-baseline gap-1.5">
                    <span className="text-3xl font-mono font-extrabold text-[#C4B5FD] tabular-nums">
                      {formatBrl(annualPlan.price)}
                    </span>
                    <span className="text-xs text-[#94A3B8] font-mono">/ 12 meses</span>
                  </div>
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="px-2 py-0.5 rounded bg-[#8B7CFF]/20 border border-[#8B7CFF]/45 text-[11px] font-mono font-bold text-[#C4B5FD] tabular-nums">
                      Equivale a ~{formatBrl(annualPlan.monthlyEquivalent)}/mês
                    </span>
                    <span className="px-2 py-0.5 rounded bg-[#20C997]/15 border border-[#20C997]/40 text-[11px] font-mono font-bold text-[#20C997] tabular-nums">
                      Economia de {formatBrl(annualPlan.annualSavingsAmount)}/ano
                    </span>
                  </div>
                  <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-[#20C997]/12 border border-[#20C997]/30 text-xs font-bold text-[#20C997] font-mono tabular-nums">
                    <Sparkles className="w-3.5 h-3.5" />
                    <span>R$ 0,00 hoje • 3 dias de teste grátis</span>
                  </div>
                  <p className="text-[11px] text-[#94A3B8] leading-relaxed">
                    Ciclo anual de {formatBrl(annualPlan.price)} cobrado somente após os 3 dias de teste gratuito.
                  </p>
                </div>

                <div className="space-y-2.5 pt-3 border-t border-[#8B7CFF]/30 text-xs">
                  <div className="flex items-center gap-2.5 text-[#F8FAFC]">
                    <CheckCircle2 className="w-4 h-4 text-[#C4B5FD] shrink-0" />
                    <span>
                      <strong>Tudo do PRO Mensal Incluso:</strong> TikTok LIVE e Comentários PRO
                    </span>
                  </div>
                  <div className="flex items-center gap-2.5 text-[#F8FAFC]">
                    <CheckCircle2 className="w-4 h-4 text-[#20C997] shrink-0" />
                    <span>
                      <strong>Economia Real de {formatBrl(annualPlan.annualSavingsAmount)}:</strong> vs. 12 meses ({formatBrl(monthlyPlan.price * 12)})
                    </span>
                  </div>
                  <div className="flex items-center gap-2.5 text-[#F8FAFC]">
                    <CheckCircle2 className="w-4 h-4 text-[#C4B5FD] shrink-0" />
                    <span>
                      <strong>Proteção de Preço por 12 Meses:</strong> Garantia anual contra reajustes
                    </span>
                  </div>
                  <div className="flex items-center gap-2.5 text-[#F8FAFC]">
                    <CheckCircle2 className="w-4 h-4 text-[#00A9FF] shrink-0" />
                    <span>
                      <strong>Auditoria Criptográfica SHA-256 & CSPRNG:</strong> Certificados oficiais
                    </span>
                  </div>
                  <div className="flex items-center gap-2.5 text-[#F8FAFC]">
                    <ShieldCheck className="w-4 h-4 text-[#20C997] shrink-0" />
                    <span>
                      <strong>3 Dias de Teste Grátis:</strong> Cancele antes do fim sem cobrança
                    </span>
                  </div>
                </div>
              </div>

              <div className="pt-4 border-t border-[#8B7CFF]/30 space-y-2">
                <button
                  type="button"
                  onClick={() => handleOpenCheckoutModal(annualPlan)}
                  className="gio-btn-pro w-full py-3.5 px-5 text-xs font-bold justify-center shadow-lg"
                >
                  <Crown className="w-4 h-4" />
                  <span>
                    {userHasUsedTrial
                      ? `Assinar PRO Anual (${formatBrl(annualPlan.price)}/ano)`
                      : 'Começar 3 dias grátis'}
                  </span>
                  <ArrowRight className="w-4 h-4" />
                </button>
                <p className="text-[11px] text-center text-[#94A3B8] font-mono tabular-nums">
                  Após 3 dias: {formatBrl(annualPlan.price)}/ano • Cancele quando quiser
                </p>
              </div>
            </div>
          </div>

          {/* User's Current Subscription & Self-Service Cancellation Card */}
          <div className="gio-card p-6 space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-[#182943] pb-4">
              <div>
                <span className="text-[11px] font-bold uppercase tracking-wider text-[#00A9FF]">
                  Gestão da Sua Assinatura & Vínculo Firebase UID
                </span>
                <h3 className="text-lg font-extrabold text-[#F8FAFC]">
                  Status da Conta, Período de Teste e Cancelamento
                </h3>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {effectiveUid ? (
                  <span className="px-3 py-1 rounded-lg bg-[#0B1730] border border-[#00A9FF]/40 text-[11px] font-mono text-[#35B9F5]">
                    UID Autenticado: <strong>{effectiveUid}</strong>
                  </span>
                ) : (
                  <span className="px-3 py-1 rounded-lg bg-[#0B1730] border border-[#182943] text-[11px] font-medium text-[#94A3B8]">
                    Conta Firebase não conectada (faça login no topo para vincular)
                  </span>
                )}
                {isPro && (
                  <button
                    type="button"
                    onClick={onNavigateToLivePro}
                    className="gio-btn-pro px-3.5 py-1.5 text-xs"
                  >
                    <Radio className="w-3.5 h-3.5" />
                    <span>Abrir Painel TikTok LIVE PRO</span>
                  </button>
                )}
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 text-xs">
              <div className="p-3.5 rounded-xl bg-[#0B1730] border border-[#182943]">
                <span className="text-[10px] font-bold uppercase text-[#94A3B8] block">
                  Plano / Modalidade
                </span>
                <span className="font-bold text-[#F8FAFC] text-sm block mt-0.5">
                  {userSubscription?.planName || (isPro ? 'Plano PRO Ativo' : 'Plano FREE (Gratuito)')}
                </span>
                <span className="text-[11px] font-mono text-[#00A9FF] tabular-nums">
                  {userSubscription?.contractedAmount
                    ? `${formatBrl(userSubscription.contractedAmount)} (${
                        userSubscription.frequency === 12 ? 'Ciclo 12 meses' : 'Ciclo 1 mês'
                      })`
                    : 'Sem cobrança recorrente ativa'}
                </span>
              </div>

              <div className="p-3.5 rounded-xl bg-[#050D20] border border-[#182943]">
                <span className="text-[10px] font-mono uppercase text-[#94A3B8] block">
                  Status Interno & Mercado Pago
                </span>
                <span className="font-mono font-bold text-[#F5B942] text-sm block mt-0.5">
                  {userSubscription?.statusState || statusState} ({userSubscription?.billingSubStatus || 'FREE_TIER'})
                </span>
                <span className="text-[11px] font-mono text-[#94A3B8]">
                  Remoto MP: {userSubscription?.remoteMpStatus || 'nenhum'}
                </span>
              </div>

              <div className="p-3.5 rounded-xl bg-[#050D20] border border-[#182943]">
                <span className="text-[10px] font-mono uppercase text-[#94A3B8] block">
                  Fim do Teste (3 Dias) / Ciclo Vigente
                </span>
                <span className="font-mono font-bold text-[#35B9F5] text-xs block mt-0.5 tabular-nums">
                  {userSubscription?.trialEndDate
                    ? formatDatePtBr(userSubscription.trialEndDate)
                    : userSubscription?.currentPeriodEnd
                    ? formatDatePtBr(userSubscription.currentPeriodEnd)
                    : 'N/A'}
                </span>
                <span className="text-[10px] text-[#94A3B8] block mt-0.5">
                  Elegibilidade 3 dias grátis (UID):{' '}
                  <strong className="text-[#F8FAFC]">
                    {userHasUsedTrial ? 'Já utilizado nesta conta' : 'Disponível (1x por UID)'}
                  </strong>
                </span>
              </div>

              <div className="p-3.5 rounded-xl bg-[#050D20] border border-[#182943]">
                <span className="text-[10px] font-mono uppercase text-[#94A3B8] block">
                  Próxima Cobrança (next_payment_date)
                </span>
                <span className="font-mono font-bold text-[#F5B942] text-xs block mt-0.5 tabular-nums">
                  {userSubscription?.cancelAtPeriodEnd
                    ? 'Cancelada (Sem cobranças futuras)'
                    : formatDatePtBr(userSubscription?.nextPaymentDate)}
                </span>
                {userSubscription?.mpPreapprovalId && (
                  <span className="text-[10px] font-mono text-[#94A3B8] block mt-0.5 truncate">
                    ID MP: {userSubscription.mpPreapprovalId}
                  </span>
                )}
              </div>
            </div>

            {/* Bilateral Verification Input & Self-Service Cancellation Action */}
            <div className="pt-3 border-t border-[#182943] flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-4">
              <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 flex-1">
                <input
                  type="text"
                  value={verifyPreapprovalInput}
                  onChange={(e) => setVerifyPreapprovalInput(e.target.value)}
                  placeholder="ID da assinatura Mercado Pago (preapproval_id) para verificar no backend..."
                  className="flex-1 px-3.5 py-2 rounded-xl bg-[#050D20] border border-[#182943] text-xs font-mono text-[#F8FAFC] placeholder:text-[#64748B]"
                />
                <button
                  type="button"
                  onClick={() => handleVerifyPreapproval()}
                  disabled={isVerifyingPreapproval}
                  className="px-4 py-2 rounded-xl bg-[#0866F5]/20 hover:bg-[#0866F5]/30 text-[#00A9FF] border border-[#00A9FF]/40 text-xs font-bold transition flex items-center justify-center gap-1.5 shrink-0"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${isVerifyingPreapproval ? 'animate-spin' : ''}`} />
                  <span>Verificar Assinatura (GET /preapproval)</span>
                </button>
              </div>

              {userSubscription &&
                (userSubscription.statusState === 'ACTIVE' ||
                  userSubscription.statusState === 'PENDING' ||
                  userSubscription.statusState === 'PAST_DUE') &&
                !userSubscription.cancelAtPeriodEnd && (
                  <button
                    type="button"
                    onClick={handleCancelSubscription}
                    disabled={isCancelingSubscription}
                    className="px-4 py-2.5 rounded-xl bg-[#050D20] hover:bg-[#0B1730] text-[#F5B942] border border-[#F5B942]/50 text-xs font-bold transition flex items-center justify-center gap-2 shrink-0"
                  >
                    <XCircle className="w-4 h-4 text-[#F5B942]" />
                    <span>
                      {isCancelingSubscription
                        ? 'Processando cancelamento ("canceled")...'
                        : 'Cancelar Renovação Automática (Manter Acesso até o Fim do Ciclo)'}
                    </span>
                  </button>
                )}

              {userSubscription?.cancelAtPeriodEnd && (
                <div className="px-3.5 py-2 rounded-xl bg-[#F5B942]/15 border border-[#F5B942]/50 text-xs text-[#F5B942] font-mono">
                  Renovação cancelada (status: &quot;canceled&quot;) • Acesso PRO mantido até{' '}
                  {formatDatePtBr(userSubscription.trialEndDate || userSubscription.currentPeriodEnd)}
                </div>
              )}
            </div>
          </div>
        </>
      ) : (
        /* ADMIN COMMERCIAL & MERCADO PAGO HOMOLOGATION PANEL */
        <div className="space-y-6">
          {/* KPI Summary Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
            <div className="p-4 rounded-2xl bg-[#101F3D] border border-[#00A9FF]/40 shadow-[0_8px_24px_rgba(2,8,23,0.4)]">
              <span className="text-[10px] font-mono uppercase text-[#35B9F5] block">
                Em Teste Gratuito (3 Dias)
              </span>
              <span className="text-2xl font-mono font-black text-[#F8FAFC] tabular-nums mt-1 block">
                {adminSummary?.metrics.subscribersInTrialCount ?? 0}
              </span>
              <span className="text-[11px] text-[#94A3B8]">Assinantes em avaliação</span>
            </div>

            <div className="p-4 rounded-2xl bg-[#101F3D] border border-[#20C997]/40 shadow-[0_8px_24px_rgba(2,8,23,0.4)]">
              <span className="text-[10px] font-mono uppercase text-[#20C997] block">
                Assinaturas Ativas (PRO)
              </span>
              <span className="text-2xl font-mono font-black text-[#20C997] tabular-nums mt-1 block">
                {adminSummary?.metrics.activeSubscribersCount ?? 0}
              </span>
              <span className="text-[11px] text-[#94A3B8]">
                Total cadastradas: {adminSummary?.metrics.totalSubscribersCount ?? 0}
              </span>
            </div>

            <div className="p-4 rounded-2xl bg-[#101F3D] border border-[#F5B942]/40 shadow-[0_8px_24px_rgba(2,8,23,0.4)]">
              <span className="text-[10px] font-mono uppercase text-[#F5B942] block">
                Receita Plano Mensal
              </span>
              <span className="text-2xl font-mono font-black text-[#F5B942] tabular-nums mt-1 block">
                {formatBrl(adminSummary?.metrics.revenueByModality.pro_monthly ?? 0)}
              </span>
              <span className="text-[11px] text-[#94A3B8] font-mono tabular-nums">
                Modalidade R$ 29,90/mês
              </span>
            </div>

            <div className="p-4 rounded-2xl bg-[#101F3D] border border-[#F5B942]/40 shadow-[0_8px_24px_rgba(2,8,23,0.4)]">
              <span className="text-[10px] font-mono uppercase text-[#F5B942] block">
                Receita Plano Anual Integral
              </span>
              <span className="text-2xl font-mono font-black text-[#F5B942] tabular-nums mt-1 block">
                {formatBrl(adminSummary?.metrics.revenueByModality.pro_annual ?? 0)}
              </span>
              <span className="text-[11px] text-[#94A3B8] font-mono tabular-nums">
                Receita Total: {formatBrl(adminSummary?.metrics.revenueByModality.totalBrl ?? 0)}
              </span>
            </div>

            <div className="p-4 rounded-2xl bg-[#101F3D] border border-[#182943] shadow-[0_8px_24px_rgba(2,8,23,0.4)]">
              <span className="text-[10px] font-mono uppercase text-[#94A3B8] block">
                Canceladas / Pendentes
              </span>
              <span className="text-2xl font-mono font-black text-[#F8FAFC] tabular-nums mt-1 block">
                {adminSummary?.metrics.canceledSubscribersCount ?? 0} /{' '}
                {adminSummary?.metrics.pendingOrRejectedCount ?? 0}
              </span>
              <span className="text-[11px] text-[#94A3B8]">Status oficial: &quot;canceled&quot;</span>
            </div>
          </div>

          {/* Architecture Comparison Table: Option 1 (Hosted Individual) vs Alternative A (Transparent Tokenization) */}
          <div className="p-6 rounded-2xl bg-[#101F3D] border border-[#182943] space-y-4 shadow-[0_12px_32px_rgba(2,8,23,0.45)]">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <span className="text-[11px] font-mono font-bold uppercase tracking-wider text-[#F5B942]">
                  Arquitetura Oficial Mercado Pago & Vinculação ao Firebase UID
                </span>
                <h3 className="text-lg font-display font-black text-[#F8FAFC]">
                  Comparativo Técnico: Checkout Hospedado Individual vs. Alternativa A (Tokenização Transparente)
                </h3>
              </div>
              <span className="px-3 py-1 rounded-lg bg-[#050D20] border border-[#00A9FF]/40 text-[11px] font-mono text-[#35B9F5]">
                Proibido usar auto_recurring.start_date sem comprovação de 3 dias grátis
              </span>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="border-b border-[#182943] text-[11px] font-mono uppercase text-[#35B9F5] bg-[#0B1730]">
                    <th className="p-3">Critério Técnico / UX</th>
                    <th className="p-3">
                      Opção 1 (Primária): Checkout Hospedado Individual (POST /preapproval sem plano)
                    </th>
                    <th className="p-3">
                      Alternativa A (Contingência Oficial): Plano Associado + card_token_id
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#182943]/80 text-[#F8FAFC]">
                  <tr>
                    <td className="p-3 font-bold text-[#F8FAFC]">Endpoint & Vínculo UID</td>
                    <td className="p-3 font-mono text-[11px] text-[#94A3B8]">
                      POST /preapproval sem preapproval_plan_id • external_reference = Firebase UID
                    </td>
                    <td className="p-3 font-mono text-[11px] text-[#94A3B8]">
                      POST /preapproval com preapproval_plan_id + card_token_id • external_reference = Firebase UID
                    </td>
                  </tr>
                  <tr>
                    <td className="p-3 font-bold text-[#F8FAFC]">Tipo de Checkout</td>
                    <td className="p-3 text-[#35B9F5]">
                      <strong>Checkout Hospedado:</strong> Redireciona o usuário pelo init_point individual exclusivo da assinatura.
                    </td>
                    <td className="p-3 text-[#F5B942]">
                      <strong>Tokenização Transparente:</strong> Altera o fluxo de checkout hospedado para coleta via CardForm SDK no frontend.
                    </td>
                  </tr>
                  <tr>
                    <td className="p-3 font-bold text-[#F8FAFC]">Exigência de Homologação (3 Dias Grátis)</td>
                    <td className="p-3 text-[#94A3B8]">
                      Exige comprovação real via GET /preapproval/&#123;id&#125; de que free_trial (3 days) é aplicado e next_payment_date &gt;= +3 dias.
                    </td>
                    <td className="p-3 text-[#94A3B8]">
                      Herda free_trial do preapproval_plan, exigindo igualmente comprovação real de next_payment_date &gt;= +3 dias antes de liberar.
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          {/* 10-Step Homologation Report & Trigger */}
          <div className="p-6 rounded-2xl bg-[#101F3D] border border-[#F5B942]/40 space-y-4 shadow-[0_12px_32px_rgba(2,8,23,0.45)]">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-[#182943] pb-4">
              <div>
                <span className="text-[11px] font-mono font-bold uppercase tracking-wider text-[#F5B942]">
                  Protocolo Obrigatório de 10 Etapas — API de Homologação Mercado Pago
                </span>
                <h3 className="text-lg font-display font-black text-[#F8FAFC]">
                  Validação Real de Teste Gratuito (3 Dias), Titularidade UID e Status &quot;canceled&quot;
                </h3>
              </div>
              <button
                type="button"
                onClick={handleRunHomologationCheck}
                disabled={isRunningHomologation}
                className="px-4 py-2.5 rounded-xl bg-gradient-to-r from-[#F5B942] to-[#E5A932] text-[#050D20] font-black text-xs transition flex items-center gap-2 shrink-0 cursor-pointer"
              >
                <RefreshCw className={`w-4 h-4 ${isRunningHomologation ? 'animate-spin' : ''}`} />
                <span>
                  {isRunningHomologation
                    ? 'Executando 10 Etapas na API...'
                    : 'Executar Validação de Homologação (10 Etapas)'}
                </span>
              </button>
            </div>

            {homologationReport && (
              <div className="space-y-2.5">
                {homologationReport.steps.map((st) => (
                  <div
                    key={st.stepNumber}
                    className="p-3 rounded-xl bg-[#0B1730] border border-[#182943] flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs"
                  >
                    <div className="flex items-start gap-2.5">
                      <span className="px-2 py-0.5 rounded font-mono font-bold bg-[#050D20] text-[#35B9F5] border border-[#0866F5]/40 shrink-0">
                        #{st.stepNumber}
                      </span>
                      <div>
                        <span className="font-bold text-[#F8FAFC] block">{st.title}</span>
                        <span className="text-[#94A3B8] text-[11px]">{st.details}</span>
                      </div>
                    </div>
                    <span
                      className={`px-2.5 py-1 rounded-lg text-[10px] font-mono font-bold uppercase shrink-0 ${
                        st.status === 'PASSED'
                          ? 'bg-[#20C997]/15 text-[#20C997] border border-[#20C997]/40'
                          : st.status === 'BLOCKED_PENDING_CREDENTIALS'
                          ? 'bg-[#F5B942]/15 text-[#F5B942] border border-[#F5B942]/40'
                          : 'bg-[#050D20] text-[#94A3B8] border border-[#182943]'
                      }`}
                    >
                      {st.status}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Admin Commercial Plan Editor & Internal State Simulator */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="p-6 rounded-2xl bg-[#101F3D] border border-[#182943] space-y-4 shadow-[0_12px_32px_rgba(2,8,23,0.45)]">
              <h3 className="text-base font-display font-black text-[#F8FAFC] flex items-center gap-2">
                <Settings className="w-4 h-4 text-[#00A9FF]" />
                <span>Configuração de Preços e Oferta de 3 Dias Grátis</span>
              </h3>
              <p className="text-xs text-[#94A3B8]">
                Alterações de preço geram uma nova versão comercial (atual:{' '}
                <strong className="font-mono text-[#35B9F5]">
                  {commercialConfig?.priceVersion || 'v1.0.0'}
                </strong>
                ) e aplicam-se apenas a novas contratações, preservando o valor das assinaturas vigentes.
              </p>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                <div>
                  <label className="block text-[11px] font-mono uppercase text-[#94A3B8] mb-1">
                    Preço PRO Mensal (BRL)
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    value={editMonthlyPrice}
                    onChange={(e) => setEditMonthlyPrice(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl bg-[#050D20] border border-[#182943] focus:border-[#00A9FF] focus:outline-none text-[#F8FAFC] font-mono"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-mono uppercase text-[#94A3B8] mb-1">
                    Preço PRO Anual Integral (BRL)
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    value={editAnnualPrice}
                    onChange={(e) => setEditAnnualPrice(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl bg-[#050D20] border border-[#182943] focus:border-[#00A9FF] focus:outline-none text-[#F8FAFC] font-mono"
                  />
                </div>
              </div>

              <label className="flex items-center gap-2.5 text-xs text-[#F8FAFC] cursor-pointer pt-1">
                <input
                  type="checkbox"
                  checked={editTrialEnabled}
                  onChange={(e) => setEditTrialEnabled(e.target.checked)}
                  className="w-4 h-4 accent-[#00A9FF]"
                />
                <span>Habilitar oferta de 3 dias de teste gratuito para novas contas elegíveis</span>
              </label>

              <button
                type="button"
                onClick={handleSaveAdminPlans}
                disabled={isSavingAdminPlans}
                className="w-full py-2.5 px-4 rounded-xl bg-gradient-to-r from-[#0866F5] to-[#00A9FF] hover:brightness-110 text-[#F8FAFC] font-black text-xs transition cursor-pointer"
              >
                {isSavingAdminPlans ? 'Salvando...' : 'Salvar Parâmetros Comerciais (Nova Versão)'}
              </button>
            </div>

            {/* Admin Permission State Simulator (For Internal Verification Only) */}
            <div className="p-6 rounded-2xl bg-[#101F3D] border border-[#182943] space-y-4 shadow-[0_12px_32px_rgba(2,8,23,0.45)]">
              <h3 className="text-base font-display font-black text-[#F8FAFC] flex items-center gap-2">
                <ShieldCheck className="w-4 h-4 text-[#F5B942]" />
                <span>Simulador Administrativo de Estados (Uso Interno Admin)</span>
              </h3>
              <p className="text-xs text-[#94A3B8]">
                Permite ao administrador testar o bloqueio imediato do motor TikTok LIVE PRO em cada estado de assinatura sem simular cobranças no Mercado Pago.
              </p>

              <select
                value={statusState}
                disabled={isUpdating}
                onChange={(e) => {
                  const chosen = e.target.value as SubscriptionStatusState;
                  const targetTier: SubscriptionPlanTier = chosen === 'ACTIVE' ? 'PRO' : 'FREE';
                  handleAdminSimulateState(targetTier, chosen);
                }}
                className="w-full px-3.5 py-2.5 rounded-xl bg-[#050D20] border border-[#182943] focus:border-[#00A9FF] focus:outline-none text-xs font-mono font-bold text-[#F8FAFC]"
              >
                {SUBSCRIPTION_STATES.map((st) => (
                  <option key={st.state} value={st.state}>
                    {st.label}
                  </option>
                ))}
              </select>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => handleAdminSimulateState('FREE', 'FREE')}
                  disabled={isUpdating}
                  className="flex-1 py-2.5 px-3 rounded-xl bg-[#0B1730] hover:bg-[#182943] text-[#F8FAFC] border border-[#182943] text-xs font-bold transition cursor-pointer"
                >
                  Testar Bloqueio FREE
                </button>
                <button
                  type="button"
                  onClick={() => handleAdminSimulateState('PRO', 'ACTIVE')}
                  disabled={isUpdating}
                  className="flex-1 py-2.5 px-3 rounded-xl bg-gradient-to-r from-[#0866F5] to-[#00A9FF] text-[#F8FAFC] font-black text-xs transition flex items-center justify-center gap-1.5 cursor-pointer"
                >
                  {isUpdating ? <RotateCw className="w-3.5 h-3.5 animate-spin" /> : <Crown className="w-3.5 h-3.5" />}
                  <span>Override Admin PRO (ACTIVE)</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* PRE-CHECKOUT TRANSPARENCY & CONFIRMATION MODAL */}
      {selectedPlanForCheckout && (
        <div className="fixed inset-0 z-50 bg-[#050D20]/85 backdrop-blur-md flex items-center justify-center p-4 overflow-y-auto">
          <div className="relative w-full max-w-xl gio-card p-6 sm:p-7 space-y-5 border border-white/[0.12] shadow-2xl animate-scale-in text-xs">
            <div className="flex items-center justify-between border-b border-white/[0.08] pb-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-[#8B7CFF]/15 border border-[#8B7CFF]/35 flex items-center justify-center text-[#C4B5FD] shrink-0">
                  <CreditCard className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base sm:text-lg font-display font-bold text-[#F8FAFC]">
                    Confirmar Contratação da Assinatura PRO
                  </h3>
                  <p className="text-xs text-[#94A3B8]">
                    {selectedPlanForCheckout.name} • 3 Dias de Avaliação Gratuita
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setSelectedPlanForCheckout(null)}
                className="p-1.5 rounded-lg text-[#94A3B8] hover:text-[#F8FAFC] hover:bg-white/[0.08] transition"
              >
                <XCircle className="w-5 h-5" />
              </button>
            </div>

            {/* Key Commercial Disclosures Required Before Confirmation */}
            <div className="p-4 rounded-xl bg-[#0B1730] border border-[#182943] space-y-2.5">
              <div className="flex items-center justify-between">
                <span className="text-[#94A3B8]">Plano Selecionado:</span>
                <span className="font-bold text-[#F8FAFC]">{selectedPlanForCheckout.name}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-[#94A3B8]">Duração do Teste Gratuito:</span>
                <span className="font-mono font-bold text-[#20C997]">
                  {userHasUsedTrial
                    ? '0 dias (Teste já utilizado nesta conta UID)'
                    : '3 dias gratuitos (R$ 0,00 hoje)'}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-[#94A3B8]">Valor e Frequência de Renovação:</span>
                <span className="font-mono font-bold text-[#F5B942] tabular-nums">
                  {formatBrl(selectedPlanForCheckout.price)} /{' '}
                  {selectedPlanForCheckout.frequency === 12
                    ? '12 meses (cobrança anual integral)'
                    : '1 mês (mensal)'}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-[#94A3B8]">Data da Primeira Cobrança:</span>
                <span className="font-mono text-[#35B9F5] text-right tabular-nums">
                  {userHasUsedTrial
                    ? 'No ato da autorização'
                    : `Após 3 dias (~${new Date(
                        Date.now() + 3 * 24 * 60 * 60 * 1000
                      ).toLocaleDateString('pt-BR')}, confirmada via next_payment_date da API MP)`}
                </span>
              </div>
              <div className="pt-2 border-t border-[#182943] text-[11px] text-[#94A3B8] space-y-1">
                <p>
                  • <strong className="text-[#F8FAFC]">Renovação Automática:</strong> A assinatura será renovada automaticamente ao final de cada ciclo até que seja cancelada.
                </p>
                <p>
                  • <strong className="text-[#F8FAFC]">Cancelamento Livre pelo Usuário:</strong> Você pode cancelar a qualquer momento no painel, inclusive durante os 3 dias de teste gratuito (sem cobrança se cancelado antes do fim do teste), mantendo o acesso até o término do período concedido.
                </p>
              </div>
            </div>

            {/* Firebase UID & Verified Email Binding */}
            <div className="space-y-3">
              <div className="p-3 rounded-xl bg-[#0B1730] border border-[#182943] flex items-center justify-between">
                <span className="text-[#94A3B8] flex items-center gap-1.5">
                  <UserCheck className="w-4 h-4 text-[#00A9FF]" />
                  <span>Vínculo Exclusivo (external_reference):</span>
                </span>
                <span className="font-mono font-bold text-[#35B9F5]">
                  {effectiveUid || 'Faça login na conta Firebase'}
                </span>
              </div>

              <div>
                <label className="block text-[11px] font-mono uppercase text-[#94A3B8] mb-1">
                  E-mail Verificado do Comprador (payer_email no Mercado Pago)
                </label>
                <input
                  type="email"
                  value={confirmedEmailInput}
                  onChange={(e) => setConfirmedEmailInput(e.target.value)}
                  placeholder="seu-email@dominio.com"
                  className="w-full px-3.5 py-2.5 rounded-xl bg-[#050D20] border border-[#182943] focus:border-[#00A9FF] focus:outline-none text-[#F8FAFC] font-mono text-xs"
                />
              </div>

              {!emailVerified && (
                <label className="flex items-start gap-2.5 text-[11px] text-[#94A3B8] cursor-pointer">
                  <input
                    type="checkbox"
                    checked={confirmEmailOwnership}
                    onChange={(e) => setConfirmEmailOwnership(e.target.checked)}
                    className="mt-0.5 w-4 h-4 accent-[#00A9FF] shrink-0"
                  />
                  <span>
                    Confirmo que este endereço de e-mail pertence à minha conta autenticada e será utilizado na autorização da assinatura no Mercado Pago.
                  </span>
                </label>
              )}

              <label className="flex items-start gap-2.5 text-[11px] text-[#94A3B8] cursor-pointer">
                <input
                  type="checkbox"
                  checked={acceptedCommercialTerms}
                  onChange={(e) => setAcceptedCommercialTerms(e.target.checked)}
                  className="mt-0.5 w-4 h-4 accent-[#00A9FF] shrink-0"
                />
                <span>
                  Declaro ciência e concordo com a{' '}
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedPlanForCheckout(null);
                      onOpenLegalDocument?.('politica-de-assinaturas-e-pagamentos');
                    }}
                    className="text-[#35B9F5] underline hover:text-[#F8FAFC] font-semibold cursor-pointer"
                  >
                    Política de Assinaturas e Pagamentos
                  </button>{' '}
                  e com a{' '}
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedPlanForCheckout(null);
                      onOpenLegalDocument?.('politica-de-cancelamento-e-reembolso');
                    }}
                    className="text-[#35B9F5] underline hover:text-[#F8FAFC] font-semibold cursor-pointer"
                  >
                    Política de Cancelamento e Reembolso
                  </button>
                  .
                </span>
              </label>
            </div>

            {checkoutError && (
              <div className="p-3.5 rounded-xl bg-[#F5B942]/15 border border-[#F5B942]/50 text-[#F8FAFC] text-xs space-y-2">
                <div className="flex items-start gap-2">
                  <AlertTriangle className="w-4 h-4 text-[#F5B942] shrink-0 mt-0.5" />
                  <span className="font-semibold">{checkoutError}</span>
                </div>
                {checkoutPayloadPreview && (
                  <details className="text-[10px] font-mono text-[#35B9F5] pt-1">
                    <summary className="cursor-pointer text-[#F5B942]">
                      Ver Payload Oficial Preparado (POST /preapproval)
                    </summary>
                    <pre className="mt-2 p-2.5 rounded bg-[#050D20] border border-[#182943] overflow-x-auto">
                      {JSON.stringify(checkoutPayloadPreview, null, 2)}
                    </pre>
                  </details>
                )}
              </div>
            )}

            <div className="flex items-center justify-end gap-3 pt-4 border-t border-white/[0.08]">
              <button
                type="button"
                onClick={() => setSelectedPlanForCheckout(null)}
                className="gio-btn-secondary text-xs px-4 py-2.5 font-semibold"
              >
                Voltar
              </button>
              <button
                type="button"
                onClick={handleInitiateCheckout}
                disabled={isSubmittingCheckout}
                className="gio-btn-primary text-xs px-5 py-2.5 font-bold shadow-md flex items-center gap-2"
              >
                <ExternalLink className="w-4 h-4" />
                <span>
                  {isSubmittingCheckout
                    ? 'Validando no Backend...'
                    : userHasUsedTrial
                    ? 'Confirmar e Ir para o Mercado Pago'
                    : 'Confirmar e Começar 3 Dias Grátis'}
                </span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
