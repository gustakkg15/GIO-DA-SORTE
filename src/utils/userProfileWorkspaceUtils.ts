import type {
  RaffleSettings,
  Participant,
  Winner,
  TicketAllocation,
  UserSubscriptionRecord,
  ProPlanEntitlement,
  LgpdRequestRecord,
  CommercialSubscriptionConfig,
} from '../types.ts';

export type ProfileWorkspaceSectionId =
  | 'profile'
  | 'connections'
  | 'security'
  | 'subscription'
  | 'payments'
  | 'preferences'
  | 'privacy';

export interface ProfileWorkspaceSectionMeta {
  id: ProfileWorkspaceSectionId;
  label: string;
  shortLabel: string;
  subtitle: string;
  description: string;
  group: 'CONTA' | 'FINANCEIRO' | 'SISTEMA';
}

export const PROFILE_WORKSPACE_SECTIONS: ProfileWorkspaceSectionMeta[] = [
  {
    id: 'profile',
    label: 'Meu perfil',
    shortLabel: 'Meu perfil',
    subtitle: 'Nome, foto, @usuário, e-mail e sincronização',
    description:
      'Gerencie sua identidade pública como organizador, foto de exibição, arroba de identificação e sincronização automática na nuvem.',
    group: 'CONTA',
  },
  {
    id: 'connections',
    label: 'Contas conectadas',
    shortLabel: 'Contas',
    subtitle: 'TikTok Login Kit, TikTok LIVE e provedores OAuth',
    description:
      'Controle o vínculo oficial com o TikTok (OAuth 2.0), o estado da transmissão TikTok LIVE e os provedores de autenticação vinculados.',
    group: 'CONTA',
  },
  {
    id: 'security',
    label: 'Segurança',
    shortLabel: 'Segurança',
    subtitle: 'Senha, sessões ativas e verificação de acesso',
    description:
      'Altere sua senha com reautenticação em 2 etapas (Step-Up), monitore a sessão ativa, renove tokens criptográficos e encerre acessos com segurança.',
    group: 'CONTA',
  },
  {
    id: 'subscription',
    label: 'Assinatura',
    shortLabel: 'Assinatura',
    subtitle: 'Plano atual, ciclo de renovação e cancelamento',
    description:
      'Acompanhe o status autoritativo do seu plano FREE ou TIKTOK LIVE PRO, período de avaliação, data da próxima renovação e opção de cancelamento.',
    group: 'FINANCEIRO',
  },
  {
    id: 'payments',
    label: 'Pagamentos',
    shortLabel: 'Pagamentos',
    subtitle: 'Histórico, recibos e métodos de pagamento',
    description:
      'Consulte cobranças registradas na sua assinatura, emita comprovantes detalhados e configure suas chaves PIX e PayPal para apoio dos participantes.',
    group: 'FINANCEIRO',
  },
  {
    id: 'preferences',
    label: 'Preferências',
    shortLabel: 'Preferências',
    subtitle: 'Idioma, notificações, áudio e aparência',
    description:
      'Personalize o tema visual do aplicativo, efeitos sonoros do globo/roleta, contagem regressiva, idioma regional e regras padrão dos sorteios.',
    group: 'SISTEMA',
  },
  {
    id: 'privacy',
    label: 'Privacidade',
    shortLabel: 'Privacidade',
    subtitle: 'Exportação de dados, cookies e exclusão (LGPD)',
    description:
      'Exporte seus dados em formato aberto (JSON, CSV e PDF), ajuste preferências de cookies e registre solicitações formais de exclusão ou portabilidade (LGPD).',
    group: 'SISTEMA',
  },
];

export interface BillingReceiptItem {
  receiptId: string;
  referenceId: string;
  provider: 'PAYPAL' | 'MERCADO_PAGO';
  planId: string;
  planName: string;
  description: string;
  amount: number;
  currency: 'BRL';
  status: 'PAID' | 'TRIAL' | 'PENDING' | 'CANCELED';
  issuedAtIso: string;
  periodStartIso: string | null;
  periodEndIso: string | null;
}

export function deriveUsernameHandle(
  customHandle?: string | null,
  displayName?: string | null,
  email?: string | null
): string {
  const rawCustom = (customHandle || '').trim().replace(/^@+/, '');
  if (rawCustom) {
    return `@${rawCustom.toLowerCase().replace(/[^a-z0-9._-]/g, '')}`;
  }
  const rawName = (displayName || '').trim();
  if (rawName) {
    const slug = rawName
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9._-]/g, '_')
      .replace(/_+/g, '_')
      .replace(/^_|_$/g, '');
    if (slug) return `@${slug}`;
  }
  const emailPrefix = (email || '').split('@')[0]?.trim().toLowerCase().replace(/[^a-z0-9._-]/g, '');
  if (emailPrefix) return `@${emailPrefix}`;
  return '@organizador_gio';
}

