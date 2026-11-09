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
  isAdminAuthorized?: boolean;
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
    badgeClass: 'bg-[#0131CD]/20 text-[#FFFFFF] border-[#0131CD]/50',
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
    badgeClass: 'bg-[#10141E] text-[#94A3B8] border-[#161C2C]',
    description: 'Renovações futuras interrompidas ("status": "canceled"). Histórico de participantes e sorteios mantido.',
  },
  {
    state: 'EXPIRED',
    label: 'EXPIRED (Ciclo Expirado)',
    tier: 'FREE',
    badgeClass: 'bg-[#10141E] text-[#94A3B8] border-[#161C2C]',
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
  isAdminAuthorized = false,
}) => {
  const [activeViewTab, setActiveViewTab] = useState<'plans' | 'admin'>('plans');
  const [isUpdating, setIsUpdating] = useState(false);
  const [statusState, setStatusState] = useState<SubscriptionStatusState>(() => {
    if (entitlement.active && entitlement.tier === 'PRO' && entitlement.statusState === 'ACTIVE') {
      return 'ACTIVE';
    }
    const localState = getLocalSubscriptionState();
    if (entitlement.statusState && entitlement.statusState !== 'ACTIVE') {
      return entitlement.statusState;
    }
    return localState && localState !== 'ACTIVE' ? localState : 'FREE';
  });
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
    if (!isAdminAuthorized) {
      setAdminSummary(null);
      return;
    }
    try {
      const authHeaders = await getAuthBearerHeaders();
      if (!authHeaders.Authorization) {
        setAdminSummary(null);
        return;
      }
      const res = await fetch('/api/subscriptions/admin/summary', {
        headers: authHeaders,
      });
      if (res.ok) {
        const data = await res.json();
        if (data.summary) {
          setAdminSummary(data.summary);
          if (data.summary.homologationReport) {
            setHomologationReport(data.summary.homologationReport);
          }
        }
      } else {
        setAdminSummary(null);
      }
    } catch {
      setAdminSummary(null);
    }
  }, [isAdminAuthorized]);

  useEffect(() => {
    loadSubscriptionData();
    loadAdminSummary();
  }, [loadSubscriptionData, loadAdminSummary]);

  useEffect(() => {
    if (!isAdminAuthorized && activeViewTab === 'admin') {
      setActiveViewTab('plans');
    }
  }, [isAdminAuthorized, activeViewTab]);

  useEffect(() => {
    if (!effectiveUid) {
      setUserSubscription(null);
      setAdminSummary(null);
      setConfirmedEmailInput('');
      setConfirmEmailOwnership(false);
      setStatusState('FREE');
      return;
    }
    if (userEmail) {
      setConfirmedEmailInput(userEmail);
    }
    if (emailVerified) {
      setConfirmEmailOwnership(true);
    }
  }, [effectiveUid, userEmail, emailVerified]);

  useEffect(() => {
    if (entitlement.active && entitlement.tier === 'PRO' && entitlement.statusState === 'ACTIVE') {
      setStatusState('ACTIVE');
    } else if (entitlement.statusState && entitlement.statusState !== 'ACTIVE') {
      setStatusState(entitlement.statusState);
    } else if (statusState === 'ACTIVE') {
      setStatusState('FREE');
    }
  }, [entitlement.active, entitlement.tier, entitlement.statusState, statusState]);

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
    if (!isAdminAuthorized || !effectiveUid) {
      setNotice({
        type: 'warning',
        text: 'Acesso negado: o simulador administrativo exige autenticação de administrador confirmada pelo servidor.',
      });
      return;
    }
    setIsUpdating(true);
    setNotice(null);
    try {
      const nextState: SubscriptionStatusState =
        targetState || (target === 'PRO' ? 'ACTIVE' : 'FREE');

      const authHeaders = await getAuthBearerHeaders({
        'Content-Type': 'application/json',
      });
      if (!authHeaders.Authorization) {
        setNotice({
          type: 'warning',
          text: 'Token de autenticação ausente. Não foi possível alterar o estado no servidor.',
        });
        return;
      }

      const res = await fetch('/api/tiktok/plan/tier', {
        method: 'POST',
        headers: authHeaders,
        body: JSON.stringify({ uid: effectiveUid, tier: target, statusState: nextState }),
      });
      const data = await res.json().catch(() => ({}));

      if (!res.ok || !data?.entitlement) {
        setNotice({
          type: 'warning',
          text:
            data?.error ||
            'Operação negada pelo servidor (HTTP ' +
              res.status +
              '). Nenhum privilégio PRO foi concedido localmente.',
        });
        return;
      }

      const confirmedState: SubscriptionStatusState =
        data.entitlement.statusState || nextState;
      setStatusState(confirmedState);
      setLocalSubscriptionState(confirmedState === 'ACTIVE' ? 'FREE' : confirmedState);
      await onSwitchPlan(data.entitlement.tier, confirmedState);
      setNotice({
        type: 'info',
        text: `[Simulador Admin] Estado de permissão confirmado pelo servidor: ${confirmedState} (Plano ${data.entitlement.tier}).`,
      });
    } catch {
      setNotice({
        type: 'warning',
        text: 'Falha de comunicação com o servidor. Nenhum privilégio foi concedido localmente.',
      });
    } finally {
      setIsUpdating(false);
    }
  };

  const handleSaveAdminPlans = async () => {
    if (!isAdminAuthorized) {
      setNotice({
        type: 'warning',
        text: 'Acesso negado: somente administradores autenticados podem alterar planos comerciais.',
      });
      return;
    }
    setIsSavingAdminPlans(true);
    try {
      const authHeaders = await getAuthBearerHeaders({
        'Content-Type': 'application/json',
      });
      if (!authHeaders.Authorization) {
        setNotice({
          type: 'warning',
          text: 'Autenticação administrativa obrigatória.',
        });
        return;
      }
      const res = await fetch('/api/subscriptions/admin/plans', {
        method: 'POST',
        headers: authHeaders,
        body: JSON.stringify({
          monthlyPrice: Number(editMonthlyPrice),
          annualPrice: Number(editAnnualPrice),
          trialOfferEnabled: editTrialEnabled,
          adminEmail: userEmail || 'admin',
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
    if (!isAdminAuthorized) {
      setNotice({
        type: 'warning',
        text: 'Acesso negado: somente administradores autenticados podem executar diagnósticos de homologação.',
      });
      return;
    }
    setIsRunningHomologation(true);
    try {
      const authHeaders = await getAuthBearerHeaders({
        'Content-Type': 'application/json',
      });
      if (!authHeaders.Authorization) {
        setNotice({
          type: 'warning',
          text: 'Autenticação administrativa obrigatória.',
        });
        return;
      }
      const res = await fetch('/api/subscriptions/admin/homologation/verify', {
        method: 'POST',
        headers: authHeaders,
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
      <div className="relative overflow-hidden p-6 sm:p-8 rounded-2xl bg-[#080A0F] border border-white/[0.08] shadow-xl flex flex-col lg:flex-row lg:items-center justify-between gap-6">
        <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-[#0131CD] via-[#0131CD] to-[#B9FC01]" />

        <div className="flex items-start sm:items-center gap-4">
          {/* Official Clean Brand Emblem */}
          <div className="w-14 h-14 rounded-2xl bg-[#10141E] p-0.5 border border-white/[0.1] shadow-md flex items-center justify-center shrink-0">
            <div className="w-full h-full rounded-[14px] bg-[#080A0F] flex items-center justify-center relative">
              <Ticket className="w-7 h-7 text-[#B9FC01] transform -rotate-12" />
              <Sparkles className="w-3.5 h-3.5 text-[#B9FC01] absolute top-2 right-2" />
            </div>
          </div>

          <div className="space-y-2 max-w-2xl">
            <div className="flex flex-wrap items-center gap-2.5">
              <span className="gio-badge-pro">
                <Crown className="w-3.5 h-3.5 text-[#B9FC01]" />
                <span>Planos Oficiais & Assinatura PRO</span>
              </span>
              <span
                className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-md text-xs font-mono font-bold border ${
                  isPro
                    ? 'bg-[#20C997]/15 text-[#20C997] border-[#20C997]/40'
                    : 'bg-[#080A0F] text-[#FFFFFF] border-white/[0.1]'
                }`}
              >
                <span
                  className={`w-2 h-2 rounded-full ${
                    isPro ? 'bg-[#20C997] animate-pulse' : 'bg-[#0131CD]'
                  }`}
                />
                <span>ACESSO DA CONTA: {activeStateInfo.label}</span>
              </span>
            </div>

            <h1 className="text-2xl sm:text-3xl font-display font-extrabold text-[#FFFFFF] tracking-tight">
              GIO DA SORTE — Planos Comerciais & 3 Dias de Teste Grátis
            </h1>
            <p className="text-xs sm:text-sm text-[#94A3B8] leading-relaxed">
              Utilize o Plano FREE gratuito ou ative o <strong className="text-[#B9FC01]">Plano PRO</strong> com 3 dias de avaliação sem custo, captura em tempo real do TikTok LIVE, sorteador de comentários e campanhas Multi-LIVE.
            </p>
          </div>
        </div>

        {/* View Switcher Tabs (Planos do Usuário vs Painel Admin Comercial) */}
        <div className="flex flex-col sm:flex-row lg:flex-col gap-2 shrink-0 bg-[#10141E] p-2 rounded-xl border border-white/[0.08]">
          <button
            type="button"
            onClick={() => setActiveViewTab('plans')}
            className={`px-4 py-2.5 rounded-lg text-xs font-bold transition flex items-center justify-center gap-2 ${
              activeViewTab === 'plans'
                ? 'gio-btn-primary shadow-xs'
                : 'text-[#94A3B8] hover:text-[#FFFFFF] bg-transparent'
            }`}
          >
            <CreditCard className="w-4 h-4" />
            <span>Planos & Minha Assinatura</span>
          </button>
          {isAdminAuthorized && (
            <button
              type="button"
              onClick={() => setActiveViewTab('admin')}
              className={`px-4 py-2.5 rounded-lg text-xs font-bold transition flex items-center justify-center gap-2 ${
                activeViewTab === 'admin'
                  ? 'gio-btn-pro shadow-xs'
                  : 'text-[#B9FC01] hover:bg-white/[0.05] border border-[#B9FC01]/30'
              }`}
            >
              <Settings className="w-4 h-4" />
              <span>Diagnóstico & Homologação MP</span>
            </button>
          )}
        </div>
      </div>

      {/* Notice Banner */}
      {notice && (
        <div
          className={`p-4 rounded-xl border text-xs flex items-center justify-between gap-4 ${
            notice.type === 'success'
              ? 'bg-[#20C997]/15 border-[#20C997]/50 text-[#FFFFFF]'
              : notice.type === 'warning'
              ? 'bg-[#F5B942]/15 border-[#F5B942]/50 text-[#FFFFFF]'
              : 'bg-[#0131CD]/15 border-[#0131CD]/50 text-[#FFFFFF]'
          }`}
        >
          <div className="flex items-center gap-2.5">
            <Info className="w-4 h-4 shrink-0 text-[#B9FC01]" />
            <span>{notice.text}</span>
          </div>
          <button
            type="button"
            onClick={() => setNotice(null)}
            className="text-[#94A3B8] hover:text-[#FFFFFF] px-2 font-bold"
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
              ? 'bg-[#10141E] border-[#B9FC01]/45'
              : 'bg-[#10141E] border-[#161C2C]'
          }`}
        >
          <div className="flex items-start gap-3">
            {isPro ? (
              <CheckCircle2 className="w-5 h-5 text-[#20C997] shrink-0 mt-0.5" />
            ) : (
              <ShieldCheck className="w-5 h-5 text-[#B9FC01] shrink-0 mt-0.5" />
            )}
            <div className="space-y-1">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-xs font-bold uppercase tracking-wider text-[#FFFFFF]">
                  {isAdminAuthorized
                    ? (isPro
                        ? 'Recursos PRO Liberados nesta Sessão · Checkout Externo em Homologação'
                        : 'Proteção de Pagamento Ativa · Checkout Mercado Pago em Homologação')
                    : (isPro
                        ? 'Recursos PRO Ativos · Acesso Liberado'
                        : 'Plano Gratuito Ativo · Teste de 3 Dias Disponível')}
                </span>
                {isAdminAuthorized && (
                  <span className="px-2 py-0.5 rounded text-[10px] font-mono font-semibold bg-[#10141E] text-[#94A3B8] border border-[#161C2C]">
                    Gateway: {homologationReport?.status || 'PENDING_CREDENTIALS'}
                  </span>
                )}
              </div>
              <p className="text-xs text-[#94A3B8] leading-relaxed">
                {isAdminAuthorized
                  ? (isPro
                      ? 'Seu acesso aos módulos TikTok LIVE PRO e Sorteador de Comentários já está ativo. Novas contratações externas via Mercado Pago permanecem em modo seguro de homologação (nenhuma cobrança externa é gerada).'
                      : homologationReport?.blockReason ||
                        'A contratação financeira automática aguarda a conclusão das etapas de homologação da API do Mercado Pago. Nenhuma cobrança é realizada ou simulada.')
                  : (isPro
                      ? 'Você tem acesso completo aos recursos da plataforma GIO DA SORTE PRO nesta conta.'
                      : 'Experimente os recursos exclusivos do Plano PRO com 3 dias de avaliação gratuita sem compromisso.')}
              </p>
            </div>
          </div>
          {isAdminAuthorized && (
            <button
              type="button"
              onClick={() => setActiveViewTab('admin')}
              className="px-3.5 py-2 rounded-xl bg-[#10141E] hover:bg-[#161C2C] text-[#B9FC01] border border-[#B9FC01]/35 text-xs font-semibold shrink-0 transition"
            >
              Ver Status Técnico MP
            </button>
          )}
        </div>
      )}

      {activeViewTab === 'plans' || !isAdminAuthorized ? (
        <>
          {/* 3-Column Commercial Plans Grid: FREE | PRO MENSAL | PRO ANUAL */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-stretch">
            {/* 1. PLANO FREE */}
            <div className="p-6 sm:p-7 rounded-2xl bg-[#080A0F] border border-white/[0.08] flex flex-col justify-between space-y-6 shadow-md transition-all hover:border-white/[0.15]">
              <div className="space-y-4">
                <div className="flex items-center justify-between gap-2">
                  <div>
                    <span className="text-[11px] font-bold uppercase tracking-wider text-[#B9FC01]">
                      Mesa Oficial & Gestão Local
                    </span>
                    <h2 className="text-xl font-display font-extrabold text-[#FFFFFF] mt-0.5">
                      Plano FREE
                    </h2>
                  </div>
                  <span className="gio-badge-free">Gratuito</span>
                </div>

                <div className="pt-3 border-t border-white/[0.08]">
                  <div className="flex items-baseline gap-1.5">
                    <span className="text-3xl font-mono font-extrabold text-[#FFFFFF] tabular-nums">
                      R$ 0,00
                    </span>
                    <span className="text-xs text-[#94A3B8] font-mono">/ sempre</span>
                  </div>
                  <p className="text-xs text-[#94A3B8] mt-1.5">
                    Sem cartão de crédito • Uso livre da Mesa Oficial de Sorteio
                  </p>
                </div>

                <div className="space-y-2.5 pt-3 border-t border-white/[0.08] text-xs">
                  <div className="flex items-center gap-2.5 text-[#FFFFFF]">
                    <Check className="w-4 h-4 text-[#20C997] shrink-0" />
                    <span>Sorteio Proporcional por Moedas e Bilhetes</span>
                  </div>
                  <div className="flex items-center gap-2.5 text-[#FFFFFF]">
                    <Check className="w-4 h-4 text-[#20C997] shrink-0" />
                    <span>Globo Digital, Roleta Proporcional e Battle Royale</span>
                  </div>
                  <div className="flex items-center gap-2.5 text-[#FFFFFF]">
                    <Database className="w-4 h-4 text-[#B9FC01] shrink-0" />
                    <span>
                      <strong>Histórico e Certificados SHA-256:</strong> Laudos PDF e consulta
                    </span>
                  </div>
                  <div className="flex items-center gap-2.5 text-[#94A3B8]/70">
                    <Lock className="w-4 h-4 text-[#B9FC01] shrink-0" />
                    <span>Conexão TikTok LIVE em Tempo Real (Exclusivo PRO)</span>
                  </div>
                  <div className="flex items-center gap-2.5 text-[#94A3B8]/70">
                    <Lock className="w-4 h-4 text-[#B9FC01] shrink-0" />
                    <span>Sorteador de Comentários do TikTok (Exclusivo PRO)</span>
                  </div>
                  <div className="flex items-center gap-2.5 text-[#94A3B8]/70">
                    <Lock className="w-4 h-4 text-[#B9FC01] shrink-0" />
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
                  <ArrowRight className="w-4 h-4 text-[#B9FC01]" />
                </button>
              </div>
            </div>

            {/* 2. PLANO PRO MENSAL */}
            <div className="p-6 sm:p-7 rounded-2xl bg-[#10141E] border border-[#0131CD]/60 shadow-xl flex flex-col justify-between space-y-6 relative transition-all hover:border-[#0131CD]">
              <div className="space-y-4">
                <div className="flex items-center justify-between gap-2">
                  <div>
                    <span className="text-[11px] font-bold uppercase tracking-wider text-[#B9FC01]">
                      Flexibilidade Mensal
                    </span>
                    <h2 className="text-xl font-display font-extrabold text-[#FFFFFF] mt-0.5">
                      {monthlyPlan.name}
                    </h2>
                  </div>
                  <span className="px-2.5 py-1 rounded-md text-[10px] font-bold uppercase bg-[#20C997]/15 text-[#20C997] border border-[#20C997]/40 shadow-xs">
                    3 Dias Grátis
                  </span>
                </div>

                <div className="pt-3 border-t border-white/[0.08] space-y-2">
                  <div className="flex items-baseline gap-1.5">
                    <span className="text-3xl font-mono font-extrabold text-[#FFFFFF] tabular-nums">
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
                  <div className="flex items-center gap-2.5 text-[#FFFFFF]">
                    <Radio className="w-4 h-4 text-[#B9FC01] shrink-0" />
                    <span>
                      <strong>Conexão TikTok LIVE em Tempo Real:</strong> Webcast + OAuth 2.0
                    </span>
                  </div>
                  <div className="flex items-center gap-2.5 text-[#FFFFFF]">
                    <Gift className="w-4 h-4 text-[#B9FC01] shrink-0" />
                    <span>
                      <strong>Captura Automática de Presentes:</strong> Controle de combos sem duplicidade
                    </span>
                  </div>
                  <div className="flex items-center gap-2.5 text-[#FFFFFF]">
                    <Ticket className="w-4 h-4 text-[#B9FC01] shrink-0" />
                    <span>
                      <strong>Sorteador de Comentários PRO:</strong> Extração automática e filtros
                    </span>
                  </div>
                  <div className="flex items-center gap-2.5 text-[#FFFFFF]">
                    <Layers className="w-4 h-4 text-[#B9FC01] shrink-0" />
                    <span>
                      <strong>Campanhas Acumuladas Multi-LIVE:</strong> Ranking unificado
                    </span>
                  </div>
                  <div className="flex items-center gap-2.5 text-[#FFFFFF]">
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

            {/* 3. PLANO PRO ANUAL (MAIS ECONÔMICO — VIOLET PRO #B9FC01 / #B9FC01) */}
            <div className="p-6 sm:p-7 rounded-2xl gio-card-pro border-2 border-[#B9FC01]/85 flex flex-col justify-between space-y-6 relative shadow-2xl transition-all hover:border-[#B9FC01]">
              <div className="space-y-4">
                <div className="flex items-center justify-between gap-2">
                  <div>
                    <span className="inline-flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-[#B9FC01]">
                      <Crown className="w-3.5 h-3.5 text-[#B9FC01]" />
                      <span>Mais Econômico • Melhor Valor</span>
                    </span>
                    <h2 className="text-xl font-display font-extrabold text-[#FFFFFF] mt-0.5">
                      {annualPlan.name}
                    </h2>
                  </div>
                  <span className="px-2.5 py-1 rounded-md text-[11px] font-mono font-extrabold uppercase bg-[#20C997] text-[#080A0F] shadow-sm tabular-nums">
                    ~{annualPlan.annualDiscountPercent}% OFF
                  </span>
                </div>

                <div className="pt-3 border-t border-[#B9FC01]/30 space-y-2">
                  <div className="flex items-baseline gap-1.5">
                    <span className="text-3xl font-mono font-extrabold text-[#B9FC01] tabular-nums">
                      {formatBrl(annualPlan.price)}
                    </span>
                    <span className="text-xs text-[#94A3B8] font-mono">/ 12 meses</span>
                  </div>
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="px-2 py-0.5 rounded bg-[#B9FC01]/20 border border-[#B9FC01]/45 text-[11px] font-mono font-bold text-[#B9FC01] tabular-nums">
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

                <div className="space-y-2.5 pt-3 border-t border-[#B9FC01]/30 text-xs">
                  <div className="flex items-center gap-2.5 text-[#FFFFFF]">
                    <CheckCircle2 className="w-4 h-4 text-[#B9FC01] shrink-0" />
                    <span>
                      <strong>Tudo do PRO Mensal Incluso:</strong> TikTok LIVE e Comentários PRO
                    </span>
                  </div>
                  <div className="flex items-center gap-2.5 text-[#FFFFFF]">
                    <CheckCircle2 className="w-4 h-4 text-[#20C997] shrink-0" />
                    <span>
                      <strong>Economia Real de {formatBrl(annualPlan.annualSavingsAmount)}:</strong> vs. 12 meses ({formatBrl(monthlyPlan.price * 12)})
                    </span>
                  </div>
                  <div className="flex items-center gap-2.5 text-[#FFFFFF]">
                    <CheckCircle2 className="w-4 h-4 text-[#B9FC01] shrink-0" />
                    <span>
                      <strong>Proteção de Preço por 12 Meses:</strong> Garantia anual contra reajustes
                    </span>
                  </div>
                  <div className="flex items-center gap-2.5 text-[#FFFFFF]">
                    <CheckCircle2 className="w-4 h-4 text-[#B9FC01] shrink-0" />
                    <span>
                      <strong>Auditoria Criptográfica SHA-256 & CSPRNG:</strong> Certificados oficiais
                    </span>
                  </div>
                  <div className="flex items-center gap-2.5 text-[#FFFFFF]">
                    <ShieldCheck className="w-4 h-4 text-[#20C997] shrink-0" />
                    <span>
                      <strong>3 Dias de Teste Grátis:</strong> Cancele antes do fim sem cobrança
                    </span>
                  </div>
                </div>
              </div>

              <div className="pt-4 border-t border-[#B9FC01]/30 space-y-2">
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
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-[#161C2C] pb-4">
              <div>
                <span className="text-[11px] font-bold uppercase tracking-wider text-[#B9FC01]">
                  Gestão da Sua Assinatura & Vínculo Firebase UID
                </span>
                <h3 className="text-lg font-extrabold text-[#FFFFFF]">
                  Status da Conta, Período de Teste e Cancelamento
                </h3>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {effectiveUid ? (
                  <span className="px-3 py-1 rounded-lg bg-[#10141E] border border-[#0131CD]/40 text-[11px] font-mono text-[#B9FC01]">
                    UID Autenticado: <strong>{effectiveUid}</strong>
                  </span>
                ) : (
                  <span className="px-3 py-1 rounded-lg bg-[#10141E] border border-[#161C2C] text-[11px] font-medium text-[#94A3B8]">
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
              <div className="p-3.5 rounded-xl bg-[#10141E] border border-[#161C2C]">
                <span className="text-[10px] font-bold uppercase text-[#94A3B8] block">
                  Plano / Modalidade
                </span>
                <span className="font-bold text-[#FFFFFF] text-sm block mt-0.5">
                  {userSubscription?.planName || (isPro ? 'Plano PRO Ativo' : 'Plano FREE (Gratuito)')}
                </span>
                <span className="text-[11px] font-mono text-[#B9FC01] tabular-nums">
                  {userSubscription?.contractedAmount
                    ? `${formatBrl(userSubscription.contractedAmount)} (${
                        userSubscription.frequency === 12 ? 'Ciclo 12 meses' : 'Ciclo 1 mês'
                      })`
                    : 'Sem cobrança recorrente ativa'}
                </span>
              </div>

              <div className="p-3.5 rounded-xl bg-[#080A0F] border border-[#161C2C]">
                <span className="text-[10px] font-mono uppercase text-[#94A3B8] block">
                  {isAdminAuthorized ? 'Status Interno & Mercado Pago' : 'Situação da Assinatura'}
                </span>
                <span className="font-mono font-bold text-[#F5B942] text-sm block mt-0.5">
                  {isAdminAuthorized
                    ? `${userSubscription?.statusState || statusState} (${userSubscription?.billingSubStatus || 'FREE_TIER'})`
                    : isPro
                    ? 'Ativa (Acesso PRO Liberado)'
                    : 'Plano Gratuito (FREE)'}
                </span>
                <span className="text-[11px] font-mono text-[#94A3B8]">
                  {isAdminAuthorized
                    ? `Remoto MP: ${userSubscription?.remoteMpStatus || 'nenhum'}`
                    : isPro
                    ? 'Recursos exclusivos liberados'
                    : 'Sem cobrança recorrente ativa'}
                </span>
              </div>

              <div className="p-3.5 rounded-xl bg-[#080A0F] border border-[#161C2C]">
                <span className="text-[10px] font-mono uppercase text-[#94A3B8] block">
                  Fim do Teste (3 Dias) / Ciclo Vigente
                </span>
                <span className="font-mono font-bold text-[#B9FC01] text-xs block mt-0.5 tabular-nums">
                  {userSubscription?.trialEndDate
                    ? formatDatePtBr(userSubscription.trialEndDate)
                    : userSubscription?.currentPeriodEnd
                    ? formatDatePtBr(userSubscription.currentPeriodEnd)
                    : 'N/A'}
                </span>
                <span className="text-[10px] text-[#94A3B8] block mt-0.5">
                  Elegibilidade 3 dias grátis (UID):{' '}
                  <strong className="text-[#FFFFFF]">
                    {userHasUsedTrial ? 'Já utilizado nesta conta' : 'Disponível (1x por UID)'}
                  </strong>
                </span>
              </div>

              <div className="p-3.5 rounded-xl bg-[#080A0F] border border-[#161C2C]">
                <span className="text-[10px] font-mono uppercase text-[#94A3B8] block">
                  Próxima Cobrança (next_payment_date)
                </span>
                <span className="font-mono font-bold text-[#F5B942] text-xs block mt-0.5 tabular-nums">
                  {userSubscription?.cancelAtPeriodEnd
                    ? 'Cancelada (Sem cobranças futuras)'
                    : formatDatePtBr(userSubscription?.nextPaymentDate)}
                </span>
                {isAdminAuthorized && userSubscription?.mpPreapprovalId && (
                  <span className="text-[10px] font-mono text-[#94A3B8] block mt-0.5 truncate">
                    ID MP: {userSubscription.mpPreapprovalId}
                  </span>
                )}
              </div>
            </div>

            {/* Bilateral Verification Input (Admin Only) & Self-Service Cancellation Action */}
            <div className="pt-3 border-t border-[#161C2C] flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-4">
              {isAdminAuthorized && (
                <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 flex-1">
                  <input
                    type="text"
                    value={verifyPreapprovalInput}
                    onChange={(e) => setVerifyPreapprovalInput(e.target.value)}
                    placeholder="ID da assinatura Mercado Pago (preapproval_id) para verificar no backend..."
                    className="flex-1 px-3.5 py-2 rounded-xl bg-[#080A0F] border border-[#161C2C] text-xs font-mono text-[#FFFFFF] placeholder:text-[#94A3B8]"
                  />
                  <button
                    type="button"
                    onClick={() => handleVerifyPreapproval()}
                    disabled={isVerifyingPreapproval}
                    className="px-4 py-2 rounded-xl bg-[#0131CD]/20 hover:bg-[#0131CD]/30 text-[#FFFFFF] border border-[#0131CD]/40 text-xs font-bold transition flex items-center justify-center gap-1.5 shrink-0"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${isVerifyingPreapproval ? 'animate-spin' : ''}`} />
                    <span>Verificar Assinatura (GET /preapproval)</span>
                  </button>
                </div>
              )}

              {userSubscription &&
                (userSubscription.statusState === 'ACTIVE' ||
                  userSubscription.statusState === 'PENDING' ||
                  userSubscription.statusState === 'PAST_DUE') &&
                !userSubscription.cancelAtPeriodEnd && (
                  <button
                    type="button"
                    onClick={handleCancelSubscription}
                    disabled={isCancelingSubscription}
                    className="px-4 py-2.5 rounded-xl bg-[#080A0F] hover:bg-[#10141E] text-[#F5B942] border border-[#F5B942]/50 text-xs font-bold transition flex items-center justify-center gap-2 shrink-0"
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
            <div className="p-4 rounded-2xl bg-[#10141E] border border-[#0131CD]/40 shadow-[0_8px_24px_rgba(2,8,23,0.4)]">
              <span className="text-[10px] font-mono uppercase text-[#B9FC01] block">
                Em Teste Gratuito (3 Dias)
              </span>
              <span className="text-2xl font-mono font-black text-[#FFFFFF] tabular-nums mt-1 block">
                {adminSummary?.metrics.subscribersInTrialCount ?? 0}
              </span>
              <span className="text-[11px] text-[#94A3B8]">Assinantes em avaliação</span>
            </div>

            <div className="p-4 rounded-2xl bg-[#10141E] border border-[#20C997]/40 shadow-[0_8px_24px_rgba(2,8,23,0.4)]">
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

            <div className="p-4 rounded-2xl bg-[#10141E] border border-[#F5B942]/40 shadow-[0_8px_24px_rgba(2,8,23,0.4)]">
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

            <div className="p-4 rounded-2xl bg-[#10141E] border border-[#F5B942]/40 shadow-[0_8px_24px_rgba(2,8,23,0.4)]">
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

            <div className="p-4 rounded-2xl bg-[#10141E] border border-[#161C2C] shadow-[0_8px_24px_rgba(2,8,23,0.4)]">
              <span className="text-[10px] font-mono uppercase text-[#94A3B8] block">
                Canceladas / Pendentes
              </span>
              <span className="text-2xl font-mono font-black text-[#FFFFFF] tabular-nums mt-1 block">
                {adminSummary?.metrics.canceledSubscribersCount ?? 0} /{' '}
                {adminSummary?.metrics.pendingOrRejectedCount ?? 0}
              </span>
              <span className="text-[11px] text-[#94A3B8]">Status oficial: &quot;canceled&quot;</span>
            </div>
          </div>

          {/* Architecture Comparison Table: Option 1 (Hosted Individual) vs Alternative A (Transparent Tokenization) */}
          <div className="p-6 rounded-2xl bg-[#10141E] border border-[#161C2C] space-y-4 shadow-[0_12px_32px_rgba(2,8,23,0.45)]">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <span className="text-[11px] font-mono font-bold uppercase tracking-wider text-[#F5B942]">
                  Arquitetura Oficial Mercado Pago & Vinculação ao Firebase UID
                </span>
                <h3 className="text-lg font-display font-black text-[#FFFFFF]">
                  Comparativo Técnico: Checkout Hospedado Individual vs. Alternativa A (Tokenização Transparente)
                </h3>
              </div>
              <span className="px-3 py-1 rounded-lg bg-[#080A0F] border border-[#0131CD]/40 text-[11px] font-mono text-[#B9FC01]">
                Proibido usar auto_recurring.start_date sem comprovação de 3 dias grátis
              </span>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="border-b border-[#161C2C] text-[11px] font-mono uppercase text-[#B9FC01] bg-[#10141E]">
                    <th className="p-3">Critério Técnico / UX</th>
                    <th className="p-3">
                      Opção 1 (Primária): Checkout Hospedado Individual (POST /preapproval sem plano)
                    </th>
                    <th className="p-3">
                      Alternativa A (Contingência Oficial): Plano Associado + card_token_id
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#161C2C]/80 text-[#FFFFFF]">
                  <tr>
                    <td className="p-3 font-bold text-[#FFFFFF]">Endpoint & Vínculo UID</td>
                    <td className="p-3 font-mono text-[11px] text-[#94A3B8]">
                      POST /preapproval sem preapproval_plan_id • external_reference = Firebase UID
                    </td>
                    <td className="p-3 font-mono text-[11px] text-[#94A3B8]">
                      POST /preapproval com preapproval_plan_id + card_token_id • external_reference = Firebase UID
                    </td>
                  </tr>
                  <tr>
                    <td className="p-3 font-bold text-[#FFFFFF]">Tipo de Checkout</td>
                    <td className="p-3 text-[#B9FC01]">
                      <strong>Checkout Hospedado:</strong> Redireciona o usuário pelo init_point individual exclusivo da assinatura.
                    </td>
                    <td className="p-3 text-[#F5B942]">
                      <strong>Tokenização Transparente:</strong> Altera o fluxo de checkout hospedado para coleta via CardForm SDK no frontend.
                    </td>
                  </tr>
                  <tr>
                    <td className="p-3 font-bold text-[#FFFFFF]">Exigência de Homologação (3 Dias Grátis)</td>
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
          <div className="p-6 rounded-2xl bg-[#10141E] border border-[#F5B942]/40 space-y-4 shadow-[0_12px_32px_rgba(2,8,23,0.45)]">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-[#161C2C] pb-4">
              <div>
                <span className="text-[11px] font-mono font-bold uppercase tracking-wider text-[#F5B942]">
                  Protocolo Obrigatório de 10 Etapas — API de Homologação Mercado Pago
                </span>
                <h3 className="text-lg font-display font-black text-[#FFFFFF]">
                  Validação Real de Teste Gratuito (3 Dias), Titularidade UID e Status &quot;canceled&quot;
                </h3>
              </div>
              <button
                type="button"
                onClick={handleRunHomologationCheck}
                disabled={isRunningHomologation}
                className="px-4 py-2.5 rounded-xl bg-gradient-to-r from-[#F5B942] to-[#E5A932] text-[#080A0F] font-black text-xs transition flex items-center gap-2 shrink-0 cursor-pointer"
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
                    className="p-3 rounded-xl bg-[#10141E] border border-[#161C2C] flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs"
                  >
                    <div className="flex items-start gap-2.5">
                      <span className="px-2 py-0.5 rounded font-mono font-bold bg-[#080A0F] text-[#B9FC01] border border-[#0131CD]/40 shrink-0">
                        #{st.stepNumber}
                      </span>
                      <div>
                        <span className="font-bold text-[#FFFFFF] block">{st.title}</span>
                        <span className="text-[#94A3B8] text-[11px]">{st.details}</span>
                      </div>
                    </div>
                    <span
                      className={`px-2.5 py-1 rounded-lg text-[10px] font-mono font-bold uppercase shrink-0 ${
                        st.status === 'PASSED'
                          ? 'bg-[#20C997]/15 text-[#20C997] border border-[#20C997]/40'
                          : st.status === 'BLOCKED_PENDING_CREDENTIALS'
                          ? 'bg-[#F5B942]/15 text-[#F5B942] border border-[#F5B942]/40'
                          : 'bg-[#080A0F] text-[#94A3B8] border border-[#161C2C]'
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
            <div className="p-6 rounded-2xl bg-[#10141E] border border-[#161C2C] space-y-4 shadow-[0_12px_32px_rgba(2,8,23,0.45)]">
              <h3 className="text-base font-display font-black text-[#FFFFFF] flex items-center gap-2">
                <Settings className="w-4 h-4 text-[#B9FC01]" />
                <span>Configuração de Preços e Oferta de 3 Dias Grátis</span>
              </h3>
              <p className="text-xs text-[#94A3B8]">
                Alterações de preço geram uma nova versão comercial (atual:{' '}
                <strong className="font-mono text-[#B9FC01]">
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
                    className="w-full px-3 py-2 rounded-xl bg-[#080A0F] border border-[#161C2C] focus:outline-none focus:border-[#B9FC01] focus:ring-2 focus:ring-[#B9FC01]/35 text-[#FFFFFF] font-mono"
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
                    className="w-full px-3 py-2 rounded-xl bg-[#080A0F] border border-[#161C2C] focus:outline-none focus:border-[#B9FC01] focus:ring-2 focus:ring-[#B9FC01]/35 text-[#FFFFFF] font-mono"
                  />
                </div>
              </div>

              <label className="flex items-center gap-2.5 text-xs text-[#FFFFFF] cursor-pointer pt-1">
                <input
                  type="checkbox"
                  checked={editTrialEnabled}
                  onChange={(e) => setEditTrialEnabled(e.target.checked)}
                  className="w-4 h-4 accent-[#0131CD]"
                />
                <span>Habilitar oferta de 3 dias de teste gratuito para novas contas elegíveis</span>
              </label>

              <button
                type="button"
                onClick={handleSaveAdminPlans}
                disabled={isSavingAdminPlans}
                className="w-full py-2.5 px-4 rounded-xl bg-gradient-to-r from-[#0131CD] to-[#0131CD] hover:brightness-110 text-[#FFFFFF] font-black text-xs transition cursor-pointer"
              >
                {isSavingAdminPlans ? 'Salvando...' : 'Salvar Parâmetros Comerciais (Nova Versão)'}
              </button>
            </div>

            {/* Admin Permission State Simulator (For Internal Verification Only) */}
            <div className="p-6 rounded-2xl bg-[#10141E] border border-[#161C2C] space-y-4 shadow-[0_12px_32px_rgba(2,8,23,0.45)]">
              <h3 className="text-base font-display font-black text-[#FFFFFF] flex items-center gap-2">
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
                className="w-full px-3.5 py-2.5 rounded-xl bg-[#080A0F] border border-[#161C2C] focus:outline-none focus:border-[#B9FC01] focus:ring-2 focus:ring-[#B9FC01]/35 text-xs font-mono font-bold text-[#FFFFFF]"
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
                  className="flex-1 py-2.5 px-3 rounded-xl bg-[#10141E] hover:bg-[#161C2C] text-[#FFFFFF] border border-[#161C2C] text-xs font-bold transition cursor-pointer"
                >
                  Testar Bloqueio FREE
                </button>
                <button
                  type="button"
                  onClick={() => handleAdminSimulateState('PRO', 'ACTIVE')}
                  disabled={isUpdating}
                  className="flex-1 py-2.5 px-3 rounded-xl bg-gradient-to-r from-[#0131CD] to-[#0131CD] text-[#FFFFFF] font-black text-xs transition flex items-center justify-center gap-1.5 cursor-pointer"
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
        <div className="fixed inset-0 z-50 bg-[#080A0F]/85 backdrop-blur-md flex items-center justify-center p-4 overflow-y-auto">
          <div className="relative w-full max-w-xl gio-card p-6 sm:p-7 space-y-5 border border-white/[0.12] shadow-2xl animate-scale-in text-xs">
            <div className="flex items-center justify-between border-b border-white/[0.08] pb-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-[#B9FC01]/15 border border-[#B9FC01]/35 flex items-center justify-center text-[#B9FC01] shrink-0">
                  <CreditCard className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base sm:text-lg font-display font-bold text-[#FFFFFF]">
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
                className="p-1.5 rounded-lg text-[#94A3B8] hover:text-[#FFFFFF] hover:bg-white/[0.08] transition"
              >
                <XCircle className="w-5 h-5" />
              </button>
            </div>

            {/* Key Commercial Disclosures Required Before Confirmation */}
            <div className="p-4 rounded-xl bg-[#10141E] border border-[#161C2C] space-y-2.5">
              <div className="flex items-center justify-between">
                <span className="text-[#94A3B8]">Plano Selecionado:</span>
                <span className="font-bold text-[#FFFFFF]">{selectedPlanForCheckout.name}</span>
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
                <span className="font-mono text-[#B9FC01] text-right tabular-nums">
                  {userHasUsedTrial
                    ? 'No ato da autorização'
                    : `Após 3 dias (~${new Date(
                        Date.now() + 3 * 24 * 60 * 60 * 1000
                      ).toLocaleDateString('pt-BR')}, confirmada via next_payment_date da API MP)`}
                </span>
              </div>
              <div className="pt-2 border-t border-[#161C2C] text-[11px] text-[#94A3B8] space-y-1">
                <p>
                  • <strong className="text-[#FFFFFF]">Renovação Automática:</strong> A assinatura será renovada automaticamente ao final de cada ciclo até que seja cancelada.
                </p>
                <p>
                  • <strong className="text-[#FFFFFF]">Cancelamento Livre pelo Usuário:</strong> Você pode cancelar a qualquer momento no painel, inclusive durante os 3 dias de teste gratuito (sem cobrança se cancelado antes do fim do teste), mantendo o acesso até o término do período concedido.
                </p>
              </div>
            </div>

            {/* Firebase UID & Verified Email Binding */}
            <div className="space-y-3">
              <div className="p-3 rounded-xl bg-[#10141E] border border-[#161C2C] flex items-center justify-between">
                <span className="text-[#94A3B8] flex items-center gap-1.5">
                  <UserCheck className="w-4 h-4 text-[#B9FC01]" />
                  <span>Vínculo Exclusivo (external_reference):</span>
                </span>
                <span className="font-mono font-bold text-[#B9FC01]">
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
                  className="w-full px-3.5 py-2.5 rounded-xl bg-[#080A0F] border border-[#161C2C] focus:outline-none focus:border-[#B9FC01] focus:ring-2 focus:ring-[#B9FC01]/35 text-[#FFFFFF] font-mono text-xs"
                />
              </div>

              {!emailVerified && (
                <label className="flex items-start gap-2.5 text-[11px] text-[#94A3B8] cursor-pointer">
                  <input
                    type="checkbox"
                    checked={confirmEmailOwnership}
                    onChange={(e) => setConfirmEmailOwnership(e.target.checked)}
                    className="mt-0.5 w-4 h-4 accent-[#0131CD] shrink-0"
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
                  className="mt-0.5 w-4 h-4 accent-[#0131CD] shrink-0"
                />
                <span>
                  Declaro ciência e concordo com a{' '}
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedPlanForCheckout(null);
                      onOpenLegalDocument?.('politica-de-assinaturas-e-pagamentos');
                    }}
                    className="text-[#B9FC01] underline hover:text-[#FFFFFF] font-semibold cursor-pointer"
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
                    className="text-[#B9FC01] underline hover:text-[#FFFFFF] font-semibold cursor-pointer"
                  >
                    Política de Cancelamento e Reembolso
                  </button>
                  .
                </span>
              </label>
            </div>

            {checkoutError && (
              <div className="p-3.5 rounded-xl bg-[#F5B942]/15 border border-[#F5B942]/50 text-[#FFFFFF] text-xs space-y-2">
                <div className="flex items-start gap-2">
                  <AlertTriangle className="w-4 h-4 text-[#F5B942] shrink-0 mt-0.5" />
                  <span className="font-semibold">{checkoutError}</span>
                </div>
                {checkoutPayloadPreview && (
                  <details className="text-[10px] font-mono text-[#B9FC01] pt-1">
                    <summary className="cursor-pointer text-[#F5B942]">
                      Ver Payload Oficial Preparado (POST /preapproval)
                    </summary>
                    <pre className="mt-2 p-2.5 rounded bg-[#080A0F] border border-[#161C2C] overflow-x-auto">
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
