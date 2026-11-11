import crypto from 'crypto';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { db } from '../firebase.ts';
import type {
  CommercialPlanId,
  OfficialSubscriptionPlanDefinition,
  PayPalRemoteStatus,
  SubscriptionBillingSubStatus,
  SubscriptionPlanTier,
  SubscriptionStatusState,
  UserSubscriptionRecord,
} from '../types.ts';
import { mercadoPagoSubscriptionService } from './mercadoPagoSubscriptionService.ts';

export const PAYPAL_SANDBOX_BASE_URL = 'https://api-m.sandbox.paypal.com';
export const PAYPAL_LIVE_BASE_URL = 'https://api-m.paypal.com';
export const THREE_DAYS_MS = 3 * 24 * 60 * 60 * 1000;

export interface PayPalSubscriptionDetails {
  id: string;
  plan_id: string;
  status: PayPalRemoteStatus;
  custom_id?: string;
  subscriber?: {
    email_address?: string;
    name?: {
      given_name?: string;
      surname?: string;
    };
  };
  create_time?: string;
  start_time?: string;
  links?: Array<{ href: string; rel: string; method?: string }>;
  billing_info?: {
    next_billing_time?: string;
    last_payment?: {
      amount?: {
        currency_code?: string;
        value?: string;
      };
      time?: string;
    };
  };
}

export interface PayPalTransport {
  getAccessToken(): Promise<string>;
  createSubscription(payload: Record<string, unknown>): Promise<{ status: number; data: any }>;
  getSubscription(subscriptionId: string): Promise<{ status: number; data: any }>;
  cancelSubscription(subscriptionId: string, reason: string): Promise<{ status: number; data: any }>;
  verifyWebhookSignature(params: {
    authAlgo: string;
    certUrl: string;
    transmissionId: string;
    transmissionSig: string;
    transmissionTime: string;
    webhookId: string;
    webhookEvent: Record<string, unknown>;
  }): Promise<{ status: number; data: any }>;
}

/**
 * Default HTTP transport for the official PayPal REST API (v1 / v2)
 */
export class DefaultPayPalTransport implements PayPalTransport {
  private cachedToken: { token: string; expiresAt: number } | null = null;

  private getBaseUrl(): string {
    const env = (process.env.PAYPAL_ENVIRONMENT || 'sandbox').trim().toLowerCase();
    return env === 'production' || env === 'live' ? PAYPAL_LIVE_BASE_URL : PAYPAL_SANDBOX_BASE_URL;
  }