export function buildPaymentHistoryFromSubscription(
  sub: UserSubscriptionRecord | null,
  config?: CommercialSubscriptionConfig | null
): BillingReceiptItem[] {
  if (!sub) return [];
  const hasProviderBinding = Boolean(sub.paypalSubscriptionId || sub.mpPreapprovalId);
  if (!hasProviderBinding && sub.statusState === 'FREE' && sub.chargedQuantity === 0) {
    return [];
  }

  const items: BillingReceiptItem[] = [];
  const provider: 'PAYPAL' | 'MERCADO_PAGO' =
    sub.provider === 'PAYPAL' || Boolean(sub.paypalSubscriptionId) ? 'PAYPAL' : 'MERCADO_PAGO';
  const referenceId =
    (provider === 'PAYPAL' ? sub.paypalSubscriptionId : sub.mpPreapprovalId) || `SUB-${sub.uid.slice(0, 8)}`;
  const fallbackPrice =
    sub.planId === 'pro_annual'
      ? config?.annualPrice ?? 199.9
      : config?.monthlyPrice ?? 29.9;
  const cycleAmount = sub.contractedAmount > 0 ? sub.contractedAmount : fallbackPrice;

  // 1. Paid or active recurring cycle
  if (sub.chargedQuantity > 0 || sub.billingSubStatus === 'PAID_ACTIVE') {
    const amountPaid = sub.chargedAmount > 0 ? sub.chargedAmount : cycleAmount;
    const issuedIso =
      sub.currentPeriodStart ||
      sub.firstPaymentDate ||
      new Date(sub.updatedAt || Date.now()).toISOString();
    items.push({
      receiptId: `REC-${referenceId.slice(-8).toUpperCase()}-PAID`,
      referenceId,
      provider,
      planId: sub.planId || 'pro_monthly',
      planName: sub.planName || 'GIO DA SORTE PRO',
      description: `Assinatura ${sub.planName || 'GIO DA SORTE PRO'} — Ciclo confirmada via ${
        provider === 'PAYPAL' ? 'PayPal' : 'Mercado Pago'
      }`,
      amount: amountPaid,
      currency: 'BRL',
      status: 'PAID',
      issuedAtIso: issuedIso,
      periodStartIso: sub.currentPeriodStart || sub.firstPaymentDate,
      periodEndIso: sub.currentPeriodEnd || sub.nextPaymentDate,
    });
  }

  // 2. Trial activation record
  if (sub.trialApplied || sub.billingSubStatus === 'TRIAL_ACTIVE') {
    const trialStart =
      sub.trialStartDate ||
      sub.firstTrialStartedAt ||
      sub.currentPeriodStart ||
      new Date(sub.updatedAt || Date.now()).toISOString();
    items.push({
      receiptId: `REC-${referenceId.slice(-8).toUpperCase()}-TRIAL`,
      referenceId,
      provider,
      planId: sub.planId || 'pro_monthly',
      planName: sub.planName || 'GIO DA SORTE PRO',
      description: `Ativação de Período de Teste Gratuito (${sub.trialDaysGranted || 3} dias) — Sem cobrança imediata`,
      amount: 0,
      currency: 'BRL',
      status: 'TRIAL',
      issuedAtIso: trialStart,
      periodStartIso: trialStart,
      periodEndIso: sub.trialEndDate || sub.currentPeriodEnd,
    });
  }

  // 3. Pending checkout or canceled without previous entries
  if (items.length === 0 && hasProviderBinding) {
    const statusMap: BillingReceiptItem['status'] =
      sub.statusState === 'CANCELED'
        ? 'CANCELED'
        : sub.statusState === 'ACTIVE'
        ? 'PAID'
        : 'PENDING';
    items.push({
      receiptId: `REC-${referenceId.slice(-8).toUpperCase()}-STATUS`,
      referenceId,
      provider,
      planId: sub.planId || 'pro_monthly',
      planName: sub.planName || 'GIO DA SORTE PRO',
      description: `Registro de Assinatura (${sub.statusState}) via ${
        provider === 'PAYPAL' ? 'PayPal' : 'Mercado Pago'
      }`,
      amount: statusMap === 'PAID' ? cycleAmount : 0,
      currency: 'BRL',
      status: statusMap,
      issuedAtIso:
        sub.currentPeriodStart ||
        sub.canceledAt ||
        new Date(sub.updatedAt || Date.now()).toISOString(),
      periodStartIso: sub.currentPeriodStart,
      periodEndIso: sub.currentPeriodEnd,
    });
  }

  return items;
}

