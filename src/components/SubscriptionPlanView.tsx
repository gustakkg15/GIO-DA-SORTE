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
import { safeApiJson } from '../utils/apiConfig';

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
    badgeClass: 'bg-[#A6C957]/15 text-[#A6C957] border-[#A6C957]/40',
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
    badgeClass: 'bg-[#A6C957]/15 text-[#A6C957] border-[#A6C957]/40',
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
    badgeClass: 'bg-[#111B30] text-[#A5B1C5] border-[var(--gio-border-subtle)]',
    description: 'Renovações futuras interrompidas ("status": "canceled"). Histórico de participantes e sorteios mantido.',
  },
  {
    state: 'EXPIRED',
    label: 'EXPIRED (Ciclo Expirado)',
    tier: 'FREE',
    badgeClass: 'bg-[#111B30] text-[#A5B1C5] border-[var(--gio-border-subtle)]',
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

  // Payment provider and billing cycle selection state
  const [selectedPaymentProvider, setSelectedPaymentProvider] = useState<'MERCADO_PAGO' | 'PAYPAL'>('MERCADO_PAGO');
  const [billingCycle, setBillingCycle] = useState<'monthly' | 'annual'>('annual');

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
      const res = await safeApiJson<any>(`/api/subscriptions/plans${query}`, {
        headers: { ...authHeaders },
      });
      if (res.ok && res.data) {
        const data = res.data;
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
      const res = await safeApiJson<any>('/api/subscriptions/admin/summary', {
        headers: authHeaders,
      });
      if (res.ok && res.data) {
        const data = res.data;
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
    async (preapprovalIdToVerify?: string, providerToVerify?: 'MERCADO_PAGO' | 'PAYPAL') => {
      const targetId = (preapprovalIdToVerify || verifyPreapprovalInput).trim();
      if (!targetId) {
        setNotice({
          type: 'warning',
          text: 'Informe o ID da assinatura (preapproval_id do Mercado Pago ou ID I-... do PayPal) para verificar no backend.',
        });
        return;
      }
      if (!effectiveUid) {
        setNotice({
          type: 'warning',
          text: 'Faça login na sua conta Firebase para validar a titularidade (external_reference / custom_id === uid).',
        });
        return;
      }

      const isPayPalId = targetId.startsWith('I-') || providerToVerify === 'PAYPAL' || selectedPaymentProvider === 'PAYPAL';
      const provider: 'MERCADO_PAGO' | 'PAYPAL' = isPayPalId ? 'PAYPAL' : 'MERCADO_PAGO';

      setIsVerifyingPreapproval(true);
      try {
        const authHeaders = await getAuthBearerHeaders();
        const res = await safeApiJson<any>('/api/subscriptions/verify', {
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
            provider,
            preapprovalId: !isPayPalId ? targetId : undefined,
            paypalSubscriptionId: isPayPalId ? targetId : undefined,
          }),
        });
        const data = res.data || {};
        if (data.subscription) {
          setUserSubscription(data.subscription);
          setStatusState(data.subscription.statusState);
        }
        if (!res.ok || !data.success) {
          setNotice({
            type: 'warning',
            text: data.error || res.error || `Não foi possível validar a assinatura no provedor ${provider}.`,
          });
        } else {
          setNotice({
            type: 'success',
            text: data.message || `Assinatura verificada e sincronizada com sucesso via ${provider === 'PAYPAL' ? 'PayPal' : 'Mercado Pago'}.`,
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
    [effectiveUid, loadSubscriptionData, onSwitchPlan, selectedPaymentProvider, userEmail, verifyPreapprovalInput]
  );

  // Check URL return from Mercado Pago (?preapproval_id=...) or PayPal (?subscription_id=... or ?paypal_return=1)
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const returnedPreapprovalId = params.get('preapproval_id');
    const returnedPayPalSubId = params.get('subscription_id');
    const isPayPalReturn = params.get('paypal_return') === '1' || Boolean(returnedPayPalSubId);

    if (returnedPayPalSubId && effectiveUid) {
      setSelectedPaymentProvider('PAYPAL');
      setVerifyPreapprovalInput(returnedPayPalSubId);
      handleVerifyPreapproval(returnedPayPalSubId, 'PAYPAL');
    } else if (returnedPreapprovalId && effectiveUid) {
      setSelectedPaymentProvider('MERCADO_PAGO');
      setVerifyPreapprovalInput(returnedPreapprovalId);
      handleVerifyPreapproval(returnedPreapprovalId, 'MERCADO_PAGO');
    } else if (isPayPalReturn && effectiveUid) {
      // Return from PayPal approval without explicit query sub ID: trigger auto-verify
      handleVerifyPreapproval(undefined, 'PAYPAL');
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
      const res = await safeApiJson<any>('/api/subscriptions/checkout', {
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
          provider: selectedPaymentProvider,
          acceptedTerms: acceptedCommercialTerms,
        }),
      });

      const data = res.data || {};
      if (data.payloadPreview) {
        setCheckoutPayloadPreview(data.payloadPreview);
      }

      if (!res.ok || !data.success) {
        setCheckoutError(
          data.error ||
            res.error ||
            (selectedPaymentProvider === 'PAYPAL'
              ? 'Falha ao inicializar o checkout do PayPal. Verifique as credenciais ou tente novamente.'
              : 'Contratação bloqueada preventivamente até a conclusão da homologação na API do Mercado Pago.')
        );
        return;
      }

      if (data.subscription) {
        setUserSubscription(data.subscription);
      }

      const redirectUrl = data.approvalUrl || data.initPoint;
      setNotice({
        type: 'success',
        text: data.message || `Checkout individual criado com sucesso via ${selectedPaymentProvider === 'PAYPAL' ? 'PayPal' : 'Mercado Pago'}. Redirecionando...`,
      });
      setSelectedPlanForCheckout(null);
      await loadSubscriptionData();

      if (redirectUrl) {
        window.location.href = redirectUrl;
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
      const res = await safeApiJson<any>('/api/subscriptions/cancel', {
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
      const data = res.data || {};
      if (data.subscription) {
        setUserSubscription(data.subscription);
        setStatusState(data.subscription.statusState);
      }
      if (!res.ok || !data.success) {
        setNotice({
          type: 'warning',
          text: data.error || res.error || 'Não foi possível processar o cancelamento da assinatura.',
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

      const res = await safeApiJson<any>('/api/tiktok/plan/tier', {
        method: 'POST',
        headers: authHeaders,
        body: JSON.stringify({ uid: effectiveUid, tier: target, statusState: nextState }),
      });
      const data = res.data || {};

      if (!res.ok || !data?.entitlement) {
        setNotice({
          type: 'warning',
          text:
            data?.error ||
            res.error ||
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
      const res = await safeApiJson<any>('/api/subscriptions/admin/plans', {
        method: 'POST',
        headers: authHeaders,
        body: JSON.stringify({
          monthlyPrice: Number(editMonthlyPrice),
          annualPrice: Number(editAnnualPrice),
          trialOfferEnabled: editTrialEnabled,
          adminEmail: userEmail || 'admin',
        }),
      });
      const data = res.data || {};
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
          text: data.error || res.error || 'Erro ao atualizar configuração comercial.',
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
      const res = await safeApiJson<any>('/api/subscriptions/admin/homologation/verify', {
        method: 'POST',
        headers: authHeaders,
      });
      const data = res.data || {};
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
  const selectedCyclePlan = billingCycle === 'annual' ? annualPlan : monthlyPlan;

  return (
    <div className="space-y-6 animate-fade-in min-w-0 font-sans text-[#FFFFFF]">
      {/* Top Hero Banner — Official GIO DA SORTE SaaS Billing Identity */}
      <div className="relative overflow-hidden p-6 sm:p-8 rounded-2xl bg-[#111B30] border border-[#0131CD]/40 shadow-xl flex flex-col xl:flex-row xl:items-center justify-between gap-6">
        <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-[#0131CD] via-[#0131CD] to-[#A6C957]" />

        <div className="flex items-start gap-4 sm:gap-5 min-w-0">
          {/* Official Brand Logo */}
          <img
            src="/logo.png"
            alt="Logotipo Oficial GIO DA SORTE"
            className="w-12 h-12 sm:w-14 sm:h-14 rounded-2xl object-cover border border-[#0131CD]/50 shadow-[0_6px_20px_rgba(1,49,205,0.35)] shrink-0"
          />

          <div className="space-y-2.5 max-w-3xl min-w-0">
            <div className="flex flex-wrap items-center gap-2 text-xs">
              <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-md font-semibold bg-[#0131CD]/25 text-[#FFFFFF] border border-[#0131CD]/50">
                <Crown className="w-3.5 h-3.5 text-[#A6C957]" />
                <span>Planos & Assinatura Oficial</span>
              </span>
              <span
                className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-md font-semibold border ${
                  isPro
                    ? 'bg-[#A6C957]/15 text-[#A6C957] border-[#A6C957]/35'
                    : 'bg-[#080D18] text-[#FFFFFF] border-[var(--gio-border-subtle)]'
                }`}
              >
                <span
                  className={`w-2 h-2 rounded-full ${
                    isPro ? 'bg-[#A6C957] animate-pulse' : 'bg-[#0131CD]'
                  }`}
                />
                <span>Conta: {activeStateInfo.label}</span>
              </span>
            </div>

            <h1 className="text-xl sm:text-2xl lg:text-3xl font-bold text-[#FFFFFF] tracking-tight">
              Automatize suas Lives no TikTok com 3 Dias de Teste Grátis
            </h1>
            <p className="text-xs sm:text-sm text-[#A5B1C5] leading-relaxed">
              Utilize a Mesa Oficial de Sorteio gratuitamente no <strong className="text-[#FFFFFF] font-semibold">Plano FREE</strong> ou ative a captura em tempo real de presentes, moedas, comentários e campanhas Multi-LIVE no <strong className="text-[#A6C957] font-semibold">Plano PRO</strong> sem pagar nada hoje.
            </p>

            {/* Quick Trust & Guarantee Highlights */}
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 pt-1 text-xs text-[#A5B1C5] tabular-nums">
              <span className="inline-flex items-center gap-1.5 text-[#FFFFFF] font-medium">
                <CheckCircle2 className="w-3.5 h-3.5 text-[#A6C957] shrink-0" />
                <span>R$ 0,00 nos primeiros 3 dias</span>
              </span>
              <span aria-hidden="true" className="text-[#A5B1C5]/40 hidden sm:inline">·</span>
              <span className="inline-flex items-center gap-1.5">
                <ShieldCheck className="w-3.5 h-3.5 text-[#0131CD] shrink-0" />
                <span>Cancelamento livre com 1 clique</span>
              </span>
              <span aria-hidden="true" className="text-[#A5B1C5]/40 hidden sm:inline">·</span>
              <span className="inline-flex items-center gap-1.5">
                <Database className="w-3.5 h-3.5 text-[#A5B1C5] shrink-0" />
                <span>Histórico e dados 100% preservados</span>
              </span>
            </div>
          </div>
        </div>

        {/* Right Controls: Quick CTA or View Switcher Tabs */}
        <div className="flex flex-col sm:flex-row xl:flex-col gap-2 shrink-0 bg-[#080D18] p-2 rounded-xl border border-[var(--gio-border-subtle)]">
          {isPro && (
            <button
              type="button"
              onClick={onNavigateToLivePro}
              className="px-4 py-2.5 rounded-lg text-xs font-semibold bg-[#A6C957] hover:bg-[#B5D477] text-[#080D18] transition flex items-center justify-center gap-2 shadow-sm cursor-pointer"
            >
              <Radio className="w-4 h-4 text-[#080D18]" />
              <span>Abrir Painel TikTok LIVE PRO</span>
            </button>
          )}
          <button
            type="button"
            onClick={() => setActiveViewTab('plans')}
            className={`px-4 py-2.5 rounded-lg text-xs font-semibold transition flex items-center justify-center gap-2 cursor-pointer ${
              activeViewTab === 'plans'
                ? 'bg-[#0131CD] text-[#FFFFFF] shadow-xs'
                : 'text-[#A5B1C5] hover:text-[#FFFFFF] bg-transparent'
            }`}
          >
            <CreditCard className="w-4 h-4" />
            <span>Planos & Minha Assinatura</span>
          </button>
          {isAdminAuthorized && (
            <button
              type="button"
              onClick={() => setActiveViewTab('admin')}
              className={`px-4 py-2.5 rounded-lg text-xs font-semibold transition flex items-center justify-center gap-2 cursor-pointer ${
                activeViewTab === 'admin'
                  ? 'bg-[#A6C957] text-[#080D18] font-bold shadow-xs'
                  : 'text-[#A6C957] hover:bg-[#111B30] border border-[#A6C957]/30'
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
              ? 'bg-[#A6C957]/15 border-[#A6C957]/40 text-[#FFFFFF]'
              : notice.type === 'warning'
              ? 'bg-[#A6C957]/10 border-[#A6C957]/35 text-[#FFFFFF]'
              : 'bg-[#0131CD]/15 border-[#0131CD]/50 text-[#FFFFFF]'
          }`}
        >
          <div className="flex items-center gap-2.5">
            <Info className="w-4 h-4 shrink-0 text-[#A6C957]" />
            <span>{notice.text}</span>
          </div>
          <button
            type="button"
            onClick={() => setNotice(null)}
            className="text-[#A5B1C5] hover:text-[#FFFFFF] px-2 font-semibold"
          >
            ✕
          </button>
        </div>
      )}

      {/* Harmonized Gateway & Entitlement Status Banner */}
      {isContractingBlocked && (
        <div
          className={`p-4 sm:p-5 rounded-2xl border flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 ${
            isPro
              ? 'bg-[#111B30] border-[#A6C957]/40'
              : 'bg-[#111B30] border-[var(--gio-border-subtle)]'
          }`}
        >
          <div className="flex items-start gap-3">
            {isPro ? (
              <CheckCircle2 className="w-5 h-5 text-[#A6C957] shrink-0 mt-0.5" />
            ) : (
              <ShieldCheck className="w-5 h-5 text-[#0131CD] shrink-0 mt-0.5" />
            )}
            <div className="space-y-1">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-xs font-semibold text-[#FFFFFF]">
                  {isAdminAuthorized
                    ? isPro
                      ? 'Recursos PRO Liberados nesta Sessão · Checkout Externo em Homologação'
                      : 'Proteção de Pagamento Ativa · Checkout Mercado Pago em Homologação'
                    : isPro
                    ? 'Recursos PRO Ativos · Acesso Liberado'
                    : 'Plano Gratuito Ativo · Teste de 3 Dias Disponível'}
                </span>
                {isAdminAuthorized && (
                  <span className="px-2 py-0.5 rounded text-[10px] font-mono font-semibold bg-[#080D18] text-[#A5B1C5] border border-[var(--gio-border-subtle)]">
                    Gateway: {homologationReport?.status || 'PENDING_CREDENTIALS'}
                  </span>
                )}
              </div>
              <p className="text-xs text-[#A5B1C5] leading-relaxed">
                {isAdminAuthorized
                  ? isPro
                    ? 'Seu acesso aos módulos TikTok LIVE PRO e Sorteador de Comentários já está ativo. Novas contratações externas via Mercado Pago permanecem em modo seguro de homologação (nenhuma cobrança externa é gerada).'
                    : homologationReport?.blockReason ||
                      'A contratação financeira automática aguarda a conclusão das etapas de homologação da API do Mercado Pago. Nenhuma cobrança é realizada ou simulada.'
                  : isPro
                  ? 'Você tem acesso completo aos recursos da plataforma GIO DA SORTE PRO nesta conta.'
                  : 'Escolha abaixo o provedor de pagamento (Mercado Pago ou PayPal) e o ciclo (Mensal ou Anual) para iniciar seus 3 dias de avaliação gratuita.'}
              </p>
            </div>
          </div>
          {isAdminAuthorized && (
            <button
              type="button"
              onClick={() => setActiveViewTab('admin')}
              className="px-3.5 py-2 rounded-xl bg-[#080D18] hover:bg-[#111B30] text-[#A6C957] border border-[#A6C957]/35 text-xs font-semibold shrink-0 transition"
            >
              Ver Status Técnico MP
            </button>
          )}
        </div>
      )}

      {activeViewTab === 'plans' || !isAdminAuthorized ? (
        <>
          {/* Interactive Checkout Configuration Bar: Step 1 (Gateway) + Step 2 (Cycle) */}
          <div className="grid grid-cols-1 xl:grid-cols-12 gap-4 items-stretch">
            {/* Step 1: Official Payment Provider Choice */}
            <div className="xl:col-span-7 p-5 rounded-2xl bg-[#111B30] border border-[var(--gio-border-subtle)] shadow-lg flex flex-col justify-between space-y-3.5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <span className="text-[11px] font-semibold text-[#A5B1C5] flex items-center gap-1.5">
                    <ShieldCheck className="w-3.5 h-3.5 text-[#0131CD]" />
                    <span>Passo 1 · Provedor Oficial de Pagamento</span>
                  </span>
                  <h2 className="text-sm sm:text-base font-bold text-[#FFFFFF] mt-0.5">
                    Escolha por onde autorizar seu teste de 3 dias
                  </h2>
                </div>
                <span className="text-[11px] text-[#A5B1C5]">
                  Ambiente externo criptografado
                </span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {/* Provider Card: Mercado Pago (Official Brand Color #0866F5) */}
                <button
                  type="button"
                  onClick={() => setSelectedPaymentProvider('MERCADO_PAGO')}
                  className={`p-3.5 rounded-xl border text-left transition-all cursor-pointer relative flex flex-col justify-between gap-2.5 ${
                    selectedPaymentProvider === 'MERCADO_PAGO'
                      ? 'bg-[#0866F5]/10 border-[#0866F5] ring-2 ring-[#0866F5]/30 shadow-md'
                      : 'bg-[#080D18] border-[var(--gio-border-subtle)] hover:border-[var(--gio-border-active)]'
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2.5">
                      <div className="w-9 h-9 rounded-lg bg-[#0866F5]/15 border border-[#0866F5]/40 flex items-center justify-center shrink-0">
                        <CreditCard className="w-4 h-4 text-[#0866F5]" />
                      </div>
                      <div>
                        <div className="flex items-center gap-1.5">
                          <span className="font-semibold text-sm text-[#FFFFFF]">Mercado Pago</span>
                          <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-[#0866F5]/20 text-[#0866F5] border border-[#0866F5]/40">
                            BR
                          </span>
                        </div>
                        <span className="text-[11px] text-[#A5B1C5] block">
                          Pix · Cartões Nacionais · Boleto
                        </span>
                      </div>
                    </div>
                    <div
                      className={`w-5 h-5 rounded-full border flex items-center justify-center shrink-0 transition ${
                        selectedPaymentProvider === 'MERCADO_PAGO'
                          ? 'border-[#0866F5] bg-[#0866F5] text-[#FFFFFF]'
                          : 'border-[var(--gio-border-subtle)] bg-transparent'
                      }`}
                    >
                      {selectedPaymentProvider === 'MERCADO_PAGO' && (
                        <Check className="w-3 h-3 stroke-[3]" />
                      )}
                    </div>
                  </div>
                </button>

                {/* Provider Card: PayPal (Official Brand Color #0079C1) */}
                <button
                  type="button"
                  onClick={() => setSelectedPaymentProvider('PAYPAL')}
                  className={`p-3.5 rounded-xl border text-left transition-all cursor-pointer relative flex flex-col justify-between gap-2.5 ${
                    selectedPaymentProvider === 'PAYPAL'
                      ? 'bg-[#0079C1]/10 border-[#0079C1] ring-2 ring-[#0079C1]/30 shadow-md'
                      : 'bg-[#080D18] border-[var(--gio-border-subtle)] hover:border-[var(--gio-border-active)]'
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2.5">
                      <div className="w-9 h-9 rounded-lg bg-[#0079C1]/15 border border-[#0079C1]/40 flex items-center justify-center shrink-0">
                        <Sparkles className="w-4 h-4 text-[#0079C1]" />
                      </div>
                      <div>
                        <div className="flex items-center gap-1.5">
                          <span className="font-semibold text-sm text-[#FFFFFF]">PayPal</span>
                          <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-[#0079C1]/20 text-[#0079C1] border border-[#0079C1]/40">
                            Global
                          </span>
                        </div>
                        <span className="text-[11px] text-[#A5B1C5] block">
                          Cartões · Saldo PayPal
                        </span>
                      </div>
                    </div>
                    <div
                      className={`w-5 h-5 rounded-full border flex items-center justify-center shrink-0 transition ${
                        selectedPaymentProvider === 'PAYPAL'
                          ? 'border-[#0079C1] bg-[#0079C1] text-[#FFFFFF]'
                          : 'border-[var(--gio-border-subtle)] bg-transparent'
                      }`}
                    >
                      {selectedPaymentProvider === 'PAYPAL' && (
                        <Check className="w-3 h-3 stroke-[3]" />
                      )}
                    </div>
                  </div>
                </button>
              </div>
            </div>

            {/* Step 2: Interactive Billing Cycle Selector + Instant Summary CTA */}
            <div className="xl:col-span-5 p-5 rounded-2xl bg-[#111B30] border border-[var(--gio-border-subtle)] shadow-lg flex flex-col justify-between space-y-3.5">
              <div className="flex items-center justify-between gap-2">
                <div>
                  <span className="text-[11px] font-semibold text-[#A5B1C5] flex items-center gap-1.5">
                    <Crown className="w-3.5 h-3.5 text-[#A6C957]" />
                    <span>Passo 2 · Ciclo de Faturamento PRO</span>
                  </span>
                  <h2 className="text-sm sm:text-base font-bold text-[#FFFFFF] mt-0.5 tabular-nums">
                    Economize {annualPlan.annualDiscountPercent}% no ciclo anual
                  </h2>
                </div>
                <span className="px-2 py-0.5 rounded text-[11px] font-semibold bg-[#A6C957]/15 text-[#A6C957] border border-[#A6C957]/35 tabular-nums">
                  -{formatBrl(annualPlan.annualSavingsAmount)}/ano
                </span>
              </div>

              <div className="grid grid-cols-2 gap-2 p-1 rounded-xl bg-[#080D18] border border-[var(--gio-border-subtle)]">
                <button
                  type="button"
                  onClick={() => setBillingCycle('monthly')}
                  className={`px-3 py-2.5 rounded-lg text-xs font-semibold transition flex flex-col items-center justify-center cursor-pointer tabular-nums ${
                    billingCycle === 'monthly'
                      ? 'bg-[#0131CD] text-[#FFFFFF] shadow-sm'
                      : 'text-[#A5B1C5] hover:text-[#FFFFFF]'
                  }`}
                >
                  <span>PRO Mensal</span>
                  <span className="text-[11px] opacity-90">{formatBrl(monthlyPlan.price)}/mês</span>
                </button>
                <button
                  type="button"
                  onClick={() => setBillingCycle('annual')}
                  className={`px-3 py-2.5 rounded-lg text-xs font-semibold transition flex flex-col items-center justify-center cursor-pointer tabular-nums ${
                    billingCycle === 'annual'
                      ? 'bg-[#A6C957] text-[#080D18] font-bold shadow-sm'
                      : 'text-[#A5B1C5] hover:text-[#FFFFFF]'
                  }`}
                >
                  <span className="inline-flex items-center gap-1">
                    <span>PRO Anual</span>
                    <span
                      className={`px-1.5 py-0.2 rounded text-[10px] font-bold ${
                        billingCycle === 'annual'
                          ? 'bg-[#080D18]/15 text-[#080D18]'
                          : 'bg-[#A6C957]/15 text-[#A6C957]'
                      }`}
                    >
                      44% OFF
                    </span>
                  </span>
                  <span className="text-[11px] opacity-90">~{formatBrl(annualPlan.monthlyEquivalent)}/mês</span>
                </button>
              </div>

              <div className="flex items-center justify-between gap-3 pt-1">
                <div className="text-[11px] text-[#A5B1C5] tabular-nums min-w-0">
                  <span className="block text-[#FFFFFF] font-semibold truncate">
                    {selectedCyclePlan.name} via {selectedPaymentProvider === 'PAYPAL' ? 'PayPal' : 'Mercado Pago'}
                  </span>
                  <span>
                    {userHasUsedTrial
                      ? `${formatBrl(selectedCyclePlan.price)}/${selectedCyclePlan.frequency === 12 ? 'ano' : 'mês'}`
                      : `R$ 0,00 hoje · após 3 dias ${formatBrl(selectedCyclePlan.price)}/${selectedCyclePlan.frequency === 12 ? 'ano' : 'mês'}`}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => handleOpenCheckoutModal(selectedCyclePlan)}
                  className="px-3.5 py-2 rounded-xl bg-[#0131CD] hover:brightness-110 text-[#FFFFFF] text-xs font-semibold transition inline-flex items-center gap-1.5 shrink-0 cursor-pointer shadow-sm"
                >
                  <span>Contratar</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          </div>

          {/* 3-Column Commercial Plans Grid: FREE | PRO MENSAL (Azul #0131CD) | PRO ANUAL (Azul #0131CD + Verde-Limão #A6C957) */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-stretch font-sans">
            {/* ==============================================================
                1. PLANO FREE — MESA OFICIAL & GESTÃO MANUAL
               ============================================================== */}
            <article className="relative overflow-hidden p-6 sm:p-7 rounded-2xl bg-[#111B30] border border-[#0131CD]/30 flex flex-col justify-between space-y-6 shadow-md transition-all hover:border-[#0131CD]/65">
              <div className="absolute inset-x-0 top-0 h-1.5 bg-[#0131CD]/55" />

              <div className="space-y-5">
                {/* Card Header */}
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <span className="text-xs font-medium text-[#A5B1C5]">
                      Mesa Oficial & Gestão Manual
                    </span>
                    <h2 className="text-xl font-bold text-[#FFFFFF] tracking-tight mt-0.5">
                      Plano FREE
                    </h2>
                  </div>
                  <span className="px-2.5 py-1 rounded-md text-xs font-semibold bg-[#080D18] text-[#A5B1C5] border border-[#0131CD]/35">
                    Sempre Gratuito
                  </span>
                </div>

                {/* Price Block */}
                <div className="p-4 rounded-xl bg-[#080D18] border border-[#0131CD]/25 space-y-2">
                  <div className="flex items-baseline gap-1.5 tabular-nums">
                    <span className="text-3xl sm:text-4xl font-bold text-[#FFFFFF] tracking-tight tabular-nums">
                      R$ 0,00
                    </span>
                    <span className="text-xs font-medium text-[#A5B1C5]">/ vitalício</span>
                  </div>
                  <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-[#0131CD]/15 border border-[#0131CD]/35 text-xs font-medium text-[#FFFFFF]">
                    <ShieldCheck className="w-3.5 h-3.5 text-[#0131CD] shrink-0" />
                    <span>Acesso imediato · Sem cartão de crédito</span>
                  </div>
                  <p className="text-xs text-[#A5B1C5] leading-relaxed">
                    Ideal para sorteios tradicionais, rifas e conferência pública de bilhetes com auditoria.
                  </p>
                </div>

                {/* Categorized Benefits Hierarchy */}
                <div className="space-y-4 text-xs">
                  {/* Tier 1: Core Raffle & Broadcast Engine */}
                  <div className="space-y-2.5">
                    <div className="flex items-center justify-between text-[11px] font-semibold text-[#A5B1C5] border-b border-[var(--gio-border-subtle)] pb-1.5">
                      <span>1. Sorteios & Apresentação Ao Vivo</span>
                      <span className="px-1.5 py-0.5 rounded bg-[#0131CD]/20 text-[#FFFFFF] border border-[#0131CD]/40 tabular-nums">
                        Ilimitado
                      </span>
                    </div>

                    <div className="flex items-start gap-2.5">
                      <div className="w-5 h-5 rounded-md bg-[#0131CD]/20 border border-[#0131CD]/45 flex items-center justify-center shrink-0 mt-0.5">
                        <Check className="w-3.5 h-3.5 text-[#A6C957]" />
                      </div>
                      <div>
                        <span className="font-semibold text-[#FFFFFF] block">
                          Sorteio Proporcional por Moedas e Bilhetes
                        </span>
                        <span className="text-[11px] text-[#A5B1C5] leading-snug block">
                          Cálculo automático de chances proporcionais e gestão manual de participantes.
                        </span>
                      </div>
                    </div>

                    <div className="flex items-start gap-2.5">
                      <div className="w-5 h-5 rounded-md bg-[#0131CD]/20 border border-[#0131CD]/45 flex items-center justify-center shrink-0 mt-0.5">
                        <Check className="w-3.5 h-3.5 text-[#A6C957]" />
                      </div>
                      <div>
                        <span className="font-semibold text-[#FFFFFF] block">
                          Globo Digital 3D, Roleta Visual e Battle Royale
                        </span>
                        <span className="text-[11px] text-[#A5B1C5] leading-snug block">
                          Modos visuais de alta performance com suporte a Overlay OBS Chroma Key.
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Tier 2: Cryptographic Security & Cloud Isolation */}
                  <div className="space-y-2.5">
                    <div className="flex items-center justify-between text-[11px] font-semibold text-[#A5B1C5] border-b border-[var(--gio-border-subtle)] pb-1.5">
                      <span>2. Segurança & Auditoria</span>
                      <span className="px-1.5 py-0.5 rounded bg-[#0131CD]/20 text-[#FFFFFF] border border-[#0131CD]/40">
                        Provably Fair V2
                      </span>
                    </div>

                    <div className="flex items-start gap-2.5">
                      <div className="w-5 h-5 rounded-md bg-[#0131CD]/20 border border-[#0131CD]/45 flex items-center justify-center shrink-0 mt-0.5">
                        <Check className="w-3.5 h-3.5 text-[#A6C957]" />
                      </div>
                      <div>
                        <span className="font-semibold text-[#FFFFFF] block">
                          Certificados SHA-256, QR Code e Laudos PDF
                        </span>
                        <span className="text-[11px] text-[#A5B1C5] leading-snug block">
                          Comprovação matemática pública de integridade para cada sorteio realizado.
                        </span>
                      </div>
                    </div>

                    <div className="flex items-start gap-2.5">
                      <div className="w-5 h-5 rounded-md bg-[#0131CD]/20 border border-[#0131CD]/45 flex items-center justify-center shrink-0 mt-0.5">
                        <Check className="w-3.5 h-3.5 text-[#A6C957]" />
                      </div>
                      <div>
                        <span className="font-semibold text-[#FFFFFF] block">
                          Isolamento na Nuvem por Conta (UID)
                        </span>
                        <span className="text-[11px] text-[#A5B1C5] leading-snug block">
                          Seus sorteios e históricos ficam salvos exclusivamente na sua conta.
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Locked PRO Capabilities Summary */}
                  <div className="p-3 rounded-xl bg-[#080D18]/80 border border-[var(--gio-border-subtle)] space-y-2 text-[#A5B1C5]">
                    <span className="text-[11px] font-semibold text-[#A5B1C5] block">
                      Disponível apenas nos planos PRO:
                    </span>
                    <div className="flex items-center gap-2 text-[11px]">
                      <Lock className="w-3.5 h-3.5 text-[#A5B1C5] shrink-0" />
                      <span>Conexão TikTok LIVE e Presentes em Tempo Real</span>
                    </div>
                    <div className="flex items-center gap-2 text-[11px]">
                      <Lock className="w-3.5 h-3.5 text-[#A5B1C5] shrink-0" />
                      <span>Sorteador Oficial de Comentários e Multi-LIVE</span>
                    </div>
                  </div>
                </div>
              </div>

              <div className="pt-4 border-t border-[var(--gio-border-subtle)] space-y-2">
                <button
                  type="button"
                  onClick={onNavigateToParticipants}
                  className="gio-btn-secondary w-full py-3.5 px-4 text-xs font-semibold justify-center"
                >
                  <span>Usar Sorteador Manual e Participantes</span>
                  <ArrowRight className="w-4 h-4 text-[#A5B1C5]" />
                </button>
                <p className="text-[11px] text-center text-[#A5B1C5]">
                  {!isPro ? 'Plano atualmente ativo na sua conta' : 'Disponível permanentemente sem custo'}
                </p>
              </div>
            </article>

            {/* ==============================================================
                2. PLANO PRO MENSAL — IDENTIDADE AZUL PRINCIPAL (#0131CD)
               ============================================================== */}
            <article
              onClick={() => setBillingCycle('monthly')}
              className={`relative overflow-hidden p-6 sm:p-7 rounded-2xl bg-[#111B30] flex flex-col justify-between space-y-6 transition-all cursor-pointer ${
                billingCycle === 'monthly'
                  ? 'border-2 border-[#0131CD] ring-4 ring-[#0131CD]/25 shadow-2xl'
                  : 'border border-[#0131CD]/60 shadow-xl hover:border-[#0131CD]'
              }`}
            >
              <div className="absolute inset-x-0 top-0 h-1.5 bg-[#0131CD]" />

              <div className="space-y-5">
                {/* Card Header */}
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#A5B1C5]">
                      <Radio className="w-3.5 h-3.5 text-[#0131CD]" />
                      <span>Automação Mês a Mês</span>
                    </span>
                    <h2 className="text-xl font-bold text-[#FFFFFF] tracking-tight mt-0.5">
                      {monthlyPlan.name}
                    </h2>
                  </div>
                  <span className="px-2.5 py-1 rounded-md text-xs font-semibold bg-[#0131CD] text-[#FFFFFF] shadow-xs tabular-nums">
                    {billingCycle === 'monthly' ? 'Ciclo Selecionado' : '3 Dias Grátis'}
                  </span>
                </div>

                {/* Price Block with Blue #0131CD & Lime #A6C957 Trial Accent */}
                <div className="p-4 rounded-xl bg-[#080D18] border border-[#0131CD]/45 space-y-2.5">
                  <div className="flex items-baseline gap-1.5 tabular-nums">
                    <span className="text-3xl sm:text-4xl font-bold text-[#FFFFFF] tracking-tight tabular-nums">
                      {formatBrl(monthlyPlan.price)}
                    </span>
                    <span className="text-xs font-medium text-[#A5B1C5]">/ mês</span>
                  </div>
                  <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-[#A6C957]/12 border border-[#A6C957]/35 text-xs font-semibold text-[#A6C957] tabular-nums">
                    <CheckCircle2 className="w-3.5 h-3.5 text-[#A6C957] shrink-0" />
                    <span>R$ 0,00 hoje · 1ª cobrança somente no 4º dia</span>
                  </div>
                  <p className="text-xs text-[#A5B1C5] leading-relaxed">
                    Liberdade mensal sem fidelidade. Cancele com 1 clique durante os 3 dias de avaliação sem pagar nada.
                  </p>
                </div>

                {/* Categorized Benefits Hierarchy */}
                <div className="space-y-4 text-xs">
                  {/* Tier 1: Real-time TikTok LIVE Automation */}
                  <div className="space-y-2.5">
                    <div className="flex items-center justify-between text-[11px] font-semibold text-[#A5B1C5] border-b border-[var(--gio-border-subtle)] pb-1.5">
                      <span>1. Automação TikTok LIVE em Tempo Real</span>
                      <span className="px-1.5 py-0.5 rounded bg-[#A6C957]/15 text-[#A6C957] border border-[#A6C957]/35 font-semibold">
                        Exclusivo PRO
                      </span>
                    </div>

                    <div className="flex items-start gap-2.5">
                      <div className="w-5 h-5 rounded-md bg-[#0131CD]/25 border border-[#0131CD]/55 flex items-center justify-center shrink-0 mt-0.5">
                        <Radio className="w-3.5 h-3.5 text-[#FFFFFF]" />
                      </div>
                      <div>
                        <span className="font-semibold text-[#FFFFFF] block">
                          Conexão TikTok LIVE (Webcast + OAuth 2.0)
                        </span>
                        <span className="text-[11px] text-[#A5B1C5] leading-snug block">
                          Sincronização imediata pelo @ da transmissão com diagnóstico de sala ao vivo.
                        </span>
                      </div>
                    </div>

                    <div className="flex items-start gap-2.5">
                      <div className="w-5 h-5 rounded-md bg-[#0131CD]/25 border border-[#0131CD]/55 flex items-center justify-center shrink-0 mt-0.5">
                        <Gift className="w-3.5 h-3.5 text-[#A6C957]" />
                      </div>
                      <div>
                        <span className="font-semibold text-[#FFFFFF] block">
                          Captura Automática de Presentes e Moedas
                        </span>
                        <span className="text-[11px] text-[#A5B1C5] leading-snug block">
                          Emissão atômica de bilhetes na urna e preservação automática de sobras de moedas.
                        </span>
                      </div>
                    </div>

                    <div className="flex items-start gap-2.5">
                      <div className="w-5 h-5 rounded-md bg-[#0131CD]/25 border border-[#0131CD]/55 flex items-center justify-center shrink-0 mt-0.5">
                        <ShieldCheck className="w-3.5 h-3.5 text-[#FFFFFF]" />
                      </div>
                      <div>
                        <span className="font-semibold text-[#FFFFFF] block">
                          Workers Persistentes em 2º Plano (Fila WAL)
                        </span>
                        <span className="text-[11px] text-[#A5B1C5] leading-snug block">
                          Continua contabilizando presentes mesmo se você fechar a aba ou reiniciar o navegador.
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Tier 2: Comments & Multi-LIVE Campaigns */}
                  <div className="space-y-2.5">
                    <div className="flex items-center justify-between text-[11px] font-semibold text-[#A5B1C5] border-b border-[var(--gio-border-subtle)] pb-1.5">
                      <span>2. Comentários & Campanhas Multi-LIVE</span>
                      <span className="px-1.5 py-0.5 rounded bg-[#0131CD]/25 text-[#FFFFFF] border border-[#0131CD]/50">
                        Incluso
                      </span>
                    </div>

                    <div className="flex items-start gap-2.5">
                      <div className="w-5 h-5 rounded-md bg-[#0131CD]/25 border border-[#0131CD]/55 flex items-center justify-center shrink-0 mt-0.5">
                        <Ticket className="w-3.5 h-3.5 text-[#A6C957]" />
                      </div>
                      <div>
                        <span className="font-semibold text-[#FFFFFF] block">
                          Sorteador Oficial de Comentários PRO
                        </span>
                        <span className="text-[11px] text-[#A5B1C5] leading-snug block">
                          Filtros por palavra-chave, hashtag e proteção contra comentários duplicados.
                        </span>
                      </div>
                    </div>

                    <div className="flex items-start gap-2.5">
                      <div className="w-5 h-5 rounded-md bg-[#0131CD]/25 border border-[#0131CD]/55 flex items-center justify-center shrink-0 mt-0.5">
                        <Layers className="w-3.5 h-3.5 text-[#FFFFFF]" />
                      </div>
                      <div>
                        <span className="font-semibold text-[#FFFFFF] block">
                          Campanhas Acumuladas Multi-LIVE
                        </span>
                        <span className="text-[11px] text-[#A5B1C5] leading-snug block">
                          Reúna bilhetes de várias lives em uma única urna com snapshot SHA-256.
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              <div className="pt-4 border-t border-[var(--gio-border-subtle)] space-y-2">
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    setBillingCycle('monthly');
                    handleOpenCheckoutModal(monthlyPlan);
                  }}
                  className="gio-btn-primary w-full py-3.5 px-5 text-xs font-semibold justify-center shadow-md"
                >
                  <Sparkles className="w-4 h-4" />
                  <span>
                    {userHasUsedTrial
                      ? `Assinar PRO Mensal (${formatBrl(monthlyPlan.price)}/mês)`
                      : `Começar 3 Dias Grátis (${selectedPaymentProvider === 'PAYPAL' ? 'PayPal' : 'Mercado Pago'})`}
                  </span>
                  <ArrowRight className="w-4 h-4" />
                </button>
                <p className="text-[11px] text-center text-[#A5B1C5] tabular-nums">
                  Após 3 dias: {formatBrl(monthlyPlan.price)}/mês · Cancele quando quiser
                </p>
              </div>
            </article>

            {/* ==============================================================
                3. PLANO PRO ANUAL — IDENTIDADE AZUL (#0131CD) + ACENTO VERDE-LIMÃO (#A6C957)
               ============================================================== */}
            <article
              onClick={() => setBillingCycle('annual')}
              className={`relative overflow-hidden p-6 sm:p-7 rounded-2xl bg-[#111B30] flex flex-col justify-between space-y-6 transition-all cursor-pointer ${
                billingCycle === 'annual'
                  ? 'border-2 border-[#A6C957] ring-4 ring-[#A6C957]/15 shadow-2xl'
                  : 'border border-[#0131CD]/60 shadow-xl hover:border-[#A6C957]'
              }`}
            >
              <div className="absolute inset-x-0 top-0 h-1.5 bg-gradient-to-r from-[#0131CD] via-[#0131CD] to-[#A6C957]" />

              <div className="space-y-5">
                {/* Card Header */}
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#A6C957]">
                      <Crown className="w-3.5 h-3.5 text-[#A6C957]" />
                      <span>Melhor Custo-Benefício Anual</span>
                    </span>
                    <h2 className="text-xl font-bold text-[#FFFFFF] tracking-tight mt-0.5">
                      {annualPlan.name}
                    </h2>
                  </div>
                  <span className="px-2.5 py-1 rounded-md text-xs font-bold bg-[#A6C957] text-[#080D18] shadow-xs tabular-nums">
                    ~{annualPlan.annualDiscountPercent}% OFF
                  </span>
                </div>

                {/* Price Block with Monthly Equivalent + Annual Savings Highlight */}
                <div className="p-4 rounded-xl bg-[#080D18] border border-[#0131CD]/45 space-y-2.5">
                  <div className="flex items-baseline gap-2 tabular-nums">
                    <span className="text-3xl sm:text-4xl font-bold text-[#FFFFFF] tracking-tight tabular-nums">
                      ~{formatBrl(annualPlan.monthlyEquivalent)}
                    </span>
                    <span className="text-xs font-medium text-[#A5B1C5]">/ mês no ciclo anual</span>
                  </div>
                  <div className="flex flex-wrap items-center justify-between gap-2 text-xs tabular-nums pt-0.5">
                    <span className="text-[#A5B1C5]">
                      Total anual: <strong className="text-[#FFFFFF] font-semibold">{formatBrl(annualPlan.price)}</strong>
                    </span>
                    <span className="px-2 py-0.5 rounded bg-[#A6C957]/15 border border-[#A6C957]/35 text-[11px] font-semibold text-[#A6C957]">
                      Economia de {formatBrl(annualPlan.annualSavingsAmount)}
                    </span>
                  </div>
                  <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-[#0131CD]/20 border border-[#0131CD]/45 text-xs font-medium text-[#FFFFFF] tabular-nums">
                    <CheckCircle2 className="w-3.5 h-3.5 text-[#A6C957] shrink-0" />
                    <span>R$ 0,00 hoje · 3 dias de teste grátis inclusos</span>
                  </div>
                </div>

                {/* Categorized Benefits Hierarchy */}
                <div className="space-y-4 text-xs">
                  {/* Tier 1: Full PRO Automation Suite */}
                  <div className="space-y-2.5">
                    <div className="flex items-center justify-between text-[11px] font-semibold text-[#A5B1C5] border-b border-[var(--gio-border-subtle)] pb-1.5">
                      <span>1. Suíte Completa de Automação PRO</span>
                      <span className="px-1.5 py-0.5 rounded bg-[#0131CD]/25 text-[#FFFFFF] border border-[#0131CD]/50 font-semibold">
                        100% Liberado
                      </span>
                    </div>

                    <div className="flex items-start gap-2.5">
                      <div className="w-5 h-5 rounded-md bg-[#0131CD]/25 border border-[#0131CD]/55 flex items-center justify-center shrink-0 mt-0.5">
                        <CheckCircle2 className="w-3.5 h-3.5 text-[#A6C957]" />
                      </div>
                      <div>
                        <span className="font-semibold text-[#FFFFFF] block">
                          Todos os Recursos do PRO Mensal Inclusos
                        </span>
                        <span className="text-[11px] text-[#A5B1C5] leading-snug block">
                          Presentes TikTok LIVE em tempo real, Sorteador de Comentários PRO e Workers 24/7.
                        </span>
                      </div>
                    </div>

                    <div className="flex items-start gap-2.5">
                      <div className="w-5 h-5 rounded-md bg-[#0131CD]/25 border border-[#0131CD]/55 flex items-center justify-center shrink-0 mt-0.5">
                        <Layers className="w-3.5 h-3.5 text-[#FFFFFF]" />
                      </div>
                      <div>
                        <span className="font-semibold text-[#FFFFFF] block">
                          Campanhas Multi-LIVE & Ciclos Recorrentes
                        </span>
                        <span className="text-[11px] text-[#A5B1C5] leading-snug block">
                          Operação contínua para temporadas semanais ou mensais com trilha imutável de entrega.
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Tier 2: Exclusive Annual Commercial Advantages */}
                  <div className="space-y-2.5">
                    <div className="flex items-center justify-between text-[11px] font-semibold text-[#A5B1C5] border-b border-[var(--gio-border-subtle)] pb-1.5">
                      <span>2. Vantagens Financeiras do Ciclo Anual</span>
                      <span className="px-1.5 py-0.5 rounded bg-[#A6C957]/15 text-[#A6C957] border border-[#A6C957]/35 font-semibold tabular-nums">
                        -{annualPlan.annualDiscountPercent}%
                      </span>
                    </div>

                    <div className="flex items-start gap-2.5">
                      <div className="w-5 h-5 rounded-md bg-[#A6C957]/15 border border-[#A6C957]/35 flex items-center justify-center shrink-0 mt-0.5">
                        <Crown className="w-3.5 h-3.5 text-[#A6C957]" />
                      </div>
                      <div className="tabular-nums">
                        <span className="font-semibold text-[#FFFFFF] block">
                          Desconto Real de {formatBrl(annualPlan.annualSavingsAmount)} no Ano
                        </span>
                        <span className="text-[11px] text-[#A5B1C5] leading-snug block">
                          Pague {formatBrl(annualPlan.price)}/ano em vez de {formatBrl(monthlyPlan.price * 12)} em 12 mensalidades avulsas.
                        </span>
                      </div>
                    </div>

                    <div className="flex items-start gap-2.5">
                      <div className="w-5 h-5 rounded-md bg-[#A6C957]/15 border border-[#A6C957]/35 flex items-center justify-center shrink-0 mt-0.5">
                        <ShieldCheck className="w-3.5 h-3.5 text-[#A6C957]" />
                      </div>
                      <div>
                        <span className="font-semibold text-[#FFFFFF] block">
                          Trava de Preço Garantida por 12 Meses
                        </span>
                        <span className="text-[11px] text-[#A5B1C5] leading-snug block">
                          Proteção integral contra reajustes de tabela durante todo o ciclo anual contratado.
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              <div className="pt-4 border-t border-[var(--gio-border-subtle)] space-y-2">
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    setBillingCycle('annual');
                    handleOpenCheckoutModal(annualPlan);
                  }}
                  className="gio-btn-pro w-full py-3.5 px-5 text-xs font-bold justify-center shadow-lg"
                >
                  <Crown className="w-4 h-4 text-[#080D18]" />
                  <span>
                    {userHasUsedTrial
                      ? `Assinar PRO Anual (${formatBrl(annualPlan.price)}/ano)`
                      : `Começar 3 Dias Grátis (${selectedPaymentProvider === 'PAYPAL' ? 'PayPal' : 'Mercado Pago'})`}
                  </span>
                  <ArrowRight className="w-4 h-4 text-[#080D18]" />
                </button>
                <p className="text-[11px] text-center text-[#A5B1C5] tabular-nums">
                  Após 3 dias: {formatBrl(annualPlan.price)}/ano · Cancele quando quiser
                </p>
              </div>
            </article>
          </div>

          {/* 3-Step Free Trial Timeline ("Como funcionam os 3 dias de teste grátis") */}
          <div className="p-6 rounded-2xl bg-[#111B30] border border-[var(--gio-border-subtle)] shadow-lg space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div>
                <span className="text-xs font-semibold text-[#A6C957]">
                  Transparência Total · Sem Surpresas na Fatura
                </span>
                <h3 className="text-base sm:text-lg font-bold text-[#FFFFFF]">
                  Como funcionam seus 3 dias de avaliação gratuita no Plano PRO
                </h3>
              </div>
              <span className="text-xs text-[#A5B1C5]">
                Vinculado com segurança ao seu UID no Firebase
              </span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-1">
              <div className="p-4 rounded-xl bg-[#080D18] border border-[var(--gio-border-subtle)] space-y-1.5">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-[#FFFFFF]">1. Hoje — Ativação Imediata</span>
                  <span className="px-2 py-0.5 rounded text-[11px] font-bold bg-[#A6C957]/15 text-[#A6C957] tabular-nums">
                    R$ 0,00
                  </span>
                </div>
                <p className="text-xs text-[#A5B1C5] leading-relaxed">
                  Você autoriza a assinatura via Mercado Pago ou PayPal sem cobrança no ato e libera imediatamente o TikTok LIVE PRO e o Sorteador de Comentários.
                </p>
              </div>

              <div className="p-4 rounded-xl bg-[#080D18] border border-[var(--gio-border-subtle)] space-y-1.5">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-[#FFFFFF]">2. Dias 1 a 3 — Uso Ilimitado</span>
                  <span className="px-2 py-0.5 rounded text-[11px] font-semibold bg-[#0131CD]/25 text-[#FFFFFF] border border-[#0131CD]/45 tabular-nums">
                    100% Liberado
                  </span>
                </div>
                <p className="text-xs text-[#A5B1C5] leading-relaxed">
                  Realize quantas transmissões e sorteios quiser, contabilize presentes ao vivo com workers em segundo plano e emita certificados criptográficos.
                </p>
              </div>

              <div className="p-4 rounded-xl bg-[#080D18] border border-[var(--gio-border-subtle)] space-y-1.5">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-[#FFFFFF]">3. A partir do 4º Dia — Você Decide</span>
                  <span className="px-2 py-0.5 rounded text-[11px] font-semibold bg-[#111B30] text-[#A5B1C5] border border-[var(--gio-border-subtle)]">
                    1 Clique
                  </span>
                </div>
                <p className="text-xs text-[#A5B1C5] leading-relaxed">
                  Continue utilizando normalmente ou cancele a renovação aqui mesmo no painel antes do fim do 3º dia sem nenhuma cobrança e sem perder seu histórico.
                </p>
              </div>
            </div>
          </div>

          {/* Detailed Feature Comparison Table: FREE vs PRO */}
          <div className="p-6 rounded-2xl bg-[#111B30] border border-[var(--gio-border-subtle)] shadow-lg space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div>
                <span className="text-xs font-semibold text-[#A5B1C5]">
                  Comparativo Completo de Recursos
                </span>
                <h3 className="text-base sm:text-lg font-bold text-[#FFFFFF]">
                  O que está incluído em cada plano
                </h3>
              </div>
              <span className="text-xs text-[#A5B1C5]">
                Todos os planos contam com auditoria Provably Fair V2 (SHA-256 + CSPRNG)
              </span>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs tabular-nums">
                <thead>
                  <tr className="border-b border-[var(--gio-border-subtle)] bg-[#080D18] text-[#A5B1C5]">
                    <th className="p-3.5 font-semibold">Recurso / Funcionalidade</th>
                    <th className="p-3.5 font-semibold text-center">Plano FREE</th>
                    <th className="p-3.5 font-semibold text-center text-[#FFFFFF]">PRO Mensal</th>
                    <th className="p-3.5 font-bold text-center text-[#A6C957]">PRO Anual</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--gio-border-subtle)] text-[#FFFFFF]">
                  <tr>
                    <td className="p-3.5 font-medium">Mesa Oficial de Sorteio, Globo Digital 3D e Roleta Visual</td>
                    <td className="p-3.5 text-center text-[#FFFFFF] font-semibold">Ilimitado</td>
                    <td className="p-3.5 text-center text-[#FFFFFF] font-semibold">Ilimitado</td>
                    <td className="p-3.5 text-center text-[#A6C957] font-semibold">Ilimitado</td>
                  </tr>
                  <tr>
                    <td className="p-3.5 font-medium">Certificados SHA-256, Laudos PDF, QR Code e Overlay OBS Chroma Key</td>
                    <td className="p-3.5 text-center text-[#FFFFFF] font-semibold">Incluso</td>
                    <td className="p-3.5 text-center text-[#FFFFFF] font-semibold">Incluso</td>
                    <td className="p-3.5 text-center text-[#A6C957] font-semibold">Incluso</td>
                  </tr>
                  <tr>
                    <td className="p-3.5 font-medium">Conexão TikTok LIVE em Tempo Real (Webcast + OAuth 2.0 Oficial)</td>
                    <td className="p-3.5 text-center text-[#A5B1C5]">—</td>
                    <td className="p-3.5 text-center text-[#FFFFFF] font-semibold">Incluso</td>
                    <td className="p-3.5 text-center text-[#A6C957] font-semibold">Incluso</td>
                  </tr>
                  <tr>
                    <td className="p-3.5 font-medium">Captura Automática de Presentes e Moedas com Workers em 2º Plano</td>
                    <td className="p-3.5 text-center text-[#A5B1C5]">—</td>
                    <td className="p-3.5 text-center text-[#FFFFFF] font-semibold">Incluso</td>
                    <td className="p-3.5 text-center text-[#A6C957] font-semibold">Incluso</td>
                  </tr>
                  <tr>
                    <td className="p-3.5 font-medium">Sorteador Oficial de Comentários da LIVE (Filtro por Hashtag/Palavra)</td>
                    <td className="p-3.5 text-center text-[#A5B1C5]">—</td>
                    <td className="p-3.5 text-center text-[#FFFFFF] font-semibold">Incluso</td>
                    <td className="p-3.5 text-center text-[#A6C957] font-semibold">Incluso</td>
                  </tr>
                  <tr>
                    <td className="p-3.5 font-medium">Campanhas Acumuladas Multi-LIVE com Ranking Unificado</td>
                    <td className="p-3.5 text-center text-[#A5B1C5]">—</td>
                    <td className="p-3.5 text-center text-[#FFFFFF] font-semibold">Incluso</td>
                    <td className="p-3.5 text-center text-[#A6C957] font-semibold">Incluso</td>
                  </tr>
                  <tr>
                    <td className="p-3.5 font-medium">Proteção de Preço por 12 Meses + Economia de {formatBrl(annualPlan.annualSavingsAmount)}</td>
                    <td className="p-3.5 text-center text-[#A5B1C5]">—</td>
                    <td className="p-3.5 text-center text-[#A5B1C5]">Ciclo Mensal</td>
                    <td className="p-3.5 text-center text-[#A6C957] font-bold">Exclusivo Anual (~44% OFF)</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          {/* User's Current Subscription & Self-Service Cancellation Card */}
          <div className="gio-card p-6 space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-[var(--gio-border-subtle)] pb-4">
              <div>
                <span className="text-xs font-semibold text-[#A6C957]">
                  Gestão da Sua Assinatura & Vínculo Firebase UID
                </span>
                <h3 className="text-lg font-bold text-[#FFFFFF]">
                  Status da Conta, Período de Teste e Cancelamento
                </h3>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {effectiveUid ? (
                  <span className="px-3 py-1 rounded-lg bg-[#080D18] border border-[#0131CD]/40 text-[11px] font-mono text-[#A6C957]">
                    UID Autenticado: <strong>{effectiveUid}</strong>
                  </span>
                ) : (
                  <span className="px-3 py-1 rounded-lg bg-[#080D18] border border-[var(--gio-border-subtle)] text-[11px] font-medium text-[#A5B1C5]">
                    Conta Firebase não conectada (faça login no topo para vincular)
                  </span>
                )}
                {isPro && (
                  <button
                    type="button"
                    onClick={onNavigateToLivePro}
                    className="gio-btn-pro px-3.5 py-1.5 text-xs"
                  >
                    <Radio className="w-3.5 h-3.5 text-[#080D18]" />
                    <span>Abrir Painel TikTok LIVE PRO</span>
                  </button>
                )}
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 text-xs">
              <div className="p-3.5 rounded-xl bg-[#080D18] border border-[var(--gio-border-subtle)]">
                <span className="text-[11px] font-medium text-[#A5B1C5] block">
                  Plano / Modalidade
                </span>
                <span className="font-bold text-[#FFFFFF] text-sm block mt-0.5">
                  {userSubscription?.planName || (isPro ? 'Plano PRO Ativo' : 'Plano FREE (Gratuito)')}
                </span>
                <span className="text-[11px] text-[#A6C957] tabular-nums">
                  {userSubscription?.contractedAmount
                    ? `${formatBrl(userSubscription.contractedAmount)} (${
                        userSubscription.frequency === 12 ? 'Ciclo 12 meses' : 'Ciclo 1 mês'
                      })`
                    : 'Sem cobrança recorrente ativa'}
                </span>
              </div>

              <div className="p-3.5 rounded-xl bg-[#080D18] border border-[var(--gio-border-subtle)]">
                <span className="text-[11px] font-medium text-[#A5B1C5] block">
                  {isAdminAuthorized ? 'Status Interno & Provedor' : 'Situação da Assinatura'}
                </span>
                <span className={`font-bold text-sm block mt-0.5 ${isPro ? 'text-[#A6C957]' : 'text-[#FFFFFF]'}`}>
                  {isAdminAuthorized
                    ? `${userSubscription?.statusState || statusState} (${userSubscription?.billingSubStatus || 'FREE_TIER'})`
                    : isPro
                    ? 'Ativa (Acesso PRO Liberado)'
                    : 'Plano Gratuito (FREE)'}
                </span>
                <span className="text-[11px] text-[#A5B1C5] block mt-0.5">
                  {userSubscription?.provider ? (
                    <span className="inline-flex items-center gap-1 font-semibold text-[#FFFFFF]">
                      Provedor: {userSubscription.provider === 'PAYPAL' ? 'PayPal' : 'Mercado Pago'}
                    </span>
                  ) : isAdminAuthorized ? (
                    `Remoto MP: ${userSubscription?.remoteMpStatus || 'nenhum'}`
                  ) : isPro ? (
                    'Recursos exclusivos liberados'
                  ) : (
                    'Sem cobrança recorrente ativa'
                  )}
                </span>
              </div>

              <div className="p-3.5 rounded-xl bg-[#080D18] border border-[var(--gio-border-subtle)]">
                <span className="text-[11px] font-medium text-[#A5B1C5] block">
                  Fim do Teste (3 Dias) / Ciclo Vigente
                </span>
                <span className="font-bold text-[#FFFFFF] text-xs block mt-0.5 tabular-nums">
                  {userSubscription?.trialEndDate
                    ? formatDatePtBr(userSubscription.trialEndDate)
                    : userSubscription?.currentPeriodEnd
                    ? formatDatePtBr(userSubscription.currentPeriodEnd)
                    : 'N/A'}
                </span>
                <span className="text-[11px] text-[#A5B1C5] block mt-0.5">
                  Elegibilidade 3 dias grátis:{' '}
                  <strong className="text-[#FFFFFF]">
                    {userHasUsedTrial ? 'Já utilizado nesta conta' : 'Disponível (1x por UID)'}
                  </strong>
                </span>
              </div>

              <div className="p-3.5 rounded-xl bg-[#080D18] border border-[var(--gio-border-subtle)]">
                <span className="text-[11px] font-medium text-[#A5B1C5] block">
                  Próxima Cobrança Programada
                </span>
                <span className="font-bold text-[#FFFFFF] text-xs block mt-0.5 tabular-nums">
                  {userSubscription?.cancelAtPeriodEnd
                    ? 'Cancelada (Sem cobranças futuras)'
                    : formatDatePtBr(userSubscription?.nextPaymentDate)}
                </span>
                {isAdminAuthorized && (userSubscription?.mpPreapprovalId || userSubscription?.paypalSubscriptionId) && (
                  <span className="text-[10px] font-mono text-[#A5B1C5] block mt-0.5 truncate">
                    ID Remoto: {userSubscription.paypalSubscriptionId || userSubscription.mpPreapprovalId}
                  </span>
                )}
              </div>
            </div>

            {/* Bilateral Verification Input (Admin Only) & Self-Service Cancellation Action */}
            <div className="pt-3 border-t border-[var(--gio-border-subtle)] flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-4">
              {isAdminAuthorized && (
                <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 flex-1">
                  <input
                    type="text"
                    value={verifyPreapprovalInput}
                    onChange={(e) => setVerifyPreapprovalInput(e.target.value)}
                    placeholder="ID preapproval_id (MP) ou I-xxxx (PayPal) para verificar no backend..."
                    className="flex-1 px-3.5 py-2 rounded-xl bg-[#080D18] border border-[var(--gio-border-subtle)] text-xs font-mono text-[#FFFFFF] placeholder:text-[#A5B1C5]"
                  />
                  <button
                    type="button"
                    onClick={() => handleVerifyPreapproval()}
                    disabled={isVerifyingPreapproval}
                    className="px-4 py-2 rounded-xl bg-[#0131CD]/20 hover:bg-[#0131CD]/30 text-[#FFFFFF] border border-[#0131CD]/40 text-xs font-bold transition flex items-center justify-center gap-1.5 shrink-0"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${isVerifyingPreapproval ? 'animate-spin' : ''}`} />
                    <span>Verificar Assinatura (MP / PayPal)</span>
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
                    className="px-4 py-2.5 rounded-xl bg-[#080D18] hover:bg-[#111B30] text-[#F05262] border border-[#F05262]/50 text-xs font-bold transition flex items-center justify-center gap-2 shrink-0"
                  >
                    <XCircle className="w-4 h-4 text-[#F05262]" />
                    <span>
                      {isCancelingSubscription
                        ? 'Processando cancelamento ("canceled")...'
                        : 'Cancelar Renovação Automática (Manter Acesso até o Fim do Ciclo)'}
                    </span>
                  </button>
                )}

              {userSubscription?.cancelAtPeriodEnd && (
                <div className="px-3.5 py-2 rounded-xl bg-[#A6C957]/15 border border-[#A6C957]/40 text-xs text-[#A6C957] tabular-nums">
                  Renovação cancelada (status: &quot;canceled&quot;) • Acesso PRO mantido até{' '}
                  {formatDatePtBr(userSubscription.trialEndDate || userSubscription.currentPeriodEnd)}
                </div>
              )}
            </div>
          </div>

          {/* Frequently Asked Questions (FAQ) */}
          <div className="p-6 rounded-2xl bg-[#111B30] border border-[var(--gio-border-subtle)] shadow-lg space-y-4">
            <div>
              <span className="text-xs font-semibold text-[#A5B1C5]">
                Perguntas Frequentes
              </span>
              <h3 className="text-base sm:text-lg font-bold text-[#FFFFFF]">
                Dúvidas sobre Planos, Pagamentos e Segurança dos Dados
              </h3>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
              <details className="group p-4 rounded-xl bg-[#080D18] border border-[var(--gio-border-subtle)] open:border-[#0131CD]/60 transition-all">
                <summary className="font-bold text-[#FFFFFF] cursor-pointer list-none flex items-center justify-between gap-2">
                  <span>1. Serei cobrado ao iniciar os 3 dias de teste grátis?</span>
                  <span className="text-[#A6C957] group-open:rotate-45 transition-transform text-base leading-none">+</span>
                </summary>
                <p className="text-[#A5B1C5] mt-2 leading-relaxed">
                  Não. Ao ativar o período de teste gratuito via Mercado Pago ou PayPal, o valor hoje é R$ 0,00. A primeira cobrança recorrente ocorre somente após o término das 72 horas (3 dias), e você pode cancelar antes com 1 clique sem custo.
                </p>
              </details>

              <details className="group p-4 rounded-xl bg-[#080D18] border border-[var(--gio-border-subtle)] open:border-[#0131CD]/60 transition-all">
                <summary className="font-bold text-[#FFFFFF] cursor-pointer list-none flex items-center justify-between gap-2">
                  <span>2. O que acontece com meus sorteios se eu voltar para o FREE?</span>
                  <span className="text-[#A6C957] group-open:rotate-45 transition-transform text-base leading-none">+</span>
                </summary>
                <p className="text-[#A5B1C5] mt-2 leading-relaxed">
                  Nada é apagado. Todos os participantes, bilhetes, vencedores, snapshots e certificados SHA-256 permanecem 100% salvos e isolados no seu Firebase UID para consulta, auditoria e exportação PDF/CSV.
                </p>
              </details>

              <details className="group p-4 rounded-xl bg-[#080D18] border border-[var(--gio-border-subtle)] open:border-[#0131CD]/60 transition-all">
                <summary className="font-bold text-[#FFFFFF] cursor-pointer list-none flex items-center justify-between gap-2">
                  <span>3. Qual a diferença entre assinar via Mercado Pago ou PayPal?</span>
                  <span className="text-[#A6C957] group-open:rotate-45 transition-transform text-base leading-none">+</span>
                </summary>
                <p className="text-[#A5B1C5] mt-2 leading-relaxed">
                  Ambos liberam exatamente os mesmos recursos PRO e 3 dias grátis. O Mercado Pago é ideal para pagamentos nacionais em Reais (BRL), enquanto o PayPal permite usar saldo PayPal ou cartões de crédito internacionais.
                </p>
              </details>

              <details className="group p-4 rounded-xl bg-[#080D18] border border-[var(--gio-border-subtle)] open:border-[#0131CD]/60 transition-all">
                <summary className="font-bold text-[#FFFFFF] cursor-pointer list-none flex items-center justify-between gap-2">
                  <span>4. Se eu fechar o navegador durante a LIVE, perco os presentes?</span>
                  <span className="text-[#A6C957] group-open:rotate-45 transition-transform text-base leading-none">+</span>
                </summary>
                <p className="text-[#A5B1C5] mt-2 leading-relaxed">
                  Não. No Plano PRO, os workers do servidor continuam conectados à sua transmissão TikTok LIVE processando presentes, moedas e bilhetes em segundo plano mesmo se você fechar a aba ou fizer logout.
                </p>
              </details>
            </div>
          </div>
        </>
      ) : (
        /* ADMIN COMMERCIAL & MERCADO PAGO HOMOLOGATION PANEL */
        <div className="space-y-6">
          {/* KPI Summary Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
            <div className="p-4 rounded-2xl bg-[#111B30] border border-[#0131CD]/40 shadow-md">
              <span className="text-[11px] font-semibold text-[#A5B1C5] block">
                Em Teste Gratuito (3 Dias)
              </span>
              <span className="text-2xl font-bold text-[#FFFFFF] tabular-nums mt-1 block">
                {adminSummary?.metrics.subscribersInTrialCount ?? 0}
              </span>
              <span className="text-[11px] text-[#A5B1C5]">Assinantes em avaliação</span>
            </div>

            <div className="p-4 rounded-2xl bg-[#111B30] border border-[#A6C957]/40 shadow-md">
              <span className="text-[11px] font-semibold text-[#A5B1C5] block">
                Assinaturas Ativas (PRO)
              </span>
              <span className="text-2xl font-bold text-[#A6C957] tabular-nums mt-1 block">
                {adminSummary?.metrics.activeSubscribersCount ?? 0}
              </span>
              <span className="text-[11px] text-[#A5B1C5] tabular-nums">
                Total cadastradas: {adminSummary?.metrics.totalSubscribersCount ?? 0}
              </span>
            </div>

            <div className="p-4 rounded-2xl bg-[#111B30] border border-[var(--gio-border-subtle)] shadow-md">
              <span className="text-[11px] font-semibold text-[#A5B1C5] block">
                Receita Plano Mensal
              </span>
              <span className="text-2xl font-bold text-[#FFFFFF] tabular-nums mt-1 block">
                {formatBrl(adminSummary?.metrics.revenueByModality.pro_monthly ?? 0)}
              </span>
              <span className="text-[11px] text-[#A5B1C5] tabular-nums">
                Modalidade R$ 29,90/mês
              </span>
            </div>

            <div className="p-4 rounded-2xl bg-[#111B30] border border-[var(--gio-border-subtle)] shadow-md">
              <span className="text-[11px] font-semibold text-[#A5B1C5] block">
                Receita Plano Anual Integral
              </span>
              <span className="text-2xl font-bold text-[#FFFFFF] tabular-nums mt-1 block">
                {formatBrl(adminSummary?.metrics.revenueByModality.pro_annual ?? 0)}
              </span>
              <span className="text-[11px] text-[#A5B1C5] tabular-nums">
                Receita Total: {formatBrl(adminSummary?.metrics.revenueByModality.totalBrl ?? 0)}
              </span>
            </div>

            <div className="p-4 rounded-2xl bg-[#111B30] border border-[var(--gio-border-subtle)] shadow-md">
              <span className="text-[11px] font-semibold text-[#A5B1C5] block">
                Canceladas / Pendentes
              </span>
              <span className="text-2xl font-bold text-[#FFFFFF] tabular-nums mt-1 block">
                {adminSummary?.metrics.canceledSubscribersCount ?? 0} /{' '}
                {adminSummary?.metrics.pendingOrRejectedCount ?? 0}
              </span>
              <span className="text-[11px] text-[#A5B1C5]">Status oficial: &quot;canceled&quot;</span>
            </div>
          </div>

          {/* Architecture Comparison Table: Option 1 (Hosted Individual) vs Alternative A (Transparent Tokenization) */}
          <div className="p-6 rounded-2xl bg-[#111B30] border border-[var(--gio-border-subtle)] space-y-4 shadow-lg">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <span className="text-xs font-semibold text-[#A6C957]">
                  Arquitetura Oficial Mercado Pago & Vinculação ao Firebase UID
                </span>
                <h3 className="text-lg font-bold text-[#FFFFFF]">
                  Comparativo Técnico: Checkout Hospedado Individual vs. Alternativa A (Tokenização Transparente)
                </h3>
              </div>
              <span className="px-3 py-1 rounded-lg bg-[#080D18] border border-[#0131CD]/40 text-[11px] font-medium text-[#A5B1C5]">
                Proibido usar auto_recurring.start_date sem comprovação de 3 dias grátis
              </span>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="border-b border-[var(--gio-border-subtle)] text-xs font-semibold text-[#A5B1C5] bg-[#080D18]">
                    <th className="p-3">Critério Técnico / UX</th>
                    <th className="p-3">
                      Opção 1 (Primária): Checkout Hospedado Individual (POST /preapproval sem plano)
                    </th>
                    <th className="p-3">
                      Alternativa A (Contingência Oficial): Plano Associado + card_token_id
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--gio-border-subtle)] text-[#FFFFFF]">
                  <tr>
                    <td className="p-3 font-semibold text-[#FFFFFF]">Endpoint & Vínculo UID</td>
                    <td className="p-3 font-mono text-[11px] text-[#A5B1C5]">
                      POST /preapproval sem preapproval_plan_id • external_reference = Firebase UID
                    </td>
                    <td className="p-3 font-mono text-[11px] text-[#A5B1C5]">
                      POST /preapproval com preapproval_plan_id + card_token_id • external_reference = Firebase UID
                    </td>
                  </tr>
                  <tr>
                    <td className="p-3 font-semibold text-[#FFFFFF]">Tipo de Checkout</td>
                    <td className="p-3 text-[#A6C957]">
                      <strong>Checkout Hospedado:</strong> Redireciona o usuário pelo init_point individual exclusivo da assinatura.
                    </td>
                    <td className="p-3 text-[#FFFFFF]">
                      <strong>Tokenização Transparente:</strong> Altera o fluxo de checkout hospedado para coleta via CardForm SDK no frontend.
                    </td>
                  </tr>
                  <tr>
                    <td className="p-3 font-semibold text-[#FFFFFF]">Exigência de Homologação (3 Dias Grátis)</td>
                    <td className="p-3 text-[#A5B1C5]">
                      Exige comprovação real via GET /preapproval/&#123;id&#125; de que free_trial (3 days) é aplicado e next_payment_date &gt;= +3 dias.
                    </td>
                    <td className="p-3 text-[#A5B1C5]">
                      Herda free_trial do preapproval_plan, exigindo igualmente comprovação real de next_payment_date &gt;= +3 dias antes de liberar.
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          {/* 10-Step Homologation Report & Trigger */}
          <div className="p-6 rounded-2xl bg-[#111B30] border border-[#A6C957]/35 space-y-4 shadow-lg">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-[var(--gio-border-subtle)] pb-4">
              <div>
                <span className="text-xs font-semibold text-[#A6C957]">
                  Protocolo Obrigatório de 10 Etapas — API de Homologação Mercado Pago
                </span>
                <h3 className="text-lg font-bold text-[#FFFFFF]">
                  Validação Real de Teste Gratuito (3 Dias), Titularidade UID e Status &quot;canceled&quot;
                </h3>
              </div>
              <button
                type="button"
                onClick={handleRunHomologationCheck}
                disabled={isRunningHomologation}
                className="px-4 py-2.5 rounded-xl bg-[#A6C957] hover:bg-[#B5D477] text-[#080D18] font-bold text-xs transition flex items-center gap-2 shrink-0 cursor-pointer"
              >
                <RefreshCw className={`w-4 h-4 text-[#080D18] ${isRunningHomologation ? 'animate-spin' : ''}`} />
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
                    className="p-3 rounded-xl bg-[#080D18] border border-[var(--gio-border-subtle)] flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs"
                  >
                    <div className="flex items-start gap-2.5">
                      <span className="px-2 py-0.5 rounded font-bold tabular-nums bg-[#111B30] text-[#FFFFFF] border border-[#0131CD]/40 shrink-0">
                        #{st.stepNumber}
                      </span>
                      <div>
                        <span className="font-bold text-[#FFFFFF] block">{st.title}</span>
                        <span className="text-[#A5B1C5] text-[11px]">{st.details}</span>
                      </div>
                    </div>
                    <span
                      className={`px-2.5 py-1 rounded-lg text-[10px] font-bold uppercase shrink-0 ${
                        st.status === 'PASSED'
                          ? 'bg-[#A6C957]/15 text-[#A6C957] border border-[#A6C957]/35'
                          : st.status === 'BLOCKED_PENDING_CREDENTIALS'
                          ? 'bg-[#F05262]/15 text-[#F05262] border border-[#F05262]/40'
                          : 'bg-[#111B30] text-[#A5B1C5] border border-[var(--gio-border-subtle)]'
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
            <div className="p-6 rounded-2xl bg-[#111B30] border border-[var(--gio-border-subtle)] space-y-4 shadow-lg">
              <h3 className="text-base font-bold text-[#FFFFFF] flex items-center gap-2">
                <Settings className="w-4 h-4 text-[#A5B1C5]" />
                <span>Configuração de Preços e Oferta de 3 Dias Grátis</span>
              </h3>
              <p className="text-xs text-[#A5B1C5]">
                Alterações de preço geram uma nova versão comercial (atual:{' '}
                <strong className="font-mono text-[#A6C957]">
                  {commercialConfig?.priceVersion || 'v1.0.0'}
                </strong>
                ) e aplicam-se apenas a novas contratações, preservando o valor das assinaturas vigentes.
              </p>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                <div>
                  <label className="block text-[11px] font-semibold text-[#A5B1C5] mb-1">
                    Preço PRO Mensal (BRL)
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    value={editMonthlyPrice}
                    onChange={(e) => setEditMonthlyPrice(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl bg-[#080D18] border border-[var(--gio-border-subtle)] focus:outline-none focus:border-[#0131CD] focus:ring-2 focus:ring-[#0131CD]/35 text-[#FFFFFF] tabular-nums"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-[#A5B1C5] mb-1">
                    Preço PRO Anual Integral (BRL)
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    value={editAnnualPrice}
                    onChange={(e) => setEditAnnualPrice(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl bg-[#080D18] border border-[var(--gio-border-subtle)] focus:outline-none focus:border-[#0131CD] focus:ring-2 focus:ring-[#0131CD]/35 text-[#FFFFFF] tabular-nums"
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
                className="w-full py-2.5 px-4 rounded-xl bg-[#0131CD] hover:brightness-110 text-[#FFFFFF] font-bold text-xs transition cursor-pointer"
              >
                {isSavingAdminPlans ? 'Salvando...' : 'Salvar Parâmetros Comerciais (Nova Versão)'}
              </button>
            </div>

            {/* Admin Permission State Simulator (For Internal Verification Only) */}
            <div className="p-6 rounded-2xl bg-[#111B30] border border-[var(--gio-border-subtle)] space-y-4 shadow-lg">
              <h3 className="text-base font-bold text-[#FFFFFF] flex items-center gap-2">
                <ShieldCheck className="w-4 h-4 text-[#A5B1C5]" />
                <span>Simulador Administrativo de Estados (Uso Interno Admin)</span>
              </h3>
              <p className="text-xs text-[#A5B1C5]">
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
                className="w-full px-3.5 py-2.5 rounded-xl bg-[#080D18] border border-[var(--gio-border-subtle)] focus:outline-none focus:border-[#0131CD] focus:ring-2 focus:ring-[#0131CD]/35 text-xs font-bold text-[#FFFFFF]"
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
                  className="flex-1 py-2.5 px-3 rounded-xl bg-[#080D18] hover:bg-[#111B30] text-[#FFFFFF] border border-[var(--gio-border-subtle)] text-xs font-bold transition cursor-pointer"
                >
                  Testar Bloqueio FREE
                </button>
                <button
                  type="button"
                  onClick={() => handleAdminSimulateState('PRO', 'ACTIVE')}
                  disabled={isUpdating}
                  className="flex-1 py-2.5 px-3 rounded-xl bg-[#0131CD] hover:brightness-110 text-[#FFFFFF] font-bold text-xs transition flex items-center justify-center gap-1.5 cursor-pointer"
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
        <div className="fixed inset-0 z-50 bg-[#080D18]/85 backdrop-blur-md flex items-center justify-center p-4 overflow-y-auto">
          <div className="relative w-full max-w-xl gio-card p-6 sm:p-7 space-y-5 border border-[var(--gio-border-subtle)] shadow-2xl animate-scale-in text-xs">
            <div className="flex items-center justify-between border-b border-[var(--gio-border-subtle)] pb-4">
              <div className="flex items-center gap-3">
                <div
                  className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${
                    selectedPaymentProvider === 'PAYPAL'
                      ? 'bg-[#0079C1]/15 border border-[#0079C1]/35 text-[#0079C1]'
                      : 'bg-[#0866F5]/15 border border-[#0866F5]/35 text-[#0866F5]'
                  }`}
                >
                  <CreditCard className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base sm:text-lg font-bold text-[#FFFFFF]">
                    Confirmar Contratação da Assinatura PRO
                  </h3>
                  <p className="text-xs text-[#A5B1C5]">
                    {selectedPlanForCheckout.name} • 3 Dias de Avaliação Gratuita via{' '}
                    <strong className={selectedPaymentProvider === 'PAYPAL' ? 'text-[#0079C1]' : 'text-[#0866F5]'}>
                      {selectedPaymentProvider === 'PAYPAL' ? 'PayPal' : 'Mercado Pago'}
                    </strong>
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setSelectedPlanForCheckout(null)}
                className="p-1.5 rounded-lg text-[#A5B1C5] hover:text-[#FFFFFF] hover:bg-[#080D18] transition"
              >
                <XCircle className="w-5 h-5" />
              </button>
            </div>

            {/* Key Commercial Disclosures Required Before Confirmation */}
            <div className="p-4 rounded-xl bg-[#080D18] border border-[var(--gio-border-subtle)] space-y-2.5">
              <div className="flex items-center justify-between">
                <span className="text-[#A5B1C5]">Plano Selecionado:</span>
                <span className="font-bold text-[#FFFFFF]">{selectedPlanForCheckout.name}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-[#A5B1C5]">Provedor Escolhido:</span>
                <span
                  className={`font-bold px-2 py-0.5 rounded text-[11px] ${
                    selectedPaymentProvider === 'PAYPAL'
                      ? 'bg-[#0079C1]/20 text-[#0079C1] border border-[#0079C1]/40'
                      : 'bg-[#0866F5]/20 text-[#0866F5] border border-[#0866F5]/40'
                  }`}
                >
                  {selectedPaymentProvider === 'PAYPAL' ? 'PayPal' : 'Mercado Pago'}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-[#A5B1C5]">Duração do Teste Gratuito:</span>
                <span className="font-bold text-[#A6C957] tabular-nums">
                  {userHasUsedTrial
                    ? '0 dias (Teste já utilizado nesta conta UID)'
                    : '3 dias gratuitos (R$ 0,00 hoje)'}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-[#A5B1C5]">Valor e Frequência de Renovação:</span>
                <span className="font-bold text-[#FFFFFF] tabular-nums">
                  {formatBrl(selectedPlanForCheckout.price)} /{' '}
                  {selectedPlanForCheckout.frequency === 12
                    ? '12 meses (cobrança anual integral)'
                    : '1 mês (mensal)'}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-[#A5B1C5]">Data da Primeira Cobrança:</span>
                <span className="text-[#A6C957] font-semibold text-right tabular-nums">
                  {userHasUsedTrial
                    ? 'No ato da autorização'
                    : `Após 3 dias (~${new Date(
                        Date.now() + 3 * 24 * 60 * 60 * 1000
                      ).toLocaleDateString('pt-BR')})`}
                </span>
              </div>
              <div className="pt-2 border-t border-[var(--gio-border-subtle)] text-[11px] text-[#A5B1C5] space-y-1">
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
              <div className="p-3 rounded-xl bg-[#080D18] border border-[var(--gio-border-subtle)] flex items-center justify-between">
                <span className="text-[#A5B1C5] flex items-center gap-1.5">
                  <UserCheck className="w-4 h-4 text-[#A6C957]" />
                  <span>
                    Vínculo Exclusivo ({selectedPaymentProvider === 'PAYPAL' ? 'custom_id' : 'external_reference'}):
                  </span>
                </span>
                <span className="font-mono font-bold text-[#A6C957]">
                  {effectiveUid || 'Faça login na conta Firebase'}
                </span>
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-[#A5B1C5] mb-1">
                  E-mail do Comprador ({selectedPaymentProvider === 'PAYPAL' ? 'conta PayPal' : 'payer_email no Mercado Pago'})
                </label>
                <input
                  type="email"
                  value={confirmedEmailInput}
                  onChange={(e) => setConfirmedEmailInput(e.target.value)}
                  placeholder="seu-email@dominio.com"
                  className="w-full px-3.5 py-2.5 rounded-xl bg-[#080D18] border border-[var(--gio-border-subtle)] focus:outline-none focus:border-[#0131CD] focus:ring-2 focus:ring-[#0131CD]/35 text-[#FFFFFF] text-xs"
                />
              </div>

              {!emailVerified && (
                <label className="flex items-start gap-2.5 text-[11px] text-[#A5B1C5] cursor-pointer">
                  <input
                    type="checkbox"
                    checked={confirmEmailOwnership}
                    onChange={(e) => setConfirmEmailOwnership(e.target.checked)}
                    className="mt-0.5 w-4 h-4 accent-[#0131CD] shrink-0"
                  />
                  <span>
                    Confirmo que este endereço de e-mail pertence à minha conta autenticada e será utilizado na autorização da assinatura via {selectedPaymentProvider === 'PAYPAL' ? 'PayPal' : 'Mercado Pago'}.
                  </span>
                </label>
              )}

              <label className="flex items-start gap-2.5 text-[11px] text-[#A5B1C5] cursor-pointer">
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
                    className="text-[#A6C957] underline hover:text-[#FFFFFF] font-semibold cursor-pointer"
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
                    className="text-[#A6C957] underline hover:text-[#FFFFFF] font-semibold cursor-pointer"
                  >
                    Política de Cancelamento e Reembolso
                  </button>
                  .
                </span>
              </label>
            </div>

            {checkoutError && (
              <div className="p-3.5 rounded-xl bg-[#F05262]/15 border border-[#F05262]/50 text-[#FFFFFF] text-xs space-y-2">
                <div className="flex items-start gap-2">
                  <AlertTriangle className="w-4 h-4 text-[#F05262] shrink-0 mt-0.5" />
                  <span className="font-semibold">{checkoutError}</span>
                </div>
                {checkoutPayloadPreview && (
                  <details className="text-[10px] font-mono text-[#A6C957] pt-1">
                    <summary className="cursor-pointer text-[#FFFFFF]">
                      Ver Payload Oficial Preparado ({selectedPaymentProvider === 'PAYPAL' ? 'POST /v1/billing/subscriptions' : 'POST /preapproval'})
                    </summary>
                    <pre className="mt-2 p-2.5 rounded bg-[#080D18] border border-[var(--gio-border-subtle)] overflow-x-auto">
                      {JSON.stringify(checkoutPayloadPreview, null, 2)}
                    </pre>
                  </details>
                )}
              </div>
            )}

            <div className="flex items-center justify-end gap-3 pt-4 border-t border-[var(--gio-border-subtle)]">
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
                    ? `Confirmar e Ir para o ${selectedPaymentProvider === 'PAYPAL' ? 'PayPal' : 'Mercado Pago'}`
                    : `Confirmar e Começar 3 Dias Grátis no ${selectedPaymentProvider === 'PAYPAL' ? 'PayPal' : 'Mercado Pago'}`}
                </span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