  public async getAccessToken(): Promise<string> {
    if (this.cachedToken && Date.now() < this.cachedToken.expiresAt - 60000) {
      return this.cachedToken.token;
    }

    const clientId = (process.env.PAYPAL_CLIENT_ID || '').trim();
    const clientSecret = (process.env.PAYPAL_CLIENT_SECRET || '').trim();

    if (!clientId || !clientSecret) {
      throw new Error(
        'Credenciais do PayPal não configuradas (PAYPAL_CLIENT_ID / PAYPAL_CLIENT_SECRET).'
      );
    }

    const authHeader = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');
    const res = await fetch(`${this.getBaseUrl()}/v1/oauth2/token`, {
      method: 'POST',
      headers: {
        Authorization: `Basic ${authHeader}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: 'grant_type=client_credentials',
    });

    const data = await res.json();
    if (!res.ok || !data.access_token) {
      throw new Error(
        `Falha na autenticação com PayPal: ${data.error_description || data.error || res.statusText}`
      );
    }

    const expiresIn = Number(data.expires_in) || 3600;
    this.cachedToken = {
      token: data.access_token,
      expiresAt: Date.now() + expiresIn * 1000,
    };

    return data.access_token;
  }

  public async createSubscription(payload: Record<string, unknown>): Promise<{ status: number; data: any }> {
    const token = await this.getAccessToken();
    const res = await fetch(`${this.getBaseUrl()}/v1/billing/subscriptions`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        Accept: 'application/json',
        Prefer: 'return=representation',
      },
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    return { status: res.status, data };
  }

  public async getSubscription(subscriptionId: string): Promise<{ status: number; data: any }> {
    const token = await this.getAccessToken();
    const res = await fetch(`${this.getBaseUrl()}/v1/billing/subscriptions/${encodeURIComponent(subscriptionId)}`, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
    });
    const data = await res.json();
    return { status: res.status, data };
  }

  public async cancelSubscription(subscriptionId: string, reason: string): Promise<{ status: number; data: any }> {
    const token = await this.getAccessToken();
    const res = await fetch(`${this.getBaseUrl()}/v1/billing/subscriptions/${encodeURIComponent(subscriptionId)}/cancel`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify({ reason: reason || 'Cancelamento solicitado pelo usuário' }),
    });

    // 204 No Content is success
    if (res.status === 204) {
      return { status: 204, data: { success: true } };
    }
    const data = await res.json().catch(() => ({}));
    return { status: res.status, data };
  }

  public async verifyWebhookSignature(params: {
    authAlgo: string;
    certUrl: string;
    transmissionId: string;
    transmissionSig: string;
    transmissionTime: string;
    webhookId: string;
    webhookEvent: Record<string, unknown>;
  }): Promise<{ status: number; data: any }> {
    const token = await this.getAccessToken();
    const res = await fetch(`${this.getBaseUrl()}/v1/notifications/verify-webhook-signature`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify({
        auth_algo: params.authAlgo,
        cert_url: params.certUrl,
        transmission_id: params.transmissionId,
        transmission_sig: params.transmissionSig,
        transmission_time: params.transmissionTime,
        webhook_id: params.webhookId,
        webhook_event: params.webhookEvent,
      }),
    });
    const data = await res.json();
    return { status: res.status, data };
  }
}

export class PayPalSubscriptionService {
  private transport: PayPalTransport;

  constructor(transport?: PayPalTransport) {
    this.transport = transport || new DefaultPayPalTransport();
  }

  public setTransport(transport: PayPalTransport): void {
    this.transport = transport;
  }

  /**
   * Returns official PayPal recurring plans configuration.
   * Aligned with commercial pricing:
   * - PRO Mensal: R$ 29,90 / mês
   * - PRO Anual: R$ 199,90 / ano
   * - 3 days free trial
   */
  public getOfficialPlans(): {
    monthly: OfficialSubscriptionPlanDefinition;
    annual: OfficialSubscriptionPlanDefinition;
  } {
    const monthly: OfficialSubscriptionPlanDefinition = {
      planId: 'pro_monthly',
      name: 'PRO Mensal',
      price: 29.9,
      currency: 'BRL',
      frequency: 1,
      frequencyType: 'months',
      freeTrial: {
        frequency: 3,
        frequencyType: 'days',
      },
      monthlyEquivalent: 29.9,
      annualSavingsAmount: 0,
      annualDiscountPercent: 0,
      priceVersion: 'v1.0.0',
    };

    const annual: OfficialSubscriptionPlanDefinition = {
      planId: 'pro_annual',
      name: 'PRO Anual',
      price: 199.9,
      currency: 'BRL',
      frequency: 12,
      frequencyType: 'months',
      freeTrial: {
        frequency: 3,
        frequencyType: 'days',
      },
      monthlyEquivalent: +(199.9 / 12).toFixed(2),
      annualSavingsAmount: +(29.9 * 12 - 199.9).toFixed(2), // R$ 158.90
      annualDiscountPercent: Math.round(((29.9 * 12 - 199.9) / (29.9 * 12)) * 100), // ~44%
      priceVersion: 'v1.0.0',
    };

    return { monthly, annual };
  }

  /**
   * Resolves the PayPal Plan ID (custom configured or default sandbox identifier)
   */
  public getPayPalPlanId(planId: CommercialPlanId): string {
    if (planId === 'pro_annual') {
      return process.env.PAYPAL_PLAN_ID_ANNUAL || 'P-GIO-PRO-ANNUAL-BRL';
    }
    return process.env.PAYPAL_PLAN_ID_MONTHLY || 'P-GIO-PRO-MONTHLY-BRL';
  }

  /**
   * Initiates an official PayPal Subscription checkout with bilateral Firebase UID binding (`custom_id`).
   */
  public async initiateCheckout(params: {
    uid: string;
    email: string;
    emailVerified?: boolean;
    planId: CommercialPlanId;
    returnUrl: string;
    cancelUrl: string;
  }): Promise<{
    allowed: boolean;
    status: number;
    code: string;
    message: string;
    approvalUrl?: string;
    subscriptionId?: string;
    subscription?: UserSubscriptionRecord;
  }> {
    const { uid, email, emailVerified, planId, returnUrl, cancelUrl } = params;

    if (!uid || !uid.trim()) {
      return {
        allowed: false,
        status: 400,
        code: 'MISSING_UID',
        message: 'Identificador Firebase UID é obrigatório para iniciar o checkout do PayPal.',
      };
    }

    const cleanEmail = (email || '').trim();
    if (!cleanEmail) {
      return {
        allowed: false,
        status: 400,
        code: 'MISSING_PAYER_EMAIL',
        message: 'E-mail do organizador é obrigatório para registrar a assinatura no PayPal.',
      };
    }

    const userRecord = await mercadoPagoSubscriptionService.getUserSubscriptionRecord(
      uid,
      cleanEmail,
      Boolean(emailVerified)
    );

    if (userRecord.tier === 'PRO' && userRecord.statusState === 'ACTIVE') {
      return {
        allowed: false,
        status: 409,
        code: 'ALREADY_ACTIVE_PRO',
        message: 'Sua conta já possui uma assinatura PRO ativa.',
        subscription: userRecord,
      };
    }

    const paypalPlanId = this.getPayPalPlanId(planId);
    const plans = this.getOfficialPlans();
    const chosenPlan = planId === 'pro_annual' ? plans.annual : plans.monthly;

    const payload: Record<string, unknown> = {
      plan_id: paypalPlanId,
      custom_id: uid, // Strict 1:1 Bilateral Firebase UID Binding
      subscriber: {
        email_address: cleanEmail,
      },
      application_context: {
        brand_name: 'GIO DA SORTE PRO',
        locale: 'pt-BR',
        shipping_preference: 'NO_SHIPPING',
        user_action: 'SUBSCRIBE_NOW',
        return_url: returnUrl,
        cancel_url: cancelUrl,
      },
    };

    try {
      const response = await this.transport.createSubscription(payload);
      if (response.status !== 201 && response.status !== 200) {
        const errorDetail =
          response.data?.details?.[0]?.description ||
          response.data?.message ||
          response.data?.error ||
          'Falha ao criar assinatura no PayPal.';
        return {
          allowed: false,
          status: response.status >= 400 && response.status < 600 ? response.status : 502,
          code: 'PAYPAL_API_ERROR',
          message: `Erro da API PayPal: ${errorDetail}`,
        };
      }

      const subData = response.data;
      const subscriptionId = subData.id;
      const approveLink = (subData.links || []).find((l: any) => l.rel === 'approve')?.href;

      if (!subscriptionId || !approveLink) {
        return {
          allowed: false,
          status: 502,
          code: 'PAYPAL_MISSING_APPROVE_LINK',
          message: 'A resposta do PayPal não conteve o link de autorização de pagamento.',
        };
      }

      // Record pending subscription bound to user
      const updatedRecord: UserSubscriptionRecord = {
        ...userRecord,
        provider: 'PAYPAL',
        planId,
        planName: chosenPlan.name,
        paypalSubscriptionId: subscriptionId,
        paypalPlanId,
        remotePaypalStatus: subData.status || 'APPROVAL_PENDING',
        checkoutInitPoint: approveLink,
        contractedAmount: chosenPlan.price,
        contractedPriceVersion: chosenPlan.priceVersion,
        frequency: chosenPlan.frequency,
        frequencyType: chosenPlan.frequencyType,
        statusState: 'PENDING',
        billingSubStatus: 'PAYMENT_PENDING',
        updatedAt: Date.now(),
      };

      await mercadoPagoSubscriptionService.saveUserSubscriptionRecord(updatedRecord);
      await this.reconcileUnassociatedWebhooks(uid, subscriptionId);

      return {
        allowed: true,
        status: 200,
        code: 'PAYPAL_CHECKOUT_CREATED',
        message: 'Assinatura criada no PayPal. Redirecionando para aprovação segura...',
        approvalUrl: approveLink,
        subscriptionId,
        subscription: updatedRecord,
      };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      return {
        allowed: false,
        status: 503,
        code: 'PAYPAL_COMMUNICATION_ERROR',
        message: `Falha na comunicação com o serviço PayPal: ${msg}`,
      };
    }
  }

  /**
   * Verifies a PayPal subscription by calling `GET /v1/billing/subscriptions/{id}`,
   * enforces 1:1 bilateral ownership (`custom_id === authenticatedUid`),
   * and activates PRO access if status is ACTIVE or APPROVED.
   */
  public async verifyAndSyncUserSubscription(params: {
    authenticatedUid: string;
    requestedSubscriptionId: string;
  }): Promise<{
    success: boolean;
    status: number;
    code: string;
    message: string;
    subscription?: UserSubscriptionRecord;
  }> {
    const { authenticatedUid, requestedSubscriptionId } = params;

    if (!authenticatedUid || !requestedSubscriptionId) {
      return {
        success: false,
        status: 400,
        code: 'MISSING_PARAMS',
        message: 'authenticatedUid e requestedSubscriptionId são obrigatórios.',
      };
    }

    const userRecord = await mercadoPagoSubscriptionService.getUserSubscriptionRecord(authenticatedUid);

    try {
      const res = await this.transport.getSubscription(requestedSubscriptionId);
      if (res.status !== 200 || !res.data) {
        return {
          success: false,
          status: res.status === 404 ? 404 : 502,
          code: 'PAYPAL_SUBSCRIPTION_NOT_FOUND',
          message: 'Assinatura não encontrada na API oficial do PayPal.',
        };
      }

      const sub = res.data;
      const customId = String(sub.custom_id || '').trim();

      // Enforce 1:1 Bilateral UID Ownership
      if (customId && customId !== authenticatedUid) {
        return {
          success: false,
          status: 403,
          code: 'FORBIDDEN_SUBSCRIPTION_OWNERSHIP',
          message: 'Esta assinatura do PayPal pertence a outra conta GIO DA SORTE.',
        };
      }

      const remoteStatus: PayPalRemoteStatus = sub.status;
      const now = Date.now();

      // Check if trial was granted
      const hasTrial = !userRecord.hasUsedFreeTrial;
      const trialStartDate = hasTrial ? new Date(now).toISOString() : userRecord.trialStartDate;
      const trialEndDate = hasTrial
        ? new Date(now + THREE_DAYS_MS).toISOString()
        : userRecord.trialEndDate;

      const nextPaymentDate = sub.billing_info?.next_billing_time || trialEndDate;

      let newTier: SubscriptionPlanTier = 'FREE';
      let newStatusState: SubscriptionStatusState = 'PENDING';
      let newBillingSubStatus: SubscriptionBillingSubStatus = 'PAYMENT_PENDING';

      if (remoteStatus === 'ACTIVE' || remoteStatus === 'APPROVED') {
        newTier = 'PRO';
        newStatusState = 'ACTIVE';
        newBillingSubStatus = hasTrial ? 'TRIAL_ACTIVE' : 'PAID_ACTIVE';
      } else if (remoteStatus === 'SUSPENDED') {
        newTier = 'FREE';
        newStatusState = 'PAST_DUE';
        newBillingSubStatus = 'PAYMENT_REJECTED';
      } else if (remoteStatus === 'CANCELLED') {
        newTier = 'FREE';
        newStatusState = 'CANCELED';
        newBillingSubStatus = 'CANCELED';
      } else if (remoteStatus === 'EXPIRED') {
        newTier = 'FREE';
        newStatusState = 'EXPIRED';
        newBillingSubStatus = 'TRIAL_ENDED';
      }

      const updatedRecord: UserSubscriptionRecord = {
        ...userRecord,
        provider: 'PAYPAL',
        paypalSubscriptionId: requestedSubscriptionId,
        remotePaypalStatus: remoteStatus,
        tier: newTier,
        statusState: newStatusState,
        billingSubStatus: newBillingSubStatus,
        trialApplied: hasTrial,
        trialDaysGranted: hasTrial ? 3 : userRecord.trialDaysGranted,
        trialStartDate: trialStartDate || null,
        trialEndDate: trialEndDate || null,
        nextPaymentDate: nextPaymentDate || null,
        currentPeriodStart: sub.billing_info?.last_payment?.time || trialStartDate || new Date(now).toISOString(),
        currentPeriodEnd: nextPaymentDate || null,
        hasUsedFreeTrial: userRecord.hasUsedFreeTrial || hasTrial,
        updatedAt: now,
      };

      const saved = await mercadoPagoSubscriptionService.saveUserSubscriptionRecord(updatedRecord);
      await this.reconcileUnassociatedWebhooks(authenticatedUid, requestedSubscriptionId);

      return {
        success: true,
        status: 200,
        code: 'PAYPAL_SUBSCRIPTION_SYNCED',
        message:
          newStatusState === 'ACTIVE'
            ? 'Assinatura PRO confirmada e ativada com sucesso pelo PayPal!'
            : `Status da assinatura PayPal atualizado para: ${remoteStatus}`,
        subscription: saved,
      };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      return {
        success: false,
        status: 503,
        code: 'PAYPAL_VERIFICATION_ERROR',
        message: `Falha ao verificar assinatura no PayPal: ${msg}`,
      };
    }
  }

  /**
   * Cancels future recurring billing in PayPal while keeping PRO access active
   * until `trialEndDate` or `currentPeriodEnd`.
   */
  public async cancelSubscription(params: {
    uid: string;
    reason?: string;
  }): Promise<{
    success: boolean;
    status: number;
    code: string;
    message: string;
    subscription?: UserSubscriptionRecord;
  }> {
    const { uid, reason = 'Cancelamento solicitado pelo usuário' } = params;

    const userRecord = await mercadoPagoSubscriptionService.getUserSubscriptionRecord(uid);
    const subscriptionId = userRecord.paypalSubscriptionId;

    if (!subscriptionId) {
      return {
        success: false,
        status: 400,
        code: 'NO_PAYPAL_SUBSCRIPTION',
        message: 'Nenhuma assinatura PayPal ativa encontrada para esta conta.',
      };
    }

    try {
      const res = await this.transport.cancelSubscription(subscriptionId, reason);
      if (res.status !== 204 && res.status !== 200) {
        const errorDesc = res.data?.message || res.data?.error || 'Erro ao cancelar no PayPal.';
        return {
          success: false,
          status: res.status >= 400 && res.status < 600 ? res.status : 502,
          code: 'PAYPAL_CANCEL_ERROR',
          message: `Falha ao cancelar no PayPal: ${errorDesc}`,
        };
      }

      // Mark cancelAtPeriodEnd while preserving PRO access until the cycle expires
      const now = Date.now();
      const updated: UserSubscriptionRecord = {
        ...userRecord,
        cancelAtPeriodEnd: true,
        canceledAt: new Date(now).toISOString(),
        remotePaypalStatus: 'CANCELLED',
        updatedAt: now,
      };

      const saved = await mercadoPagoSubscriptionService.saveUserSubscriptionRecord(updated);

      return {
        success: true,
        status: 200,
        code: 'PAYPAL_SUBSCRIPTION_CANCELED',
        message:
          'Renovações futuras canceladas com sucesso. Seu acesso PRO permanece liberado até o final do período contratado.',
        subscription: saved,
      };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      return {
        success: false,
        status: 503,
        code: 'PAYPAL_CANCEL_COMMUNICATION_ERROR',
        message: `Erro de comunicação com o PayPal: ${msg}`,
      };
    }
  }

  /**
   * Reconciles unassociated webhooks stored in PENDING_RECONCILIATION state for a given subscriptionId
   */
  public async reconcileUnassociatedWebhooks(
    uid: string,
    paypalSubscriptionId: string
  ): Promise<{ reconciledCount: number; subscription?: UserSubscriptionRecord }> {
    const cleanUid = (uid || '').trim();
    const cleanSubId = (paypalSubscriptionId || '').trim();
    if (!cleanUid || !cleanSubId) return { reconciledCount: 0 };

    let reconciledCount = 0;
    let latestSubscription: UserSubscriptionRecord | undefined;

    for (const [key, item] of memoryUnassociatedWebhooks.entries()) {
      if (item.paypalSubscriptionId === cleanSubId && !item.reconciled) {
        item.resource = { ...item.resource, custom_id: cleanUid };
        const result = await this.processWebhookNotification({
          webhookId: item.webhookId,
          eventType: item.eventType,
          resource: item.resource,
          headers: item.headers || {},
          enforceSignature: false,
        });

        if (result.processed) {
          item.reconciled = true;
          item.status = 'PROCESSED';
          reconciledCount++;
          if (result.subscription) latestSubscription = result.subscription;
        }
      }
    }

    return { reconciledCount, subscription: latestSubscription };
  }

  /**
   * Processes PayPal webhook notifications idempotently.
   * Handles:
   * - BILLING.SUBSCRIPTION.ACTIVATED
   * - BILLING.SUBSCRIPTION.CANCELLED
   * - BILLING.SUBSCRIPTION.SUSPENDED
   * - BILLING.SUBSCRIPTION.EXPIRED
   * - BILLING.SUBSCRIPTION.PAYMENT.FAILED
   * - PAYMENT.SALE.COMPLETED
   * - PAYMENT.SALE.DENIED
   * - PAYMENT.SALE.REFUNDED
   * - PAYMENT.SALE.REVERSED
   */
  public async processWebhookNotification(params: {
    webhookId: string;
    eventType: string;
    resource: Record<string, any>;
    headers: {
      authAlgo?: string;
      certUrl?: string;
      transmissionId?: string;
      transmissionSig?: string;
      transmissionTime?: string;
    };
    rawBody?: Record<string, any>;
    enforceSignature?: boolean;
  }): Promise<{
    processed: boolean;
    status: number;
    code: string;
    message: string;
    subscription?: UserSubscriptionRecord;
  }> {
    const { webhookId, eventType, resource, headers, rawBody, enforceSignature = true } = params;

    if (!webhookId) {
      return {
        processed: false,
        status: 400,
        code: 'MISSING_WEBHOOK_ID',
        message: 'Identificador de webhook ausente.',
      };
    }

    const dedupKey = `pp_${webhookId}`;

    // 1. Idempotency Check in memory and Firestore
    const memoryReceipt = memoryWebhookReceipts.get(dedupKey);
    if (memoryReceipt && memoryReceipt.status === 'PROCESSED') {
      return {
        processed: true,
        status: 200,
        code: 'WEBHOOK_ALREADY_PROCESSED',
        message: 'Webhook PayPal já processado com sucesso anteriormente (Idempotência garantida).',
        subscription: memoryReceipt.subscription,
      };
    }

    try {
      const snap = await getDoc(doc(db, 'subscription_webhooks', dedupKey));
      if (snap.exists()) {
        const existingData = snap.data() as Record<string, any>;
        if (existingData.status === 'PROCESSED') {
          return {
            processed: true,
            status: 200,
            code: 'WEBHOOK_ALREADY_PROCESSED',
            message: 'Webhook PayPal já processado com sucesso anteriormente (Idempotência garantida).',
            subscription: existingData.subscription,
          };
        }
      }
    } catch {
      // Offline / in-memory fallback
    }

    // 2. Cryptographic Signature Verification
    const configuredWebhookId = (process.env.PAYPAL_WEBHOOK_ID || '').trim();
    if (enforceSignature && configuredWebhookId && headers.transmissionId && headers.transmissionSig) {
      try {
        const verifyRes = await this.transport.verifyWebhookSignature({
          authAlgo: headers.authAlgo || 'SHA256withRSA',
          certUrl: headers.certUrl || '',
          transmissionId: headers.transmissionId,
          transmissionSig: headers.transmissionSig,
          transmissionTime: headers.transmissionTime || '',
          webhookId: configuredWebhookId,
          webhookEvent: rawBody || { id: webhookId, event_type: eventType, resource },
        });

        if (verifyRes.data?.verification_status !== 'SUCCESS') {
          return {
            processed: false,
            status: 401,
            code: 'INVALID_PAYPAL_WEBHOOK_SIGNATURE',
            message: 'Assinatura criptográfica do webhook PayPal inválida.',
          };
        }
      } catch (err: unknown) {
        return {
          processed: false,
          status: 401,
          code: 'WEBHOOK_SIGNATURE_VERIFICATION_FAILED',
          message: `Falha ao validar assinatura do webhook: ${err instanceof Error ? err.message : String(err)}`,
        };
      }
    }

    // 3. Extract custom_id (Firebase UID) or resolve by subscriptionId
    const subscriptionId = String(
      resource?.id || resource?.billing_agreement_id || resource?.subscription_id || ''
    ).trim();
    let uid = String(resource?.custom_id || resource?.custom || '').trim();

    if (!uid && subscriptionId) {
      const foundRec = await mercadoPagoSubscriptionService.findUserRecordByPayPalSubscriptionId(subscriptionId);
      if (foundRec) {
        uid = foundRec.uid;
      } else {
        try {
          const subRes = await this.transport.getSubscription(subscriptionId);
          if (subRes.status === 200 && subRes.data?.custom_id) {
            uid = String(subRes.data.custom_id).trim();
          }
        } catch {
          // Fallback below
        }
      }
    }

    if (!uid) {
      // Store webhook in PENDING_RECONCILIATION state for safe custody
      const pendingRecord = {
        webhookId,
        provider: 'PAYPAL',
        eventType,
        paypalSubscriptionId: subscriptionId,
        resource,
        headers,
        processedAt: new Date().toISOString(),
        status: 'PENDING_RECONCILIATION',
        reconciled: false,
      };

      memoryUnassociatedWebhooks.set(dedupKey, pendingRecord);
      try {
        await setDoc(doc(db, 'subscription_webhooks', dedupKey), pendingRecord);
      } catch {}

      return {
        processed: true,
        status: 200,
        code: 'WEBHOOK_PENDING_RECONCILIATION',
        message: 'Evento mantido em custódia segura aguardando vinculação de UID de usuário.',
      };
    }

    const userRecord = await mercadoPagoSubscriptionService.getUserSubscriptionRecord(uid);
    const now = Date.now();

    // Out-of-Order Event Protection
    const rawEventTime = resource?.create_time || resource?.update_time || resource?.event_time || headers?.transmissionTime;
    const eventTime = rawEventTime ? Date.parse(rawEventTime) : now;

    if (eventTime && userRecord.updatedAt && eventTime < userRecord.updatedAt) {
      const skippedRecord = {
        webhookId,
        provider: 'PAYPAL',
        eventType,
        uid,
        processedAt: new Date().toISOString(),
        status: 'SKIPPED_OUT_OF_ORDER',
      };
      memoryWebhookReceipts.set(dedupKey, { status: 'SKIPPED_OUT_OF_ORDER', subscription: userRecord });
      try {
        await setDoc(doc(db, 'subscription_webhooks', dedupKey), skippedRecord);
      } catch {}

      return {
        processed: true,
        status: 200,
        code: 'WEBHOOK_SKIPPED_OUT_OF_ORDER',
        message: 'Evento mais antigo que a última atualização do registro de assinatura. Mutation descartada por segurança.',
        subscription: userRecord,
      };
    }

    let updatedRecord: UserSubscriptionRecord = { ...userRecord };

    switch (eventType) {
      case 'BILLING.SUBSCRIPTION.ACTIVATED': {
        const hasTrial = !userRecord.hasUsedFreeTrial;
        updatedRecord = {
          ...userRecord,
          provider: 'PAYPAL',
          paypalSubscriptionId: subscriptionId || userRecord.paypalSubscriptionId,
          remotePaypalStatus: 'ACTIVE',
          tier: 'PRO',
          statusState: 'ACTIVE',
          billingSubStatus: hasTrial ? 'TRIAL_ACTIVE' : 'PAID_ACTIVE',
          trialApplied: hasTrial,
          hasUsedFreeTrial: userRecord.hasUsedFreeTrial || hasTrial,
          updatedAt: now,
        };
        break;
      }

      case 'BILLING.SUBSCRIPTION.CANCELLED': {
        updatedRecord = {
          ...userRecord,
          cancelAtPeriodEnd: true,
          canceledAt: new Date(now).toISOString(),
          remotePaypalStatus: 'CANCELLED',
          updatedAt: now,
        };
        break;
      }

      case 'BILLING.SUBSCRIPTION.SUSPENDED': {
        updatedRecord = {
          ...userRecord,
          remotePaypalStatus: 'SUSPENDED',
          tier: 'FREE',
          statusState: 'PAST_DUE',
          billingSubStatus: 'PAYMENT_REJECTED',
          updatedAt: now,
        };
        break;
      }

      case 'BILLING.SUBSCRIPTION.EXPIRED': {
        updatedRecord = {
          ...userRecord,
          remotePaypalStatus: 'EXPIRED',
          tier: 'FREE',
          statusState: 'EXPIRED',
          billingSubStatus: 'TRIAL_ENDED',
          updatedAt: now,
        };
        break;
      }

      case 'BILLING.SUBSCRIPTION.PAYMENT.FAILED': {
        updatedRecord = {
          ...userRecord,
          tier: 'FREE',
          statusState: 'PAST_DUE',
          billingSubStatus: 'PAYMENT_REJECTED',
          updatedAt: now,
        };
        break;
      }

      case 'PAYMENT.SALE.COMPLETED': {
        const amount = Number(resource?.amount?.total) || userRecord.contractedAmount || 29.9;
        const nextBilling = resource?.billing_agreement_id
          ? new Date(now + 30 * 24 * 60 * 60 * 1000).toISOString()
          : userRecord.nextPaymentDate || new Date(now + 30 * 24 * 60 * 60 * 1000).toISOString();

        updatedRecord = {
          ...userRecord,
          provider: 'PAYPAL',
          tier: 'PRO',
          statusState: 'ACTIVE',
          billingSubStatus: 'PAID_ACTIVE',
          chargedQuantity: (userRecord.chargedQuantity || 0) + 1,
          chargedAmount: (userRecord.chargedAmount || 0) + amount,
          firstPaymentDate: userRecord.firstPaymentDate || new Date(now).toISOString(),
          currentPeriodStart: new Date(now).toISOString(),
          currentPeriodEnd: nextBilling,
          nextPaymentDate: nextBilling,
          updatedAt: now,
        };
        break;
      }

      case 'PAYMENT.SALE.DENIED': {
        updatedRecord = {
          ...userRecord,
          billingSubStatus: 'PAYMENT_REJECTED',
          updatedAt: now,
        };
        break;
      }

      case 'PAYMENT.SALE.REFUNDED': {
        const refundedAmount = Number(resource?.amount?.total) || 0;
        const newQuantity = Math.max(0, (userRecord.chargedQuantity || 1) - 1);
        const newAmount = Math.max(0, (userRecord.chargedAmount || 0) - refundedAmount);

        updatedRecord = {
          ...userRecord,
          chargedQuantity: newQuantity,
          chargedAmount: newAmount,
          tier: newQuantity === 0 && !userRecord.trialApplied ? 'FREE' : userRecord.tier,
          statusState: newQuantity === 0 && !userRecord.trialApplied ? 'CANCELED' : userRecord.statusState,
          billingSubStatus: newQuantity === 0 && !userRecord.trialApplied ? 'CANCELED' : userRecord.billingSubStatus,
          updatedAt: now,
        };
        break;
      }

      case 'PAYMENT.SALE.REVERSED': {
        const reversedAmount = Number(resource?.amount?.total) || 0;
        const newQuantity = Math.max(0, (userRecord.chargedQuantity || 1) - 1);
        const newAmount = Math.max(0, (userRecord.chargedAmount || 0) - reversedAmount);

        updatedRecord = {
          ...userRecord,
          chargedQuantity: newQuantity,
          chargedAmount: newAmount,
          tier: newQuantity === 0 && !userRecord.trialApplied ? 'FREE' : userRecord.tier,
          statusState: newQuantity === 0 && !userRecord.trialApplied ? 'PAST_DUE' : userRecord.statusState,
          billingSubStatus: newQuantity === 0 && !userRecord.trialApplied ? 'PAYMENT_REJECTED' : userRecord.billingSubStatus,
          updatedAt: now,
        };
        break;
      }

      default:
        // Other events do not alter state
        break;
    }

    const saved = await mercadoPagoSubscriptionService.saveUserSubscriptionRecord(updatedRecord);

    const receipt = {
      webhookId,
      provider: 'PAYPAL',
      eventType,
      uid,
      subscription: saved,
      processedAt: new Date().toISOString(),
      status: 'PROCESSED',
    };

    memoryWebhookReceipts.set(dedupKey, receipt);
    try {
      await setDoc(doc(db, 'subscription_webhooks', dedupKey), receipt);
    } catch {}

    return {
      processed: true,
      status: 200,
      code: 'WEBHOOK_PROCESSED_SUCCESSFULLY',
      message: `Webhook ${eventType} processado com sucesso para o usuário ${uid}.`,
      subscription: saved,
    };
  }
}

// In-memory mirrors for fallback custody and deduplication
const memoryWebhookReceipts = new Map<string, { status: string; subscription?: UserSubscriptionRecord }>();
const memoryUnassociatedWebhooks = new Map<string, any>();

export const paypalSubscriptionService = new PayPalSubscriptionService();
