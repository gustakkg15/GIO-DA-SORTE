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
    badgeClass: 'bg-cyan-950/80 text-cyan-300 border-cyan-500/50',
    description: 'Todas as automações TikTok LIVE PRO, captura de presentes e emissão de bilhetes liberadas.',
  },
  {
    state: 'FREE',
    label: 'FREE (Plano Gratuito)',
    tier: 'FREE',
    badgeClass: 'bg-blue-950/80 text-blue-300 border-blue-700/50',
    description: 'Sorteadores manuais liberados e histórico salvo disponível para consulta e exportação.',
  },
  {
    state: 'PENDING',
    label: 'PENDING (Aguardando Confirmação)',
    tier: 'FREE',
    badgeClass: 'bg-amber-950/80 text-amber-300 border-amber-500/50',
    description: 'Assinatura individual criada. Automações ao vivo aguardam autorização no Mercado Pago.',
  },
  {
    state: 'PAST_DUE',
    label: 'PAST_DUE (Pagamento em Atraso)',
    tier: 'FREE',
    badgeClass: 'bg-amber-950/90 text-amber-200 border-amber-600/60',
    description: 'Renovação pendente de regularização. Dados históricos permanecem 100% preservados.',
  },
  {
    state: 'CANCELED',
    label: 'CANCELED (Cancelada — Ciclo Encerrado)',
    tier: 'FREE',
    badgeClass: 'bg-slate-900 text-slate-300 border-slate-700',
    description: 'Renovações futuras interrompidas ("status": "canceled"). Histórico de participantes e sorteios mantido.',
  },
  {
    state: 'EXPIRED',
    label: 'EXPIRED (Ciclo Expirado)',
    tier: 'FREE',
    badgeClass: 'bg-slate-900 text-slate-400 border-slate-800',
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
    <div className="space-y-6">
      {/* Top Hero Banner — Sapphire Blue, Cyan, Gold & Deep Black */}
      <div className="p-6 sm:p-8 rounded-2xl bg-gradient-to-r from-[#030712] via-[#0A1128] to-[#0F1B3D] border border-cyan-500/35 shadow-2xl flex flex-col lg:flex-row lg:items-center justify-between gap-6">
        <div className="flex items-start sm:items-center gap-4">
          <img
            src="/logo.png"
            alt="GIO DA SORTE PRO"
            className="w-16 h-16 object-contain shrink-0 drop-shadow-[0_0_14px_rgba(34,211,238,0.45)]"
          />
          <div className="space-y-2 max-w-2xl">
            <div className="flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-mono font-bold uppercase tracking-wider bg-amber-500/15 text-amber-300 border border-amber-400/40">
                <Crown className="w-3.5 h-3.5 text-amber-400" />
                <span>Planos Oficiais & Assinatura Recorrente</span>
              </span>
              <span
                className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-mono font-bold border ${activeStateInfo.badgeClass}`}
              >
                <span
                  className={`w-2 h-2 rounded-full ${
                    isPro ? 'bg-cyan-400 animate-pulse' : 'bg-amber-400'
                  }`}
                />
                <span>ESTADO ATUAL: {activeStateInfo.label}</span>
              </span>
            </div>

            <h1 className="text-2xl sm:text-3xl font-display font-black text-white tracking-tight">
              GIO DA SORTE PRO — Planos Comerciais & 3 Dias de Teste Grátis
            </h1>
            <p className="text-xs sm:text-sm text-cyan-100/80 leading-relaxed">
              Assinatura recorrente integrada ao Mercado Pago com 3 dias de avaliação gratuita, vinculação criptográfica 1:1 ao seu Firebase UID e cancelamento a qualquer momento mantendo o acesso até o fim do período vigente.
            </p>
          </div>
        </div>

        {/* View Switcher Tabs (Planos do Usuário vs Painel Admin Comercial) */}
        <div className="flex flex-col sm:flex-row lg:flex-col gap-2 shrink-0 bg-[#050814] p-2.5 rounded-2xl border border-blue-800/70">
          <button
            type="button"
            onClick={() => setActiveViewTab('plans')}
            className={`px-4 py-2.5 rounded-xl text-xs font-bold transition flex items-center justify-center gap-2 ${
              activeViewTab === 'plans'
                ? 'bg-gradient-to-r from-cyan-500 to-blue-600 text-slate-950 font-black shadow-lg shadow-cyan-500/20'
                : 'text-slate-300 hover:text-white bg-[#0A1128]'
            }`}
          >
            <CreditCard className="w-4 h-4" />
            <span>Planos & Minha Assinatura</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveViewTab('admin')}
            className={`px-4 py-2.5 rounded-xl text-xs font-bold transition flex items-center justify-center gap-2 ${
              activeViewTab === 'admin'
                ? 'bg-gradient-to-r from-amber-400 to-yellow-500 text-slate-950 font-black shadow-lg shadow-amber-500/20'
                : 'text-amber-300/90 hover:text-amber-200 bg-[#0A1128] border border-amber-500/30'
            }`}
          >
            <Settings className="w-4 h-4" />
            <span>Painel Admin & Homologação MP</span>
          </button>
        </div>
      </div>

      {/* Notice Banner */}
      {notice && (
        <div
          className={`p-4 rounded-xl border text-xs flex items-center justify-between gap-4 ${
            notice.type === 'success'
              ? 'bg-cyan-950/70 border-cyan-500/60 text-cyan-100'
              : notice.type === 'warning'
              ? 'bg-amber-950/70 border-amber-500/60 text-amber-100'
              : 'bg-blue-950/70 border-blue-600/60 text-blue-100'
          }`}
        >
          <div className="flex items-center gap-2.5">
            <Info className="w-4 h-4 shrink-0 text-cyan-400" />
            <span>{notice.text}</span>
          </div>
          <button
            type="button"
            onClick={() => setNotice(null)}
            className="text-slate-400 hover:text-white px-2 font-bold"
          >
            ✕
          </button>
        </div>
      )}

      {/* Homologation Fail-Closed Gate Status Banner */}
      {isContractingBlocked && (
        <div className="p-4 sm:p-5 rounded-2xl bg-[#0A1128] border border-amber-400/50 shadow-lg flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div className="flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
            <div className="space-y-1">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-xs font-display font-black uppercase tracking-wider text-amber-300">
                  Trava de Segurança Fail-Closed Ativa — Homologação Mercado Pago
                </span>
                <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-amber-950 text-amber-300 border border-amber-600/50">
                  {homologationReport?.status || 'PENDING_CREDENTIALS'}
                </span>
              </div>
              <p className="text-xs text-blue-100/85 leading-relaxed">
                {homologationReport?.blockReason ||
                  'Contratação bloqueada preventivamente até a validação das 10 etapas na API de homologação do Mercado Pago (incluindo confirmação de free_trial de 3 dias e next_payment_date >= +3 dias). Nenhuma cobrança é realizada ou simulada.'}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setActiveViewTab('admin')}
            className="px-3.5 py-2 rounded-xl bg-amber-500/20 hover:bg-amber-500/30 text-amber-200 border border-amber-400/40 text-xs font-bold shrink-0 transition"
          >
            Ver 10 Etapas de Homologação
          </button>
        </div>
      )}

      {activeViewTab === 'plans' ? (
        <>
          {/* 3-Column Commercial Plans Grid: FREE | PRO MENSAL | PRO ANUAL */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-stretch">
            {/* 1. PLANO FREE */}
            <div className="p-6 rounded-2xl bg-[#0A1128]/90 border border-blue-800/70 flex flex-col justify-between space-y-6">
              <div className="space-y-4">
                <div className="flex items-center justify-between gap-2">
                  <div>
                    <span className="text-[11px] font-mono font-bold uppercase tracking-wider text-blue-300">
                      Sorteios Manuais & Histórico
                    </span>
                    <h2 className="text-xl font-display font-black text-white mt-0.5">
                      Plano FREE
                    </h2>
                  </div>
                  <span className="px-2.5 py-1 rounded-lg text-[10px] font-mono font-bold uppercase bg-blue-950 text-blue-200 border border-blue-700">
                    Gratuito
                  </span>
                </div>

                <div className="pt-2 border-t border-blue-900/70">
                  <div className="flex items-baseline gap-1.5">
                    <span className="text-3xl font-mono font-black text-white tabular-nums">
                      R$ 0,00
                    </span>
                    <span className="text-xs text-slate-400 font-mono">/ sempre</span>
                  </div>
                  <p className="text-[11px] text-slate-300 mt-1">
                    Sem cartão de crédito • Uso livre dos sorteadores manuais
                  </p>
                </div>

                <div className="space-y-2.5 pt-3 border-t border-blue-900/70 text-xs">
                  <div className="flex items-center gap-2.5 text-slate-200">
                    <Check className="w-4 h-4 text-cyan-400 shrink-0" />
                    <span>Sorteio Proporcional Manual por Moedas e Bilhetes</span>
                  </div>
                  <div className="flex items-center gap-2.5 text-slate-200">
                    <Check className="w-4 h-4 text-cyan-400 shrink-0" />
                    <span>Sorteador Clássico de Comentários e Roleta 3D</span>
                  </div>
                  <div className="flex items-center gap-2.5 text-slate-200">
                    <Database className="w-4 h-4 text-cyan-400 shrink-0" />
                    <span>
                      <strong>Preservação Total de Histórico:</strong> Consulta e exportação de sorteios salvos
                    </span>
                  </div>
                  <div className="flex items-center gap-2.5 text-slate-500">
                    <Lock className="w-4 h-4 text-slate-500 shrink-0" />
                    <span>Conexão TikTok LIVE em Tempo Real (Exclusivo PRO)</span>
                  </div>
                  <div className="flex items-center gap-2.5 text-slate-500">
                    <Lock className="w-4 h-4 text-slate-500 shrink-0" />
                    <span>Captura Automática de Presentes e Combos (Exclusivo PRO)</span>
                  </div>
                  <div className="flex items-center gap-2.5 text-slate-500">
                    <Lock className="w-4 h-4 text-slate-500 shrink-0" />
                    <span>Campanhas Acumuladas Multi-LIVE (Exclusivo PRO)</span>
                  </div>
                </div>
              </div>

              <div className="pt-4 border-t border-blue-900/70">
                <button
                  type="button"
                  onClick={onNavigateToParticipants}
                  className="w-full py-3 px-4 rounded-xl bg-blue-950 hover:bg-blue-900 text-blue-100 border border-blue-700 text-xs font-bold transition flex items-center justify-center gap-2"
                >
                  <span>Consultar Histórico Salvo</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>

            {/* 2. GIO DA SORTE PRO MENSAL */}
            <div className="p-6 rounded-2xl bg-gradient-to-b from-[#0F1B3D] to-[#050814] border border-cyan-500/50 shadow-xl flex flex-col justify-between space-y-6 relative">
              <div className="space-y-4">
                <div className="flex items-center justify-between gap-2">
                  <div>
                    <span className="text-[11px] font-mono font-bold uppercase tracking-wider text-cyan-300">
                      Flexibilidade Mensal
                    </span>
                    <h2 className="text-xl font-display font-black text-white mt-0.5">
                      {monthlyPlan.name}
                    </h2>
                  </div>
                  <span className="px-2.5 py-1 rounded-lg text-[10px] font-mono font-bold uppercase bg-cyan-500/20 text-cyan-200 border border-cyan-400/50">
                    3 Dias Grátis
                  </span>
                </div>

                <div className="pt-2 border-t border-blue-800/80 space-y-1.5">
                  <div className="flex items-baseline gap-1.5">
                    <span className="text-3xl font-mono font-black text-white tabular-nums">
                      {formatBrl(monthlyPlan.price)}
                    </span>
                    <span className="text-xs text-cyan-200/80 font-mono">/ mês (BRL)</span>
                  </div>
                  <p className="text-xs font-bold text-cyan-300 font-mono tabular-nums">
                    R$ 0,00 hoje • 3 dias de teste gratuito
                  </p>
                  <p className="text-[11px] text-slate-300">
                    Cobrança recorrente mensal somente após o fim dos 3 dias de teste. Renovação automática a cada 1 mês até o cancelamento.
                  </p>
                </div>

                <div className="space-y-2.5 pt-3 border-t border-blue-800/80 text-xs">
                  <div className="flex items-center gap-2.5 text-white">
                    <Radio className="w-4 h-4 text-cyan-400 shrink-0" />
                    <span>
                      <strong>Conexão TikTok LIVE em Tempo Real:</strong> Webcast + OAuth 2.0
                    </span>
                  </div>
                  <div className="flex items-center gap-2.5 text-white">
                    <Gift className="w-4 h-4 text-cyan-400 shrink-0" />
                    <span>
                      <strong>Captura Automática de Presentes:</strong> Controle de combos sem duplicidade
                    </span>
                  </div>
                  <div className="flex items-center gap-2.5 text-white">
                    <Ticket className="w-4 h-4 text-cyan-400 shrink-0" />
                    <span>
                      <strong>Emissão Atômica de Bilhetes:</strong> Conversão automática + saldo residual
                    </span>
                  </div>
                  <div className="flex items-center gap-2.5 text-white">
                    <Layers className="w-4 h-4 text-cyan-400 shrink-0" />
                    <span>
                      <strong>Campanhas Acumuladas Multi-LIVE:</strong> Ranking unificado
                    </span>
                  </div>
                  <div className="flex items-center gap-2.5 text-white">
                    <ShieldCheck className="w-4 h-4 text-amber-400 shrink-0" />
                    <span>
                      <strong>Cancelamento Livre:</strong> Cancele no teste sem cobrança
                    </span>
                  </div>
                </div>
              </div>

              <div className="pt-4 border-t border-blue-800/80 space-y-2">
                <button
                  type="button"
                  onClick={() => handleOpenCheckoutModal(monthlyPlan)}
                  className="w-full py-3.5 px-5 rounded-xl font-black text-xs text-slate-950 bg-gradient-to-r from-cyan-400 via-cyan-300 to-sky-400 hover:brightness-110 transition shadow-lg shadow-cyan-500/20 flex items-center justify-center gap-2"
                >
                  <Sparkles className="w-4 h-4" />
                  <span>
                    {userHasUsedTrial
                      ? `Assinar PRO Mensal (${formatBrl(monthlyPlan.price)}/mês)`
                      : 'Começar 3 dias grátis'}
                  </span>
                  <ArrowRight className="w-4 h-4" />
                </button>
                <p className="text-[10px] text-center text-slate-400 font-mono">
                  Depois de 3 dias: {formatBrl(monthlyPlan.price)}/mês • Cancele quando quiser
                </p>
              </div>
            </div>

            {/* 3. GIO DA SORTE PRO ANUAL (MAIS ECONÔMICO — DOURADO & SAFIRA) */}
            <div className="p-6 rounded-2xl bg-gradient-to-b from-[#0F1B3D] via-[#0A1128] to-[#030712] border-2 border-amber-400/80 shadow-2xl shadow-amber-500/10 flex flex-col justify-between space-y-6 relative">
              <div className="space-y-4">
                <div className="flex items-center justify-between gap-2">
                  <div>
                    <span className="inline-flex items-center gap-1 text-[11px] font-mono font-black uppercase tracking-wider text-amber-300">
                      <Crown className="w-3.5 h-3.5 text-amber-400" />
                      <span>Mais Econômico • Melhor Valor</span>
                    </span>
                    <h2 className="text-xl font-display font-black text-white mt-0.5">
                      {annualPlan.name}
                    </h2>
                  </div>
                  <span className="px-2.5 py-1 rounded-lg text-[10px] font-mono font-black uppercase bg-amber-400 text-slate-950 shadow">
                    ~{annualPlan.annualDiscountPercent}% OFF
                  </span>
                </div>

                <div className="pt-2 border-t border-amber-500/30 space-y-1.5">
                  <div className="flex items-baseline gap-1.5">
                    <span className="text-3xl font-mono font-black text-amber-300 tabular-nums">
                      {formatBrl(annualPlan.price)}
                    </span>
                    <span className="text-xs text-amber-100/80 font-mono">/ 12 meses (BRL)</span>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="px-2 py-0.5 rounded bg-amber-500/15 border border-amber-400/40 text-[11px] font-mono font-bold text-amber-200 tabular-nums">
                      Equivalente a ~{formatBrl(annualPlan.monthlyEquivalent)}/mês
                    </span>
                    <span className="px-2 py-0.5 rounded bg-cyan-500/15 border border-cyan-400/40 text-[11px] font-mono font-bold text-cyan-200 tabular-nums">
                      Economia de {formatBrl(annualPlan.annualSavingsAmount)}/ano
                    </span>
                  </div>
                  <p className="text-xs font-bold text-cyan-300 font-mono tabular-nums pt-0.5">
                    R$ 0,00 hoje • 3 dias de teste gratuito
                  </p>
                  <p className="text-[11px] text-slate-300">
                    Cobrança integral de {formatBrl(annualPlan.price)} por ciclo anual (a cada 12 meses) somente após os 3 dias de teste. Não parcelado em mensalidades.
                  </p>
                </div>

                <div className="space-y-2.5 pt-3 border-t border-amber-500/30 text-xs">
                  <div className="flex items-center gap-2.5 text-white">
                    <CheckCircle2 className="w-4 h-4 text-amber-400 shrink-0" />
                    <span>
                      <strong>Tudo do PRO Mensal Incluso:</strong> Conexão TikTok LIVE ilimitada
                    </span>
                  </div>
                  <div className="flex items-center gap-2.5 text-white">
                    <CheckCircle2 className="w-4 h-4 text-amber-400 shrink-0" />
                    <span>
                      <strong>Economia Real de {formatBrl(annualPlan.annualSavingsAmount)}:</strong> Comparado a 12 mensalidades ({formatBrl(monthlyPlan.price * 12)})
                    </span>
                  </div>
                  <div className="flex items-center gap-2.5 text-white">
                    <CheckCircle2 className="w-4 h-4 text-amber-400 shrink-0" />
                    <span>
                      <strong>Proteção de Preço por 12 Meses:</strong> Ciclo anual garantido contra reajustes
                    </span>
                  </div>
                  <div className="flex items-center gap-2.5 text-white">
                    <CheckCircle2 className="w-4 h-4 text-cyan-400 shrink-0" />
                    <span>
                      <strong>Auditoria Criptográfica SHA-256 & CSPRNG:</strong> Certificados oficiais
                    </span>
                  </div>
                  <div className="flex items-center gap-2.5 text-white">
                    <ShieldCheck className="w-4 h-4 text-amber-400 shrink-0" />
                    <span>
                      <strong>3 Dias de Teste Grátis:</strong> Cancele antes do fim sem cobrança
                    </span>
                  </div>
                </div>
              </div>

              <div className="pt-4 border-t border-amber-500/30 space-y-2">
                <button
                  type="button"
                  onClick={() => handleOpenCheckoutModal(annualPlan)}
                  className="w-full py-3.5 px-5 rounded-xl font-black text-xs text-slate-950 bg-gradient-to-r from-amber-300 via-amber-400 to-yellow-500 hover:brightness-110 transition shadow-lg shadow-amber-500/25 flex items-center justify-center gap-2"
                >
                  <Crown className="w-4 h-4" />
                  <span>
                    {userHasUsedTrial
                      ? `Assinar PRO Anual (${formatBrl(annualPlan.price)}/ano)`
                      : 'Começar 3 dias grátis'}
                  </span>
                  <ArrowRight className="w-4 h-4" />
                </button>
                <p className="text-[10px] text-center text-amber-200/80 font-mono">
                  Depois de 3 dias: {formatBrl(annualPlan.price)}/ano integral • Cancele quando quiser
                </p>
              </div>
            </div>
          </div>

          {/* User's Current Subscription & Self-Service Cancellation Card */}
          <div className="p-6 rounded-2xl bg-[#0A1128] border border-blue-800/80 space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-blue-900/70 pb-4">
              <div>
                <span className="text-[11px] font-mono font-bold uppercase tracking-wider text-cyan-300">
                  Gestão da Sua Assinatura & Vínculo Firebase UID
                </span>
                <h3 className="text-lg font-display font-black text-white">
                  Status da Conta, Período de Teste e Cancelamento
                </h3>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {effectiveUid ? (
                  <span className="px-3 py-1 rounded-lg bg-[#050814] border border-cyan-500/40 text-[11px] font-mono text-cyan-200">
                    UID Autenticado: <strong>{effectiveUid}</strong>
                  </span>
                ) : (
                  <span className="px-3 py-1 rounded-lg bg-amber-950/80 border border-amber-500/40 text-[11px] font-mono text-amber-200">
                    Conta Firebase não conectada (faça login no topo para contratar)
                  </span>
                )}
                {isPro && (
                  <button
                    type="button"
                    onClick={onNavigateToLivePro}
                    className="px-3.5 py-1.5 rounded-xl bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-black text-xs transition flex items-center gap-1.5"
                  >
                    <Radio className="w-3.5 h-3.5" />
                    <span>Abrir Painel TikTok LIVE PRO</span>
                  </button>
                )}
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 text-xs">
              <div className="p-3.5 rounded-xl bg-[#050814] border border-blue-900/60">
                <span className="text-[10px] font-mono uppercase text-slate-400 block">
                  Plano / Modalidade
                </span>
                <span className="font-bold text-white text-sm block mt-0.5">
                  {userSubscription?.planName || (isPro ? 'GIO DA SORTE PRO' : 'Plano FREE (Gratuito)')}
                </span>
                <span className="text-[11px] font-mono text-cyan-300 tabular-nums">
                  {userSubscription?.contractedAmount
                    ? `${formatBrl(userSubscription.contractedAmount)} (${
                        userSubscription.frequency === 12 ? 'Ciclo 12 meses' : 'Ciclo 1 mês'
                      })`
                    : 'Sem cobrança recorrente ativa'}
                </span>
              </div>

              <div className="p-3.5 rounded-xl bg-[#050814] border border-blue-900/60">
                <span className="text-[10px] font-mono uppercase text-slate-400 block">
                  Status Interno & Mercado Pago
                </span>
                <span className="font-mono font-bold text-amber-300 text-sm block mt-0.5">
                  {userSubscription?.statusState || statusState} ({userSubscription?.billingSubStatus || 'FREE_TIER'})
                </span>
                <span className="text-[11px] font-mono text-slate-400">
                  Remoto MP: {userSubscription?.remoteMpStatus || 'nenhum'}
                </span>
              </div>

              <div className="p-3.5 rounded-xl bg-[#050814] border border-blue-900/60">
                <span className="text-[10px] font-mono uppercase text-slate-400 block">
                  Fim do Teste (3 Dias) / Ciclo Vigente
                </span>
                <span className="font-mono font-bold text-cyan-200 text-xs block mt-0.5 tabular-nums">
                  {userSubscription?.trialEndDate
                    ? formatDatePtBr(userSubscription.trialEndDate)
                    : userSubscription?.currentPeriodEnd
                    ? formatDatePtBr(userSubscription.currentPeriodEnd)
                    : 'N/A'}
                </span>
                <span className="text-[10px] text-slate-400 block mt-0.5">
                  Elegibilidade 3 dias grátis (UID):{' '}
                  <strong className="text-white">
                    {userHasUsedTrial ? 'Já utilizado nesta conta' : 'Disponível (1x por UID)'}
                  </strong>
                </span>
              </div>

              <div className="p-3.5 rounded-xl bg-[#050814] border border-blue-900/60">
                <span className="text-[10px] font-mono uppercase text-slate-400 block">
                  Próxima Cobrança (next_payment_date)
                </span>
                <span className="font-mono font-bold text-amber-200 text-xs block mt-0.5 tabular-nums">
                  {userSubscription?.cancelAtPeriodEnd
                    ? 'Cancelada (Sem cobranças futuras)'
                    : formatDatePtBr(userSubscription?.nextPaymentDate)}
                </span>
                {userSubscription?.mpPreapprovalId && (
                  <span className="text-[10px] font-mono text-slate-400 block mt-0.5 truncate">
                    ID MP: {userSubscription.mpPreapprovalId}
                  </span>
                )}
              </div>
            </div>

            {/* Bilateral Verification Input & Self-Service Cancellation Action */}
            <div className="pt-3 border-t border-blue-900/60 flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-4">
              <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 flex-1">
                <input
                  type="text"
                  value={verifyPreapprovalInput}
                  onChange={(e) => setVerifyPreapprovalInput(e.target.value)}
                  placeholder="ID da assinatura Mercado Pago (preapproval_id) para verificar no backend..."
                  className="flex-1 px-3.5 py-2 rounded-xl bg-[#050814] border border-blue-800 text-xs font-mono text-white placeholder:text-slate-500"
                />
                <button
                  type="button"
                  onClick={() => handleVerifyPreapproval()}
                  disabled={isVerifyingPreapproval}
                  className="px-4 py-2 rounded-xl bg-blue-900/80 hover:bg-blue-800 text-cyan-200 border border-cyan-500/40 text-xs font-bold transition flex items-center justify-center gap-1.5 shrink-0"
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
                    className="px-4 py-2.5 rounded-xl bg-[#050814] hover:bg-slate-900 text-amber-300 border border-amber-500/50 text-xs font-bold transition flex items-center justify-center gap-2 shrink-0"
                  >
                    <XCircle className="w-4 h-4 text-amber-400" />
                    <span>
                      {isCancelingSubscription
                        ? 'Processando cancelamento ("canceled")...'
                        : 'Cancelar Renovação Automática (Manter Acesso até o Fim do Ciclo)'}
                    </span>
                  </button>
                )}

              {userSubscription?.cancelAtPeriodEnd && (
                <div className="px-3.5 py-2 rounded-xl bg-amber-950/70 border border-amber-500/50 text-xs text-amber-200 font-mono">
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
            <div className="p-4 rounded-2xl bg-[#0A1128] border border-cyan-500/40">
              <span className="text-[10px] font-mono uppercase text-cyan-300 block">
                Em Teste Gratuito (3 Dias)
              </span>
              <span className="text-2xl font-mono font-black text-white tabular-nums mt-1 block">
                {adminSummary?.metrics.subscribersInTrialCount ?? 0}
              </span>
              <span className="text-[11px] text-slate-400">Assinantes em avaliação</span>
            </div>

            <div className="p-4 rounded-2xl bg-[#0A1128] border border-cyan-500/40">
              <span className="text-[10px] font-mono uppercase text-cyan-300 block">
                Assinaturas Ativas (PRO)
              </span>
              <span className="text-2xl font-mono font-black text-cyan-300 tabular-nums mt-1 block">
                {adminSummary?.metrics.activeSubscribersCount ?? 0}
              </span>
              <span className="text-[11px] text-slate-400">
                Total cadastradas: {adminSummary?.metrics.totalSubscribersCount ?? 0}
              </span>
            </div>

            <div className="p-4 rounded-2xl bg-[#0A1128] border border-amber-500/40">
              <span className="text-[10px] font-mono uppercase text-amber-300 block">
                Receita Plano Mensal
              </span>
              <span className="text-2xl font-mono font-black text-amber-300 tabular-nums mt-1 block">
                {formatBrl(adminSummary?.metrics.revenueByModality.pro_monthly ?? 0)}
              </span>
              <span className="text-[11px] text-slate-400 font-mono tabular-nums">
                Modalidade R$ 29,90/mês
              </span>
            </div>

            <div className="p-4 rounded-2xl bg-[#0A1128] border border-amber-500/40">
              <span className="text-[10px] font-mono uppercase text-amber-300 block">
                Receita Plano Anual Integral
              </span>
              <span className="text-2xl font-mono font-black text-amber-300 tabular-nums mt-1 block">
                {formatBrl(adminSummary?.metrics.revenueByModality.pro_annual ?? 0)}
              </span>
              <span className="text-[11px] text-slate-400 font-mono tabular-nums">
                Receita Total: {formatBrl(adminSummary?.metrics.revenueByModality.totalBrl ?? 0)}
              </span>
            </div>

            <div className="p-4 rounded-2xl bg-[#0A1128] border border-blue-800">
              <span className="text-[10px] font-mono uppercase text-slate-400 block">
                Canceladas / Pendentes
              </span>
              <span className="text-2xl font-mono font-black text-white tabular-nums mt-1 block">
                {adminSummary?.metrics.canceledSubscribersCount ?? 0} /{' '}
                {adminSummary?.metrics.pendingOrRejectedCount ?? 0}
              </span>
              <span className="text-[11px] text-slate-400">Status oficial: &quot;canceled&quot;</span>
            </div>
          </div>

          {/* Architecture Comparison Table: Option 1 (Hosted Individual) vs Alternative A (Transparent Tokenization) */}
          <div className="p-6 rounded-2xl bg-[#0A1128] border border-blue-800/80 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <span className="text-[11px] font-mono font-bold uppercase tracking-wider text-amber-300">
                  Arquitetura Oficial Mercado Pago & Vinculação ao Firebase UID
                </span>
                <h3 className="text-lg font-display font-black text-white">
                  Comparativo Técnico: Checkout Hospedado Individual vs. Alternativa A (Tokenização Transparente)
                </h3>
              </div>
              <span className="px-3 py-1 rounded-lg bg-[#050814] border border-cyan-500/40 text-[11px] font-mono text-cyan-300">
                Proibido usar auto_recurring.start_date sem comprovação de 3 dias grátis
              </span>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="border-b border-blue-800 text-[11px] font-mono uppercase text-cyan-300 bg-[#050814]">
                    <th className="p-3">Critério Técnico / UX</th>
                    <th className="p-3">
                      Opção 1 (Primária): Checkout Hospedado Individual (POST /preapproval sem plano)
                    </th>
                    <th className="p-3">
                      Alternativa A (Contingência Oficial): Plano Associado + card_token_id
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-blue-900/60 text-slate-200">
                  <tr>
                    <td className="p-3 font-bold text-white">Endpoint & Vínculo UID</td>
                    <td className="p-3 font-mono text-[11px]">
                      POST /preapproval sem preapproval_plan_id • external_reference = Firebase UID
                    </td>
                    <td className="p-3 font-mono text-[11px]">
                      POST /preapproval com preapproval_plan_id + card_token_id • external_reference = Firebase UID
                    </td>
                  </tr>
                  <tr>
                    <td className="p-3 font-bold text-white">Tipo de Checkout</td>
                    <td className="p-3 text-cyan-200">
                      <strong>Checkout Hospedado:</strong> Redireciona o usuário pelo init_point individual exclusivo da assinatura.
                    </td>
                    <td className="p-3 text-amber-200">
                      <strong>Tokenização Transparente:</strong> Altera o fluxo de checkout hospedado para coleta via CardForm SDK no frontend.
                    </td>
                  </tr>
                  <tr>
                    <td className="p-3 font-bold text-white">Exigência de Homologação (3 Dias Grátis)</td>
                    <td className="p-3">
                      Exige comprovação real via GET /preapproval/&#123;id&#125; de que free_trial (3 days) é aplicado e next_payment_date &gt;= +3 dias.
                    </td>
                    <td className="p-3">
                      Herda free_trial do preapproval_plan, exigindo igualmente comprovação real de next_payment_date &gt;= +3 dias antes de liberar.
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          {/* 10-Step Homologation Report & Trigger */}
          <div className="p-6 rounded-2xl bg-[#0A1128] border border-amber-500/40 space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-blue-900/70 pb-4">
              <div>
                <span className="text-[11px] font-mono font-bold uppercase tracking-wider text-amber-300">
                  Protocolo Obrigatório de 10 Etapas — API de Homologação Mercado Pago
                </span>
                <h3 className="text-lg font-display font-black text-white">
                  Validação Real de Teste Gratuito (3 Dias), Titularidade UID e Status &quot;canceled&quot;
                </h3>
              </div>
              <button
                type="button"
                onClick={handleRunHomologationCheck}
                disabled={isRunningHomologation}
                className="px-4 py-2.5 rounded-xl bg-gradient-to-r from-amber-400 to-yellow-500 text-slate-950 font-black text-xs transition flex items-center gap-2 shrink-0"
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
                    className="p-3 rounded-xl bg-[#050814] border border-blue-900/70 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs"
                  >
                    <div className="flex items-start gap-2.5">
                      <span className="px-2 py-0.5 rounded font-mono font-bold bg-blue-950 text-cyan-300 border border-blue-800 shrink-0">
                        #{st.stepNumber}
                      </span>
                      <div>
                        <span className="font-bold text-white block">{st.title}</span>
                        <span className="text-slate-400 text-[11px]">{st.details}</span>
                      </div>
                    </div>
                    <span
                      className={`px-2.5 py-1 rounded-lg text-[10px] font-mono font-bold uppercase shrink-0 ${
                        st.status === 'PASSED'
                          ? 'bg-cyan-950 text-cyan-300 border border-cyan-500/50'
                          : st.status === 'BLOCKED_PENDING_CREDENTIALS'
                          ? 'bg-amber-950 text-amber-300 border border-amber-500/50'
                          : 'bg-slate-900 text-slate-300 border border-slate-700'
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
            <div className="p-6 rounded-2xl bg-[#0A1128] border border-blue-800/80 space-y-4">
              <h3 className="text-base font-display font-black text-white flex items-center gap-2">
                <Settings className="w-4 h-4 text-cyan-400" />
                <span>Configuração de Preços e Oferta de 3 Dias Grátis</span>
              </h3>
              <p className="text-xs text-slate-300">
                Alterações de preço geram uma nova versão comercial (atual:{' '}
                <strong className="font-mono text-cyan-300">
                  {commercialConfig?.priceVersion || 'v1.0.0'}
                </strong>
                ) e aplicam-se apenas a novas contratações, preservando o valor das assinaturas vigentes.
              </p>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                <div>
                  <label className="block text-[11px] font-mono uppercase text-slate-400 mb-1">
                    Preço PRO Mensal (BRL)
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    value={editMonthlyPrice}
                    onChange={(e) => setEditMonthlyPrice(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl bg-[#050814] border border-blue-800 text-white font-mono"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-mono uppercase text-slate-400 mb-1">
                    Preço PRO Anual Integral (BRL)
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    value={editAnnualPrice}
                    onChange={(e) => setEditAnnualPrice(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl bg-[#050814] border border-blue-800 text-white font-mono"
                  />
                </div>
              </div>

              <label className="flex items-center gap-2.5 text-xs text-slate-200 cursor-pointer pt-1">
                <input
                  type="checkbox"
                  checked={editTrialEnabled}
                  onChange={(e) => setEditTrialEnabled(e.target.checked)}
                  className="w-4 h-4 accent-cyan-400"
                />
                <span>Habilitar oferta de 3 dias de teste gratuito para novas contas elegíveis</span>
              </label>

              <button
                type="button"
                onClick={handleSaveAdminPlans}
                disabled={isSavingAdminPlans}
                className="w-full py-2.5 px-4 rounded-xl bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-black text-xs transition"
              >
                {isSavingAdminPlans ? 'Salvando...' : 'Salvar Parâmetros Comerciais (Nova Versão)'}
              </button>
            </div>

            {/* Admin Permission State Simulator (For Internal Verification Only) */}
            <div className="p-6 rounded-2xl bg-[#0A1128] border border-blue-800/80 space-y-4">
              <h3 className="text-base font-display font-black text-white flex items-center gap-2">
                <ShieldCheck className="w-4 h-4 text-amber-400" />
                <span>Simulador Administrativo de Estados (Uso Interno Admin)</span>
              </h3>
              <p className="text-xs text-slate-300">
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
                className="w-full px-3.5 py-2.5 rounded-xl bg-[#050814] border border-blue-800 text-xs font-mono font-bold text-white"
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
                  className="flex-1 py-2.5 px-3 rounded-xl bg-[#050814] hover:bg-blue-950 text-blue-200 border border-blue-800 text-xs font-bold transition"
                >
                  Testar Bloqueio FREE
                </button>
                <button
                  type="button"
                  onClick={() => handleAdminSimulateState('PRO', 'ACTIVE')}
                  disabled={isUpdating}
                  className="flex-1 py-2.5 px-3 rounded-xl bg-gradient-to-r from-cyan-500 to-blue-600 text-slate-950 font-black text-xs transition flex items-center justify-center gap-1.5"
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
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto">
          <div className="w-full max-w-xl rounded-2xl bg-[#0A1128] border-2 border-cyan-500/50 shadow-2xl p-6 space-y-5 text-xs">
            <div className="flex items-start justify-between gap-4 border-b border-blue-900 pb-4">
              <div>
                <span className="text-[10px] font-mono font-bold uppercase tracking-wider text-amber-300">
                  Resumo Transparente Antes da Confirmação
                </span>
                <h3 className="text-lg font-display font-black text-white mt-0.5">
                  {selectedPlanForCheckout.name}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setSelectedPlanForCheckout(null)}
                className="text-slate-400 hover:text-white text-sm font-bold px-2"
              >
                ✕
              </button>
            </div>

            {/* Key Commercial Disclosures Required Before Confirmation */}
            <div className="p-4 rounded-xl bg-[#050814] border border-blue-800/80 space-y-2.5">
              <div className="flex items-center justify-between">
                <span className="text-slate-400">Plano Selecionado:</span>
                <span className="font-bold text-white">{selectedPlanForCheckout.name}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-400">Duração do Teste Gratuito:</span>
                <span className="font-mono font-bold text-cyan-300">
                  {userHasUsedTrial
                    ? '0 dias (Teste já utilizado nesta conta UID)'
                    : '3 dias gratuitos (R$ 0,00 hoje)'}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-400">Valor e Frequência de Renovação:</span>
                <span className="font-mono font-bold text-amber-300 tabular-nums">
                  {formatBrl(selectedPlanForCheckout.price)} /{' '}
                  {selectedPlanForCheckout.frequency === 12
                    ? '12 meses (cobrança anual integral)'
                    : '1 mês (mensal)'}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-400">Data da Primeira Cobrança:</span>
                <span className="font-mono text-cyan-200 text-right tabular-nums">
                  {userHasUsedTrial
                    ? 'No ato da autorização'
                    : `Após 3 dias (~${new Date(
                        Date.now() + 3 * 24 * 60 * 60 * 1000
                      ).toLocaleDateString('pt-BR')}, confirmada via next_payment_date da API MP)`}
                </span>
              </div>
              <div className="pt-2 border-t border-blue-900/60 text-[11px] text-slate-300 space-y-1">
                <p>
                  • <strong>Renovação Automática:</strong> A assinatura será renovada automaticamente ao final de cada ciclo até que seja cancelada.
                </p>
                <p>
                  • <strong>Cancelamento Livre pelo Usuário:</strong> Você pode cancelar a qualquer momento no painel, inclusive durante os 3 dias de teste gratuito (sem cobrança se cancelado antes do fim do teste), mantendo o acesso até o término do período concedido.
                </p>
              </div>
            </div>

            {/* Firebase UID & Verified Email Binding */}
            <div className="space-y-3">
              <div className="p-3 rounded-xl bg-[#050814] border border-blue-900/70 flex items-center justify-between">
                <span className="text-slate-400 flex items-center gap-1.5">
                  <UserCheck className="w-4 h-4 text-cyan-400" />
                  <span>Vínculo Exclusivo (external_reference):</span>
                </span>
                <span className="font-mono font-bold text-cyan-300">
                  {effectiveUid || 'Faça login na conta Firebase'}
                </span>
              </div>

              <div>
                <label className="block text-[11px] font-mono uppercase text-slate-300 mb-1">
                  E-mail Verificado do Comprador (payer_email no Mercado Pago)
                </label>
                <input
                  type="email"
                  value={confirmedEmailInput}
                  onChange={(e) => setConfirmedEmailInput(e.target.value)}
                  placeholder="seu-email@dominio.com"
                  className="w-full px-3.5 py-2.5 rounded-xl bg-[#050814] border border-blue-800 text-white font-mono text-xs"
                />
              </div>

              {!emailVerified && (
                <label className="flex items-start gap-2.5 text-[11px] text-slate-300 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={confirmEmailOwnership}
                    onChange={(e) => setConfirmEmailOwnership(e.target.checked)}
                    className="mt-0.5 w-4 h-4 accent-cyan-400 shrink-0"
                  />
                  <span>
                    Confirmo que este endereço de e-mail pertence à minha conta autenticada e será utilizado na autorização da assinatura no Mercado Pago.
                  </span>
                </label>
              )}

              <label className="flex items-start gap-2.5 text-[11px] text-slate-300 cursor-pointer">
                <input
                  type="checkbox"
                  checked={acceptedCommercialTerms}
                  onChange={(e) => setAcceptedCommercialTerms(e.target.checked)}
                  className="mt-0.5 w-4 h-4 accent-cyan-400 shrink-0"
                />
                <span>
                  Declaro ciência e concordo com a{' '}
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedPlanForCheckout(null);
                      onOpenLegalDocument?.('politica-de-assinaturas-e-pagamentos');
                    }}
                    className="text-cyan-300 underline hover:text-white font-semibold"
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
                    className="text-cyan-300 underline hover:text-white font-semibold"
                  >
                    Política de Cancelamento e Reembolso
                  </button>
                  .
                </span>
              </label>
            </div>

            {checkoutError && (
              <div className="p-3.5 rounded-xl bg-amber-950/90 border border-amber-500/70 text-amber-200 text-xs space-y-2">
                <div className="flex items-start gap-2">
                  <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                  <span className="font-semibold">{checkoutError}</span>
                </div>
                {checkoutPayloadPreview && (
                  <details className="text-[10px] font-mono text-cyan-200 pt-1">
                    <summary className="cursor-pointer text-amber-300">
                      Ver Payload Oficial Preparado (POST /preapproval)
                    </summary>
                    <pre className="mt-2 p-2.5 rounded bg-[#030712] overflow-x-auto">
                      {JSON.stringify(checkoutPayloadPreview, null, 2)}
                    </pre>
                  </details>
                )}
              </div>
            )}

            <div className="flex items-center justify-end gap-3 pt-3 border-t border-blue-900">
              <button
                type="button"
                onClick={() => setSelectedPlanForCheckout(null)}
                className="px-4 py-2.5 rounded-xl bg-[#050814] hover:bg-slate-900 text-slate-300 border border-blue-900 text-xs font-bold"
              >
                Voltar
              </button>
              <button
                type="button"
                onClick={handleInitiateCheckout}
                disabled={isSubmittingCheckout}
                className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-cyan-400 to-blue-500 text-slate-950 font-black text-xs transition flex items-center gap-2"
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
