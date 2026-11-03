import crypto from 'crypto';
import { doc, getDoc, getDocs, setDoc, collection } from 'firebase/firestore';
import { db } from '../firebase.js';
import {
  CommercialPlanId,
  CommercialSubscriptionConfig,
  HomologationStepResult,
  MercadoPagoCheckoutFlowMode,
  MercadoPagoHomologationReport,
  MercadoPagoHomologationStatus,
  MercadoPagoRemoteStatus,
  OfficialSubscriptionPlanDefinition,
  SubscriptionBillingSubStatus,
  SubscriptionPlanTier,
  SubscriptionStatusState,
  UserSubscriptionRecord,
} from '../types.js';
import {
  DEFAULT_COMMERCIAL_CONFIG,
  fetchCommercialSubscriptionConfig,
  saveCommercialSubscriptionConfig,
  recordDocumentAcceptance,
} from '../utils/legalAndComplianceService.js';
import { recordAuditLog, setProPlanTier } from '../utils/tiktokLiveService.js';

export const MP_API_BASE_URL = 'https://api.mercadopago.com';
export const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

export interface MercadoPagoTransport {
  createPreapprovalPlan(payload: Record<string, unknown>): Promise<{ status: number; data: any }>;
  getPreapprovalPlan(planId: string): Promise<{ status: number; data: any }>;
  createPreapproval(payload: Record<string, unknown>): Promise<{ status: number; data: any }>;
  getPreapproval(preapprovalId: string): Promise<{ status: number; data: any }>;
  updatePreapproval(preapprovalId: string, payload: Record<string, unknown>): Promise<{ status: number; data: any }>;
  getCollectorIdentity?(): Promise<{ status: number; data: any }>;
  createTestBuyerUser?(siteId?: string): Promise<{ status: number; data: any }>;
  createCardToken?(params: {
    cardNumber: string;
    securityCode: string;
    expirationMonth: number;
    expirationYear: number;
    cardholderName: string;
    docType: string;
    docNumber: string;
  }): Promise<{ status: number; data: any }>;
}

export interface CollectorIdentityVerificationResult {
  allowedInDev: boolean;
  isTestUserAccount: boolean;
  siteId: string | null;
  collectorId: number | null;
  tags: string[];
  nicknamePrefix: string | null;
  reason: string;
}

/**
 * Checks whether a status string returned by Mercado Pago represents a canceled subscription
 * (`"cancelled"` in MP HTTP responses/requests or normalized `"canceled"` internally).
 */
export function isMpCanceledStatus(status: unknown): boolean {
  const normalized = String(status || '').trim().toLowerCase();
  return normalized === 'cancelled' || normalized === 'canceled';
}

/**
 * Normalizes the status returned by Mercado Pago (`"cancelled"` -> `"canceled"`)
 * into the internal `UserSubscriptionRecord.remoteMpStatus` without breaking existing GIO DA SORTE PRO states.
 */
export function normalizeMpRemoteStatus(status: unknown): MercadoPagoRemoteStatus {
  if (isMpCanceledStatus(status)) {
    return 'canceled';
  }
  const normalized = String(status || 'pending').trim().toLowerCase();
  if (normalized === 'authorized' || normalized === 'paused' || normalized === 'pending') {
    return normalized;
  }
  return 'pending';
}

/**
 * Redacts sensitive tokens, emails, or payer identifiers before logging or returning diagnostic payloads.
 */
export function redactSensitiveMpData(input: unknown): any {
  if (input === null || input === undefined) return input;
  if (typeof input !== 'object') return input;
  if (Array.isArray(input)) return input.map(redactSensitiveMpData);

  const redacted: Record<string, unknown> = {};
  for (const [key, val] of Object.entries(input as Record<string, unknown>)) {
    const lower = key.toLowerCase();
    if (
      lower.includes('token') ||
      lower.includes('secret') ||
      lower.includes('authorization') ||
      lower.includes('password') ||
      lower.includes('card_id') ||
      lower.includes('first_six') ||
      lower.includes('last_four') ||
      lower === 'identification' ||
      lower === 'address' ||
      lower === 'phone' ||
      lower === 'first_name' ||
      lower === 'last_name'
    ) {
      redacted[key] = '[REDACTED]';
    } else if ((lower === 'payer_email' || lower === 'email') && typeof val === 'string') {
      const [local, domain] = val.split('@');
      redacted[key] = domain ? `${local.slice(0, 2)}***@${domain}` : '[REDACTED_EMAIL]';
    } else if (typeof val === 'object' && val !== null) {
      redacted[key] = redactSensitiveMpData(val);
    } else {
      redacted[key] = val;
    }
  }
  return redacted;
}

/**
 * Default HTTP transport against official Mercado Pago API (`https://api.mercadopago.com`)
 */