export function generateSubscriptionReceiptHtml(
  item: BillingReceiptItem,
  user: { uid: string; displayName: string; email: string }
): string {
  const formattedAmount = item.amount.toLocaleString('pt-BR', {
    style: 'currency',
    currency: item.currency,
  });
  const issuedDate = new Date(item.issuedAtIso).toLocaleString('pt-BR');
  const periodStart = item.periodStartIso
    ? new Date(item.periodStartIso).toLocaleDateString('pt-BR')
    : '—';
  const periodEnd = item.periodEndIso
    ? new Date(item.periodEndIso).toLocaleDateString('pt-BR')
    : '—';
  const statusLabel =
    item.status === 'PAID'
      ? 'PAGO / ATIVO'
      : item.status === 'TRIAL'
      ? 'TESTE GRATUITO (R$ 0,00)'
      : item.status === 'CANCELED'
      ? 'CANCELADO'
      : 'PENDENTE';

  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8" />
  <title>Recibo ${item.receiptId} — GIO DA SORTE PRO</title>
  <style>
    body { font-family: 'Inter', -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; background: #080D18; color: #FFFFFF; padding: 32px; margin: 0; }
    .card { max-width: 680px; margin: 0 auto; background: #111B30; border: 1px solid rgba(165, 177, 197, 0.2); border-radius: 16px; padding: 32px; }
    .header { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 1px solid rgba(165, 177, 197, 0.2); padding-bottom: 20px; margin-bottom: 24px; }
    .brand { font-size: 20px; font-weight: 800; color: #FFFFFF; letter-spacing: 0.02em; }
    .badge { display: inline-block; padding: 4px 10px; border-radius: 6px; font-size: 11px; font-weight: 700; background: #0131CD; color: #FFFFFF; }
    .row { display: flex; justify-content: space-between; padding: 10px 0; border-bottom: 1px solid rgba(165, 177, 197, 0.12); font-size: 14px; }
    .label { color: #A5B1C5; }
    .val { font-weight: 600; color: #FFFFFF; font-variant-numeric: tabular-nums; }
    .total { font-size: 18px; font-weight: 800; color: #A6C957; }
    .footer { margin-top: 24px; font-size: 12px; color: #A5B1C5; line-height: 1.5; }
  </style>
</head>
<body>
  <div class="card">
    <div class="header">
      <div>
        <div class="brand">GIO DA SORTE PRO</div>
        <div style="color:#A5B1C5;font-size:13px;margin-top:4px;">Comprovante de Assinatura e Serviços SaaS</div>
      </div>
      <span class="badge">${statusLabel}</span>
    </div>
    <div class="row"><span class="label">Nº do Recibo</span><span class="val">${item.receiptId}</span></div>
    <div class="row"><span class="label">Provedor de Pagamento</span><span class="val">${item.provider === 'PAYPAL' ? 'PayPal Subscriptions' : 'Mercado Pago Assinaturas'}</span></div>
    <div class="row"><span class="label">ID da Assinatura no Provedor</span><span class="val">${item.referenceId}</span></div>
    <div class="row"><span class="label">Titular (Organizador)</span><span class="val">${user.displayName || 'Organizador'} (${user.email || user.uid})</span></div>
    <div class="row"><span class="label">UID da Conta</span><span class="val">${user.uid}</span></div>
    <div class="row"><span class="label">Plano / Descrição</span><span class="val">${item.description}</span></div>
    <div class="row"><span class="label">Data de Emissão</span><span class="val">${issuedDate}</span></div>
    <div class="row"><span class="label">Período de Vigência</span><span class="val">${periodStart} até ${periodEnd}</span></div>
    <div class="row"><span class="label">Valor Registrado</span><span class="val total">${formattedAmount}</span></div>
    <div class="footer">
      Documento emitido eletronicamente pela central de perfil GIO DA SORTE PRO para fins de controle financeiro e transparência do assinante.
    </div>
  </div>
</body>
</html>`;
}

export function buildCompleteUserPortabilityArchive(params: {
  user: {
    uid: string;
    email: string | null;
    displayName: string | null;
    emailVerified: boolean;
    photoURL?: string | null;
  } | null;
  organizerHandle: string;
  organizerBio: string;
  settings: RaffleSettings;
  participants: Participant[];
  winners: Winner[];
  entitlement: ProPlanEntitlement;
  subscription: UserSubscriptionRecord | null;
  lgpdRequests: LgpdRequestRecord[];
}) {
  return {
    schemaVersion: 'GIO_PORTABILITY_V2',
    exportedAtIso: new Date().toISOString(),
    lgpdLegalBasis: 'Art. 18, II e V da Lei nº 13.709/2018 (LGPD) — Acesso e Portabilidade de Dados',
    profile: {
      uid: params.user?.uid || 'local_unauthenticated',
      displayName: params.user?.displayName || params.settings.organizerName || 'Organizador',
      usernameHandle: params.organizerHandle,
      bio: params.organizerBio,
      email: params.user?.email || null,
      emailVerified: Boolean(params.user?.emailVerified),
      photoURL: params.user?.photoURL || null,
    },
    subscriptionSummary: {
      tier: params.entitlement.tier,
      active: params.entitlement.active,
      statusState: params.subscription?.statusState || params.entitlement.statusState || 'FREE',
      billingSubStatus: params.subscription?.billingSubStatus || 'FREE_TIER',
      provider: params.subscription?.provider || null,
      planId: params.subscription?.planId || null,
      currentPeriodStart: params.subscription?.currentPeriodStart || null,
      currentPeriodEnd: params.subscription?.currentPeriodEnd || null,
      cancelAtPeriodEnd: Boolean(params.subscription?.cancelAtPeriodEnd),
    },
    preferencesAndSettings: {
      organizerName: params.settings.organizerName || '',
      raffleTitle: params.settings.raffleTitle || '',
      prizeName: params.settings.prizeName || '',
      rate: params.settings.rate,
      total: params.settings.total,
      drawMode: params.settings.drawMode,
      themeMode: params.settings.themeMode || 'default',
      spinDuration: params.settings.spinDuration,
      countdownSeconds: params.settings.countdownSeconds ?? 5,
      supportPixKey: params.settings.supportPixKey || '',
      supportPaypalEmail: params.settings.supportPaypalEmail || '',
    },
    raffleData: {
      participantsCount: params.participants.length,
      winnersCount: params.winners.length,
      participants: params.participants,
      winners: params.winners,
    },
    privacyRequestsHistory: params.lgpdRequests.map((r) => ({
      protocol: r.protocol,
      requestType: r.requestType,
      status: r.status,
      createdAtIso: new Date(r.createdAt).toISOString(),
      updatedAtIso: new Date(r.updatedAt).toISOString(),
    })),
  };
}

function escapeCsvCell(val: string | number | boolean | null | undefined): string {
  const str = String(val ?? '');
  if (str.includes(',') || str.includes('"') || str.includes('\n') || str.includes(';')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

export function buildParticipantsCsvExport(
  participants: Participant[],
  allocations: TicketAllocation[]
): string {
  const allocMap = new Map<string, TicketAllocation>();
  for (const alloc of allocations) {
    allocMap.set(alloc.participant.id, alloc);
  }

  const header = [
    'ID_Participante',
    'Nome_Participante',
    'Moedas_Acumuladas',
    'Bilhetes_Emitidos',
    'Saldo_Residual_Moedas',
    'Probabilidade_Vitoria_Pct',
    'Numeros_Bilhetes',
    'Data_Cadastro_ISO',
  ].join(',');

  const rows = participants.map((p) => {
    const alloc = allocMap.get(p.id);
    const ticketsCount = alloc ? alloc.assignedTickets : 0;
    const remainder = alloc ? alloc.remainderCoins : 0;
    const prob = alloc ? alloc.winProbability.toFixed(2) : '0.00';
    const numbersList = alloc && alloc.tickets.length > 0 ? alloc.tickets.join(' | ') : 'Sem bilhetes';
    const addedIso = p.addedAt ? new Date(p.addedAt).toISOString() : '';

    return [
      escapeCsvCell(p.id),
      escapeCsvCell(p.name),
      escapeCsvCell(p.coins),
      escapeCsvCell(ticketsCount),
      escapeCsvCell(remainder),
      escapeCsvCell(prob),
      escapeCsvCell(numbersList),
      escapeCsvCell(addedIso),
    ].join(',');
  });

  return `\uFEFF${[header, ...rows].join('\r\n')}`;
}