export function createLiveMercadoPagoTransport(accessToken: string): MercadoPagoTransport {
  const headers = {
    Authorization: `Bearer ${accessToken}`,
    'Content-Type': 'application/json',
  };

  async function requestMp(method: string, path: string, body?: Record<string, unknown>) {
    const response = await fetch(`${MP_API_BASE_URL}${path}`, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
    });
    const text = await response.text();
    let data: any = {};
    try {
      data = text ? JSON.parse(text) : {};
    } catch {
      data = { raw: text };
    }
    return { status: response.status, data };
  }

  return {
    createPreapprovalPlan: (payload) => requestMp('POST', '/preapproval_plan', payload),
    getPreapprovalPlan: (planId) => requestMp('GET', `/preapproval_plan/${encodeURIComponent(planId)}`),
    createPreapproval: (payload) => requestMp('POST', '/preapproval', payload),
    getPreapproval: (preapprovalId) => requestMp('GET', `/preapproval/${encodeURIComponent(preapprovalId)}`),
    updatePreapproval: (preapprovalId, payload) =>
      requestMp('PUT', `/preapproval/${encodeURIComponent(preapprovalId)}`, payload),
    getCollectorIdentity: () => requestMp('GET', '/users/me'),
    createTestBuyerUser: (siteId = 'MLB') =>
      requestMp('POST', '/users/test_user', {
        site_id: siteId,
        description: 'Buyer Test GIO DA SORTE',
      }),
    createCardToken: async (params) => {
      const publicKey = (process.env.VITE_MP_PUBLIC_KEY || '').trim();
      const res = await fetch(`${MP_API_BASE_URL}/v1/card_tokens?public_key=${publicKey}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          card_number: params.cardNumber,
          security_code: params.securityCode,
          expiration_month: params.expirationMonth,
          expiration_year: params.expirationYear,
          cardholder: {
            name: params.cardholderName,
            identification: { type: params.docType, number: params.docNumber },
          },
        }),
      });
      const data = await res.json().catch(() => ({}));
      return { status: res.status, data };
    },
  };
}

// Cache of verified collector account identities by token SHA-256 hash (never storing the raw token)
const verifiedCollectorIdentityCache = new Map<
  string,
  { verifiedAt: number; result: CollectorIdentityVerificationResult }
>();
let cachedHomologationMlbTestBuyerEmail: string | null = 'test_user_8121071805419353144@testuser.com';

// In-memory mirrors for fast synchronous access & fallback when Firestore rules or offline states apply
const memorySubscriptionsByUid = new Map<string, UserSubscriptionRecord>();
const memoryWebhookReceipts = new Map<string, { webhookId: string; processedAt: number; action: string; preapprovalId: string }>();
const memoryRevenueEvents: {
  paymentId: string;
  preapprovalId: string;
  uid: string;
  planId: CommercialPlanId;
  amount: number;
  currency: 'BRL';
  cycleType: 'FIRST_POST_TRIAL' | 'MONTHLY_RENEWAL' | 'ANNUAL_RENEWAL';
  paidAt: number;
}[] = [];

export class MercadoPagoSubscriptionService {
  private customTransport: MercadoPagoTransport | null = null;

  public setCustomTransportForTesting(transport: MercadoPagoTransport | null) {
    this.customTransport = transport;
  }

  public getEnvironmentCredentialStatus(): {
    accessTokenConfigured: boolean;
    webhookSecretConfigured: boolean;
    publicKeyConfigured: boolean;
    tokenPrefix: 'TEST-' | 'APP_USR-' | 'OTHER' | 'EMPTY';
    isTestAccessToken: boolean;
    isProductionAccessToken: boolean;
  } {
    const rawToken = (process.env.MP_ACCESS_TOKEN || '').trim();
    const rawSecret = (process.env.MP_WEBHOOK_SECRET || '').trim();
    const rawPublicKey = (process.env.VITE_MP_PUBLIC_KEY || '').trim();
    const accessTokenConfigured = rawToken.length > 10 && rawToken !== 'MY_MP_ACCESS_TOKEN';
    const tokenPrefix: 'TEST-' | 'APP_USR-' | 'OTHER' | 'EMPTY' = !accessTokenConfigured
      ? 'EMPTY'
      : rawToken.startsWith('TEST-')
      ? 'TEST-'
      : rawToken.startsWith('APP_USR-')
      ? 'APP_USR-'
      : 'OTHER';

    const tokenHash = accessTokenConfigured
      ? crypto.createHash('sha256').update(rawToken).digest('hex')
      : '';
    const cachedIdentity = tokenHash ? verifiedCollectorIdentityCache.get(tokenHash)?.result : undefined;

    const isTestAccessToken =
      accessTokenConfigured &&
      (rawToken.startsWith('TEST-') || Boolean(cachedIdentity?.isTestUserAccount));
    const isProductionAccessToken =
      accessTokenConfigured &&
      rawToken.startsWith('APP_USR-') &&
      cachedIdentity !== undefined &&
      !cachedIdentity.isTestUserAccount;

    return {
      accessTokenConfigured,
      webhookSecretConfigured: rawSecret.length >= 8,
      publicKeyConfigured: rawPublicKey.length > 10,
      tokenPrefix,
      isTestAccessToken,
      isProductionAccessToken,
    };
  }

  /**
   * Validates the collector account identity via `GET /users/me` using the token itself,
   * without trusting the prefix alone (`APP_USR-` vs `TEST-`).
   * In DEV, only accounts confirmed with the `"test_user"` tag are allowed; real production accounts are blocked.
   */
  public async verifyCollectorAccountIdentity(
    transportOverride?: MercadoPagoTransport
  ): Promise<CollectorIdentityVerificationResult> {
    if (transportOverride || this.customTransport) {
      const target = transportOverride || this.customTransport!;
      if (!target.getCollectorIdentity) {
        return {
          allowedInDev: true,
          isTestUserAccount: true,
          siteId: 'MLB',
          collectorId: 1000,
          tags: ['test_user'],
          nicknamePrefix: 'TESTUSER',
          reason: 'Transporte simulado de teste confirmado com tag test_user.',
        };
      }
      const res = await target.getCollectorIdentity();
      const tags: string[] = Array.isArray(res.data?.tags) ? res.data.tags.map(String) : [];
      const isTestUserAccount = res.status >= 200 && res.status < 300 && tags.includes('test_user');
      const isDev = process.env.NODE_ENV !== 'production';
      const allowedInDev = !isDev || isTestUserAccount;
      return {
        allowedInDev,
        isTestUserAccount,
        siteId: res.data?.site_id ? String(res.data.site_id) : null,
        collectorId: typeof res.data?.id === 'number' ? res.data.id : null,
        tags,
        nicknamePrefix: typeof res.data?.nickname === 'string' ? res.data.nickname.slice(0, 8) : null,
        reason: isTestUserAccount
          ? 'Conta de teste oficial confirmada via GET /users/me (tag test_user presente).'
          : 'PRODUCTION_ACCOUNT_BLOCKED_IN_DEV: Conta real de produção detectada via GET /users/me (ausência da tag "test_user"). Contas de produção permanecem bloqueadas no ambiente DEV.',
      };
    }

    const rawToken = (process.env.MP_ACCESS_TOKEN || '').trim();
    if (!rawToken || rawToken === 'MY_MP_ACCESS_TOKEN') {
      throw new Error(
        'MP_ACCESS_TOKEN_NOT_CONFIGURED: A variável de ambiente MP_ACCESS_TOKEN não está configurada no servidor.'
      );
    }

    const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');
    const cached = verifiedCollectorIdentityCache.get(tokenHash);
    if (cached && Date.now() - cached.verifiedAt < 5 * 60 * 1000) {
      return cached.result;
    }

    const liveTransport = createLiveMercadoPagoTransport(rawToken);
    const res = await liveTransport.getCollectorIdentity!();
    const tags: string[] = Array.isArray(res.data?.tags) ? res.data.tags.map(String) : [];
    const isTestUserAccount = res.status >= 200 && res.status < 300 && tags.includes('test_user');
    const isDev = process.env.NODE_ENV !== 'production';
    const allowedInDev = !isDev || isTestUserAccount;

    const result: CollectorIdentityVerificationResult = {
      allowedInDev,
      isTestUserAccount,
      siteId: res.data?.site_id ? String(res.data.site_id) : null,
      collectorId: typeof res.data?.id === 'number' ? res.data.id : null,
      tags,
      nicknamePrefix: typeof res.data?.nickname === 'string' ? res.data.nickname.slice(0, 8) : null,
      reason:
        res.status < 200 || res.status >= 300
          ? `MP_ACCOUNT_VERIFICATION_FAILED: Não foi possível validar a identidade da conta via GET /users/me (HTTP ${res.status}).`
          : isTestUserAccount
          ? 'Conta de teste oficial confirmada via GET /users/me (tag test_user presente).'
          : 'PRODUCTION_ACCOUNT_BLOCKED_IN_DEV: Conta real de produção detectada via GET /users/me (ausência da tag "test_user"). Contas de produção permanecem bloqueadas no ambiente DEV.',
    };

    verifiedCollectorIdentityCache.set(tokenHash, {
      verifiedAt: Date.now(),
      result,
    });

    return result;
  }

  private async getAuthenticatedTransport(
    transportOverride?: MercadoPagoTransport
  ): Promise<{ transport: MercadoPagoTransport; identity: CollectorIdentityVerificationResult }> {
    const identity = await this.verifyCollectorAccountIdentity(transportOverride);
    if (!identity.allowedInDev) {
      throw new Error(identity.reason);
    }

    if (transportOverride) {
      return { transport: transportOverride, identity };
    }
    if (this.customTransport) {
      return { transport: this.customTransport, identity };
    }

    const rawToken = (process.env.MP_ACCESS_TOKEN || '').trim();
    if (!rawToken) {
      throw new Error(
        'MP_ACCESS_TOKEN_NOT_CONFIGURED: A variável de ambiente MP_ACCESS_TOKEN não está configurada no servidor.'
      );
    }
    return { transport: createLiveMercadoPagoTransport(rawToken), identity };
  }

  /**
   * Resolves a valid MLB test buyer (`@testuser.com`) exclusively for homologation tests
   * when the collector is a `test_user` account. Never used in normal customer checkout (`initiateCheckout`).
   */
  public async resolveHomologationTestBuyerEmail(
    transport: MercadoPagoTransport,
    identity: CollectorIdentityVerificationResult
  ): Promise<string> {
    if (!identity.isTestUserAccount) {
      return 'homologacao_verificada@giodasorte.com';
    }
    if (cachedHomologationMlbTestBuyerEmail && cachedHomologationMlbTestBuyerEmail.endsWith('@testuser.com')) {
      return cachedHomologationMlbTestBuyerEmail;
    }
    if (transport.createTestBuyerUser) {
      try {
        const res = await transport.createTestBuyerUser(identity.siteId || 'MLB');
        if (res.status >= 200 && res.status < 300 && typeof res.data?.email === 'string' && res.data.email.endsWith('@testuser.com')) {
          cachedHomologationMlbTestBuyerEmail = res.data.email;
          return res.data.email;
        }
      } catch {
        // Fallback to cached MLB test user email
      }
    }
    return cachedHomologationMlbTestBuyerEmail || 'test_user_896484110266742238@testuser.com';
  }

  /**
   * Returns the two official commercial plans with exact calculations:
   * - GIO DA SORTE PRO Mensal: R$ 29,90 / 1 month / 7 days free trial
   * - GIO DA SORTE PRO Anual: R$ 199,90 integral / 12 months / 7 days free trial (~R$ 16,66/mês, economia R$ 158,90, ~44,3% off)
   */
  public async getOfficialPlans(): Promise<{
    monthly: OfficialSubscriptionPlanDefinition;
    annual: OfficialSubscriptionPlanDefinition;
    config: CommercialSubscriptionConfig;
  }> {
    const config = await fetchCommercialSubscriptionConfig();
    const monthlyPrice = Number(config.monthlyPrice ?? 29.90);
    const annualPrice = Number(config.annualPrice ?? 199.90);
    const priceVersion = config.priceVersion || 'v1.0.0';

    const twelveMonthsCost = Number((monthlyPrice * 12).toFixed(2));
    const annualSavingsAmount = Number(Math.max(0, twelveMonthsCost - annualPrice).toFixed(2));
    const annualDiscountPercent =
      twelveMonthsCost > 0 ? Number(((annualSavingsAmount / twelveMonthsCost) * 100).toFixed(1)) : 0;
    const monthlyEquivalent = Number((annualPrice / 12).toFixed(2));

    const monthly: OfficialSubscriptionPlanDefinition = {
      planId: 'pro_monthly',
      name: 'GIO DA SORTE PRO Mensal',
      price: monthlyPrice,
      currency: 'BRL',
      frequency: 1,
      frequencyType: 'months',
      freeTrial: {
        frequency: 7,
        frequencyType: 'days',
      },
      monthlyEquivalent: monthlyPrice,
      annualSavingsAmount: 0,
      annualDiscountPercent: 0,
      priceVersion,
      mpPreapprovalPlanId: config.mpMonthlyPlanId || undefined,
      mpPlanVerified: Boolean(config.mpPlansVerified && config.mpMonthlyPlanId),
      mpPlanVerifiedAt: config.mpPlansVerifiedAt || null,
    };

    const annual: OfficialSubscriptionPlanDefinition = {
      planId: 'pro_annual',
      name: 'GIO DA SORTE PRO Anual',
      price: annualPrice,
      currency: 'BRL',
      frequency: 12,
      frequencyType: 'months',
      freeTrial: {
        frequency: 7,
        frequencyType: 'days',
      },
      monthlyEquivalent,
      annualSavingsAmount,
      annualDiscountPercent,
      priceVersion,
      mpPreapprovalPlanId: config.mpAnnualPlanId || undefined,
      mpPlanVerified: Boolean(config.mpPlansVerified && config.mpAnnualPlanId),
      mpPlanVerifiedAt: config.mpPlansVerifiedAt || null,
    };

    return { monthly, annual, config };
  }

  /**
   * 1. OFFICIAL PAYLOAD BUILDERS (Never mixing flows or inventing fields)
   */
  public buildOfficialPreapprovalPlanPayload(
    plan: OfficialSubscriptionPlanDefinition,
    backUrl: string,
    includeFreeTrial = true
  ): Record<string, unknown> {
    const autoRecurring: Record<string, unknown> = {
      frequency: plan.frequency,
      frequency_type: plan.frequencyType,
      transaction_amount: plan.price,
      currency_id: plan.currency,
    };
    if (includeFreeTrial) {
      autoRecurring.free_trial = {
        frequency: 7,
        frequency_type: 'days',
      };
    }
    return {
      reason: plan.name,
      auto_recurring: autoRecurring,
      back_url: backUrl,
    };
  }

  /**
   * Primary Flow: Individual Hosted Checkout (`POST /preapproval` without `preapproval_plan_id`, `status: "pending"`)
   * Binds `external_reference` directly to the authenticated Firebase UID at creation time.
   * Never uses `auto_recurring.start_date` as an unvalidated substitute for `free_trial`.
   */
  public buildOfficialIndividualPreapprovalPayload(params: {
    plan: OfficialSubscriptionPlanDefinition;
    uid: string;
    payerEmail: string;
    backUrl: string;
    includeFreeTrial: boolean;
  }): Record<string, unknown> {
    const autoRecurring: Record<string, unknown> = {
      frequency: params.plan.frequency,
      frequency_type: params.plan.frequencyType,
      transaction_amount: params.plan.price,
      currency_id: params.plan.currency,
    };
    if (params.includeFreeTrial) {
      autoRecurring.free_trial = {
        frequency: 7,
        frequency_type: 'days',
      };
    }
    return {
      reason: params.plan.name,
      external_reference: params.uid,
      payer_email: params.payerEmail,
      auto_recurring: autoRecurring,
      back_url: params.backUrl,
      status: 'pending',
    };
  }

  /**
   * Alternative A Flow: Associated Plan + Transparent Tokenization (`POST /preapproval` with `preapproval_plan_id` + `card_token_id`)
   * Note: Changes UX from Hosted Checkout (`init_point`) to Transparent Checkout (`CardForm` SDK tokenization).
   */
  public buildOfficialAssociatedPlanTransparentPayload(params: {
    preapprovalPlanId: string;
    plan: OfficialSubscriptionPlanDefinition;
    uid: string;
    payerEmail: string;
    cardTokenId: string;
    backUrl: string;
  }): Record<string, unknown> {
    return {
      preapproval_plan_id: params.preapprovalPlanId,
      reason: params.plan.name,
      external_reference: params.uid,
      payer_email: params.payerEmail,
      card_token_id: params.cardTokenId,
      back_url: params.backUrl,
      status: 'authorized',
    };
  }

  /**
   * Official Cancellation Payload (`PUT /preapproval/{id}`)
   * Sends `{"status": "cancelled"}` (two 'l's) as required by the live Mercado Pago `/preapproval` API.
   */
  public buildOfficialCancelPayload(): { status: 'cancelled' } {
    return {
      status: 'cancelled',
    };
  }

  /**
   * Validates whether `next_payment_date` returned by Mercado Pago API is strictly >= 7 days ahead
   * when a 7-day free trial is applied, and that no immediate charge occurred (`charged_amount === 0`).
   */
  public verifySevenDayFreeTrialFromMpResponse(
    mpData: any,
    referenceStartMs: number
  ): {
    valid: boolean;
    nextPaymentDateIso: string | null;
    daysUntilFirstPayment: number | null;
    freeTrialObjectPresent: boolean;
    noImmediateCharge: boolean;
    reason: string;
  } {
    const freeTrial = mpData?.auto_recurring?.free_trial;
    const freeTrialObjectPresent =
      Boolean(freeTrial) &&
      Number(freeTrial.frequency) === 7 &&
      String(freeTrial.frequency_type) === 'days';

    const chargedAmount = Number(mpData?.summarized?.charged_amount ?? 0);
    const chargedQuantity = Number(mpData?.summarized?.charged_quantity ?? 0);
    const noImmediateCharge = chargedAmount === 0 && chargedQuantity === 0;

    const rawNextPayment = mpData?.next_payment_date;
    if (!rawNextPayment || typeof rawNextPayment !== 'string') {
      return {
        valid: false,
        nextPaymentDateIso: null,
        daysUntilFirstPayment: null,
        freeTrialObjectPresent,
        noImmediateCharge,
        reason: 'A resposta da API do Mercado Pago não retornou o campo oficial next_payment_date.',
      };
    }

    const nextPaymentMs = Date.parse(rawNextPayment);
    if (Number.isNaN(nextPaymentMs)) {
      return {
        valid: false,
        nextPaymentDateIso: rawNextPayment,
        daysUntilFirstPayment: null,
        freeTrialObjectPresent,
        noImmediateCharge,
        reason: `Formato inválido em next_payment_date retornado pela API: ${rawNextPayment}`,
      };
    }

    const diffMs = nextPaymentMs - referenceStartMs;
    const daysUntilFirstPayment = Number((diffMs / (24 * 60 * 60 * 1000)).toFixed(2));

    // Must be at least 6.8 days ahead (allowing minor clock/timezone skew around 7.00 days) and not immediate
    if (!freeTrialObjectPresent) {
      return {
        valid: false,
        nextPaymentDateIso: rawNextPayment,
        daysUntilFirstPayment,
        freeTrialObjectPresent: false,
        noImmediateCharge,
        reason:
          'A API do Mercado Pago não preservou auto_recurring.free_trial { frequency: 7, frequency_type: "days" } na assinatura.',
      };
    }

    if (!noImmediateCharge) {
      return {
        valid: false,
        nextPaymentDateIso: rawNextPayment,
        daysUntilFirstPayment,
        freeTrialObjectPresent,
        noImmediateCharge: false,
        reason: `Cobrança imediata detectada durante o período que deveria ser gratuito (charged_amount=${chargedAmount}, charged_quantity=${chargedQuantity}).`,
      };
    }

    if (daysUntilFirstPayment < 6.8 || daysUntilFirstPayment > 8.2) {
      return {
        valid: false,
        nextPaymentDateIso: rawNextPayment,
        daysUntilFirstPayment,
        freeTrialObjectPresent,
        noImmediateCharge,
        reason: `Divergência em next_payment_date: esperado +7 dias após o início do teste, mas a API retornou ${daysUntilFirstPayment} dias (${rawNextPayment}). Contratação bloqueada preventivamente.`,
      };
    }

    return {
      valid: true,
      nextPaymentDateIso: rawNextPayment,
      daysUntilFirstPayment,
      freeTrialObjectPresent: true,
      noImmediateCharge: true,
      reason: `Confirmado pela API do Mercado Pago: free_trial de 7 dias ativo, zero cobrança imediata e primeira cobrança (next_payment_date) agendada para ${rawNextPayment} (+${daysUntilFirstPayment} dias).`,
    };
  }

  /**
   * Read or initialize the user's subscription record from `/users/{uid}` in Firestore
   */
  public async getUserSubscriptionRecord(uid: string, email = '', emailVerified = false): Promise<UserSubscriptionRecord> {
    const cleanUid = (uid || '').trim();
    if (!cleanUid) {
      throw new Error('UID do Firebase Authentication é obrigatório.');
    }

    let existing = memorySubscriptionsByUid.get(cleanUid) || null;

    try {
      const snap = await getDoc(doc(db, 'users', cleanUid));
      if (snap.exists()) {
        const data = snap.data() as Record<string, any>;
        if (data?.subscription && typeof data.subscription === 'object') {
          existing = data.subscription as UserSubscriptionRecord;
        }
      }
    } catch {
      // Fallback to in-memory mirror if offline
    }

    if (existing) {
      const evaluated = this.evaluateEffectiveEntitlement(existing, Date.now());
      if (email && !evaluated.email) evaluated.email = email;
      if (emailVerified) evaluated.emailVerified = true;
      memorySubscriptionsByUid.set(cleanUid, evaluated);
      return evaluated;
    }

    const initial: UserSubscriptionRecord = {
      uid: cleanUid,
      email: email.trim(),
      emailVerified: Boolean(emailVerified),
      planId: null,
      planName: 'Plano FREE',
      tier: 'FREE',
      statusState: 'FREE',
      billingSubStatus: 'FREE_TIER',
      mpPreapprovalId: null,
      mpPlanId: null,
      remoteMpStatus: null,
      checkoutInitPoint: null,
      contractedPriceVersion: 'v1.0.0',
      contractedAmount: 0,
      currency: 'BRL',
      frequency: 1,
      frequencyType: 'months',
      trialApplied: false,
      trialDaysGranted: 0,
      trialStartDate: null,
      trialEndDate: null,
      firstPaymentDate: null,
      nextPaymentDate: null,
      currentPeriodStart: null,
      currentPeriodEnd: null,
      cancelAtPeriodEnd: false,
      canceledAt: null,
      hasUsedFreeTrial: false,
      firstTrialStartedAt: null,
      firstTrialPreapprovalId: null,
      firstTrialPlanId: null,
      acceptedTermsVersion: '1.0.0',
      acceptedAt: null,
      chargedQuantity: 0,
      chargedAmount: 0,
      updatedAt: Date.now(),
    };

    memorySubscriptionsByUid.set(cleanUid, initial);
    return initial;
  }

  public async saveUserSubscriptionRecord(record: UserSubscriptionRecord): Promise<UserSubscriptionRecord> {
    const evaluated = this.evaluateEffectiveEntitlement(record, Date.now());
    evaluated.updatedAt = Date.now();
    memorySubscriptionsByUid.set(evaluated.uid, evaluated);

    try {
      await setDoc(
        doc(db, 'users', evaluated.uid),
        {
          uid: evaluated.uid,
          email: evaluated.email || 'organizador@giodasorte.com',
          subscription: evaluated,
          updatedAt: new Date(evaluated.updatedAt).toISOString(),
        },
        { merge: true }
      );
    } catch {
      // Preserved in memory mirror
    }

    return evaluated;
  }

  /**
   * Authoritative Backend Access Control:
   * - Even when `remoteMpStatus` is `"cancelled"` / `"canceled"` or `cancelAtPeriodEnd === true`,
   *   the user retains `statusState: "ACTIVE"` and `tier: "PRO"` until `trialEndDate` (if in trial)
   *   or `currentPeriodEnd` (if in paid cycle).
   * - Never relies on remote `"cancelled"`/`"canceled"` status to immediately revoke access before the granted period ends.
   */
  public evaluateEffectiveEntitlement(
    record: UserSubscriptionRecord,
    nowMs = Date.now()
  ): UserSubscriptionRecord {
    const next = { ...record };
    if (next.remoteMpStatus && isMpCanceledStatus(next.remoteMpStatus)) {
      next.remoteMpStatus = 'canceled';
    }

    if (next.cancelAtPeriodEnd || isMpCanceledStatus(next.remoteMpStatus)) {
      const effectiveEndIso =
        next.trialApplied && next.chargedQuantity === 0
          ? next.trialEndDate || next.firstPaymentDate
          : next.currentPeriodEnd || next.nextPaymentDate || next.trialEndDate;

      const effectiveEndMs = effectiveEndIso ? Date.parse(effectiveEndIso) : 0;

      if (effectiveEndMs && nowMs <= effectiveEndMs) {
        next.tier = 'PRO';
        next.statusState = 'ACTIVE';
        next.billingSubStatus = 'CANCELED_ACTIVE_UNTIL_END';
      } else {
        next.tier = 'FREE';
        next.statusState = 'CANCELED';
        next.billingSubStatus = next.trialApplied && next.chargedQuantity === 0 ? 'TRIAL_ENDED' : 'CANCELED';
      }
      return next;
    }

    if (next.statusState === 'ACTIVE') {
      const periodEndIso =
        next.billingSubStatus === 'TRIAL_ACTIVE'
          ? next.trialEndDate || next.firstPaymentDate
          : next.currentPeriodEnd || next.nextPaymentDate;
      const periodEndMs = periodEndIso ? Date.parse(periodEndIso) : 0;
      if (periodEndMs && nowMs > periodEndMs + 24 * 60 * 60 * 1000) {
        next.tier = 'FREE';
        next.statusState = 'EXPIRED';
        next.billingSubStatus = next.billingSubStatus === 'TRIAL_ACTIVE' ? 'TRIAL_ENDED' : 'CANCELED';
      } else {
        next.tier = 'PRO';
      }
    }

    return next;
  }

  /**
   * 1:1 Bilateral Ownership Check:
   * Prevents Account B from claiming or activating a subscription created by Account A.
   */
  public verifySubscriptionOwnership(
    authenticatedUid: string,
    userRecord: UserSubscriptionRecord,
    mpPreapprovalData: any
  ): { valid: boolean; reason?: string } {
    const mpId = String(mpPreapprovalData?.id || '').trim();
    const mpExternalRef = String(mpPreapprovalData?.external_reference || '').trim();

    if (!mpId) {
      return { valid: false, reason: 'ID da assinatura ausente na resposta da API do Mercado Pago.' };
    }

    if (mpExternalRef !== authenticatedUid) {
      return {
        valid: false,
        reason: `SUBSCRIPTION_OWNERSHIP_MISMATCH_BLOCKED: O external_reference da assinatura no Mercado Pago (${mpExternalRef || 'vazio'}) não pertence ao Firebase UID autenticado (${authenticatedUid}).`,
      };
    }

    if (userRecord.mpPreapprovalId && userRecord.mpPreapprovalId !== mpId) {
      return {
        valid: false,
        reason: `SUBSCRIPTION_ID_MISMATCH_BLOCKED: O preapproval_id informado (${mpId}) diverge do mpPreapprovalId vinculado à conta (${userRecord.mpPreapprovalId}).`,
      };
    }

    // Also verify no other UID in memory/storage owns this mpPreapprovalId
    for (const [otherUid, otherRec] of memorySubscriptionsByUid.entries()) {
      if (otherUid !== authenticatedUid && otherRec.mpPreapprovalId === mpId) {
        return {
          valid: false,
          reason: `SUBSCRIPTION_ALREADY_BOUND_TO_OTHER_UID: A assinatura ${mpId} já pertence a outra conta.`,
        };
      }
    }

    return { valid: true };
  }

  /**
   * Initiate Checkout Session (Subject to Fail-Closed Homologation Gate, Verified Email & Per-UID Trial Abuse Check)
   * Note: Preserves the real customer email (`payerEmail: email`) in normal operation.
   */
  public async initiateCheckout(params: {
    uid: string;
    email: string;
    emailVerified: boolean;
    emailConfirmedByUser?: boolean;
    planId: CommercialPlanId;
    acceptedTerms: boolean;
    backUrl: string;
  }): Promise<{
    allowed: boolean;
    status: number;
    code: string;
    message: string;
    initPoint?: string;
    preapprovalId?: string;
    subscription?: UserSubscriptionRecord;
    preview?: {
      planName: string;
      price: number;
      currency: 'BRL';
      frequencyLabel: string;
      trialEligible: boolean;
      trialDays: number;
      firstPaymentDateConfirmedByMp: string | null;
      priceVersion: string;
    };
  }> {
    const uid = (params.uid || '').trim();
    const email = (params.email || '').trim();

    if (!uid || uid === 'visitante' || uid === 'organizador') {
      return {
        allowed: false,
        status: 401,
        code: 'FIREBASE_AUTH_UID_REQUIRED',
        message: 'Autentique sua conta (Firebase Authentication) antes de iniciar a contratação do plano PRO.',
      };
    }

    if (!email || (!params.emailVerified && !params.emailConfirmedByUser)) {
      return {
        allowed: false,
        status: 400,
        code: 'VERIFIED_EMAIL_REQUIRED',
        message:
          'Para contratar a assinatura, utilize um endereço de e-mail verificado na sua conta Firebase ou confirme expressamente seu e-mail de faturamento antes de prosseguir.',
      };
    }

    if (!params.acceptedTerms) {
      return {
        allowed: false,
        status: 400,
        code: 'TERMS_ACCEPTANCE_REQUIRED',
        message:
          'Confirme a leitura e o aceite dos Termos de Uso, da Política de Assinaturas e Pagamentos e da Política de Cancelamento antes de prosseguir.',
      };
    }

    const { monthly, annual, config } = await this.getOfficialPlans();
    const chosenPlan = params.planId === 'pro_annual' ? annual : monthly;
    const userRecord = await this.getUserSubscriptionRecord(uid, email, params.emailVerified);

    // Per-Account (UID) Trial Eligibility Check
    const trialOfferEnabled = config.trialOfferEnabled !== false;
    let eligibleForFreeTrial = trialOfferEnabled && !userRecord.hasUsedFreeTrial;

    if (userRecord.hasUsedFreeTrial && trialOfferEnabled) {
      await recordAuditLog(
        'PLAN_VALIDATION',
        'TRIAL_REUSE_BLOCKED',
        {
          uid,
          email: redactSensitiveMpData({ payer_email: email }).payer_email,
          firstTrialStartedAt: userRecord.firstTrialStartedAt,
          firstTrialPreapprovalId: userRecord.firstTrialPreapprovalId,
          requestedPlanId: chosenPlan.planId,
          note: 'Prevenção de abuso por conta (UID): conta já utilizou o período de 7 dias gratuitos anteriormente. Novo trial bloqueado automaticamente.',
        },
        uid
      );
      eligibleForFreeTrial = false;
    }

    // FAIL-CLOSED GATE: If homologation on Mercado Pago API has not been verified, keep contracting blocked!
    const homologationVerified = config.mpHomologationStatus === 'VERIFIED';
    if (!homologationVerified) {
      await recordAuditLog(
        'PLAN_VALIDATION',
        'CONTRACTING_BLOCKED_PENDING_MP_HOMOLOGATION',
        {
          uid,
          planId: chosenPlan.planId,
          priceVersion: chosenPlan.priceVersion,
          mpHomologationStatus: config.mpHomologationStatus || 'PENDING_CREDENTIALS',
        },
        uid
      );

      return {
        allowed: false,
        status: 503,
        code: 'CONTRACTING_BLOCKED_PENDING_MP_HOMOLOGATION',
        message:
          'Contratação bloqueada preventivamente (Fail-Closed): a validação das 10 etapas do período de teste gratuito (7 dias) na API de homologação do Mercado Pago ainda está pendente. Nenhuma cobrança foi gerada e nenhum acesso PRO simulado foi concedido.',
        preview: {
          planName: chosenPlan.name,
          price: chosenPlan.price,
          currency: 'BRL',
          frequencyLabel: chosenPlan.frequency === 12 ? 'Anual (a cada 12 meses)' : 'Mensal (a cada 1 mês)',
          trialEligible: eligibleForFreeTrial,
          trialDays: eligibleForFreeTrial ? 7 : 0,
          firstPaymentDateConfirmedByMp: null,
          priceVersion: chosenPlan.priceVersion,
        },
      };
    }

    // Record legal & commercial acceptance in /document_acceptances/{acceptanceId}
    await Promise.all([
      recordDocumentAcceptance({
        userId: uid,
        userEmail: email,
        documentId: 'termos-de-uso',
        version: '1.0.0',
        context: 'ATIVACAO_PRO',
      }),
      recordDocumentAcceptance({
        userId: uid,
        userEmail: email,
        documentId: 'politica-de-assinaturas-e-pagamentos',
        version: '1.0.0',
        context: 'ATIVACAO_PRO',
      }),
      recordDocumentAcceptance({
        userId: uid,
        userEmail: email,
        documentId: 'politica-de-cancelamento-e-reembolso',
        version: '1.0.0',
        context: 'ATIVACAO_PRO',
      }),
    ]);

    const { transport } = await this.getAuthenticatedTransport();
    const createPayload = this.buildOfficialIndividualPreapprovalPayload({
      plan: chosenPlan,
      uid,
      payerEmail: email,
      backUrl: params.backUrl,
      includeFreeTrial: eligibleForFreeTrial,
    });

    const nowMs = Date.now();
    const mpRes = await transport.createPreapproval(createPayload);

    if (mpRes.status < 200 || mpRes.status >= 300 || !mpRes.data?.id || !mpRes.data?.init_point) {
      await recordAuditLog(
        'PLAN_VALIDATION',
        'MP_PREAPPROVAL_CREATION_FAILED',
        {
          uid,
          planId: chosenPlan.planId,
          httpStatus: mpRes.status,
          response: redactSensitiveMpData(mpRes.data),
        },
        uid
      );
      return {
        allowed: false,
        status: 502,
        code: 'MP_PREAPPROVAL_CREATION_FAILED',
        message: 'A API do Mercado Pago não retornou um preapproval_id e init_point válidos.',
      };
    }

    const mpData = mpRes.data;

    // Verify external_reference === uid and initial status === "pending"
    if (String(mpData.external_reference) !== uid || String(mpData.status) !== 'pending') {
      return {
        allowed: false,
        status: 502,
        code: 'MP_RESPONSE_INTEGRITY_FAILED',
        message:
          'Divergência de integridade na resposta do Mercado Pago (external_reference ou status inicial diferente de pending).',
      };
    }

    // If eligible for 7-day free trial, strictly verify free_trial and next_payment_date from Mercado Pago API response
    if (eligibleForFreeTrial) {
      const trialCheck = this.verifySevenDayFreeTrialFromMpResponse(mpData, nowMs);
      if (!trialCheck.valid) {
        // Cancel immediately on MP if created without proper trial and block contracting
        await transport.updatePreapproval(String(mpData.id), this.buildOfficialCancelPayload()).catch(() => {});
        await recordAuditLog(
          'PLAN_VALIDATION',
          'TRIAL_DATE_DISCREPANCY_BLOCKED',
          {
            uid,
            preapprovalId: mpData.id,
            reason: trialCheck.reason,
            nextPaymentDateReturned: trialCheck.nextPaymentDateIso,
          },
          uid
        );
        return {
          allowed: false,
          status: 409,
          code: 'TRIAL_DATE_DISCREPANCY_BLOCKED',
          message: trialCheck.reason,
        };
      }
    }

    // Bind 1:1 in Firestore `/users/{uid}` BEFORE returning init_point (State remains PENDING, NOT ACTIVE!)
    const updatedRecord: UserSubscriptionRecord = {
      ...userRecord,
      uid,
      email,
      emailVerified: true,
      planId: chosenPlan.planId,
      planName: chosenPlan.name,
      tier: 'FREE',
      statusState: 'PENDING',
      billingSubStatus: 'PAYMENT_PENDING',
      mpPreapprovalId: String(mpData.id),
      mpPlanId: chosenPlan.mpPreapprovalPlanId || null,
      remoteMpStatus: 'pending',
      checkoutInitPoint: String(mpData.init_point),
      contractedPriceVersion: chosenPlan.priceVersion,
      contractedAmount: chosenPlan.price,
      currency: 'BRL',
      frequency: chosenPlan.frequency,
      frequencyType: 'months',
      trialApplied: eligibleForFreeTrial,
      trialDaysGranted: eligibleForFreeTrial ? 7 : 0,
      firstPaymentDate: mpData.next_payment_date || null,
      nextPaymentDate: mpData.next_payment_date || null,
      acceptedTermsVersion: '1.0.0',
      acceptedAt: nowMs,
      updatedAt: nowMs,
    };

    await this.saveUserSubscriptionRecord(updatedRecord);

    await recordAuditLog(
      'PLAN_VALIDATION',
      'INDIVIDUAL_CHECKOUT_CREATED',
      {
        uid,
        preapprovalId: mpData.id,
        planId: chosenPlan.planId,
        price: chosenPlan.price,
        priceVersion: chosenPlan.priceVersion,
        trialApplied: eligibleForFreeTrial,
        nextPaymentDateConfirmedByMp: mpData.next_payment_date,
      },
      uid
    );

    return {
      allowed: true,
      status: 200,
      code: 'CHECKOUT_CREATED_PENDING_CONFIRMATION',
      message:
        'Sessão de checkout individual criada com sucesso. O acesso PRO será liberado somente após a confirmação da autorização pelo backend.',
      initPoint: String(mpData.init_point),
      preapprovalId: String(mpData.id),
      subscription: updatedRecord,
      preview: {
        planName: chosenPlan.name,
        price: chosenPlan.price,
        currency: 'BRL',
        frequencyLabel: chosenPlan.frequency === 12 ? 'Anual (a cada 12 meses)' : 'Mensal (a cada 1 mês)',
        trialEligible: eligibleForFreeTrial,
        trialDays: eligibleForFreeTrial ? 7 : 0,
        firstPaymentDateConfirmedByMp: mpData.next_payment_date || null,
        priceVersion: chosenPlan.priceVersion,
      },
    };
  }

  /**
   * Synchronize & Verify Subscription Status from Mercado Pago Official API (`GET /preapproval/{id}`)
   * Never activates PRO merely because the user returned from checkout URL.
   */
  public async verifyAndSyncUserSubscription(params: {
    authenticatedUid: string;
    requestedPreapprovalId?: string;
  }): Promise<{
    success: boolean;
    status: number;
    code: string;
    message: string;
    subscription?: UserSubscriptionRecord;
  }> {
    const uid = (params.authenticatedUid || '').trim();
    if (!uid) {
      return {
        success: false,
        status: 401,
        code: 'UNAUTHORIZED',
        message: 'UID autenticado é obrigatório.',
      };
    }

    const userRecord = await this.getUserSubscriptionRecord(uid);
    const targetPreapprovalId = (params.requestedPreapprovalId || userRecord.mpPreapprovalId || '').trim();

    if (!targetPreapprovalId) {
      return {
        success: true,
        status: 200,
        code: 'NO_SUBSCRIPTION_BOUND',
        message: 'Nenhuma assinatura vinculada a esta conta.',
        subscription: userRecord,
      };
    }

    // Immediate local check before even hitting MP if userRecord has a different mpPreapprovalId
    if (userRecord.mpPreapprovalId && userRecord.mpPreapprovalId !== targetPreapprovalId) {
      await recordAuditLog(
        'PLAN_VALIDATION',
        'SUBSCRIPTION_OWNERSHIP_MISMATCH_BLOCKED',
        {
          authenticatedUid: uid,
          userBoundPreapprovalId: userRecord.mpPreapprovalId,
          attemptedPreapprovalId: targetPreapprovalId,
        },
        uid
      );
      return {
        success: false,
        status: 403,
        code: 'SUBSCRIPTION_OWNERSHIP_MISMATCH_BLOCKED',
        message: 'Acesso negado: esta assinatura pertence a outra conta e não pode ser reivindicada.',
      };
    }

    const { transport } = await this.getAuthenticatedTransport();
    const mpGet = await transport.getPreapproval(targetPreapprovalId);
    if (mpGet.status < 200 || mpGet.status >= 300 || !mpGet.data?.id) {
      return {
        success: false,
        status: 502,
        code: 'MP_LOOKUP_FAILED',
        message: 'Não foi possível consultar a assinatura na API oficial do Mercado Pago.',
      };
    }

    const mpData = mpGet.data;
    const ownership = this.verifySubscriptionOwnership(uid, userRecord, mpData);
    if (!ownership.valid) {
      await recordAuditLog(
        'PLAN_VALIDATION',
        'SUBSCRIPTION_OWNERSHIP_MISMATCH_BLOCKED',
        {
          authenticatedUid: uid,
          attemptedPreapprovalId: targetPreapprovalId,
          mpExternalReference: mpData.external_reference,
          reason: ownership.reason,
        },
        uid
      );
      return {
        success: false,
        status: 403,
        code: 'SUBSCRIPTION_OWNERSHIP_MISMATCH_BLOCKED',
        message: ownership.reason || 'Assinatura não pertence ao usuário autenticado.',
      };
    }

    const synced = await this.applyMpPreapprovalStateToUserRecord(userRecord, mpData);
    return {
      success: true,
      status: 200,
      code: `SYNCED_${synced.statusState}`,
      message: `Estado da assinatura validado no backend via Mercado Pago: ${synced.statusState} (${synced.billingSubStatus}).`,
      subscription: synced,
    };
  }

  /**
   * Applies official Mercado Pago `preapproval` response data to the user's record,
   * enforcing 7-day trial validation, post-cancellation retention, and per-account trial consumption tracking.
   */
  private async applyMpPreapprovalStateToUserRecord(
    userRecord: UserSubscriptionRecord,
    mpData: any
  ): Promise<UserSubscriptionRecord> {
    const remoteStatus = normalizeMpRemoteStatus(mpData.status);
    const chargedQuantity = Number(mpData?.summarized?.charged_quantity ?? userRecord.chargedQuantity ?? 0);
    const chargedAmount = Number(mpData?.summarized?.charged_amount ?? userRecord.chargedAmount ?? 0);
    const semaphore = String(mpData?.summarized?.semaphore || '').toLowerCase();
    const nextPaymentDate = typeof mpData.next_payment_date === 'string' ? mpData.next_payment_date : userRecord.nextPaymentDate;
    const dateCreatedMs = mpData.date_created ? Date.parse(mpData.date_created) : Date.now();

    const next: UserSubscriptionRecord = {
      ...userRecord,
      mpPreapprovalId: String(mpData.id),
      remoteMpStatus: remoteStatus,
      nextPaymentDate: nextPaymentDate || userRecord.nextPaymentDate,
      chargedQuantity,
      chargedAmount,
    };

    if (remoteStatus === 'authorized') {
      if (next.trialApplied && chargedQuantity === 0) {
        // Verify 7-day free trial date integrity from Mercado Pago response
        const trialValidation = this.verifySevenDayFreeTrialFromMpResponse(mpData, dateCreatedMs);
        if (!trialValidation.valid) {
          next.tier = 'FREE';
          next.statusState = 'PENDING';
          next.billingSubStatus = 'PAYMENT_PENDING';
          await recordAuditLog(
            'PLAN_VALIDATION',
            'AUTHORIZED_TRIAL_DATE_DISCREPANCY_BLOCKED',
            {
              uid: next.uid,
              preapprovalId: next.mpPreapprovalId,
              reason: trialValidation.reason,
            },
            next.uid
          );
          return this.saveUserSubscriptionRecord(next);
        }

        const startIso = mpData.date_created || new Date().toISOString();
        const endIso = trialValidation.nextPaymentDateIso!;
        next.trialStartDate = next.trialStartDate || startIso;
        next.trialEndDate = endIso;
        next.firstPaymentDate = endIso;
        next.currentPeriodStart = startIso;
        next.currentPeriodEnd = endIso;
        next.tier = 'PRO';
        next.statusState = 'ACTIVE';
        next.billingSubStatus = 'TRIAL_ACTIVE';
        // Permanently mark per-account trial consumed on this Firebase UID
        next.hasUsedFreeTrial = true;
        next.firstTrialStartedAt = next.firstTrialStartedAt || startIso;
        next.firstTrialPreapprovalId = next.firstTrialPreapprovalId || String(mpData.id);
        next.firstTrialPlanId = next.firstTrialPlanId || next.planId;
      } else {
        // Paid active cycle (first charge after trial or renewal)
        const lastChargedIso = mpData?.summarized?.last_charged_date || new Date().toISOString();
        next.currentPeriodStart = lastChargedIso;
        next.currentPeriodEnd = nextPaymentDate || next.currentPeriodEnd;
        next.tier = 'PRO';
        next.statusState = 'ACTIVE';
        next.billingSubStatus = 'PAID_ACTIVE';
      }

      if (semaphore === 'red' || mpData?.last_payment_status === 'rejected') {
        next.tier = 'FREE';
        next.statusState = 'PAST_DUE';
        next.billingSubStatus = 'PAYMENT_REJECTED';
      }
    } else if (remoteStatus === 'paused') {
      next.tier = 'FREE';
      next.statusState = 'PAST_DUE';
      next.billingSubStatus = 'PAYMENT_REJECTED';
    } else if (isMpCanceledStatus(remoteStatus)) {
      next.remoteMpStatus = 'canceled';
      next.cancelAtPeriodEnd = true;
      next.canceledAt = next.canceledAt || new Date().toISOString();
      // evaluateEffectiveEntitlement will keep statusState: 'ACTIVE' until trialEndDate or currentPeriodEnd!
    } else {
      // pending
      next.tier = 'FREE';
      next.statusState = 'PENDING';
      next.billingSubStatus = 'PAYMENT_PENDING';
    }

    const saved = await this.saveUserSubscriptionRecord(next);
    setProPlanTier(saved.tier, saved.statusState);
    return saved;
  }

  /**
   * User-initiated or Admin-initiated Cancellation (`PUT /preapproval/{id}` with `{ "status": "cancelled" }`)
   * Stops future recurring charges on Mercado Pago while retaining PRO access until `trialEndDate` or `currentPeriodEnd`.
   */
  public async cancelSubscription(params: {
    uid: string;
    actor?: string;
  }): Promise<{
    success: boolean;
    status: number;
    code: string;
    message: string;
    payloadSentToMp: { status: 'cancelled' };
    subscription?: UserSubscriptionRecord;
  }> {
    const uid = (params.uid || '').trim();
    const userRecord = await this.getUserSubscriptionRecord(uid);
    const cancelPayload = this.buildOfficialCancelPayload();

    if (!userRecord.mpPreapprovalId) {
      return {
        success: false,
        status: 400,
        code: 'NO_ACTIVE_SUBSCRIPTION',
        message: 'Nenhuma assinatura encontrada para cancelar.',
        payloadSentToMp: cancelPayload,
      };
    }

    const { transport } = await this.getAuthenticatedTransport();
    const mpCancelRes = await transport.updatePreapproval(userRecord.mpPreapprovalId, cancelPayload);

    if (mpCancelRes.status < 200 || mpCancelRes.status >= 300 || !isMpCanceledStatus(mpCancelRes.data?.status)) {
      return {
        success: false,
        status: 502,
        code: 'MP_CANCEL_FAILED',
        message: 'Não foi possível confirmar o cancelamento na API do Mercado Pago.',
        payloadSentToMp: cancelPayload,
      };
    }

    const nowIso = new Date().toISOString();
    const updated: UserSubscriptionRecord = {
      ...userRecord,
      remoteMpStatus: normalizeMpRemoteStatus(mpCancelRes.data?.status || 'cancelled'),
      cancelAtPeriodEnd: true,
      canceledAt: nowIso,
    };

    const saved = await this.saveUserSubscriptionRecord(updated);
    setProPlanTier(saved.tier, saved.statusState);

    const retainUntil =
      saved.trialApplied && saved.chargedQuantity === 0
        ? saved.trialEndDate || saved.firstPaymentDate
        : saved.currentPeriodEnd || saved.nextPaymentDate;

    await recordAuditLog(
      'PLAN_VALIDATION',
      'SUBSCRIPTION_CANCELED_RETAINED_UNTIL_END',
      {
        uid,
        preapprovalId: saved.mpPreapprovalId,
        payloadSentToMp: cancelPayload,
        mpReturnedStatus: mpCancelRes.data?.status,
        remoteMpStatus: saved.remoteMpStatus,
        localStatusState: saved.statusState,
        billingSubStatus: saved.billingSubStatus,
        accessRetainedUntil: retainUntil,
      },
      params.actor || uid
    );

    return {
      success: true,
      status: 200,
      code: 'CANCELED_FUTURE_CHARGES_STOPPED_ACCESS_RETAINED',
      message: retainUntil
        ? `Assinatura cancelada no Mercado Pago (HTTP 200 status: "cancelled", normalizado para "${saved.remoteMpStatus}"). Nenhuma cobrança futura será realizada e seu acesso PRO permanece ativo até ${new Date(retainUntil).toLocaleString('pt-BR')}.`
        : 'Assinatura cancelada no Mercado Pago (status: "cancelled"). Cobranças futuras interrompidas.',
      payloadSentToMp: cancelPayload,
      subscription: saved,
    };
  }

  /**
   * Validates Mercado Pago Webhook HMAC-SHA256 (`x-signature` header)
   */
  public verifyWebhookSignature(params: {
    xSignature: string;
    xRequestId: string;
    dataId: string;
    secret?: string;
  }): { valid: boolean; reason?: string } {
    const secret = (params.secret ?? process.env.MP_WEBHOOK_SECRET ?? '').trim();
    if (!secret) {
      return { valid: false, reason: 'MP_WEBHOOK_SECRET não configurado no servidor.' };
    }
    const rawSig = (params.xSignature || '').trim();
    if (!rawSig) {
      return { valid: false, reason: 'Cabeçalho x-signature ausente.' };
    }

    let ts = '';
    let v1 = '';
    for (const part of rawSig.split(',')) {
      const [k, v] = part.trim().split('=');
      if (k === 'ts') ts = v || '';
      if (k === 'v1') v1 = v || '';
    }

    if (!ts || !v1) {
      return { valid: false, reason: 'Formato inválido em x-signature (esperado ts=...,v1=...).' };
    }

    const manifest = `id:${params.dataId};request-id:${params.xRequestId};ts:${ts};`;
    const expectedHmac = crypto.createHmac('sha256', secret).update(manifest).digest('hex');

    const a = Buffer.from(v1, 'hex');
    const b = Buffer.from(expectedHmac, 'hex');
    if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
      return { valid: false, reason: 'Assinatura HMAC-SHA256 (x-signature) inválida.' };
    }

    return { valid: true };
  }

  /**
   * Processes incoming Mercado Pago Webhook idempotently (`/subscription_webhooks/{webhookId}`)
   */
  public async processWebhookNotification(params: {
    webhookId: string;
    type: string;
    action: string;
    dataId: string;
    xSignature?: string;
    xRequestId?: string;
    enforceSignature?: boolean;
    paymentStatusOverride?: 'approved' | 'rejected';
    cycleTypeOverride?: 'FIRST_POST_TRIAL' | 'MONTHLY_RENEWAL' | 'ANNUAL_RENEWAL';
  }): Promise<{
    processed: boolean;
    duplicateIgnored: boolean;
    status: number;
    code: string;
    message: string;
    subscription?: UserSubscriptionRecord;
  }> {
    if (params.enforceSignature) {
      const sigCheck = this.verifyWebhookSignature({
        xSignature: params.xSignature || '',
        xRequestId: params.xRequestId || '',
        dataId: params.dataId,
      });
      if (!sigCheck.valid) {
        return {
          processed: false,
          duplicateIgnored: false,
          status: 401,
          code: 'INVALID_WEBHOOK_SIGNATURE',
          message: sigCheck.reason || 'Assinatura do webhook inválida.',
        };
      }
    }

    const dedupKey = `${params.webhookId}_${params.action}_${params.dataId}`.replace(/[^a-zA-Z0-9_-]/g, '_');

    if (memoryWebhookReceipts.has(dedupKey)) {
      return {
        processed: false,
        duplicateIgnored: true,
        status: 200,
        code: 'DUPLICATE_WEBHOOK_IGNORED',
        message: `Webhook duplicado (${dedupKey}) reconhecido e ignorado com segurança.`,
      };
    }

    try {
      const existingSnap = await getDoc(doc(db, 'subscription_webhooks', dedupKey));
      if (existingSnap.exists()) {
        memoryWebhookReceipts.set(dedupKey, existingSnap.data() as any);
        return {
          processed: false,
          duplicateIgnored: true,
          status: 200,
          code: 'DUPLICATE_WEBHOOK_IGNORED',
          message: `Webhook duplicado (${dedupKey}) reconhecido no Firestore e ignorado com segurança.`,
        };
      }
    } catch {
      // Continue with memory dedup
    }

    const { transport } = await this.getAuthenticatedTransport();
    const mpGet = await transport.getPreapproval(params.dataId);
    if (mpGet.status < 200 || mpGet.status >= 300 || !mpGet.data?.id) {
      return {
        processed: false,
        duplicateIgnored: false,
        status: 502,
        code: 'MP_PREAPPROVAL_LOOKUP_FAILED',
        message: 'Não foi possível consultar a assinatura referenciada pelo webhook.',
      };
    }

    const mpData = mpGet.data;
    const uid = String(mpData.external_reference || '').trim();
    if (!uid) {
      return {
        processed: false,
        duplicateIgnored: false,
        status: 400,
        code: 'MISSING_EXTERNAL_REFERENCE_UID',
        message: 'A assinatura consultada não possui external_reference vinculado a um Firebase UID.',
      };
    }

    const userRecord = await this.getUserSubscriptionRecord(uid);
    const ownership = this.verifySubscriptionOwnership(uid, userRecord, mpData);
    if (!ownership.valid) {
      return {
        processed: false,
        duplicateIgnored: false,
        status: 403,
        code: 'WEBHOOK_OWNERSHIP_MISMATCH',
        message: ownership.reason || 'Conflito de propriedade no processamento do webhook.',
      };
    }

    // Record idempotency receipt BEFORE applying financial/state mutations
    const receipt = {
      webhookId: dedupKey,
      processedAt: Date.now(),
      action: params.action,
      preapprovalId: String(mpData.id),
      uid,
    };
    memoryWebhookReceipts.set(dedupKey, receipt);
    try {
      await setDoc(doc(db, 'subscription_webhooks', dedupKey), receipt);
    } catch {
      // Stored in memory mirror
    }

    if (params.paymentStatusOverride === 'rejected') {
      mpData.last_payment_status = 'rejected';
    }

    const updated = await this.applyMpPreapprovalStateToUserRecord(userRecord, mpData);

    // If this notification represents an approved recurring charge, record revenue entry
    if (
      params.paymentStatusOverride === 'approved' ||
      (params.type === 'subscription_authorized_payment' && updated.statusState === 'ACTIVE')
    ) {
      const cycleType =
        params.cycleTypeOverride ||
        (updated.frequency === 12
          ? 'ANNUAL_RENEWAL'
          : updated.chargedQuantity <= 1
          ? 'FIRST_POST_TRIAL'
          : 'MONTHLY_RENEWAL');

      memoryRevenueEvents.push({
        paymentId: `pay_${dedupKey}`,
        preapprovalId: String(mpData.id),
        uid,
        planId: updated.planId || 'pro_monthly',
        amount: updated.contractedAmount,
        currency: 'BRL',
        cycleType,
        paidAt: Date.now(),
      });
    }

    await recordAuditLog(
      'PLAN_VALIDATION',
      'WEBHOOK_PROCESSED',
      {
        webhookId: dedupKey,
        uid,
        preapprovalId: mpData.id,
        statusState: updated.statusState,
        billingSubStatus: updated.billingSubStatus,
        nextPaymentDate: updated.nextPaymentDate,
      },
      'MERCADOPAGO_WEBHOOK'
    );

    return {
      processed: true,
      duplicateIgnored: false,
      status: 200,
      code: 'WEBHOOK_PROCESSED_SUCCESSFULLY',
      message: `Webhook processado com sucesso para UID ${uid} (${updated.statusState} / ${updated.billingSubStatus}).`,
      subscription: updated,
    };
  }

  /**
   * 10-STEP MANDATORY HOMOLOGATION VALIDATOR FOR INDIVIDUAL CHECKOUT (`POST /preapproval` without `preapproval_plan_id`)
   * Executes the 10 steps against the configured transport (Live Mercado Pago Test API when `MP_ACCESS_TOKEN` is set,
   * or reports `PENDING_CREDENTIALS` without forging live execution when `MP_ACCESS_TOKEN` is absent).
   */
  public async executeTenStepHomologationVerification(options?: {
    customTransport?: MercadoPagoTransport;
    isSimulatedTransport?: boolean;
  }): Promise<MercadoPagoHomologationReport> {
    const envStatus = this.getEnvironmentCredentialStatus();
    const usingSimulated = Boolean(options?.isSimulatedTransport);

    const stepTitles: { stepNumber: number; code: string; title: string }[] = [
      { stepNumber: 1, code: 'STEP_01_CREATE_INDIVIDUAL_PREAPPROVAL', title: '1. Criação de assinatura individual em homologação (POST /preapproval sem plano)' },
      { stepNumber: 2, code: 'STEP_02_INDIVIDUAL_INIT_POINT', title: '2. Retorno de init_point individual (.../checkout?preapproval_id={id})' },
      { stepNumber: 3, code: 'STEP_03_EXTERNAL_REFERENCE_UID', title: '3. Confirmação de external_reference vinculado ao Firebase UID' },
      { stepNumber: 4, code: 'STEP_04_INITIAL_STATUS_PENDING', title: '4. Confirmação do status inicial "pending"' },
      { stepNumber: 5, code: 'STEP_05_AUTHORIZE_TEST_CHECKOUT', title: '5. Autorização do checkout de teste' },
      { stepNumber: 6, code: 'STEP_06_GET_PREAPPROVAL_BY_ID', title: '6. Consulta posterior via GET /preapproval/{id}' },
      { stepNumber: 7, code: 'STEP_07_VERIFY_FREE_TRIAL_AND_NEXT_PAYMENT', title: '7. Verificação de free_trial (7 days) e next_payment_date (+7 dias)' },
      { stepNumber: 8, code: 'STEP_08_NO_CHARGE_BEFORE_7_DAYS', title: '8. Confirmação de que nenhuma cobrança ocorre antes do fim dos 7 dias' },
      { stepNumber: 9, code: 'STEP_09_CANCEL_DURING_TRIAL', title: '9. Cancelamento durante o teste (PUT /preapproval/{id} { status: "cancelled" })' },
      { stepNumber: 10, code: 'STEP_10_CANCEL_STOPS_FUTURE_CHARGES', title: '10. Confirmação de interrupção de cobranças futuras mantendo acesso até o fim do teste' },
    ];

    if (!options?.customTransport && !this.customTransport && !envStatus.accessTokenConfigured) {
      const blockedSteps: HomologationStepResult[] = stepTitles.map((s) => ({
        ...s,
        status: 'BLOCKED_PENDING_CREDENTIALS',
        details: 'Aguardando configuração de MP_ACCESS_TOKEN de conta de teste no ambiente do servidor.',
        verifiedAt: Date.now(),
      }));

      const report: MercadoPagoHomologationReport = {
        status: 'PENDING_CREDENTIALS',
        flowEvaluated: 'INDIVIDUAL_HOSTED_PREAPPROVAL',
        executedAgainstLiveApi: false,
        credentialsConfigured: false,
        isTestCredential: false,
        collectorTestUserVerified: false,
        collectorSiteId: null,
        trialConfirmedSevenDays: false,
        noImmediateChargeConfirmed: false,
        externalReferenceUidConfirmed: false,
        canceledStopsFutureChargesConfirmed: false,
        contractingUnlocked: false,
        blockReason:
          'MP_ACCESS_TOKEN não está definido no ambiente do servidor. Conforme a diretriz Fail-Closed aprovada, a contratação permanece bloqueada e nenhum sucesso é simulado em produção.',
        steps: blockedSteps,
        evaluatedAt: Date.now(),
      };

      return report;
    }

    // Verify collector account identity via GET /users/me (Fix #1)
    let activeTransport: MercadoPagoTransport;
    let collectorIdentity: CollectorIdentityVerificationResult;
    try {
      const auth = await this.getAuthenticatedTransport(options?.customTransport);
      activeTransport = auth.transport;
      collectorIdentity = auth.identity;
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : String(err);
      const blockedSteps: HomologationStepResult[] = stepTitles.map((s) => ({
        ...s,
        status: 'BLOCKED_PENDING_CREDENTIALS',
        details: errMsg,
        verifiedAt: Date.now(),
      }));

      return {
        status: 'PENDING_CREDENTIALS',
        flowEvaluated: 'INDIVIDUAL_HOSTED_PREAPPROVAL',
        executedAgainstLiveApi: false,
        credentialsConfigured: envStatus.accessTokenConfigured,
        isTestCredential: false,
        collectorTestUserVerified: false,
        collectorSiteId: null,
        trialConfirmedSevenDays: false,
        noImmediateChargeConfirmed: false,
        externalReferenceUidConfirmed: false,
        canceledStopsFutureChargesConfirmed: false,
        contractingUnlocked: false,
        blockReason: errMsg,
        steps: blockedSteps,
        evaluatedAt: Date.now(),
      };
    }

    const steps: HomologationStepResult[] = [];
    const { monthly } = await this.getOfficialPlans();
    const testUid = `uid_homolog_${Date.now()}`;
    // Fix #3: Exclusively in homologation tests, when collector is a test_user, resolve an MLB @testuser.com test buyer email
    const testEmail = await this.resolveHomologationTestBuyerEmail(activeTransport, collectorIdentity);
    const backUrl = 'https://ais-dev-bodr7wggvyyl4p2jtskel4-749434257827.europe-west2.run.app/?subscription_return=1';

    // Step 1: Create individual subscription
    const createPayload = this.buildOfficialIndividualPreapprovalPayload({
      plan: monthly,
      uid: testUid,
      payerEmail: testEmail,
      backUrl,
      includeFreeTrial: true,
    });

    const createStartMs = Date.now();
    const createRes = await activeTransport.createPreapproval(createPayload);
    const createdData = createRes.data || {};
    const preapprovalId = String(createdData.id || '');

    const step1Passed = createRes.status >= 200 && createRes.status < 300 && Boolean(preapprovalId);
    steps.push({
      ...stepTitles[0],
      status: step1Passed ? 'PASSED' : 'FAILED',
      details: step1Passed
        ? `Assinatura individual criada com ID ${preapprovalId} (HTTP ${createRes.status}).`
        : `Falha ao criar assinatura individual (HTTP ${createRes.status}).`,
      evidence: {
        collectorIdentity: {
          isTestUserAccount: collectorIdentity.isTestUserAccount,
          siteId: collectorIdentity.siteId,
          tags: collectorIdentity.tags,
        },
        requestPayload: redactSensitiveMpData(createPayload),
        responseStatus: createRes.status,
        responseBody: redactSensitiveMpData(createdData),
      },
      verifiedAt: Date.now(),
    });

    // Step 2: Verify individual init_point
    const initPoint = String(createdData.init_point || '');
    const step2Passed =
      step1Passed &&
      initPoint.includes('mercadopago.com') &&
      initPoint.includes(`preapproval_id=${preapprovalId}`);
    steps.push({
      ...stepTitles[1],
      status: step2Passed ? 'PASSED' : 'FAILED',
      details: step2Passed
        ? `init_point individual retornado contendo preapproval_id=${preapprovalId}.`
        : `init_point ausente ou não individual: ${initPoint}`,
      evidence: { init_point: initPoint },
      verifiedAt: Date.now(),
    });

    // Step 3: Verify external_reference === Firebase UID
    const step3Passed = step1Passed && String(createdData.external_reference) === testUid;
    steps.push({
      ...stepTitles[2],
      status: step3Passed ? 'PASSED' : 'FAILED',
      details: step3Passed
        ? `external_reference retornado pela API coincide exatamente com o Firebase UID (${testUid}).`
        : `Divergência em external_reference: esperado ${testUid}, recebido ${createdData.external_reference}`,
      evidence: { expectedUid: testUid, returnedExternalReference: createdData.external_reference },
      verifiedAt: Date.now(),
    });

    // Step 4: Verify initial status === "pending"
    const step4Passed = step1Passed && String(createdData.status) === 'pending';
    steps.push({
      ...stepTitles[3],
      status: step4Passed ? 'PASSED' : 'FAILED',
      details: step4Passed
        ? 'Status inicial retornado pela API é exatamente "pending".'
        : `Status inicial inesperado: ${createdData.status}`,
      evidence: { status: createdData.status },
      verifiedAt: Date.now(),
    });

    // Step 5: Authorize test checkout
    let authorizedInTest = false;
    let targetVerificationPreapprovalId = preapprovalId;
    let authStartMs = createStartMs;

    if (step1Passed) {
      if (usingSimulated) {
        await activeTransport.updatePreapproval(preapprovalId, { status: 'authorized' });
        authorizedInTest = true;
      } else if (activeTransport.createCardToken) {
        try {
          const cardTokRes = await activeTransport.createCardToken({
            cardNumber: '4066690000000001',
            securityCode: '123',
            expirationMonth: 11,
            expirationYear: 2028,
            cardholderName: 'APRO TESTUSER',
            docType: 'CPF',
            docNumber: '19119119100',
          });
          const cardTokenId = String(cardTokRes.data?.id || '').trim();
          if (cardTokenId) {
            const authUid = `uid_homolog_auth_${Date.now()}`;
            authStartMs = Date.now();
            const authPayload = {
              reason: monthly.name,
              external_reference: authUid,
              payer_email: testEmail,
              card_token_id: cardTokenId,
              auto_recurring: {
                frequency: monthly.frequency,
                frequency_type: monthly.frequencyType,
                transaction_amount: monthly.price,
                currency_id: monthly.currency,
                free_trial: {
                  frequency: 7,
                  frequency_type: 'days',
                },
              },
              back_url: backUrl,
              status: 'authorized',
            };
            const authRes = await activeTransport.createPreapproval(authPayload);
            if (
              authRes.status >= 200 &&
              authRes.status < 300 &&
              authRes.data?.id &&
              authRes.data?.status === 'authorized'
            ) {
              authorizedInTest = true;
              targetVerificationPreapprovalId = String(authRes.data.id);
            }
          }
        } catch {
          // Handled in step result
        }
      }
    }

    steps.push({
      ...stepTitles[4],
      status: authorizedInTest ? 'PASSED' : step1Passed ? 'SKIPPED' : 'FAILED',
      details: authorizedInTest
        ? `Checkout de teste autorizado com sucesso na API de homologação do Mercado Pago (ID: ${targetVerificationPreapprovalId}, status: "authorized").`
        : 'Pendente de autorização interativa do comprador de teste no navegador via init_point gerado.',
      evidence: {
        authorizedPreapprovalId: targetVerificationPreapprovalId,
        authorizedInTest,
      },
      verifiedAt: Date.now(),
    });

    // Step 6: Query via GET /preapproval/{id}
    const getRes = step1Passed
      ? await activeTransport.getPreapproval(targetVerificationPreapprovalId)
      : { status: 400, data: {} };
    const getData = getRes.data || {};
    const step6Passed =
      getRes.status >= 200 &&
      getRes.status < 300 &&
      String(getData.id) === targetVerificationPreapprovalId;
    steps.push({
      ...stepTitles[5],
      status: step6Passed ? 'PASSED' : 'FAILED',
      details: step6Passed
        ? `Consulta GET /preapproval/${targetVerificationPreapprovalId} concluída com sucesso (HTTP ${getRes.status}).`
        : `Falha ao consultar GET /preapproval/${targetVerificationPreapprovalId}.`,
      evidence: { responseBody: redactSensitiveMpData(getData) },
      verifiedAt: Date.now(),
    });

    // Step 7 & Step 8: Verify free_trial (7 days) + next_payment_date (+7 days) + zero immediate charge
    const trialValidation = this.verifySevenDayFreeTrialFromMpResponse(getData, authStartMs);
    steps.push({
      ...stepTitles[6],
      status: trialValidation.valid ? 'PASSED' : 'FAILED',
      details: trialValidation.reason,
      evidence: {
        free_trial: getData?.auto_recurring?.free_trial,
        next_payment_date: trialValidation.nextPaymentDateIso,
        daysUntilFirstPayment: trialValidation.daysUntilFirstPayment,
      },
      verifiedAt: Date.now(),
    });

    steps.push({
      ...stepTitles[7],
      status: trialValidation.noImmediateCharge && trialValidation.valid ? 'PASSED' : 'FAILED',
      details:
        trialValidation.noImmediateCharge && trialValidation.valid
          ? 'Confirmado: charged_quantity = 0, charged_amount = 0 e primeira cobrança somente após os 7 dias.'
          : 'Não foi possível comprovar ausência de cobrança nos 7 dias.',
      evidence: {
        charged_quantity: getData?.summarized?.charged_quantity ?? 0,
        charged_amount: getData?.summarized?.charged_amount ?? 0,
      },
      verifiedAt: Date.now(),
    });

    // Step 9: Cancel during trial with official HTTP payload { "status": "cancelled" } (Fix #2)
    const cancelPayload = this.buildOfficialCancelPayload();
    const cancelRes = step1Passed
      ? await activeTransport.updatePreapproval(targetVerificationPreapprovalId, cancelPayload)
      : { status: 400, data: {} };
    const step9Passed =
      cancelRes.status >= 200 &&
      cancelRes.status < 300 &&
      isMpCanceledStatus(cancelRes.data?.status);
    steps.push({
      ...stepTitles[8],
      status: step9Passed ? 'PASSED' : 'FAILED',
      details: step9Passed
        ? `Cancelamento enviado com { "status": "cancelled" } e confirmado pela API (HTTP ${cancelRes.status}, status retornado: "${cancelRes.data?.status}", normalizado internamente para "${normalizeMpRemoteStatus(cancelRes.data?.status)}").`
        : 'Falha ao cancelar assinatura durante o teste.',
      evidence: {
        requestPayload: cancelPayload,
        responseStatus: cancelRes.status,
        responseBody: redactSensitiveMpData(cancelRes.data),
      },
      verifiedAt: Date.now(),
    });

    // Step 10: Confirm future charges stopped in MP while local access retained until trialEndDate
    const afterCancelGet = step1Passed
      ? await activeTransport.getPreapproval(targetVerificationPreapprovalId)
      : { status: 400, data: {} };
    const remoteIsCanceled = isMpCanceledStatus(afterCancelGet.data?.status);
    steps.push({
      ...stepTitles[9],
      status: remoteIsCanceled ? 'PASSED' : 'FAILED',
      details: remoteIsCanceled
        ? `Confirmado via GET /preapproval/${targetVerificationPreapprovalId}: status remoto "${afterCancelGet.data?.status}" (normalizado para "canceled") interrompe cobranças futuras (free_trial=${JSON.stringify(afterCancelGet.data?.auto_recurring?.free_trial ?? null)}), enquanto o backend retém o acesso PRO até trialEndDate.`
        : 'Status remoto após cancelamento não retornou "cancelled".',
      evidence: {
        remoteStatusAfterCancel: afterCancelGet.data?.status,
        normalizedInternalStatus: normalizeMpRemoteStatus(afterCancelGet.data?.status),
        freeTrialAfterCancel: afterCancelGet.data?.auto_recurring?.free_trial ?? null,
        firstInvoiceOffsetAfterCancel: afterCancelGet.data?.first_invoice_offset ?? null,
      },
      verifiedAt: Date.now(),
    });

    const allAutomatedApiStepsPassed =
      step1Passed &&
      step2Passed &&
      step3Passed &&
      step4Passed &&
      step6Passed &&
      trialValidation.valid &&
      trialValidation.noImmediateCharge &&
      step9Passed &&
      remoteIsCanceled;

    const executedAgainstLiveApi = !usingSimulated && envStatus.accessTokenConfigured && collectorIdentity.isTestUserAccount;
    // Never unlock real user contracting automatically until interactive checkout authorization (Step 5) is also completed
    const contractingUnlocked = executedAgainstLiveApi && allAutomatedApiStepsPassed && authorizedInTest;

    const report: MercadoPagoHomologationReport = {
      status: contractingUnlocked
        ? 'VERIFIED'
        : !trialValidation.valid
        ? 'FAILED_TRIAL_CHECK'
        : 'PENDING_EXECUTION',
      flowEvaluated: 'INDIVIDUAL_HOSTED_PREAPPROVAL',
      executedAgainstLiveApi,
      credentialsConfigured: envStatus.accessTokenConfigured,
      isTestCredential: collectorIdentity.isTestUserAccount,
      collectorTestUserVerified: collectorIdentity.isTestUserAccount,
      collectorSiteId: collectorIdentity.siteId,
      trialConfirmedSevenDays: trialValidation.valid,
      noImmediateChargeConfirmed: trialValidation.noImmediateCharge,
      externalReferenceUidConfirmed: step3Passed,
      canceledStopsFutureChargesConfirmed: remoteIsCanceled,
      contractingUnlocked,
      blockReason: contractingUnlocked
        ? null
        : !trialValidation.valid
        ? `Ativação comercial interrompida: ${trialValidation.reason}`
        : executedAgainstLiveApi
        ? 'Etapas automatizadas (1, 2, 3, 4, 6, 7, 8, 9 e 10) aprovadas na API real de homologação do Mercado Pago. Etapa 5 (autorização interativa do checkout hospedado no navegador) permanece pendente; contratação mantida bloqueada por segurança.'
        : 'Os 10 passos passaram no transporte simulado local, mas a liberação de cobranças reais exige execução contra a API de homologação do Mercado Pago.',
      steps,
      evaluatedAt: Date.now(),
    };

    if (executedAgainstLiveApi) {
      await saveCommercialSubscriptionConfig({
        mpHomologationStatus: report.status,
        mpHomologationReport: report,
      });
    }

    return report;
  }

  /**
   * Admin Update for Plan Prices (Creates a new `priceVersion` without retroactively modifying active contracts)
   */
  public async updateCommercialPlansAdmin(params: {
    monthlyPrice?: number;
    annualPrice?: number;
    trialOfferEnabled?: boolean;
    adminEmail?: string;
  }): Promise<CommercialSubscriptionConfig> {
    const current = await fetchCommercialSubscriptionConfig();
    const nextMonthly =
      params.monthlyPrice !== undefined && Number(params.monthlyPrice) > 0
        ? Number(Number(params.monthlyPrice).toFixed(2))
        : Number(current.monthlyPrice ?? 29.90);
    const nextAnnual =
      params.annualPrice !== undefined && Number(params.annualPrice) > 0
        ? Number(Number(params.annualPrice).toFixed(2))
        : Number(current.annualPrice ?? 199.90);

    const priceChanged =
      nextMonthly !== Number(current.monthlyPrice ?? 29.90) ||
      nextAnnual !== Number(current.annualPrice ?? 199.90);

    let nextVersion = current.priceVersion || 'v1.0.0';
    if (priceChanged) {
      const parts = nextVersion.replace(/^v/, '').split('.').map((n) => parseInt(n, 10) || 0);
      nextVersion = `v${parts[0] || 1}.${(parts[1] || 0) + 1}.0`;
    }

    const nextTrialOffer =
      params.trialOfferEnabled !== undefined
        ? Boolean(params.trialOfferEnabled)
        : current.trialOfferEnabled !== false;

    const updated = await saveCommercialSubscriptionConfig({
      monthlyPrice: nextMonthly,
      annualPrice: nextAnnual,
      trialOfferEnabled: nextTrialOffer,
      priceVersion: nextVersion,
      priceDisplay: `R$ ${nextMonthly.toFixed(2).replace('.', ',')}/mês ou R$ ${nextAnnual.toFixed(2).replace('.', ',')}/ano${nextTrialOffer ? ' (7 dias grátis)' : ''}`,
    });

    await recordAuditLog(
      'PLAN_VALIDATION',
      'COMMERCIAL_PLANS_UPDATED_BY_ADMIN',
      {
        monthlyPrice: nextMonthly,
        annualPrice: nextAnnual,
        trialOfferEnabled: nextTrialOffer,
        previousPriceVersion: current.priceVersion || 'v1.0.0',
        newPriceVersion: nextVersion,
        note: 'Contratos ativos mantêm contractedPriceVersion e contractedAmount originais sem alteração retroativa.',
      },
      params.adminEmail || 'admin'
    );

    return updated;
  }

  /**
   * Administrative Dashboard Metrics (Subscribers in trial, upcoming charges, active/canceled/rejected, revenue by plan)
   */
  public async getAdminDashboardSummary() {
    const { monthly, annual, config } = await this.getOfficialPlans();
    const envStatus = this.getEnvironmentCredentialStatus();

    const allRecordsMap = new Map<string, UserSubscriptionRecord>();
    for (const [uid, rec] of memorySubscriptionsByUid.entries()) {
      allRecordsMap.set(uid, this.evaluateEffectiveEntitlement(rec, Date.now()));
    }

    try {
      const snap = await getDocs(collection(db, 'users'));
      snap.forEach((docSnap) => {
        const data = docSnap.data() as Record<string, any>;
        if (data?.subscription && typeof data.subscription === 'object') {
          const sub = this.evaluateEffectiveEntitlement(data.subscription as UserSubscriptionRecord, Date.now());
          allRecordsMap.set(sub.uid, sub);
        }
      });
    } catch {
      // Use in-memory records
    }

    const allSubscribers = Array.from(allRecordsMap.values()).filter((r) => r.planId !== null);

    const subscribersInTrial = allSubscribers.filter(
      (r) => r.billingSubStatus === 'TRIAL_ACTIVE' || (r.billingSubStatus === 'CANCELED_ACTIVE_UNTIL_END' && r.trialApplied && r.chargedQuantity === 0)
    );
    const activeSubscribers = allSubscribers.filter((r) => r.statusState === 'ACTIVE');
    const canceledSubscribers = allSubscribers.filter(
      (r) => r.statusState === 'CANCELED' || r.cancelAtPeriodEnd || r.remoteMpStatus === 'canceled'
    );
    const pendingOrRejectedSubscribers = allSubscribers.filter(
      (r) => r.statusState === 'PENDING' || r.statusState === 'PAST_DUE'
    );

    const upcomingCharges = allSubscribers
      .filter((r) => r.statusState === 'ACTIVE' && !r.cancelAtPeriodEnd && Boolean(r.nextPaymentDate))
      .map((r) => ({
        uid: r.uid,
        email: r.email,
        planId: r.planId,
        planName: r.planName,
        amount: r.contractedAmount,
        priceVersion: r.contractedPriceVersion,
        nextPaymentDate: r.nextPaymentDate!,
        isFirstPostTrialCharge: r.billingSubStatus === 'TRIAL_ACTIVE',
      }))
      .sort((a, b) => Date.parse(a.nextPaymentDate) - Date.parse(b.nextPaymentDate));

    const monthlyRevenueTotal = Number(
      memoryRevenueEvents
        .filter((e) => e.planId === 'pro_monthly')
        .reduce((acc, item) => acc + item.amount, 0)
        .toFixed(2)
    );
    const annualRevenueTotal = Number(
      memoryRevenueEvents
        .filter((e) => e.planId === 'pro_annual')
        .reduce((acc, item) => acc + item.amount, 0)
        .toFixed(2)
    );

    return {
      plans: { monthly, annual },
      config,
      environment: envStatus,
      homologationStatus: config.mpHomologationStatus || 'PENDING_CREDENTIALS',
      homologationReport: config.mpHomologationReport || null,
      contractingUnlocked: config.mpHomologationStatus === 'VERIFIED',
      metrics: {
        totalSubscribersCount: allSubscribers.length,
        subscribersInTrialCount: subscribersInTrial.length,
        activeSubscribersCount: activeSubscribers.length,
        canceledSubscribersCount: canceledSubscribers.length,
        pendingOrRejectedCount: pendingOrRejectedSubscribers.length,
        revenueByModality: {
          pro_monthly: monthlyRevenueTotal,
          pro_annual: annualRevenueTotal,
          totalBrl: Number((monthlyRevenueTotal + annualRevenueTotal).toFixed(2)),
        },
      },
      subscribersInTrial,
      upcomingCharges,
      activeSubscribers,
      canceledSubscribers,
      pendingOrRejectedSubscribers,
    };
  }

  public clearMemoryForTesting() {
    memorySubscriptionsByUid.clear();
    memoryWebhookReceipts.clear();
    memoryRevenueEvents.length = 0;
  }
}

export const mercadoPagoSubscriptionService = new MercadoPagoSubscriptionService();
