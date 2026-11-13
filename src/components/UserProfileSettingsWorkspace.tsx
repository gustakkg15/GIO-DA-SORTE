import React, { useState, useEffect, useCallback } from 'react';
import {
  User as FirebaseUser,
  updateProfile,
  updatePassword,
  EmailAuthProvider,
  GoogleAuthProvider,
  reauthenticateWithCredential,
  reauthenticateWithPopup,
  sendPasswordResetEmail,
  sendEmailVerification,
  signOut,
} from 'firebase/auth';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import {
  User,
  Link2,
  Shield,
  Crown,
  CreditCard,
  Sliders,
  Lock,
  CheckCircle2,
  AlertTriangle,
  RefreshCw,
  Cloud,
  Upload,
  Download,
  Mail,
  KeyRound,
  LogOut,
  ExternalLink,
  Volume2,
  VolumeX,
  Sparkles,
  FileText,
  FileSpreadsheet,
  FileJson,
  Trash2,
  Eye,
  EyeOff,
  Check,
  Radio,
  Globe,
  Clock,
  Receipt,
  Copy,
  ShieldCheck,
  Cookie,
  HelpCircle,
  Heart,
  Scale,
  ChevronRight,
  Printer,
  X,
} from 'lucide-react';
import { auth, db } from '../firebase';
import type {
  RaffleSettings,
  Participant,
  Winner,
  ComputedRaffle,
  ProPlanEntitlement,
  SubscriptionPlanTier,
  SubscriptionStatusState,
  TikTokConnectionState,
  LegalDocumentSlug,
  UserSubscriptionRecord,
  OfficialSubscriptionPlanDefinition,
  CommercialSubscriptionConfig,
  LgpdRequestRecord,
  LgpdRequestType,
} from '../types';
import {
  PROFILE_WORKSPACE_SECTIONS,
  ProfileWorkspaceSectionId,
  deriveUsernameHandle,
  buildPaymentHistoryFromSubscription,
  generateSubscriptionReceiptHtml,
  buildCompleteUserPortabilityArchive,
  buildParticipantsCsvExport,
  BillingReceiptItem,
} from '../utils/userProfileWorkspaceUtils';
import {
  evaluatePassphrase,
  getThrottleState,
  getGenericAuthErrorMessage,
} from '../utils/authSecurity';
import { getAuthBearerHeaders } from '../utils/tiktokLiveService';
import { apiFetch, safeApiJson } from '../utils/apiConfig';
import {
  createLgpdRequest,
  fetchLgpdRequests,
  recordDocumentAcceptance,
} from '../utils/legalAndComplianceService';
import { SettingsBackup } from './SettingsBackup';
import { idleStorage } from '../utils/idleStorage';
import { tiktokConnector } from '../utils/tiktokConnector';

interface TikTokAccountIdentity {
  connected: boolean;
  provider?: string;
  openId?: string;
  unionId?: string;
  displayName?: string;
  username?: string;
  avatarUrl?: string;
  bioDescription?: string;
  profileDeepLink?: string;
  isVerified?: boolean;
  followerCount?: number;
  followingCount?: number;
  likesCount?: number;
  videoCount?: number;
  scope?: string;
  connectedAt?: number;
  updatedAt?: number;
  warning?: string;
}

export interface UserProfileSettingsWorkspaceProps {
  activeSection: ProfileWorkspaceSectionId;
  onChangeSection: (section: ProfileWorkspaceSectionId) => void;
  currentUser: FirebaseUser | null;
  syncStatus: 'synced' | 'saving' | 'offline' | 'error' | 'idle' | 'syncing' | 'saved';
  onSaveToCloud: () => Promise<void>;
  onLoadFromCloud: () => Promise<void>;
  onOpenAccountModal: () => void;
  settings: RaffleSettings;
  participants: Participant[];
  winners: Winner[];
  computed: ComputedRaffle;
  rosterHash?: string;
  onUpdateSettings: (partial: Partial<RaffleSettings>) => void;
  onRestoreState: (data: {
    settings: RaffleSettings;
    participants: Participant[];
    winners: Winner[];
  }) => void;
  onResetToSample: () => void;
  onResetCoinsOnly: () => void;
  onOpenAuditReport: () => void;
  soundEnabled: boolean;
  onToggleSound: () => void;
  proEntitlement: ProPlanEntitlement;
  onSwitchPlan: (tier: SubscriptionPlanTier, statusState?: SubscriptionStatusState) => Promise<void>;
  onNavigateToSubscriptionTab: () => void;
  onNavigateToLivePro: () => void;
  onOpenLegalDocument: (slug: LegalDocumentSlug) => void;
  onOpenCookieSettings: () => void;
  onOpenOnboarding: () => void;
  onOpenQuickSubTab?: (sub: 'help' | 'support' | 'legal') => void;
  liveConnectionState?: TikTokConnectionState | string;
  liveConnectedUsername?: string;
}

const SECTION_ICONS: Record<ProfileWorkspaceSectionId, React.ComponentType<{ className?: string }>> = {
  profile: User,
  connections: Link2,
  security: Shield,
  subscription: Crown,
  payments: CreditCard,
  preferences: Sliders,
  privacy: Lock,
};

const AVATAR_PRESETS = [
  { label: 'Padrão (Iniciais)', url: '' },
  {
    label: 'Azul Real GIO',
    url: 'https://api.dicebear.com/7.x/bottts-neutral/svg?seed=GioBlue&backgroundColor=0131cd',
  },
  {
    label: 'Verde-Lima PRO',
    url: 'https://api.dicebear.com/7.x/shapes/svg?seed=GioLime&backgroundColor=a6c957',
  },
  {
    label: 'Oceano Profundo',
    url: 'https://api.dicebear.com/7.x/shapes/svg?seed=GioDeep&backgroundColor=111b30',
  },
];

const LGPD_TYPE_LABELS: { value: LgpdRequestType; label: string }[] = [
  { value: 'EXCLUSAO_DADOS', label: 'Exclusão de Conta e Dados Pessoais (Art. 18, VI)' },
  { value: 'PORTABILIDADE', label: 'Portabilidade Estruturada de Dados (Art. 18, V)' },
  { value: 'ACESSO_DADOS', label: 'Confirmação e Acesso aos Dados (Art. 18, I e II)' },
  { value: 'CORRECAO_DADOS', label: 'Correção de Dados Incompletos ou Inexatos (Art. 18, III)' },
  { value: 'REVOGACAO_CONSENTIMENTO', label: 'Revogação de Consentimento (Art. 18, IX)' },
];

function formatDateBr(isoOrMs: string | number | null | undefined): string {
  if (!isoOrMs) return 'Não informado';
  const d = new Date(isoOrMs);
  if (Number.isNaN(d.getTime())) return String(isoOrMs);
  return d.toLocaleString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function formatBrl(amount: number): string {
  return amount.toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL',
    minimumFractionDigits: 2,
  });
}

function mapFirebaseAuthErrorToPtBr(err: unknown): string {
  return (
    getGenericAuthErrorMessage(err, 'sensitive') ||
    (err instanceof Error ? err.message : 'Não foi possível concluir a operação de segurança.')
  );
}

export const UserProfileSettingsWorkspace: React.FC<UserProfileSettingsWorkspaceProps> = ({
  activeSection,
  onChangeSection,
  currentUser,
  syncStatus,
  onSaveToCloud,
  onLoadFromCloud,
  onOpenAccountModal,
  settings,
  participants,
  winners,
  computed,
  rosterHash,
  onUpdateSettings,
  onRestoreState,
  onResetToSample,
  onResetCoinsOnly,
  onOpenAuditReport,
  soundEnabled,
  onToggleSound,
  proEntitlement,
  onSwitchPlan,
  onNavigateToSubscriptionTab,
  onNavigateToLivePro,
  onOpenLegalDocument,
  onOpenCookieSettings,
  onOpenOnboarding,
  onOpenQuickSubTab,
  liveConnectionState = 'DISCONNECTED',
  liveConnectedUsername = '',
}) => {
  // Global feedback banner inside workspace
  const [workspaceNotice, setWorkspaceNotice] = useState<{
    type: 'success' | 'warning' | 'error' | 'info';
    text: string;
  } | null>(null);

  // ============================================================================
  // 1. MEU PERFIL STATE (UID-Isolated & Firestore Authoritative)
  // ============================================================================
  const [profileDisplayName, setProfileDisplayName] = useState(
    currentUser?.displayName || settings.organizerName || ''
  );
  const [profileUsernameHandle, setProfileUsernameHandle] = useState(() => {
    try {
      const key = currentUser?.uid
        ? `gio_organizer_handle_v1_${currentUser.uid}`
        : 'gio_organizer_handle_v1';
      return localStorage.getItem(key) || '';
    } catch {
      return '';
    }
  });
  const [profilePhotoUrl, setProfilePhotoUrl] = useState(currentUser?.photoURL || '');
  const [profileBio, setProfileBio] = useState(() => {
    try {
      const key = currentUser?.uid
        ? `gio_organizer_bio_v1_${currentUser.uid}`
        : 'gio_organizer_bio_v1';
      return (
        localStorage.getItem(key) ||
        'Organizador de sorteios auditáveis e transmissões interativas.'
      );
    } catch {
      return 'Organizador de sorteios auditáveis e transmissões interativas.';
    }
  });
  const [isSavingProfile, setIsSavingProfile] = useState(false);
  const [isSendingVerifyEmail, setIsSendingVerifyEmail] = useState(false);
  const [copiedUid, setCopiedUid] = useState(false);

  // Sync profile fields when currentUser changes (Firestore is the official source of truth)
  useEffect(() => {
    if (currentUser) {
      setProfileDisplayName(currentUser.displayName || settings.organizerName || '');
      setProfilePhotoUrl(currentUser.photoURL || '');
      try {
        const cachedHandle = localStorage.getItem(`gio_organizer_handle_v1_${currentUser.uid}`);
        const cachedBio = localStorage.getItem(`gio_organizer_bio_v1_${currentUser.uid}`);
        setProfileUsernameHandle(cachedHandle || '');
        setProfileBio(
          cachedBio || 'Organizador de sorteios auditáveis e transmissões interativas.'
        );
      } catch {}
      getDoc(doc(db, 'users', currentUser.uid))
        .then((snap) => {
          if (snap.exists()) {
            const data = snap.data();
            if (typeof data.displayName === 'string' && data.displayName.trim()) {
              setProfileDisplayName(data.displayName.trim());
            }
            if (typeof data.photoURL === 'string' && data.photoURL.trim()) {
              setProfilePhotoUrl(data.photoURL.trim());
            }
            if (typeof data.organizerHandle === 'string' && data.organizerHandle.trim()) {
              const handle = data.organizerHandle.trim();
              setProfileUsernameHandle(handle);
              try {
                localStorage.setItem(`gio_organizer_handle_v1_${currentUser.uid}`, handle);
              } catch {}
            }
            if (typeof data.bio === 'string' && data.bio.trim()) {
              const bio = data.bio.trim();
              setProfileBio(bio);
              try {
                localStorage.setItem(`gio_organizer_bio_v1_${currentUser.uid}`, bio);
              } catch {}
            }
          }
        })
        .catch(() => {});
    } else {
      // Logged out: reset local profile fields cleanly
      setProfileDisplayName('');
      setProfileUsernameHandle('');
      setProfilePhotoUrl('');
      setProfileBio('Organizador de sorteios auditáveis e transmissões interativas.');
    }
  }, [currentUser, settings.organizerName]);

  const effectiveHandle = deriveUsernameHandle(
    profileUsernameHandle,
    profileDisplayName || currentUser?.displayName,
    currentUser?.email
  );

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanName = profileDisplayName.trim() || 'Organizador GIO';
    const cleanHandle = deriveUsernameHandle(
      profileUsernameHandle,
      cleanName,
      currentUser?.email
    );
    const cleanPhoto = profilePhotoUrl.trim();
    const cleanBio = profileBio.trim();

    setIsSavingProfile(true);
    setWorkspaceNotice(null);

    try {
      onUpdateSettings({ organizerName: cleanName });
      try {
        const handleKey = currentUser?.uid
          ? `gio_organizer_handle_v1_${currentUser.uid}`
          : 'gio_organizer_handle_v1';
        const bioKey = currentUser?.uid
          ? `gio_organizer_bio_v1_${currentUser.uid}`
          : 'gio_organizer_bio_v1';
        localStorage.setItem(handleKey, cleanHandle);
        localStorage.setItem(bioKey, cleanBio);
      } catch {}

      if (currentUser) {
        await updateProfile(currentUser, {
          displayName: cleanName,
          photoURL: cleanPhoto || null,
        });
        await setDoc(
          doc(db, 'users', currentUser.uid),
          {
            uid: currentUser.uid,
            email: currentUser.email || '',
            displayName: cleanName,
            photoURL: cleanPhoto || null,
            organizerHandle: cleanHandle,
            bio: cleanBio,
            updatedAt: new Date().toISOString(),
          },
          { merge: true }
        ).catch(() => {});
      }

      setProfileUsernameHandle(cleanHandle);
      setWorkspaceNotice({
        type: 'success',
        text: currentUser
          ? 'Dados do perfil e identificação do organizador atualizados e sincronizados na nuvem.'
          : 'Identificação local do organizador salva neste navegador.',
      });
    } catch (err: unknown) {
      setWorkspaceNotice({
        type: 'error',
        text: mapFirebaseAuthErrorToPtBr(err),
      });
    } finally {
      setIsSavingProfile(false);
    }
  };

  const handleSendVerificationEmail = async () => {
    if (!currentUser) return;
    setIsSendingVerifyEmail(true);
    setWorkspaceNotice(null);
    try {
      await sendEmailVerification(currentUser);
      setWorkspaceNotice({
        type: 'info',
        text: `Link de confirmação enviado para ${currentUser.email}. Verifique sua caixa de entrada e spam.`,
      });
    } catch (err: unknown) {
      setWorkspaceNotice({
        type: 'error',
        text: mapFirebaseAuthErrorToPtBr(err),
      });
    } finally {
      setIsSendingVerifyEmail(false);
    }
  };

  // ============================================================================
  // 2. CONTAS CONECTADAS STATE (TIKTOK OAUTH + PROVIDERS)
  // ============================================================================
  const [tiktokIdentity, setTiktokIdentity] = useState<TikTokAccountIdentity | null>(null);
  const [isLoadingTiktok, setIsLoadingTiktok] = useState(false);
  const [isStepUpModalOpen, setIsStepUpModalOpen] = useState(false);
  const [stepUpPassword, setStepUpPassword] = useState('');
  const [isLinkingTiktok, setIsLinkingTiktok] = useState(false);
  const [isUnlinkingTiktok, setIsUnlinkingTiktok] = useState(false);
  const [confirmUnlinkTiktok, setConfirmUnlinkTiktok] = useState(false);

  const fetchTikTokIdentity = useCallback(async () => {
    if (!currentUser) {
      setTiktokIdentity({ connected: false });
      return;
    }
    setIsLoadingTiktok(true);
    try {
      const idToken = await currentUser.getIdToken();
      const res = await apiFetch('/api/tiktok/auth/identity', {
        credentials: 'include',
        headers: {
          Authorization: `Bearer ${idToken}`,
        },
      });
      if (res.ok) {
        const data = (await res.json()) as TikTokAccountIdentity;
        setTiktokIdentity(data);
      } else {
        setTiktokIdentity({ connected: false });
      }
    } catch {
      setTiktokIdentity({ connected: false });
    } finally {
      setIsLoadingTiktok(false);
    }
  }, [currentUser]);

  useEffect(() => {
    fetchTikTokIdentity();
  }, [fetchTikTokIdentity]);

  const hasPasswordProvider = Boolean(
    currentUser?.providerData?.some((p) => p.providerId === 'password')
  );
  const hasGoogleProvider = Boolean(
    currentUser?.providerData?.some((p) => p.providerId === 'google.com')
  );
  const isCustomTikTokUid = Boolean(currentUser?.uid?.startsWith('gio_tt_'));

  const handleConfirmStepUpAndLinkTikTok = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!currentUser) return;
    setIsLinkingTiktok(true);
    setWorkspaceNotice(null);

    try {
      if (hasPasswordProvider && currentUser.email) {
        if (!stepUpPassword) {
          setWorkspaceNotice({
            type: 'warning',
            text: 'Digite sua senha atual para autorizar o vínculo criptográfico com o TikTok.',
          });
          setIsLinkingTiktok(false);
          return;
        }
        const credential = EmailAuthProvider.credential(currentUser.email, stepUpPassword);
        await reauthenticateWithCredential(currentUser, credential);
      } else if (hasGoogleProvider) {
        const provider = new GoogleAuthProvider();
        await reauthenticateWithPopup(currentUser, provider);
      }

      const freshIdToken = await currentUser.getIdToken(true);
      const startRes = await apiFetch('/api/tiktok/auth/link/start', {
        method: 'POST',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${freshIdToken}`,
        },
        body: JSON.stringify({
          reauthIdToken: freshIdToken,
          returnTo: window.location.pathname,
        }),
      });
      const startData = await startRes.json().catch(() => ({}));
      const targetUrl = startData.url || startData.authorizeUrl;
      if (!startRes.ok || !targetUrl) {
        throw new Error(
          startData.message || startData.error || 'Não foi possível iniciar o vínculo OAuth com o TikTok.'
        );
      }

      setIsStepUpModalOpen(false);
      setStepUpPassword('');
      window.location.assign(targetUrl);
    } catch (err: unknown) {
      setWorkspaceNotice({
        type: 'error',
        text: mapFirebaseAuthErrorToPtBr(err),
      });
    } finally {
      setIsLinkingTiktok(false);
    }
  };

  const handleUnlinkTikTok = async () => {
    if (!currentUser) return;
    setIsUnlinkingTiktok(true);
    setWorkspaceNotice(null);
    try {
      const idToken = await currentUser.getIdToken();
      const res = await apiFetch('/api/tiktok/auth/unlink', {
        method: 'POST',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${idToken}`,
        },
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.message || data.error || 'Falha ao desvincular conta TikTok.');
      }
      setTiktokIdentity({ connected: false });
      setConfirmUnlinkTiktok(false);
      setWorkspaceNotice({
        type: 'success',
        text: 'Vínculo OAuth 2.0 com o TikTok revogado com sucesso.',
      });
    } catch (err: unknown) {
      setWorkspaceNotice({
        type: 'error',
        text: err instanceof Error ? err.message : 'Erro ao desvincular TikTok.',
      });
    } finally {
      setIsUnlinkingTiktok(false);
    }
  };

  // ============================================================================
  // 3. SEGURANÇA STATE (PASSWORD, SESSIONS, AUTH)
  // ============================================================================
  const [currentPasswordInput, setCurrentPasswordInput] = useState('');
  const [newPasswordInput, setNewPasswordInput] = useState('');
  const [confirmNewPasswordInput, setConfirmNewPasswordInput] = useState('');
  const [showSecurityPasswords, setShowSecurityPasswords] = useState(false);
  const [isUpdatingPassword, setIsUpdatingPassword] = useState(false);
  const [isRefreshingToken, setIsRefreshingToken] = useState(false);
  const [lastTokenRefreshIso, setLastTokenRefreshIso] = useState<string | null>(null);

  const passwordAssessment = evaluatePassphrase(newPasswordInput);
  const throttleState = getThrottleState();

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentUser || !currentUser.email) return;

    if (!currentPasswordInput) {
      setWorkspaceNotice({
        type: 'warning',
        text: 'Informe sua senha atual para confirmar sua identidade.',
      });
      return;
    }
    if (!passwordAssessment.isValid) {
      setWorkspaceNotice({
        type: 'warning',
        text: passwordAssessment.feedback,
      });
      return;
    }
    if (newPasswordInput !== confirmNewPasswordInput) {
      setWorkspaceNotice({
        type: 'warning',
        text: 'A confirmação da nova senha não coincide.',
      });
      return;
    }

    setIsUpdatingPassword(true);
    setWorkspaceNotice(null);
    try {
      const credential = EmailAuthProvider.credential(currentUser.email, currentPasswordInput);
      await reauthenticateWithCredential(currentUser, credential);
      await updatePassword(currentUser, newPasswordInput);
      setCurrentPasswordInput('');
      setNewPasswordInput('');
      setConfirmNewPasswordInput('');
      setWorkspaceNotice({
        type: 'success',
        text: 'Sua senha foi atualizada com sucesso com proteção criptográfica.',
      });
    } catch (err: unknown) {
      setWorkspaceNotice({
        type: 'error',
        text: mapFirebaseAuthErrorToPtBr(err),
      });
    } finally {
      setIsUpdatingPassword(false);
    }
  };

  const handleSendPasswordReset = async () => {
    if (!currentUser?.email) return;
    setWorkspaceNotice(null);
    try {
      await sendPasswordResetEmail(auth, currentUser.email);
      setWorkspaceNotice({
        type: 'info',
        text: `E-mail de redefinição de senha enviado para ${currentUser.email}.`,
      });
    } catch (err: unknown) {
      setWorkspaceNotice({
        type: 'error',
        text: mapFirebaseAuthErrorToPtBr(err),
      });
    }
  };

  const handleRefreshSecurityToken = async () => {
    if (!currentUser) return;
    setIsRefreshingToken(true);
    setWorkspaceNotice(null);
    try {
      await currentUser.getIdToken(true);
      const nowIso = new Date().toISOString();
      setLastTokenRefreshIso(nowIso);
      setWorkspaceNotice({
        type: 'success',
        text: 'Token criptográfico Firebase (Bearer JWT) renovado com sucesso.',
      });
    } catch (err: unknown) {
      setWorkspaceNotice({
        type: 'error',
        text: mapFirebaseAuthErrorToPtBr(err),
      });
    } finally {
      setIsRefreshingToken(false);
    }
  };

  const handleSafeLogout = async () => {
    setWorkspaceNotice(null);
    const activeUid = currentUser?.uid || null;
    try {
      if (currentUser) {
        const idToken = await currentUser.getIdToken().catch(() => '');
        await apiFetch('/api/auth/gio-logout', {
          method: 'POST',
          headers: idToken
            ? {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${idToken}`,
              }
            : { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({}),
        }).catch(() => {});
      }
      idleStorage.clearLocalCacheOnLogout(activeUid);
      tiktokConnector.detachClientStreamOnly({ clearLocalCache: true });
      await signOut(auth);
      setWorkspaceNotice({
        type: 'info',
        text: 'Sessão encerrada e cache local limpo com segurança. Seus dados armazenados no Firestore e workers ativos na nuvem foram preservados.',
      });
    } catch (err: unknown) {
      setWorkspaceNotice({
        type: 'error',
        text: mapFirebaseAuthErrorToPtBr(err),
      });
    }
  };

  // ============================================================================
  // 4. ASSINATURA & 5. PAGAMENTOS STATE
  // ============================================================================
  const [commercialConfig, setCommercialConfig] = useState<CommercialSubscriptionConfig | null>(null);
  const [officialPlans, setOfficialPlans] = useState<{
    monthly: OfficialSubscriptionPlanDefinition;
    annual: OfficialSubscriptionPlanDefinition;
  } | null>(null);
  const [userSubscription, setUserSubscription] = useState<UserSubscriptionRecord | null>(null);
  const [isLoadingSubscription, setIsLoadingSubscription] = useState(false);
  const [selectedGateway, setSelectedGateway] = useState<'PAYPAL' | 'MERCADO_PAGO'>('PAYPAL');
  const [selectedCycle, setSelectedCycle] = useState<'monthly' | 'annual'>('annual');
  const [isStartingCheckout, setIsStartingCheckout] = useState(false);
  const [isCancelingSub, setIsCancelingSub] = useState(false);
  const [confirmCancelSub, setConfirmCancelSub] = useState(false);
  const [manualVerifyId, setManualVerifyId] = useState('');
  const [isVerifyingSub, setIsVerifyingSub] = useState(false);

  // Payments / Receipts state
  const [selectedReceiptPreview, setSelectedReceiptPreview] = useState<BillingReceiptItem | null>(null);
  const [pixKeyDraft, setPixKeyDraft] = useState(settings.supportPixKey || '');
  const [paypalEmailDraft, setPaypalEmailDraft] = useState(settings.supportPaypalEmail || '');

  useEffect(() => {
    setPixKeyDraft(settings.supportPixKey || '');
    setPaypalEmailDraft(settings.supportPaypalEmail || '');
  }, [settings.supportPixKey, settings.supportPaypalEmail]);

  const loadSubscriptionDetails = useCallback(async () => {
    setIsLoadingSubscription(true);
    try {
      const authHeaders = await getAuthBearerHeaders();
      const uidParam = currentUser?.uid ? `?uid=${encodeURIComponent(currentUser.uid)}` : '';
      const res = await safeApiJson<any>(`/api/subscriptions/plans${uidParam}`, {
        headers: { ...authHeaders },
      });
      if (res.ok && res.data) {
        if (res.data.config) setCommercialConfig(res.data.config);
        if (res.data.plans) setOfficialPlans(res.data.plans);
        if (res.data.userSubscription) setUserSubscription(res.data.userSubscription);
      }
    } catch {
      // ignore
    } finally {
      setIsLoadingSubscription(false);
    }
  }, [currentUser?.uid]);

  useEffect(() => {
    loadSubscriptionDetails();
  }, [loadSubscriptionDetails]);

  const isProActive =
    proEntitlement.active &&
    proEntitlement.tier === 'PRO' &&
    (userSubscription?.statusState === 'ACTIVE' || proEntitlement.statusState === 'ACTIVE');

  const handleQuickStartCheckout = async () => {
    if (!currentUser) {
      onOpenAccountModal();
      return;
    }
    const planId = selectedCycle === 'annual' ? 'pro_annual' : 'pro_monthly';
    const cleanEmail = (currentUser.email || '').trim();
    if (!cleanEmail) {
      setWorkspaceNotice({
        type: 'warning',
        text: 'Sua conta precisa de um endereço de e-mail válido para emitir a assinatura.',
      });
      return;
    }

    setIsStartingCheckout(true);
    setWorkspaceNotice(null);
    try {
      await Promise.all([
        recordDocumentAcceptance({
          userId: currentUser.uid,
          userEmail: cleanEmail,
          documentId: 'politica-de-assinaturas-e-pagamentos',
          version: commercialConfig?.priceVersion || 'v1.0.0',
          context: 'ATIVACAO_PRO',
        }),
        recordDocumentAcceptance({
          userId: currentUser.uid,
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
          'x-firebase-uid': currentUser.uid,
          'x-firebase-email': cleanEmail,
          'x-firebase-email-verified': 'true',
          ...authHeaders,
        },
        body: JSON.stringify({
          uid: currentUser.uid,
          email: cleanEmail,
          emailVerified: true,
          emailConfirmedByUser: true,
          planId,
          provider: selectedGateway,
          acceptedTerms: true,
        }),
      });

      const data = res.data || {};
      if (!res.ok || !data.success) {
        setWorkspaceNotice({
          type: 'error',
          text:
            data.error ||
            res.error ||
            `Não foi possível iniciar o checkout via ${
              selectedGateway === 'PAYPAL' ? 'PayPal' : 'Mercado Pago'
            }.`,
        });
        return;
      }

      if (data.subscription) {
        setUserSubscription(data.subscription);
      }

      const redirectUrl = data.approvalUrl || data.initPoint;
      if (redirectUrl) {
        window.location.href = redirectUrl;
      } else {
        await loadSubscriptionDetails();
      }
    } catch (err: unknown) {
      setWorkspaceNotice({
        type: 'error',
        text: err instanceof Error ? err.message : String(err),
      });
    } finally {
      setIsStartingCheckout(false);
    }
  };

  const handleVerifySubscriptionManual = async () => {
    const cleanId = manualVerifyId.trim();
    if (!cleanId || !currentUser) return;
    const isPayPal = cleanId.startsWith('I-');
    const provider: 'PAYPAL' | 'MERCADO_PAGO' = isPayPal ? 'PAYPAL' : 'MERCADO_PAGO';

    setIsVerifyingSub(true);
    setWorkspaceNotice(null);
    try {
      const authHeaders = await getAuthBearerHeaders();
      const res = await safeApiJson<any>('/api/subscriptions/verify', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-firebase-uid': currentUser.uid,
          'x-firebase-email': currentUser.email || '',
          ...authHeaders,
        },
        body: JSON.stringify({
          uid: currentUser.uid,
          email: currentUser.email || '',
          provider,
          preapprovalId: !isPayPal ? cleanId : undefined,
          paypalSubscriptionId: isPayPal ? cleanId : undefined,
        }),
      });
      const data = res.data || {};
      if (data.subscription) {
        setUserSubscription(data.subscription);
      }
      if (!res.ok || !data.success) {
        setWorkspaceNotice({
          type: 'warning',
          text: data.error || res.error || 'Não foi possível validar o código informado.',
        });
      } else {
        setWorkspaceNotice({
          type: 'success',
          text: data.message || 'Assinatura verificada e sincronizada com sucesso!',
        });
        if (data.subscription?.statusState === 'ACTIVE') {
          await onSwitchPlan('PRO', 'ACTIVE');
        }
      }
      await loadSubscriptionDetails();
    } catch (err: unknown) {
      setWorkspaceNotice({
        type: 'error',
        text: err instanceof Error ? err.message : String(err),
      });
    } finally {
      setIsVerifyingSub(false);
    }
  };

  const handleCancelSubscriptionConfirm = async () => {
    if (!currentUser) return;
    setIsCancelingSub(true);
    setWorkspaceNotice(null);
    try {
      const authHeaders = await getAuthBearerHeaders();
      const res = await safeApiJson<any>('/api/subscriptions/cancel', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-firebase-uid': currentUser.uid,
          'x-firebase-email': currentUser.email || '',
          ...authHeaders,
        },
        body: JSON.stringify({
          uid: currentUser.uid,
          email: currentUser.email || '',
        }),
      });
      const data = res.data || {};
      if (data.subscription) {
        setUserSubscription(data.subscription);
      }
      setConfirmCancelSub(false);
      if (!res.ok || !data.success) {
        setWorkspaceNotice({
          type: 'warning',
          text: data.error || res.error || 'Não foi possível cancelar a renovação da assinatura.',
        });
      } else {
        setWorkspaceNotice({
          type: 'success',
          text:
            data.message ||
            'Renovação futura cancelada com sucesso. Seu acesso PRO segue ativo até o fim do período atual.',
        });
      }
      await loadSubscriptionDetails();
    } catch (err: unknown) {
      setWorkspaceNotice({
        type: 'error',
        text: err instanceof Error ? err.message : String(err),
      });
    } finally {
      setIsCancelingSub(false);
    }
  };

  const paymentHistoryItems = buildPaymentHistoryFromSubscription(userSubscription, commercialConfig);

  const handleDownloadReceiptHtml = (item: BillingReceiptItem) => {
    const html = generateSubscriptionReceiptHtml(item, {
      uid: currentUser?.uid || 'local_organizer',
      displayName: profileDisplayName || currentUser?.displayName || 'Organizador',
      email: currentUser?.email || 'nao-informado',
    });
    const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${item.receiptId.toLowerCase()}.html`;
    a.click();
    URL.revokeObjectURL(url);
    setWorkspaceNotice({
      type: 'success',
      text: `Comprovante ${item.receiptId} baixado com sucesso.`,
    });
  };

  const handleSaveOrganizerPaymentMethods = (e: React.FormEvent) => {
    e.preventDefault();
    onUpdateSettings({
      supportPixKey: pixKeyDraft.trim(),
      supportPaypalEmail: paypalEmailDraft.trim(),
    });
    setWorkspaceNotice({
      type: 'success',
      text: 'Chaves de recebimento e apoio do organizador (PIX e PayPal) atualizadas.',
    });
  };

  // ============================================================================
  // 6. PREFERÊNCIAS STATE
  // ============================================================================
  const [showAdvancedRulesBackup, setShowAdvancedRulesBackup] = useState(false);
  const detectedTimezone =
    typeof Intl !== 'undefined'
      ? Intl.DateTimeFormat().resolvedOptions().timeZone || 'America/Sao_Paulo'
      : 'America/Sao_Paulo';

  // ============================================================================
  // 7. PRIVACIDADE STATE (EXPORT, COOKIES, LGPD, DATA DELETION)
  // ============================================================================
  const [lgpdRequests, setLgpdRequests] = useState<LgpdRequestRecord[]>([]);
  const [isLoadingLgpd, setIsLoadingLgpd] = useState(false);
  const [lgpdRequestType, setLgpdRequestType] = useState<LgpdRequestType>('EXCLUSAO_DADOS');
  const [lgpdDescription, setLgpdDescription] = useState('');
  const [isSubmittingLgpd, setIsSubmittingLgpd] = useState(false);
  const [confirmClearLocalData, setConfirmClearLocalData] = useState(false);

  const loadUserLgpdRequests = useCallback(async () => {
    if (!currentUser?.uid) {
      setLgpdRequests([]);
      return;
    }
    setIsLoadingLgpd(true);
    try {
      const list = await fetchLgpdRequests(currentUser.uid);
      setLgpdRequests(list);
    } catch {
      setLgpdRequests([]);
    } finally {
      setIsLoadingLgpd(false);
    }
  }, [currentUser?.uid]);

  useEffect(() => {
    if (activeSection === 'privacy') {
      loadUserLgpdRequests();
    }
  }, [activeSection, loadUserLgpdRequests]);

  const handleExportCompleteJson = () => {
    const archive = buildCompleteUserPortabilityArchive({
      user: currentUser
        ? {
            uid: currentUser.uid,
            email: currentUser.email,
            displayName: currentUser.displayName,
            emailVerified: currentUser.emailVerified,
            photoURL: currentUser.photoURL,
          }
        : null,
      organizerHandle: effectiveHandle,
      organizerBio: profileBio,
      settings,
      participants,
      winners,
      entitlement: proEntitlement,
      subscription: userSubscription,
      lgpdRequests,
    });
    const blob = new Blob([JSON.stringify(archive, null, 2)], {
      type: 'application/json;charset=utf-8',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    const dateStamp = new Date().toISOString().slice(0, 10);
    a.href = url;
    a.download = `gio-da-sorte-portabilidade-dados-${dateStamp}.json`;
    a.click();
    URL.revokeObjectURL(url);
    setWorkspaceNotice({
      type: 'success',
      text: 'Pacote completo de portabilidade de dados (JSON) exportado com sucesso.',
    });
  };

  const handleExportParticipantsCsv = () => {
    const csv = buildParticipantsCsvExport(participants, computed.allocations);
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    const dateStamp = new Date().toISOString().slice(0, 10);
    a.href = url;
    a.download = `gio-da-sorte-participantes-bilhetes-${dateStamp}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    setWorkspaceNotice({
      type: 'success',
      text: 'Planilha CSV de participantes e bilhetes exportada com sucesso.',
    });
  };

  const handleSubmitLgpdRequest = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanDesc = lgpdDescription.trim();
    if (!cleanDesc) {
      setWorkspaceNotice({
        type: 'warning',
        text: 'Descreva os detalhes da sua solicitação de privacidade ou exclusão de dados.',
      });
      return;
    }

    setIsSubmittingLgpd(true);
    setWorkspaceNotice(null);
    try {
      const record = await createLgpdRequest({
        userId: currentUser?.uid || 'titular_local',
        requesterName:
          profileDisplayName || currentUser?.displayName || settings.organizerName || 'Titular',
        requesterEmail: currentUser?.email || 'nao-autenticado@local',
        requestType: lgpdRequestType,
        description: cleanDesc,
      });
      setLgpdDescription('');
      setLgpdRequests((prev) => [record, ...prev]);
      setWorkspaceNotice({
        type: 'success',
        text: `Solicitação LGPD registrada com protocolo ${record.protocol}.`,
      });
    } catch (err: unknown) {
      setWorkspaceNotice({
        type: 'error',
        text: err instanceof Error ? err.message : 'Falha ao registrar solicitação LGPD.',
      });
    } finally {
      setIsSubmittingLgpd(false);
    }
  };

  const handleClearAllLocalRaffleData = () => {
    onRestoreState({
      settings: {
        ...settings,
        currentPrize: '1º Prêmio',
      },
      participants: [],
      winners: [],
    });
    setConfirmClearLocalData(false);
    setWorkspaceNotice({
      type: 'info',
      text: 'Participantes e ganhadores locais desta mesa foram limpos com sucesso.',
    });
  };

  const currentSectionMeta =
    PROFILE_WORKSPACE_SECTIONS.find((s) => s.id === activeSection) || PROFILE_WORKSPACE_SECTIONS[0];

  const userInitial = (
    profileDisplayName ||
    currentUser?.displayName ||
    currentUser?.email ||
    'G'
  )
    .charAt(0)
    .toUpperCase();

  return (
    <div className="space-y-6 animate-fade-in">
      {/* =====================================================================
          TOP WORKSPACE IDENTITY HEADER
      ===================================================================== */}
      <div className="p-5 sm:p-6 rounded-2xl bg-[#111B30] border border-[var(--gio-border-subtle)] shadow-sm">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-5">
          <div className="flex items-start sm:items-center gap-4 min-w-0">
            {/* Avatar */}
            <div className="relative shrink-0">
              {profilePhotoUrl ? (
                <img
                  src={profilePhotoUrl}
                  alt={profileDisplayName || 'Foto do perfil'}
                  className="w-16 h-16 sm:w-20 sm:h-20 rounded-2xl object-cover border-2 border-[#0131CD] bg-[#080D18]"
                  onError={() => setProfilePhotoUrl('')}
                />
              ) : (
                <div className="w-16 h-16 sm:w-20 sm:h-20 rounded-2xl bg-[#0131CD] border-2 border-[#A6C957]/40 flex items-center justify-center text-2xl sm:text-3xl font-bold text-white">
                  {userInitial}
                </div>
              )}
              <span
                className={`absolute -bottom-1 -right-1 w-4 h-4 rounded-full border-2 border-[#111B30] ${
                  currentUser ? 'bg-[#A6C957]' : 'bg-[#A5B1C5]'
                }`}
                title={currentUser ? 'Conta conectada' : 'Modo local (sem login)'}
              />
            </div>

            {/* Identity Details */}
            <div className="min-w-0 flex-1 space-y-1.5">
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="text-lg sm:text-xl font-bold text-[#FFFFFF] truncate">
                  {profileDisplayName || currentUser?.displayName || settings.organizerName || 'Organizador GIO'}
                </h1>
                <span className="font-mono text-xs text-[#A5B1C5] bg-[#080D18] px-2.5 py-0.5 rounded-md border border-[var(--gio-border-subtle)]">
                  {effectiveHandle}
                </span>
                {isProActive ? (
                  <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-md text-[11px] font-bold bg-[#A6C957]/15 text-[#A6C957] border border-[#A6C957]/35">
                    <Crown className="w-3 h-3" />
                    TIKTOK LIVE PRO
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-md text-[11px] font-semibold bg-[#0131CD]/25 text-[#FFFFFF] border border-[#0131CD]/50">
                    PLANO FREE
                  </span>
                )}
              </div>

              <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-[#A5B1C5]">
                <span className="inline-flex items-center gap-1.5">
                  <Mail className="w-3.5 h-3.5 text-[#A5B1C5]" />
                  {currentUser?.email || 'Modo Local (Conecte sua conta para sincronizar na nuvem)'}
                </span>
                {currentUser && (
                  <span
                    className={`inline-flex items-center gap-1 font-medium ${
                      currentUser.emailVerified ? 'text-[#A6C957]' : 'text-[#A5B1C5]'
                    }`}
                  >
                    {currentUser.emailVerified ? (
                      <>
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        E-mail verificado
                      </>
                    ) : (
                      <>
                        <AlertTriangle className="w-3.5 h-3.5" />
                        Verificação pendente
                      </>
                    )}
                  </span>
                )}
                {tiktokIdentity?.connected && (
                  <span className="inline-flex items-center gap-1 text-[#A6C957] font-medium">
                    <Radio className="w-3.5 h-3.5" />
                    TikTok: @{tiktokIdentity.username || tiktokIdentity.displayName}
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* Right Quick Actions */}
          <div className="flex flex-wrap items-center gap-2.5 shrink-0">
            {currentUser ? (
              <>
                <button
                  type="button"
                  onClick={onSaveToCloud}
                  disabled={syncStatus === 'syncing' || syncStatus === 'saving'}
                  className="min-h-[40px] px-4 py-2 rounded-xl bg-[#080D18] hover:bg-[#111B30] text-[#FFFFFF] border border-[var(--gio-border-subtle)] hover:border-[var(--gio-border-active)] text-xs font-semibold flex items-center gap-2 transition disabled:opacity-50"
                >
                  <Cloud
                    className={`w-4 h-4 ${
                      syncStatus === 'syncing' || syncStatus === 'saving'
                        ? 'text-[#A6C957] animate-pulse'
                        : syncStatus === 'saved' || syncStatus === 'synced'
                        ? 'text-[#A6C957]'
                        : 'text-[#A5B1C5]'
                    }`}
                  />
                  <span>
                    {syncStatus === 'syncing' || syncStatus === 'saving'
                      ? 'Sincronizando...'
                      : syncStatus === 'saved' || syncStatus === 'synced'
                      ? 'Nuvem Sincronizada'
                      : 'Salvar na Nuvem'}
                  </span>
                </button>
                <button
                  type="button"
                  onClick={onOpenAccountModal}
                  className="min-h-[40px] px-4 py-2 rounded-xl bg-[#080D18] hover:bg-[#0131CD]/20 text-[#FFFFFF] border border-[var(--gio-border-subtle)] text-xs font-semibold flex items-center gap-2 transition"
                >
                  <KeyRound className="w-4 h-4 text-[#A5B1C5]" />
                  <span>Acesso Rápido</span>
                </button>
              </>
            ) : (
              <button
                type="button"
                onClick={onOpenAccountModal}
                className="gio-btn-primary min-h-[42px] px-5 py-2.5 rounded-xl text-white font-semibold text-xs flex items-center gap-2 transition"
              >
                <User className="w-4 h-4" />
                <span>Entrar ou Criar Conta</span>
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Global Feedback Banner */}
      {workspaceNotice && (
        <div
          className={`p-4 rounded-xl border flex items-start justify-between gap-3 text-xs sm:text-sm ${
            workspaceNotice.type === 'success'
              ? 'bg-[#A6C957]/12 border-[#A6C957]/35 text-[#A6C957]'
              : workspaceNotice.type === 'error'
              ? 'bg-[#F05262]/10 border-[#F05262]/40 text-[#F05262]'
              : workspaceNotice.type === 'warning'
              ? 'bg-[#A6C957]/10 border-[#A6C957]/35 text-[#A6C957]'
              : 'bg-[#0131CD]/15 border-[#0131CD]/40 text-[#FFFFFF]'
          }`}
        >
          <div className="flex items-start gap-2.5">
            {workspaceNotice.type === 'success' ? (
              <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" />
            ) : (
              <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
            )}
            <span>{workspaceNotice.text}</span>
          </div>
          <button
            type="button"
            onClick={() => setWorkspaceNotice(null)}
            className="text-current opacity-75 hover:opacity-100"
            aria-label="Fechar aviso"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* =====================================================================
          MOBILE / TABLET HORIZONTAL SECONDARY MENU
      ===================================================================== */}
      <div className="lg:hidden overflow-x-auto pb-1 -mx-1 px-1">
        <div className="inline-flex items-center gap-1.5 p-1.5 rounded-2xl bg-[#111B30] border border-[var(--gio-border-subtle)] min-w-full">
          {PROFILE_WORKSPACE_SECTIONS.map((sec) => {
            const Icon = SECTION_ICONS[sec.id];
            const isActive = activeSection === sec.id;
            return (
              <button
                key={sec.id}
                type="button"
                onClick={() => {
                  onChangeSection(sec.id);
                  setWorkspaceNotice(null);
                }}
                className={`min-h-[40px] px-3.5 py-2 rounded-xl text-xs font-semibold whitespace-nowrap flex items-center gap-2 transition ${
                  isActive
                    ? 'bg-[#0131CD] text-white border border-[#A6C957]/40'
                    : 'text-[#A5B1C5] hover:text-[#FFFFFF] hover:bg-[#080D18]'
                }`}
              >
                <Icon className={`w-4 h-4 shrink-0 ${isActive ? 'text-[#A6C957]' : ''}`} />
                <span>{sec.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* =====================================================================
          MAIN WORKSPACE GRID (SECONDARY MENU + INDEPENDENT SECTION PANEL)
      ===================================================================== */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* LEFT SECONDARY SIDEBAR MENU (DESKTOP) */}
        <aside className="hidden lg:block lg:col-span-3 space-y-4 sticky top-20">
          <div className="p-3 rounded-2xl bg-[#111B30] border border-[var(--gio-border-subtle)] shadow-sm space-y-4">
            {(['CONTA', 'FINANCEIRO', 'SISTEMA'] as const).map((groupKey) => {
              const groupLabel =
                groupKey === 'CONTA'
                  ? 'Conta e Acesso'
                  : groupKey === 'FINANCEIRO'
                  ? 'Plano e Cobrança'
                  : 'Sistema e Dados';
              const items = PROFILE_WORKSPACE_SECTIONS.filter((s) => s.group === groupKey);
              return (
                <div key={groupKey} className="space-y-1">
                  <div className="px-3 py-1 text-[10px] font-bold uppercase tracking-wide text-[#A5B1C5]">
                    {groupLabel}
                  </div>
                  {items.map((sec) => {
                    const Icon = SECTION_ICONS[sec.id];
                    const isActive = activeSection === sec.id;
                    return (
                      <button
                        key={sec.id}
                        type="button"
                        onClick={() => {
                          onChangeSection(sec.id);
                          setWorkspaceNotice(null);
                        }}
                        className={`w-full text-left px-3 py-2.5 rounded-xl transition flex items-center justify-between gap-2.5 group ${
                          isActive
                            ? 'bg-[#0131CD] text-white border border-[#A6C957]/35'
                            : 'text-[#A5B1C5] hover:text-[#FFFFFF] hover:bg-[#080D18] border border-transparent'
                        }`}
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          <Icon
                            className={`w-4 h-4 shrink-0 ${
                              isActive
                                ? 'text-[#A6C957]'
                                : 'text-[#A5B1C5] group-hover:text-[#FFFFFF]'
                            }`}
                          />
                          <div className="min-w-0">
                            <div className="text-xs font-semibold truncate">{sec.label}</div>
                            <div
                              className={`text-[11px] truncate ${
                                isActive ? 'text-white/80' : 'text-[#A5B1C5]'
                              }`}
                            >
                              {sec.subtitle}
                            </div>
                          </div>
                        </div>
                        <ChevronRight
                          className={`w-3.5 h-3.5 shrink-0 transition-transform ${
                            isActive ? 'text-[#A6C957] translate-x-0.5' : 'opacity-0 group-hover:opacity-60'
                          }`}
                        />
                      </button>
                    );
                  })}
                </div>
              );
            })}

            {/* Support & Documentation Quick Links */}
            {onOpenQuickSubTab && (
              <div className="pt-3 border-t border-[var(--gio-border-subtle)] space-y-1">
                <div className="px-3 py-1 text-[10px] font-bold uppercase tracking-wide text-[#A5B1C5]">
                  Ajuda e Conformidade
                </div>
                <button
                  type="button"
                  onClick={() => onOpenQuickSubTab('help')}
                  className="w-full text-left px-3 py-2 rounded-xl text-xs font-medium text-[#A5B1C5] hover:text-[#FFFFFF] hover:bg-[#080D18] flex items-center gap-2.5 transition"
                >
                  <HelpCircle className="w-4 h-4 text-[#A5B1C5]" />
                  <span>Como Funciona e Guia</span>
                </button>
                <button
                  type="button"
                  onClick={() => onOpenQuickSubTab('support')}
                  className="w-full text-left px-3 py-2 rounded-xl text-xs font-medium text-[#A5B1C5] hover:text-[#FFFFFF] hover:bg-[#080D18] flex items-center gap-2.5 transition"
                >
                  <Heart className="w-4 h-4 text-[#F05262]" />
                  <span>Central de Suporte</span>
                </button>
                <button
                  type="button"
                  onClick={() => onOpenQuickSubTab('legal')}
                  className="w-full text-left px-3 py-2 rounded-xl text-xs font-medium text-[#A5B1C5] hover:text-[#FFFFFF] hover:bg-[#080D18] flex items-center gap-2.5 transition"
                >
                  <Scale className="w-4 h-4 text-[#A5B1C5]" />
                  <span>Central Legal e Termos</span>
                </button>
              </div>
            )}
          </div>
        </aside>

        {/* RIGHT INDEPENDENT SECTION WORKSPACE */}
        <section className="lg:col-span-9 space-y-6">
          {/* Section Title Header Card */}
          <div className="p-5 rounded-2xl bg-[#111B30] border border-[var(--gio-border-subtle)] flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div>
              <div className="text-[11px] font-bold uppercase tracking-wide text-[#A6C957]">
                Ambiente de Perfil &bull; {currentSectionMeta.label}
              </div>
              <h2 className="text-lg sm:text-xl font-bold text-[#FFFFFF] mt-0.5">
                {currentSectionMeta.label}
              </h2>
              <p className="text-xs sm:text-sm text-[#A5B1C5] mt-1">
                {currentSectionMeta.description}
              </p>
            </div>
          </div>

          {/* =================================================================
              SECTION 1: MEU PERFIL (Nome, Foto, Usuário e E-mail)
          ================================================================= */}
          {activeSection === 'profile' && (
            <div className="space-y-6">
              <form
                onSubmit={handleSaveProfile}
                className="p-6 rounded-2xl bg-[#111B30] border border-[var(--gio-border-subtle)] space-y-6"
              >
                <div className="flex items-center justify-between border-b border-[var(--gio-border-subtle)] pb-4">
                  <div>
                    <h3 className="text-base font-bold text-[#FFFFFF]">
                      Identidade Pública do Organizador
                    </h3>
                    <p className="text-xs text-[#A5B1C5] mt-0.5">
                      Estes dados identificam seu canal nos sorteios públicos, comprovantes e relatórios em PDF.
                    </p>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                  {/* Nome de Exibição */}
                  <div className="space-y-1.5">
                    <label className="block text-xs font-semibold text-[#FFFFFF]">
                      Nome de Exibição / Canal
                    </label>
                    <input
                      type="text"
                      value={profileDisplayName}
                      onChange={(e) => setProfileDisplayName(e.target.value)}
                      placeholder="Ex: Gusta Sorteios Oficial"
                      className="w-full min-h-[42px] px-3.5 py-2 rounded-xl bg-[#080D18] border border-[var(--gio-border-subtle)] focus:border-[#0131CD] text-sm text-[#FFFFFF] outline-none transition"
                    />
                    <p className="text-[11px] text-[#A5B1C5]">
                      Exibido no topo dos sorteios e nos certificados SHA-256.
                    </p>
                  </div>

                  {/* @Usuário */}
                  <div className="space-y-1.5">
                    <label className="block text-xs font-semibold text-[#FFFFFF]">
                      Nome de Usuário (@arroba)
                    </label>
                    <input
                      type="text"
                      value={profileUsernameHandle}
                      onChange={(e) => setProfileUsernameHandle(e.target.value)}
                      placeholder={effectiveHandle}
                      className="w-full min-h-[42px] px-3.5 py-2 rounded-xl bg-[#080D18] border border-[var(--gio-border-subtle)] focus:border-[#0131CD] font-mono text-sm text-[#FFFFFF] outline-none transition"
                    />
                    <p className="text-[11px] text-[#A5B1C5]">
                      Identificador único formatado: <span className="font-mono text-[#FFFFFF]">{effectiveHandle}</span>
                    </p>
                  </div>

                  {/* E-mail da Conta */}
                  <div className="space-y-1.5">
                    <label className="block text-xs font-semibold text-[#FFFFFF]">
                      E-mail Principal da Conta
                    </label>
                    <div className="flex items-center gap-2">
                      <input
                        type="email"
                         readOnly
                        value={currentUser?.email || 'Não autenticado (Modo Local)'}
                        className="w-full min-h-[42px] px-3.5 py-2 rounded-xl bg-[#080D18]/60 border border-[var(--gio-border-subtle)] text-sm text-[#A5B1C5] cursor-not-allowed"
                      />
                      {currentUser && !currentUser.emailVerified && (
                        <button
                          type="button"
                          onClick={handleSendVerificationEmail}
                          disabled={isSendingVerifyEmail}
                          className="shrink-0 min-h-[42px] px-3.5 py-2 rounded-xl bg-[#A6C957]/15 hover:bg-[#A6C957]/25 text-[#A6C957] border border-[#A6C957]/35 text-xs font-semibold transition disabled:opacity-50"
                        >
                          {isSendingVerifyEmail ? 'Enviando...' : 'Verificar E-mail'}
                        </button>
                      )}
                    </div>
                    <p className="text-[11px] text-[#A5B1C5]">
                      {currentUser
                        ? `UID da conta: ${currentUser.uid}`
                        : 'Entre na sua conta para vincular um e-mail verificado.'}
                    </p>
                  </div>

                  {/* Foto de Perfil (URL + Presets) */}
                  <div className="space-y-1.5">
                    <label className="block text-xs font-semibold text-[#FFFFFF]">
                      Foto de Perfil (URL HTTPS ou Avatar)
                    </label>
                    <input
                      type="url"
                      value={profilePhotoUrl}
                      onChange={(e) => setProfilePhotoUrl(e.target.value)}
                      placeholder="https://exemplo.com/minha-foto.jpg"
                      className="w-full min-h-[42px] px-3.5 py-2 rounded-xl bg-[#080D18] border border-[var(--gio-border-subtle)] focus:border-[#0131CD] text-sm text-[#FFFFFF] outline-none transition"
                    />
                    <div className="flex flex-wrap items-center gap-1.5 pt-1">
                      {AVATAR_PRESETS.map((preset) => (
                        <button
                          key={preset.label}
                          type="button"
                          onClick={() => setProfilePhotoUrl(preset.url)}
                          className={`px-2.5 py-1 rounded-lg text-[11px] font-medium border transition ${
                            profilePhotoUrl === preset.url
                              ? 'bg-[#0131CD] text-white border-[#A6C957]/40'
                              : 'bg-[#080D18] text-[#A5B1C5] border-[var(--gio-border-subtle)] hover:text-white'
                          }`}
                        >
                          {preset.label}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>

                {/* Biografia / Apresentação */}
                <div className="space-y-1.5">
                  <label className="block text-xs font-semibold text-[#FFFFFF]">
                    Apresentação / Descrição do Canal
                  </label>
                  <textarea
                    rows={2}
                    value={profileBio}
                    onChange={(e) => setProfileBio(e.target.value)}
                    placeholder="Breve descrição sobre seus sorteios e transmissões..."
                    className="w-full px-3.5 py-2.5 rounded-xl bg-[#080D18] border border-[var(--gio-border-subtle)] focus:border-[#0131CD] text-sm text-[#FFFFFF] outline-none transition resize-none"
                  />
                </div>

                <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-[var(--gio-border-subtle)]">
                  <div className="flex items-center gap-2 text-xs text-[#A5B1C5]">
                    {currentUser && (
                      <button
                        type="button"
                        onClick={() => {
                          navigator.clipboard?.writeText(currentUser.uid);
                          setCopiedUid(true);
                          setTimeout(() => setCopiedUid(false), 2000);
                        }}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#080D18] hover:bg-[#111B30] border border-[var(--gio-border-subtle)] font-mono text-[11px] text-[#A5B1C5] hover:text-white transition"
                      >
                        <Copy className="w-3.5 h-3.5" />
                        <span>{copiedUid ? 'UID Copiado!' : `Copiar UID (${currentUser.uid.slice(0, 10)}...)`}</span>
                      </button>
                    )}
                  </div>

                  <button
                    type="submit"
                    disabled={isSavingProfile}
                    className="gio-btn-primary min-h-[42px] px-6 py-2.5 rounded-xl text-white font-semibold text-xs flex items-center gap-2 transition disabled:opacity-50"
                  >
                    <Check className="w-4 h-4" />
                    <span>{isSavingProfile ? 'Salvando alterações...' : 'Salvar Meu Perfil'}</span>
                  </button>
                </div>
              </form>

              {/* Sincronização na Nuvem e Tutorial */}
              <div className="p-6 rounded-2xl bg-[#111B30] border border-[var(--gio-border-subtle)] space-y-4">
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                  <div>
                    <h3 className="text-base font-bold text-[#FFFFFF] flex items-center gap-2">
                      <Cloud className="w-4 h-4 text-[#A5B1C5]" />
                      <span>Sincronização e Backup na Nuvem</span>
                    </h3>
                    <p className="text-xs text-[#A5B1C5] mt-0.5">
                      Mantenha seus participantes, bilhetes e histórico sincronizados no Firestore em todos os seus dispositivos.
                    </p>
                  </div>
                  <span
                    className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-semibold border ${
                      currentUser
                        ? 'bg-[#A6C957]/15 text-[#A6C957] border-[#A6C957]/35'
                        : 'bg-[#080D18] text-[#A5B1C5] border-[var(--gio-border-subtle)]'
                    }`}
                  >
                    {currentUser ? 'Backup Automático Ativo' : 'Apenas Armazenamento Local'}
                  </span>
                </div>

                <div className="flex flex-wrap items-center gap-3 pt-2">
                  {currentUser ? (
                    <>
                      <button
                        type="button"
                        onClick={onSaveToCloud}
                        disabled={syncStatus === 'syncing'}
                        className="gio-btn-primary min-h-[40px] px-4 py-2 rounded-xl text-white text-xs font-semibold flex items-center gap-2 transition disabled:opacity-50"
                      >
                        <Upload className="w-4 h-4" />
                        <span>Salvar Estado Atual na Nuvem</span>
                      </button>
                      <button
                        type="button"
                        onClick={onLoadFromCloud}
                        disabled={syncStatus === 'syncing'}
                        className="min-h-[40px] px-4 py-2 rounded-xl bg-[#080D18] hover:bg-[#111B30] text-[#FFFFFF] border border-[var(--gio-border-subtle)] text-xs font-semibold flex items-center gap-2 transition disabled:opacity-50"
                      >
                        <Download className="w-4 h-4 text-[#A5B1C5]" />
                        <span>Recarregar Dados da Nuvem</span>
                      </button>
                    </>
                  ) : (
                    <button
                      type="button"
                      onClick={onOpenAccountModal}
                      className="gio-btn-primary min-h-[40px] px-5 py-2 rounded-xl text-white text-xs font-semibold flex items-center gap-2 transition"
                    >
                      <User className="w-4 h-4" />
                      <span>Conectar Conta para Ativar Backup</span>
                    </button>
                  )}

                  <button
                    type="button"
                    onClick={onOpenOnboarding}
                    className="min-h-[40px] px-4 py-2 rounded-xl bg-[#080D18] hover:bg-[#111B30] text-[#A5B1C5] hover:text-[#FFFFFF] border border-[var(--gio-border-subtle)] text-xs font-semibold transition"
                  >
                    Reabrir Tutorial de Boas-Vindas
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* =================================================================
              SECTION 2: CONTAS CONECTADAS (TikTok e demais plataformas)
          ================================================================= */}
          {activeSection === 'connections' && (
            <div className="space-y-6">
              {/* 1. TikTok Login Kit OAuth 2.0 */}
              <div className="p-6 rounded-2xl bg-[#111B30] border border-[var(--gio-border-subtle)] space-y-5">
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 border-b border-[var(--gio-border-subtle)] pb-4">
                  <div className="flex items-start gap-3.5">
                    <div className="w-11 h-11 rounded-xl bg-[#080D18] border border-[var(--gio-border-subtle)] flex items-center justify-center shrink-0">
                      <Radio className="w-5 h-5 text-[#A6C957]" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <h3 className="text-base font-bold text-[#FFFFFF]">
                          TikTok Oficial (Login Kit OAuth 2.0)
                        </h3>
                        {tiktokIdentity?.connected ? (
                          <span className="px-2.5 py-0.5 rounded-md text-[11px] font-bold bg-[#A6C957]/15 text-[#A6C957] border border-[#A6C957]/35">
                            CONECTADO
                          </span>
                        ) : (
                          <span className="px-2.5 py-0.5 rounded-md text-[11px] font-semibold bg-[#080D18] text-[#A5B1C5] border border-[var(--gio-border-subtle)]">
                            NÃO VINCULADO
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-[#A5B1C5] mt-0.5">
                        Autenticação segura com PKCE S256 e proteção de tokens AES-256-GCM no servidor.
                      </p>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={fetchTikTokIdentity}
                    disabled={isLoadingTiktok}
                    className="self-start sm:self-center min-h-[36px] px-3 py-1.5 rounded-lg bg-[#080D18] hover:bg-[#111B30] text-[#A5B1C5] hover:text-white border border-[var(--gio-border-subtle)] text-xs font-semibold flex items-center gap-1.5 transition"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${isLoadingTiktok ? 'animate-spin' : ''}`} />
                    <span>Atualizar Status</span>
                  </button>
                </div>

                {tiktokIdentity?.connected ? (
                  <div className="space-y-4">
                    <div className="p-4 rounded-xl bg-[#080D18] border border-[var(--gio-border-subtle)] flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                      <div className="flex items-center gap-3.5">
                        {tiktokIdentity.avatarUrl ? (
                          <img
                            src={tiktokIdentity.avatarUrl}
                            alt={tiktokIdentity.displayName || 'TikTok'}
                            className="w-12 h-12 rounded-xl object-cover border border-[#A6C957]/40"
                          />
                        ) : (
                          <div className="w-12 h-12 rounded-xl bg-[#0131CD] flex items-center justify-center font-bold text-white">
                            TT
                          </div>
                        )}
                        <div>
                          <div className="text-sm font-bold text-[#FFFFFF]">
                            {tiktokIdentity.displayName || tiktokIdentity.username || 'Conta TikTok'}
                          </div>
                          <div className="font-mono text-xs text-[#A6C957]">
                            @{tiktokIdentity.username || 'tik_tok_user'}
                          </div>
                          {tiktokIdentity.openId && (
                            <div className="font-mono text-[11px] text-[#A5B1C5] mt-0.5">
                              OpenID: {tiktokIdentity.openId.slice(0, 12)}... &bull; Escopo:{' '}
                              {tiktokIdentity.scope || 'user.info.basic'}
                            </div>
                          )}
                        </div>
                      </div>

                      <div className="flex flex-wrap items-center gap-2">
                        <button
                          type="button"
                          onClick={onNavigateToLivePro}
                          className="min-h-[38px] px-3.5 py-2 rounded-xl bg-[#0131CD] hover:brightness-110 text-white text-xs font-semibold flex items-center gap-1.5 transition"
                        >
                          <Radio className="w-3.5 h-3.5 text-[#A6C957]" />
                          <span>Abrir Estúdio TikTok LIVE</span>
                        </button>
                        {!isCustomTikTokUid && (
                          <button
                            type="button"
                            onClick={() => setConfirmUnlinkTiktok(true)}
                            className="min-h-[38px] px-3.5 py-2 rounded-xl bg-[#F05262]/15 hover:bg-[#F05262]/25 text-[#F05262] border border-[#F05262]/40 text-xs font-semibold transition"
                          >
                            Desvincular
                          </button>
                        )}
                      </div>
                    </div>

                    {confirmUnlinkTiktok && (
                      <div className="p-4 rounded-xl bg-[#F05262]/10 border border-[#F05262]/40 space-y-3">
                        <p className="text-xs text-[#FFFFFF]">
                          Tem certeza que deseja revogar o vínculo OAuth 2.0 desta conta TikTok? Sessões LIVE ativas não serão apagadas, mas o login rápido precisará ser reconectado.
                        </p>
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={handleUnlinkTikTok}
                            disabled={isUnlinkingTiktok}
                            className="px-4 py-2 rounded-lg bg-[#F05262] text-white text-xs font-bold transition disabled:opacity-50"
                          >
                            {isUnlinkingTiktok ? 'Revogando...' : 'Confirmar Desvinculação'}
                          </button>
                          <button
                            type="button"
                            onClick={() => setConfirmUnlinkTiktok(false)}
                            className="px-4 py-2 rounded-lg bg-[#080D18] text-[#A5B1C5] text-xs font-semibold"
                          >
                            Cancelar
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="space-y-4">
                    <p className="text-xs sm:text-sm text-[#A5B1C5]">
                      Vincule sua conta oficial do TikTok para identificar automaticamente seu perfil nas transmissões e autenticar com 1 clique.
                    </p>

                    {!currentUser ? (
                      <button
                        type="button"
                        onClick={onOpenAccountModal}
                        className="gio-btn-primary min-h-[40px] px-5 py-2 rounded-xl text-white text-xs font-semibold flex items-center gap-2 transition"
                      >
                        <User className="w-4 h-4" />
                        <span>Entrar na Conta para Vincular TikTok</span>
                      </button>
                    ) : !isStepUpModalOpen ? (
                      <button
                        type="button"
                        onClick={() => setIsStepUpModalOpen(true)}
                        className="gio-btn-primary min-h-[42px] px-5 py-2.5 rounded-xl text-white text-xs font-semibold flex items-center gap-2 transition"
                      >
                        <Link2 className="w-4 h-4 text-[#A6C957]" />
                        <span>Vincular Conta TikTok (Step-Up OAuth)</span>
                      </button>
                    ) : (
                      <form
                        onSubmit={handleConfirmStepUpAndLinkTikTok}
                        className="p-4 rounded-xl bg-[#080D18] border border-[#0131CD]/50 space-y-3"
                      >
                        <div className="text-xs font-bold text-[#FFFFFF]">
                          Verificação de Segurança (Step-Up Authentication)
                        </div>
                        <p className="text-xs text-[#A5B1C5]">
                          {hasPasswordProvider
                            ? 'Confirme sua senha atual para autorizar o vínculo criptográfico entre seu UID Firebase e sua conta TikTok.'
                            : 'Confirme sua identidade no provedor Google para iniciar o vínculo oficial com o TikTok.'}
                        </p>
                        {hasPasswordProvider && (
                          <input
                            type="password"
                            value={stepUpPassword}
                            onChange={(e) => setStepUpPassword(e.target.value)}
                            placeholder="Sua senha atual"
                            className="w-full min-h-[40px] px-3.5 py-2 rounded-xl bg-[#111B30] border border-[var(--gio-border-subtle)] text-sm text-white outline-none"
                          />
                        )}
                        <div className="flex items-center gap-2">
                          <button
                            type="submit"
                            disabled={isLinkingTiktok}
                            className="gio-btn-primary px-4 py-2 rounded-xl text-white text-xs font-semibold transition disabled:opacity-50"
                          >
                            {isLinkingTiktok
                              ? 'Autenticando...'
                              : 'Confirmar e Ir para o TikTok'}
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setIsStepUpModalOpen(false);
                              setStepUpPassword('');
                            }}
                            className="px-4 py-2 rounded-xl bg-[#080D18] text-[#A5B1C5] text-xs font-semibold"
                          >
                            Cancelar
                          </button>
                        </div>
                      </form>
                    )}
                  </div>
                )}
              </div>

              {/* 2. TikTok LIVE Webcast Status */}
              <div className="p-6 rounded-2xl bg-[#111B30] border border-[var(--gio-border-subtle)] flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <h3 className="text-base font-bold text-[#FFFFFF]">
                      Conector TikTok LIVE (Transmissão em Tempo Real)
                    </h3>
                    <span
                      className={`px-2.5 py-0.5 rounded-md text-[11px] font-bold border ${
                        liveConnectionState === 'CONNECTED'
                          ? 'bg-[#A6C957]/15 text-[#A6C957] border-[#A6C957]/35'
                          : liveConnectionState === 'CONNECTING' ||
                            liveConnectionState === 'RECONNECTING'
                          ? 'bg-[#0131CD]/20 text-[#FFFFFF] border-[#0131CD]/40'
                          : 'bg-[#080D18] text-[#A5B1C5] border-[var(--gio-border-subtle)]'
                      }`}
                    >
                      {liveConnectionState}
                    </span>
                  </div>
                  <p className="text-xs text-[#A5B1C5]">
                    {liveConnectionState === 'CONNECTED' && liveConnectedUsername
                      ? `Capturando presentes e moedas ao vivo da sala @${liveConnectedUsername.replace(/^@/, '')}.`
                      : 'Nenhuma sala TikTok LIVE conectada no momento. A conexão é mantida pelo servidor mesmo ao trocar de aba.'}
                  </p>
                </div>

                <button
                  type="button"
                  onClick={onNavigateToLivePro}
                  className="shrink-0 min-h-[40px] px-4 py-2 rounded-xl bg-[#080D18] hover:bg-[#111B30] text-[#FFFFFF] border border-[var(--gio-border-subtle)] hover:border-[#0131CD] text-xs font-semibold flex items-center gap-2 transition"
                >
                  <Radio className="w-4 h-4 text-[#A5B1C5]" />
                  <span>Gerenciar Sala TikTok LIVE</span>
                </button>
              </div>

              {/* 3. Demais Plataformas e Provedores de Autenticação */}
              <div className="p-6 rounded-2xl bg-[#111B30] border border-[var(--gio-border-subtle)] space-y-4">
                <div>
                  <h3 className="text-base font-bold text-[#FFFFFF]">
                    Provedores de Login e Plataformas Vinculadas
                  </h3>
                  <p className="text-xs text-[#A5B1C5] mt-0.5">
                    Métodos de autenticação verificados para acesso à sua conta organizadora.
                  </p>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {/* Google OAuth */}
                  <div className="p-4 rounded-xl bg-[#080D18] border border-[var(--gio-border-subtle)] flex items-center justify-between gap-3">
                    <div className="space-y-0.5">
                      <div className="text-sm font-bold text-[#FFFFFF]">Google Workspace / Gmail</div>
                      <div className="text-xs text-[#A5B1C5]">
                        {hasGoogleProvider
                          ? `Vinculado (${currentUser?.email})`
                          : 'Login social OAuth 2.0 Google'}
                      </div>
                    </div>
                    <span
                      className={`px-2.5 py-1 rounded-md text-[11px] font-bold border ${
                        hasGoogleProvider
                          ? 'bg-[#A6C957]/15 text-[#A6C957] border-[#A6C957]/35'
                          : 'bg-[#080D18] text-[#A5B1C5] border-[var(--gio-border-subtle)]'
                      }`}
                    >
                      {hasGoogleProvider ? 'ATIVO' : 'DISPONÍVEL'}
                    </span>
                  </div>

                  {/* E-mail e Senha */}
                  <div className="p-4 rounded-xl bg-[#080D18] border border-[var(--gio-border-subtle)] flex items-center justify-between gap-3">
                    <div className="space-y-0.5">
                      <div className="text-sm font-bold text-[#FFFFFF]">Credencial E-mail e Senha</div>
                      <div className="text-xs text-[#A5B1C5]">
                        {hasPasswordProvider
                          ? `Configurada (${currentUser?.email})`
                          : 'Autenticação direta por senha forte'}
                      </div>
                    </div>
                    <span
                      className={`px-2.5 py-1 rounded-md text-[11px] font-bold border ${
                        hasPasswordProvider
                          ? 'bg-[#A6C957]/15 text-[#A6C957] border-[#A6C957]/35'
                          : 'bg-[#080D18] text-[#A5B1C5] border-[var(--gio-border-subtle)]'
                      }`}
                    >
                      {hasPasswordProvider ? 'ATIVO' : 'NÃO USADO'}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* =================================================================
              SECTION 3: SEGURANÇA (Senha, Sessões e Autenticação)
          ================================================================= */}
          {activeSection === 'security' && (
            <div className="space-y-6">
              {/* 1. Alteração de Senha */}
              <div className="p-6 rounded-2xl bg-[#111B30] border border-[var(--gio-border-subtle)] space-y-5">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-[var(--gio-border-subtle)] pb-4">
                  <div>
                    <h3 className="text-base font-bold text-[#FFFFFF] flex items-center gap-2">
                      <KeyRound className="w-4 h-4 text-[#A5B1C5]" />
                      <span>Senha e Credenciais de Acesso</span>
                    </h3>
                    <p className="text-xs text-[#A5B1C5] mt-0.5">
                      Exige confirmação da senha atual (reautenticação em 2 etapas) antes de gravar uma nova credencial.
                    </p>
                  </div>
                  {currentUser?.email && (
                    <button
                      type="button"
                      onClick={handleSendPasswordReset}
                      className="self-start sm:self-center px-3 py-1.5 rounded-lg bg-[#080D18] hover:bg-[#111B30] text-[#FFFFFF] border border-[var(--gio-border-subtle)] text-xs font-semibold transition"
                    >
                      Enviar E-mail de Redefinição
                    </button>
                  )}
                </div>

                {!currentUser ? (
                  <div className="p-4 rounded-xl bg-[#080D18] border border-[var(--gio-border-subtle)] flex items-center justify-between gap-4">
                    <span className="text-xs text-[#A5B1C5]">
                      Faça login na sua conta para gerenciar sua senha e credenciais de segurança.
                    </span>
                    <button
                      type="button"
                      onClick={onOpenAccountModal}
                      className="gio-btn-primary px-4 py-2 rounded-xl text-white text-xs font-semibold"
                    >
                      Fazer Login
                    </button>
                  </div>
                ) : !hasPasswordProvider ? (
                  <div className="p-4 rounded-xl bg-[#080D18] border border-[var(--gio-border-subtle)] space-y-2">
                    <div className="text-xs font-bold text-[#FFFFFF]">
                      Autenticação Gerenciada por Provedor OAuth Externo
                    </div>
                    <p className="text-xs text-[#A5B1C5]">
                      Sua conta utiliza autenticação criptográfica via{' '}
                      {isCustomTikTokUid ? 'TikTok Login Kit' : 'Google OAuth 2.0'} e não armazena senha local. Caso deseje criar uma senha para seu e-mail, utilize o botão &ldquo;Enviar E-mail de Redefinição&rdquo;.
                    </p>
                  </div>
                ) : (
                  <form onSubmit={handleChangePassword} className="space-y-4">
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                      <div className="space-y-1.5">
                        <label className="block text-xs font-semibold text-[#FFFFFF]">
                          Senha Atual
                        </label>
                        <div className="relative">
                          <input
                            type={showSecurityPasswords ? 'text' : 'password'}
                            value={currentPasswordInput}
                            onChange={(e) => setCurrentPasswordInput(e.target.value)}
                            placeholder="••••••••"
                            className="w-full min-h-[42px] px-3.5 py-2 rounded-xl bg-[#080D18] border border-[var(--gio-border-subtle)] focus:border-[#0131CD] text-sm text-white outline-none"
                          />
                        </div>
                      </div>

                      <div className="space-y-1.5">
                        <label className="block text-xs font-semibold text-[#FFFFFF]">
                          Nova Senha Forte
                        </label>
                        <input
                          type={showSecurityPasswords ? 'text' : 'password'}
                          value={newPasswordInput}
                          onChange={(e) => setNewPasswordInput(e.target.value)}
                          placeholder="Mínimo 10 caracteres"
                          className="w-full min-h-[42px] px-3.5 py-2 rounded-xl bg-[#080D18] border border-[var(--gio-border-subtle)] focus:border-[#0131CD] text-sm text-white outline-none"
                        />
                      </div>

                      <div className="space-y-1.5">
                        <label className="block text-xs font-semibold text-[#FFFFFF]">
                          Confirmar Nova Senha
                        </label>
                        <div className="relative flex items-center">
                          <input
                            type={showSecurityPasswords ? 'text' : 'password'}
                            value={confirmNewPasswordInput}
                            onChange={(e) => setConfirmNewPasswordInput(e.target.value)}
                            placeholder="Repita a nova senha"
                            className="w-full min-h-[42px] pl-3.5 pr-10 py-2 rounded-xl bg-[#080D18] border border-[var(--gio-border-subtle)] focus:border-[#0131CD] text-sm text-white outline-none"
                          />
                          <button
                            type="button"
                            onClick={() => setShowSecurityPasswords((v) => !v)}
                            className="absolute right-3 text-[#A5B1C5] hover:text-white"
                          >
                            {showSecurityPasswords ? (
                              <EyeOff className="w-4 h-4" />
                            ) : (
                              <Eye className="w-4 h-4" />
                            )}
                          </button>
                        </div>
                      </div>
                    </div>

                    {newPasswordInput && (
                      <div className="p-3 rounded-xl bg-[#080D18] border border-[var(--gio-border-subtle)] flex items-center justify-between gap-3 text-xs">
                        <span className="text-[#A5B1C5]">{passwordAssessment.feedback}</span>
                        <span
                          className={`font-bold tabular-nums uppercase ${
                            passwordAssessment.isValid ? 'text-[#A6C957]' : 'text-[#F05262]'
                          }`}
                        >
                          Força: {passwordAssessment.score}/3 ({passwordAssessment.label})
                        </span>
                      </div>
                    )}

                    <div className="flex justify-end">
                      <button
                        type="submit"
                        disabled={isUpdatingPassword}
                        className="gio-btn-primary min-h-[40px] px-5 py-2 rounded-xl text-white text-xs font-semibold transition disabled:opacity-50"
                      >
                        {isUpdatingPassword ? 'Atualizando Senha...' : 'Atualizar Senha de Acesso'}
                      </button>
                    </div>
                  </form>
                )}
              </div>

              {/* 2. Sessões Ativas e Telemetria de Autenticação */}
              <div className="p-6 rounded-2xl bg-[#111B30] border border-[var(--gio-border-subtle)] space-y-5">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-[var(--gio-border-subtle)] pb-4">
                  <div>
                    <h3 className="text-base font-bold text-[#FFFFFF] flex items-center gap-2">
                      <ShieldCheck className="w-4 h-4 text-[#A6C957]" />
                      <span>Sessão Atual e Tokens de Autenticação</span>
                    </h3>
                    <p className="text-xs text-[#A5B1C5] mt-0.5">
                      Inspecione a sessão autenticada neste navegador, renove seu certificado JWT ou encerre o acesso.
                    </p>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
                  <div className="p-3.5 rounded-xl bg-[#080D18] border border-[var(--gio-border-subtle)]">
                    <div className="text-[11px] text-[#A5B1C5]">Estado da Sessão</div>
                    <div className="text-xs font-bold text-[#A6C957] mt-1">
                      {currentUser ? 'Autenticada (Firebase JWT)' : 'Sessão Local Anônima'}
                    </div>
                  </div>

                  <div className="p-3.5 rounded-xl bg-[#080D18] border border-[var(--gio-border-subtle)]">
                    <div className="text-[11px] text-[#A5B1C5]">Último Login Registrado</div>
                    <div className="text-xs font-semibold tabular-nums text-[#FFFFFF] mt-1">
                      {currentUser?.metadata?.lastSignInTime
                        ? formatDateBr(currentUser.metadata.lastSignInTime)
                        : '—'}
                    </div>
                  </div>

                  <div className="p-3.5 rounded-xl bg-[#080D18] border border-[var(--gio-border-subtle)]">
                    <div className="text-[11px] text-[#A5B1C5]">Criação da Conta</div>
                    <div className="text-xs font-semibold tabular-nums text-[#FFFFFF] mt-1">
                      {currentUser?.metadata?.creationTime
                        ? formatDateBr(currentUser.metadata.creationTime)
                        : '—'}
                    </div>
                  </div>

                  <div className="p-3.5 rounded-xl bg-[#080D18] border border-[var(--gio-border-subtle)]">
                    <div className="text-[11px] text-[#A5B1C5]">Proteção Anti-Força Bruta</div>
                    <div className={`text-xs font-semibold tabular-nums mt-1 ${throttleState.isThrottled ? 'text-[#F05262]' : 'text-[#A6C957]'}`}>
                      {throttleState.isThrottled
                        ? `Bloqueio Temporário (${throttleState.remainingSeconds}s)`
                        : 'Proteção Ativa (Normal)'}
                    </div>
                  </div>
                </div>

                {lastTokenRefreshIso && (
                  <div className="text-xs tabular-nums text-[#A6C957]">
                    Última renovação manual do token Bearer JWT: {formatDateBr(lastTokenRefreshIso)}
                  </div>
                )}

                {currentUser && (
                  <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-[var(--gio-border-subtle)]">
                    <button
                      type="button"
                      onClick={handleRefreshSecurityToken}
                      disabled={isRefreshingToken}
                      className="min-h-[40px] px-4 py-2 rounded-xl bg-[#080D18] hover:bg-[#111B30] text-[#FFFFFF] border border-[var(--gio-border-subtle)] text-xs font-semibold flex items-center gap-2 transition disabled:opacity-50"
                    >
                      <RefreshCw className={`w-4 h-4 text-[#A5B1C5] ${isRefreshingToken ? 'animate-spin' : ''}`} />
                      <span>Renovar Token Criptográfico (JWT)</span>
                    </button>

                    <button
                      type="button"
                      onClick={handleSafeLogout}
                      className="min-h-[40px] px-4 py-2 rounded-xl bg-[#F05262]/15 hover:bg-[#F05262]/25 text-[#F05262] border border-[#F05262]/40 text-xs font-semibold flex items-center gap-2 transition"
                    >
                      <LogOut className="w-4 h-4" />
                      <span>Encerrar Sessão Neste Dispositivo</span>
                    </button>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* =================================================================
              SECTION 4: ASSINATURA (Plano, Renovação e Cancelamento)
          ================================================================= */}
          {activeSection === 'subscription' && (
            <div className="space-y-6">
              {/* Status Atual do Plano */}
              <div className="p-6 rounded-2xl bg-[#111B30] border border-[var(--gio-border-subtle)] space-y-5">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-[var(--gio-border-subtle)] pb-4">
                  <div className="space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="text-base font-bold text-[#FFFFFF]">
                        Plano Atual: {isProActive ? 'GIO DA SORTE PRO' : 'GIO DA SORTE FREE'}
                      </h3>
                      <span
                        className={`px-2.5 py-0.5 rounded-md text-[11px] font-bold border ${
                          isProActive
                            ? 'bg-[#A6C957]/15 text-[#A6C957] border-[#A6C957]/35'
                            : 'bg-[#0131CD]/25 text-[#FFFFFF] border-[#0131CD]/50'
                        }`}
                      >
                        {userSubscription?.statusState || proEntitlement.statusState || 'FREE'}
                      </span>
                      {userSubscription?.billingSubStatus && (
                        <span className="px-2.5 py-0.5 rounded-md text-[11px] bg-[#080D18] text-[#A5B1C5] border border-[var(--gio-border-subtle)]">
                          {userSubscription.billingSubStatus}
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-[#A5B1C5]">
                      O controle de plano é validado de forma autoritativa pelo servidor.
                    </p>
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={loadSubscriptionDetails}
                      disabled={isLoadingSubscription}
                      className="min-h-[38px] px-3 py-1.5 rounded-xl bg-[#080D18] hover:bg-[#111B30] text-[#A5B1C5] hover:text-white border border-[var(--gio-border-subtle)] text-xs font-semibold flex items-center gap-1.5 transition"
                    >
                      <RefreshCw className={`w-3.5 h-3.5 ${isLoadingSubscription ? 'animate-spin' : ''}`} />
                      <span>Sincronizar</span>
                    </button>
                    <button
                      type="button"
                      onClick={onNavigateToSubscriptionTab}
                      className="min-h-[38px] px-3.5 py-1.5 rounded-xl bg-[#080D18] hover:bg-[#0131CD]/20 text-[#FFFFFF] border border-[var(--gio-border-subtle)] text-xs font-semibold flex items-center gap-1.5 transition"
                    >
                      <ExternalLink className="w-3.5 h-3.5 text-[#A5B1C5]" />
                      <span>Catálogo Completo PRO</span>
                    </button>
                  </div>
                </div>

                {/* Ciclo, Renovação e Detalhes */}
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
                  <div className="p-3.5 rounded-xl bg-[#080D18] border border-[var(--gio-border-subtle)]">
                    <div className="text-[11px] text-[#A5B1C5]">Modalidade Contratada</div>
                    <div className="text-xs font-bold text-[#FFFFFF] mt-1">
                      {userSubscription?.planName || (isProActive ? 'Plano PRO' : 'Plano Gratuito (FREE)')}
                    </div>
                  </div>

                  <div className="p-3.5 rounded-xl bg-[#080D18] border border-[var(--gio-border-subtle)]">
                    <div className="text-[11px] text-[#A5B1C5]">Próxima Renovação / Término do Ciclo</div>
                    <div className="text-xs font-semibold tabular-nums text-[#FFFFFF] mt-1">
                      {userSubscription?.currentPeriodEnd || userSubscription?.nextPaymentDate
                        ? formatDateBr(userSubscription.currentPeriodEnd || userSubscription.nextPaymentDate)
                        : userSubscription?.trialEndDate
                        ? `Fim do Trial: ${formatDateBr(userSubscription.trialEndDate)}`
                        : 'Sem cobrança programada'}
                    </div>
                  </div>

                  <div className="p-3.5 rounded-xl bg-[#080D18] border border-[var(--gio-border-subtle)]">
                    <div className="text-[11px] text-[#A5B1C5]">Renovação Automática</div>
                    <div
                      className={`text-xs font-bold mt-1 ${
                        userSubscription?.cancelAtPeriodEnd
                          ? 'text-[#A5B1C5]'
                          : isProActive
                          ? 'text-[#A6C957]'
                          : 'text-[#A5B1C5]'
                      }`}
                    >
                      {userSubscription?.cancelAtPeriodEnd
                        ? 'Cancelada (Ativo até o fim do período)'
                        : isProActive
                        ? 'Ativa'
                        : 'Inativa (Plano FREE)'}
                    </div>
                  </div>

                  <div className="p-3.5 rounded-xl bg-[#080D18] border border-[var(--gio-border-subtle)]">
                    <div className="text-[11px] text-[#A5B1C5]">Provedor Vinculado</div>
                    <div className="font-mono text-xs font-semibold text-[#FFFFFF] mt-1">
                      {userSubscription?.provider === 'PAYPAL' || userSubscription?.paypalSubscriptionId
                        ? `PayPal (${userSubscription?.paypalSubscriptionId || 'Ativo'})`
                        : userSubscription?.mpPreapprovalId
                        ? `Mercado Pago (${userSubscription.mpPreapprovalId.slice(0, 10)}...)`
                        : 'Nenhum'}
                    </div>
                  </div>
                </div>

                {/* Upgrade / Contratação Rápida */}
                {!isProActive && (
                  <div className="p-5 rounded-xl bg-[#080D18] border border-[#0131CD]/50 space-y-4">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                      <div>
                        <div className="text-sm font-bold text-[#FFFFFF] flex items-center gap-2">
                          <Sparkles className="w-4 h-4 text-[#A6C957]" />
                          <span>Ativar GIO DA SORTE PRO (3 Dias de Teste Grátis)</span>
                        </div>
                        <p className="text-xs text-[#A5B1C5] mt-0.5">
                          Libere conexão TikTok LIVE em tempo real, captura automática de presentes, campanhas acumuladas e sorteador de comentários.
                        </p>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      {/* Seleção de Ciclo */}
                      <div className="space-y-1.5">
                        <label className="block text-xs font-semibold text-[#A5B1C5]">
                          Ciclo de Assinatura
                        </label>
                        <div className="grid grid-cols-2 gap-2">
                          <button
                            type="button"
                            onClick={() => setSelectedCycle('monthly')}
                            className={`p-3 rounded-xl border text-left transition ${
                              selectedCycle === 'monthly'
                                ? 'bg-[#0131CD]/25 border-[#A6C957]/45 text-white'
                                : 'bg-[#111B30] border-[var(--gio-border-subtle)] text-[#A5B1C5]'
                            }`}
                          >
                            <div className="text-xs font-bold">Mensal</div>
                            <div className="text-sm font-bold tabular-nums text-[#FFFFFF] mt-0.5">
                              {formatBrl(officialPlans?.monthly?.price ?? 29.9)}/mês
                            </div>
                          </button>

                          <button
                            type="button"
                            onClick={() => setSelectedCycle('annual')}
                            className={`p-3 rounded-xl border text-left transition ${
                              selectedCycle === 'annual'
                                ? 'bg-[#0131CD]/25 border-[#A6C957]/45 text-white'
                                : 'bg-[#111B30] border-[var(--gio-border-subtle)] text-[#A5B1C5]'
                            }`}
                          >
                            <div className="text-xs font-bold flex items-center justify-between">
                              <span>Anual</span>
                              <span className="text-[10px] text-[#A6C957] font-bold tabular-nums">-44%</span>
                            </div>
                            <div className="text-sm font-bold tabular-nums text-[#FFFFFF] mt-0.5">
                              {formatBrl(officialPlans?.annual?.price ?? 199.9)}/ano
                            </div>
                          </button>
                        </div>
                      </div>

                      {/* Seleção de Provedor */}
                      <div className="space-y-1.5">
                        <label className="block text-xs font-semibold text-[#A5B1C5]">
                          Gateway de Pagamento Oficial
                        </label>
                        <div className="grid grid-cols-2 gap-2">
                          <button
                            type="button"
                            onClick={() => setSelectedGateway('PAYPAL')}
                            className={`p-3 rounded-xl border text-left transition ${
                              selectedGateway === 'PAYPAL'
                                ? 'bg-[#0131CD]/25 border-[#A6C957]/45 text-white'
                                : 'bg-[#111B30] border-[var(--gio-border-subtle)] text-[#A5B1C5]'
                            }`}
                          >
                            <div className="text-xs font-bold">PayPal</div>
                            <div className="text-[11px] text-[#A5B1C5] mt-0.5">
                              Cartão / Saldo PayPal
                            </div>
                          </button>

                          <button
                            type="button"
                            onClick={() => setSelectedGateway('MERCADO_PAGO')}
                            className={`p-3 rounded-xl border text-left transition ${
                              selectedGateway === 'MERCADO_PAGO'
                                ? 'bg-[#0131CD]/25 border-[#A6C957]/45 text-white'
                                : 'bg-[#111B30] border-[var(--gio-border-subtle)] text-[#A5B1C5]'
                            }`}
                          >
                            <div className="text-xs font-bold">Mercado Pago</div>
                            <div className="text-[11px] text-[#A5B1C5] mt-0.5">
                              Assinatura Brasil
                            </div>
                          </button>
                        </div>
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
                      <span className="text-[11px] text-[#A5B1C5]">
                        Ao prosseguir, você concorda com a{' '}
                        <button
                          type="button"
                          onClick={() => onOpenLegalDocument('politica-de-assinaturas-e-pagamentos')}
                          className="text-[#A6C957] underline"
                        >
                          Política de Assinaturas
                        </button>{' '}
                        e de{' '}
                        <button
                          type="button"
                          onClick={() => onOpenLegalDocument('politica-de-cancelamento-e-reembolso')}
                          className="text-[#A6C957] underline"
                        >
                          Cancelamento
                        </button>
                        .
                      </span>

                      <button
                        type="button"
                        onClick={handleQuickStartCheckout}
                        disabled={isStartingCheckout}
                        className="gio-btn-primary min-h-[42px] px-5 py-2.5 rounded-xl text-white text-xs font-semibold flex items-center gap-2 transition disabled:opacity-50"
                      >
                        <Crown className="w-4 h-4 text-[#A6C957]" />
                        <span>
                          {isStartingCheckout
                            ? 'Iniciando Checkout Seguro...'
                            : `Assinar via ${selectedGateway === 'PAYPAL' ? 'PayPal' : 'Mercado Pago'}`}
                        </span>
                      </button>
                    </div>
                  </div>
                )}

                {/* Verificação Manual de ID de Assinatura */}
                <div className="p-4 rounded-xl bg-[#080D18] border border-[var(--gio-border-subtle)] space-y-2.5">
                  <div className="text-xs font-semibold text-[#FFFFFF]">
                    Sincronizar Assinatura por Código (PayPal Subscription ID ou Mercado Pago Preapproval)
                  </div>
                  <div className="flex flex-col sm:flex-row gap-2">
                    <input
                      type="text"
                      value={manualVerifyId}
                      onChange={(e) => setManualVerifyId(e.target.value)}
                      placeholder="Ex: I-BW452GLLEP1G (PayPal) ou código do Mercado Pago"
                      className="flex-1 min-h-[40px] px-3.5 py-2 rounded-xl bg-[#111B30] border border-[var(--gio-border-subtle)] font-mono text-xs text-white outline-none"
                    />
                    <button
                      type="button"
                      onClick={handleVerifySubscriptionManual}
                      disabled={isVerifyingSub || !manualVerifyId.trim()}
                      className="min-h-[40px] px-4 py-2 rounded-xl bg-[#080D18] hover:bg-[#0131CD]/20 text-white text-xs font-semibold transition disabled:opacity-50"
                    >
                      {isVerifyingSub ? 'Validando...' : 'Validar no Servidor'}
                    </button>
                  </div>
                </div>

                {/* Cancelamento de Renovação */}
                {(isProActive ||
                  userSubscription?.statusState === 'ACTIVE' ||
                  userSubscription?.statusState === 'PENDING') && (
                  <div className="pt-3 border-t border-[var(--gio-border-subtle)] flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div className="text-xs text-[#A5B1C5]">
                      Deseja interromper cobranças futuras? O cancelamento mantém seu acesso PRO até o fim do período já concedido.
                    </div>
                    {!confirmCancelSub ? (
                      <button
                        type="button"
                        onClick={() => setConfirmCancelSub(true)}
                        className="shrink-0 min-h-[38px] px-4 py-2 rounded-xl bg-[#F05262]/15 hover:bg-[#F05262]/25 text-[#F05262] border border-[#F05262]/40 text-xs font-semibold transition"
                      >
                        Cancelar Renovação Automática
                      </button>
                    ) : (
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={handleCancelSubscriptionConfirm}
                          disabled={isCancelingSub}
                          className="px-4 py-2 rounded-xl bg-[#F05262] text-white text-xs font-bold transition disabled:opacity-50"
                        >
                          {isCancelingSub ? 'Cancelando...' : 'Confirmar Cancelamento'}
                        </button>
                        <button
                          type="button"
                          onClick={() => setConfirmCancelSub(false)}
                          className="px-3.5 py-2 rounded-xl bg-[#080D18] text-[#A5B1C5] text-xs font-semibold"
                        >
                          Voltar
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* =================================================================
              SECTION 5: PAGAMENTOS (Histórico, Recibos e Métodos)
          ================================================================= */}
          {activeSection === 'payments' && (
            <div className="space-y-6">
              {/* 1. Histórico e Recibos da Assinatura */}
              <div className="p-6 rounded-2xl bg-[#111B30] border border-[var(--gio-border-subtle)] space-y-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-[var(--gio-border-subtle)] pb-4">
                  <div>
                    <h3 className="text-base font-bold text-[#FFFFFF] flex items-center gap-2">
                      <Receipt className="w-4 h-4 text-[#A6C957]" />
                      <span>Histórico de Pagamentos e Recibos da Assinatura</span>
                    </h3>
                    <p className="text-xs text-[#A5B1C5] mt-0.5">
                      Comprovantes oficiais vinculados à sua conta e validados pelos provedores PayPal e Mercado Pago.
                    </p>
                  </div>
                </div>

                {paymentHistoryItems.length === 0 ? (
                  <div className="p-6 rounded-xl bg-[#080D18] border border-[var(--gio-border-subtle)] text-center space-y-2">
                    <CreditCard className="w-7 h-7 text-[#A5B1C5] mx-auto" />
                    <div className="text-sm font-bold text-[#FFFFFF]">
                      Nenhuma cobrança registrada até o momento
                    </div>
                    <p className="text-xs text-[#A5B1C5] max-w-md mx-auto">
                      Sua conta está no plano gratuito (FREE) sem faturas emitidas. Quando você ativar uma assinatura PRO, seus recibos e ciclos aparecerão aqui para download.
                    </p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {paymentHistoryItems.map((item) => (
                      <div
                        key={item.receiptId}
                        className="p-4 rounded-xl bg-[#080D18] border border-[var(--gio-border-subtle)] flex flex-col sm:flex-row sm:items-center justify-between gap-4"
                      >
                        <div className="space-y-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="font-mono text-xs font-bold text-[#FFFFFF]">
                              {item.receiptId}
                            </span>
                            <span
                              className={`px-2 py-0.5 rounded text-[10px] font-bold border ${
                                item.status === 'PAID'
                                  ? 'bg-[#A6C957]/15 text-[#A6C957] border-[#A6C957]/35'
                                  : item.status === 'TRIAL'
                                  ? 'bg-[#0131CD]/20 text-[#FFFFFF] border-[#0131CD]/40'
                                  : 'bg-[#080D18] text-[#A5B1C5] border-[var(--gio-border-subtle)]'
                              }`}
                            >
                              {item.status === 'PAID'
                                ? 'PAGO'
                                : item.status === 'TRIAL'
                                ? 'PERÍODO DE TESTE'
                                : item.status}
                            </span>
                            <span className="text-xs tabular-nums text-[#A5B1C5]">
                              {formatDateBr(item.issuedAtIso)}
                            </span>
                          </div>
                          <div className="text-xs text-[#FFFFFF]">{item.description}</div>
                          <div className="font-mono text-[11px] text-[#A5B1C5]">
                            Ref: {item.referenceId}
                          </div>
                        </div>

                        <div className="flex items-center gap-3 shrink-0">
                          <div className="text-right">
                            <div className="text-sm font-bold tabular-nums text-[#A6C957]">
                              {formatBrl(item.amount)}
                            </div>
                            <div className="text-[10px] text-[#A5B1C5]">{item.provider}</div>
                          </div>

                          <button
                            type="button"
                            onClick={() => setSelectedReceiptPreview(item)}
                            className="min-h-[36px] px-3 py-1.5 rounded-lg bg-[#080D18] hover:bg-[#0131CD]/20 text-white text-xs font-semibold flex items-center gap-1.5 transition"
                          >
                            <FileText className="w-3.5 h-3.5 text-[#A5B1C5]" />
                            <span>Ver Recibo</span>
                          </button>

                          <button
                            type="button"
                            onClick={() => handleDownloadReceiptHtml(item)}
                            className="min-h-[36px] px-3 py-1.5 rounded-lg bg-[#0131CD] hover:brightness-110 text-white text-xs font-semibold flex items-center gap-1.5 transition"
                          >
                            <Download className="w-3.5 h-3.5" />
                            <span>Baixar</span>
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {/* Modal de Visualização de Recibo */}
                {selectedReceiptPreview && (
                  <div className="p-5 rounded-xl bg-[#080D18] border border-[#0131CD]/60 space-y-4">
                    <div className="flex items-center justify-between border-b border-[var(--gio-border-subtle)] pb-3">
                      <div>
                        <div className="text-xs font-bold text-[#A6C957]">
                          COMPROVANTE ELETRÔNICO DE ASSINATURA
                        </div>
                        <div className="font-mono text-sm font-bold text-white">
                          {selectedReceiptPreview.receiptId}
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => setSelectedReceiptPreview(null)}
                        className="text-[#A5B1C5] hover:text-white"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                      <div>
                        <span className="text-[#A5B1C5] block">Assinante:</span>
                        <span className="text-white font-semibold">
                          {profileDisplayName || currentUser?.displayName || 'Organizador'} (
                          {currentUser?.email || 'Local'})
                        </span>
                      </div>
                      <div>
                        <span className="text-[#A5B1C5] block">Provedor / Referência:</span>
                        <span className="font-mono text-white">
                          {selectedReceiptPreview.provider} &bull; {selectedReceiptPreview.referenceId}
                        </span>
                      </div>
                      <div>
                        <span className="text-[#A5B1C5] block">Descrição:</span>
                        <span className="text-white">{selectedReceiptPreview.description}</span>
                      </div>
                      <div>
                        <span className="text-[#A5B1C5] block">Valor Registrado:</span>
                        <span className="text-sm font-bold tabular-nums text-[#A6C957]">
                          {formatBrl(selectedReceiptPreview.amount)}
                        </span>
                      </div>
                    </div>

                    <div className="flex justify-end gap-2 pt-2">
                      <button
                        type="button"
                        onClick={() => handleDownloadReceiptHtml(selectedReceiptPreview)}
                        className="gio-btn-primary px-4 py-2 rounded-xl text-white text-xs font-semibold flex items-center gap-1.5"
                      >
                        <Printer className="w-3.5 h-3.5" />
                        <span>Baixar Recibo Completo (.HTML)</span>
                      </button>
                    </div>
                  </div>
                )}
              </div>

              {/* 2. Métodos de Pagamento e Chaves do Organizador */}
              <form
                onSubmit={handleSaveOrganizerPaymentMethods}
                className="p-6 rounded-2xl bg-[#111B30] border border-[var(--gio-border-subtle)] space-y-5"
              >
                <div className="border-b border-[var(--gio-border-subtle)] pb-4">
                  <h3 className="text-base font-bold text-[#FFFFFF]">
                    Métodos de Pagamento e Chaves de Apoio do Organizador
                  </h3>
                  <p className="text-xs text-[#A5B1C5] mt-0.5">
                    Configure suas chaves PIX e PayPal para exibição opcional na aba de apoio e nos cards compartilhados com seus participantes.
                  </p>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <label className="block text-xs font-semibold text-[#FFFFFF]">
                      Chave PIX do Organizador (Opcional)
                    </label>
                    <input
                      type="text"
                      value={pixKeyDraft}
                      onChange={(e) => setPixKeyDraft(e.target.value)}
                      placeholder="CPF, CNPJ, E-mail, Telefone ou Chave Aleatória"
                      className="w-full min-h-[42px] px-3.5 py-2 rounded-xl bg-[#080D18] border border-[var(--gio-border-subtle)] focus:border-[#0131CD] font-mono text-sm text-white outline-none"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label className="block text-xs font-semibold text-[#FFFFFF]">
                      E-mail ou Link PayPal.me do Organizador (Opcional)
                    </label>
                    <input
                      type="text"
                      value={paypalEmailDraft}
                      onChange={(e) => setPaypalEmailDraft(e.target.value)}
                      placeholder="seu-email@exemplo.com ou paypal.me/seucanal"
                      className="w-full min-h-[42px] px-3.5 py-2 rounded-xl bg-[#080D18] border border-[var(--gio-border-subtle)] focus:border-[#0131CD] font-mono text-sm text-white outline-none"
                    />
                  </div>
                </div>

                <div className="flex justify-end">
                  <button
                    type="submit"
                    className="gio-btn-primary min-h-[40px] px-5 py-2 rounded-xl text-white text-xs font-semibold flex items-center gap-2 transition"
                  >
                    <Check className="w-4 h-4" />
                    <span>Salvar Métodos do Organizador</span>
                  </button>
                </div>
              </form>
            </div>
          )}

          {/* =================================================================
              SECTION 6: PREFERÊNCIAS (Idioma, Notificações e Aparência)
          ================================================================= */}
          {activeSection === 'preferences' && (
            <div className="space-y-6">
              {/* 1. Idioma e Formato Regional */}
              <div className="p-6 rounded-2xl bg-[#111B30] border border-[var(--gio-border-subtle)] space-y-4">
                <div className="border-b border-[var(--gio-border-subtle)] pb-4">
                  <h3 className="text-base font-bold text-[#FFFFFF] flex items-center gap-2">
                    <Globe className="w-4 h-4 text-[#A5B1C5]" />
                    <span>Idioma e Formato Regional</span>
                  </h3>
                  <p className="text-xs text-[#A5B1C5] mt-0.5">
                    Configurações de localização utilizadas nos relatórios, carimbos de data/hora e valores monetários.
                  </p>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="p-3.5 rounded-xl bg-[#080D18] border border-[var(--gio-border-subtle)]">
                    <div className="text-[11px] text-[#A5B1C5]">Idioma da Interface</div>
                    <div className="text-xs font-bold text-[#FFFFFF] mt-1">
                      Português (Brasil) &mdash; pt-BR
                    </div>
                  </div>

                  <div className="p-3.5 rounded-xl bg-[#080D18] border border-[var(--gio-border-subtle)]">
                    <div className="text-[11px] text-[#A5B1C5]">Moeda e Formatação Numérica</div>
                    <div className="text-xs font-bold text-[#FFFFFF] mt-1">
                      Real Brasileiro (BRL / R$)
                    </div>
                  </div>

                  <div className="p-3.5 rounded-xl bg-[#080D18] border border-[var(--gio-border-subtle)]">
                    <div className="text-[11px] text-[#A5B1C5]">Fuso Horário do Sistema</div>
                    <div className="text-xs font-bold text-[#FFFFFF] mt-1">
                      {detectedTimezone}
                    </div>
                  </div>
                </div>
              </div>

              {/* 2. Notificações, Áudio e Experiência de Sorteio */}
              <div className="p-6 rounded-2xl bg-[#111B30] border border-[var(--gio-border-subtle)] space-y-5">
                <div className="border-b border-[var(--gio-border-subtle)] pb-4">
                  <h3 className="text-base font-bold text-[#FFFFFF] flex items-center gap-2">
                    <Volume2 className="w-4 h-4 text-[#A5B1C5]" />
                    <span>Notificações Sonoras, Contagem Regressiva e Aparência</span>
                  </h3>
                  <p className="text-xs text-[#A5B1C5] mt-0.5">
                    Personalize o comportamento visual e sonoro do sorteador durante suas transmissões.
                  </p>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {/* Efeitos Sonoros */}
                  <div className="p-4 rounded-xl bg-[#080D18] border border-[var(--gio-border-subtle)] flex items-center justify-between gap-3">
                    <div>
                      <div className="text-sm font-bold text-[#FFFFFF]">
                        Efeitos Sonoros de Sorteio e Vitória
                      </div>
                      <div className="text-xs text-[#A5B1C5]">
                        Sons de giro do globo/roleta, contagem regressiva e celebração.
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={onToggleSound}
                      className={`min-h-[38px] px-4 py-2 rounded-xl text-xs font-bold flex items-center gap-2 border transition ${
                        soundEnabled
                          ? 'bg-[#A6C957]/15 text-[#A6C957] border-[#A6C957]/35'
                          : 'bg-[#080D18] text-[#A5B1C5] border-[var(--gio-border-subtle)]'
                      }`}
                    >
                      {soundEnabled ? (
                        <>
                          <Volume2 className="w-4 h-4" />
                          <span>Ativado</span>
                        </>
                      ) : (
                        <>
                          <VolumeX className="w-4 h-4" />
                          <span>Silenciado</span>
                        </>
                      )}
                    </button>
                  </div>

                  {/* Tema Visual */}
                  <div className="p-4 rounded-xl bg-[#080D18] border border-[var(--gio-border-subtle)] flex items-center justify-between gap-3">
                    <div>
                      <div className="text-sm font-bold text-[#FFFFFF]">Aparência e Tema Visual</div>
                      <div className="text-xs text-[#A5B1C5]">
                        Escolha entre o Azul Real Clássico ou Neon Night.
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => onUpdateSettings({ themeMode: 'default' })}
                        className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition ${
                          (settings.themeMode || 'default') === 'default'
                            ? 'bg-[#0131CD] text-white border-[#A6C957]/45'
                            : 'bg-[#111B30] text-[#A5B1C5] border-[var(--gio-border-subtle)]'
                        }`}
                      >
                        Clássico
                      </button>
                      <button
                        type="button"
                        onClick={() => onUpdateSettings({ themeMode: 'neon' })}
                        className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition ${
                          settings.themeMode === 'neon'
                            ? 'bg-[#0131CD] text-white border-[#A6C957]/45'
                            : 'bg-[#111B30] text-[#A5B1C5] border-[var(--gio-border-subtle)]'
                        }`}
                      >
                        Neon Night
                      </button>
                    </div>
                  </div>

                  {/* Contagem Regressiva */}
                  <div className="p-4 rounded-xl bg-[#080D18] border border-[var(--gio-border-subtle)] space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-[#FFFFFF] flex items-center gap-1.5">
                        <Clock className="w-3.5 h-3.5 text-[#A5B1C5]" />
                        <span>Contagem Regressiva Antes do Sorteio</span>
                      </span>
                      <span className="text-xs font-bold tabular-nums text-[#A6C957]">
                        {(settings.countdownSeconds ?? 5) === 0
                          ? 'Desativada'
                          : `${settings.countdownSeconds ?? 5}s`}
                      </span>
                    </div>
                    <div className="grid grid-cols-4 gap-2">
                      {[0, 3, 5, 10].map((sec) => (
                        <button
                          key={sec}
                          type="button"
                          onClick={() => onUpdateSettings({ countdownSeconds: sec })}
                          className={`py-1.5 rounded-lg text-xs font-semibold tabular-nums border transition ${
                            (settings.countdownSeconds ?? 5) === sec
                              ? 'bg-[#0131CD] text-white border-[#A6C957]/45'
                              : 'bg-[#111B30] text-[#A5B1C5] border-[var(--gio-border-subtle)]'
                          }`}
                        >
                          {sec === 0 ? 'Off' : `${sec}s`}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Duração do Giro */}
                  <div className="p-4 rounded-xl bg-[#080D18] border border-[var(--gio-border-subtle)] space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-[#FFFFFF]">
                        Duração da Animação do Sorteio
                      </span>
                      <span className="text-xs font-bold tabular-nums text-[#A6C957]">
                        {(settings.spinDuration / 1000).toFixed(1)}s
                      </span>
                    </div>
                    <div className="grid grid-cols-3 gap-2">
                      {[
                        { label: 'Rápido (1.5s)', ms: 1500 },
                        { label: 'Normal (3.0s)', ms: 3000 },
                        { label: 'Suspense (5.0s)', ms: 5000 },
                      ].map((opt) => (
                        <button
                          key={opt.ms}
                          type="button"
                          onClick={() => onUpdateSettings({ spinDuration: opt.ms })}
                          className={`py-1.5 rounded-lg text-xs font-semibold tabular-nums border transition ${
                            settings.spinDuration === opt.ms
                              ? 'bg-[#0131CD] text-white border-[#A6C957]/45'
                              : 'bg-[#111B30] text-[#A5B1C5] border-[var(--gio-border-subtle)]'
                          }`}
                        >
                          {opt.label}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>

                {/* Painel Avançado de Regras Matemáticas e Backup */}
                <div className="pt-3 border-t border-[var(--gio-border-subtle)]">
                  <button
                    type="button"
                    onClick={() => setShowAdvancedRulesBackup((v) => !v)}
                    className="w-full p-3.5 rounded-xl bg-[#080D18] hover:bg-[#111B30] border border-[var(--gio-border-subtle)] flex items-center justify-between text-xs font-bold text-[#FFFFFF] transition"
                  >
                    <span>
                      {showAdvancedRulesBackup
                        ? 'Ocultar Regras Matemáticas da Rifa, Simulador Monte Carlo e Backup Local'
                        : 'Abrir Regras Matemáticas da Rifa, Simulador Monte Carlo e Backup Local'}
                    </span>
                    <ChevronRight
                      className={`w-4 h-4 transition-transform ${
                        showAdvancedRulesBackup ? 'rotate-90 text-[#A6C957]' : ''
                      }`}
                    />
                  </button>

                  {showAdvancedRulesBackup && (
                    <div className="mt-4">
                      <SettingsBackup
                        settings={settings}
                        participants={participants}
                        winners={winners}
                        computed={computed}
                        onUpdateSettings={onUpdateSettings}
                        onRestoreState={onRestoreState}
                        onResetToSample={onResetToSample}
                        onResetCoinsOnly={onResetCoinsOnly}
                        onOpenAuditReport={onOpenAuditReport}
                        rosterHash={rosterHash}
                      />
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* =================================================================
              SECTION 7: PRIVACIDADE (Exportação e Exclusão de Dados)
          ================================================================= */}
          {activeSection === 'privacy' && (
            <div className="space-y-6">
              {/* 1. Exportação e Portabilidade de Dados */}
              <div className="p-6 rounded-2xl bg-[#111B30] border border-[var(--gio-border-subtle)] space-y-5">
                <div className="border-b border-[var(--gio-border-subtle)] pb-4">
                  <h3 className="text-base font-bold text-[#FFFFFF] flex items-center gap-2">
                    <Download className="w-4 h-4 text-[#A5B1C5]" />
                    <span>Exportação e Portabilidade de Dados (LGPD Art. 18)</span>
                  </h3>
                  <p className="text-xs text-[#A5B1C5] mt-0.5">
                    Baixe uma cópia integral e estruturada dos seus dados de perfil, participantes, bilhetes, ganhadores e certificados de auditoria.
                  </p>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
                  <button
                    type="button"
                    onClick={handleExportCompleteJson}
                    className="p-4 rounded-xl bg-[#080D18] hover:bg-[#111B30] border border-[var(--gio-border-subtle)] hover:border-[#0131CD] text-left space-y-2 transition group"
                  >
                    <FileJson className="w-5 h-5 text-[#A6C957]" />
                    <div className="text-xs font-bold text-[#FFFFFF]">
                      Pacote Completo (JSON)
                    </div>
                    <p className="text-[11px] text-[#A5B1C5]">
                      Perfil, assinatura, configurações, participantes e ganhadores.
                    </p>
                  </button>

                  <button
                    type="button"
                    onClick={handleExportParticipantsCsv}
                    className="p-4 rounded-xl bg-[#080D18] hover:bg-[#111B30] border border-[var(--gio-border-subtle)] hover:border-[#0131CD] text-left space-y-2 transition group"
                  >
                    <FileSpreadsheet className="w-5 h-5 text-[#A5B1C5]" />
                    <div className="text-xs font-bold text-[#FFFFFF]">
                      Planilha de Bilhetes (CSV)
                    </div>
                    <p className="text-[11px] text-[#A5B1C5] tabular-nums">
                      Compatível com Excel e Google Sheets ({participants.length} participantes).
                    </p>
                  </button>

                  <button
                    type="button"
                    onClick={onOpenAuditReport}
                    className="p-4 rounded-xl bg-[#080D18] hover:bg-[#111B30] border border-[var(--gio-border-subtle)] hover:border-[#0131CD] text-left space-y-2 transition group"
                  >
                    <FileText className="w-5 h-5 text-[#A5B1C5]" />
                    <div className="text-xs font-bold text-[#FFFFFF]">
                      Relatório Auditado (PDF)
                    </div>
                    <p className="text-[11px] text-[#A5B1C5]">
                      Certificado oficial com hash SHA-256 da lista e ganhadores.
                    </p>
                  </button>

                  <button
                    type="button"
                    onClick={onOpenCookieSettings}
                    className="p-4 rounded-xl bg-[#080D18] hover:bg-[#111B30] border border-[var(--gio-border-subtle)] hover:border-[#0131CD] text-left space-y-2 transition group"
                  >
                    <Cookie className="w-5 h-5 text-[#A5B1C5]" />
                    <div className="text-xs font-bold text-[#FFFFFF]">
                      Preferências de Cookies
                    </div>
                    <p className="text-[11px] text-[#A5B1C5]">
                      Gerencie categorias essenciais, preferências e estatísticas.
                    </p>
                  </button>
                </div>
              </div>

              {/* 2. Limpeza de Dados Locais da Mesa */}
              <div className="p-6 rounded-2xl bg-[#111B30] border border-[var(--gio-border-subtle)] space-y-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div>
                    <h3 className="text-base font-bold text-[#FFFFFF] flex items-center gap-2">
                      <Trash2 className="w-4 h-4 text-[#A5B1C5]" />
                      <span>Limpeza de Dados Operacionais da Mesa Atual</span>
                    </h3>
                    <p className="text-xs text-[#A5B1C5] mt-0.5">
                      Zere apenas as moedas acumuladas ou limpe todos os participantes e ganhadores locais para iniciar um novo ciclo do zero.
                    </p>
                  </div>

                  {!confirmClearLocalData ? (
                    <div className="flex flex-wrap items-center gap-2">
                      <button
                        type="button"
                        onClick={onResetCoinsOnly}
                        className="min-h-[38px] px-3.5 py-2 rounded-xl bg-[#080D18] hover:bg-[#111B30] text-[#FFFFFF] border border-[var(--gio-border-subtle)] text-xs font-semibold transition"
                      >
                        Zerar Apenas Moedas
                      </button>
                      <button
                        type="button"
                        onClick={() => setConfirmClearLocalData(true)}
                        className="min-h-[38px] px-3.5 py-2 rounded-xl bg-[#F05262]/15 hover:bg-[#F05262]/25 text-[#F05262] border border-[#F05262]/40 text-xs font-semibold transition"
                      >
                        Limpar Mesa Completa
                      </button>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={handleClearAllLocalRaffleData}
                        className="px-4 py-2 rounded-xl bg-[#F05262] text-white text-xs font-bold"
                      >
                        Confirmar Exclusão da Mesa
                      </button>
                      <button
                        type="button"
                        onClick={() => setConfirmClearLocalData(false)}
                        className="px-3.5 py-2 rounded-xl bg-[#080D18] text-[#A5B1C5] text-xs font-semibold"
                      >
                        Cancelar
                      </button>
                    </div>
                  )}
                </div>
              </div>

              {/* 3. Solicitação Formal de Exclusão de Conta e Direitos LGPD */}
              <div className="p-6 rounded-2xl bg-[#111B30] border border-[var(--gio-border-subtle)] space-y-5">
                <div className="border-b border-[var(--gio-border-subtle)] pb-4 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <div>
                    <h3 className="text-base font-bold text-[#FFFFFF] flex items-center gap-2">
                      <Lock className="w-4 h-4 text-[#F05262]" />
                      <span>Exclusão de Conta e Direitos do Titular (LGPD)</span>
                    </h3>
                    <p className="text-xs text-[#A5B1C5] mt-0.5">
                      Registre um pedido formal de exclusão definitiva de conta e dados pessoais com número de protocolo auditável.
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => onOpenLegalDocument('politica-de-exclusao-de-conta-e-dados')}
                      className="px-3 py-1.5 rounded-lg bg-[#080D18] hover:bg-[#111B30] text-[#FFFFFF] border border-[var(--gio-border-subtle)] text-xs font-semibold transition"
                    >
                      Política de Exclusão
                    </button>
                    <button
                      type="button"
                      onClick={() => onOpenLegalDocument('politica-de-privacidade')}
                      className="px-3 py-1.5 rounded-lg bg-[#080D18] hover:bg-[#111B30] text-[#FFFFFF] border border-[var(--gio-border-subtle)] text-xs font-semibold transition"
                    >
                      Política de Privacidade
                    </button>
                  </div>
                </div>

                <form onSubmit={handleSubmitLgpdRequest} className="space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                      <label className="block text-xs font-semibold text-[#FFFFFF]">
                        Tipo de Solicitação (Art. 18 da LGPD)
                      </label>
                      <select
                        value={lgpdRequestType}
                        onChange={(e) => setLgpdRequestType(e.target.value as LgpdRequestType)}
                        className="w-full min-h-[42px] px-3.5 py-2 rounded-xl bg-[#080D18] border border-[var(--gio-border-subtle)] text-xs sm:text-sm text-white outline-none"
                      >
                        {LGPD_TYPE_LABELS.map((opt) => (
                          <option key={opt.value} value={opt.value}>
                            {opt.label}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div className="space-y-1.5">
                      <label className="block text-xs font-semibold text-[#FFFFFF]">
                        Identificação do Titular
                      </label>
                      <input
                        type="text"
                        readOnly
                        value={
                          currentUser
                            ? `${currentUser.displayName || 'Titular'} (${currentUser.email || currentUser.uid})`
                            : `${profileDisplayName || 'Visitante Local'}`
                        }
                        className="w-full min-h-[42px] px-3.5 py-2 rounded-xl bg-[#080D18]/60 border border-[var(--gio-border-subtle)] text-xs sm:text-sm text-[#A5B1C5]"
                      />
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <label className="block text-xs font-semibold text-[#FFFFFF]">
                      Detalhamento da Solicitação
                    </label>
                    <textarea
                      rows={3}
                      value={lgpdDescription}
                      onChange={(e) => setLgpdDescription(e.target.value)}
                      placeholder="Ex: Solicito a exclusão definitiva dos meus dados cadastrais e revogação de integrações vinculadas à minha conta..."
                      className="w-full px-3.5 py-2.5 rounded-xl bg-[#080D18] border border-[var(--gio-border-subtle)] focus:border-[#0131CD] text-sm text-white outline-none resize-none"
                    />
                  </div>

                  <div className="flex justify-end">
                    <button
                      type="submit"
                      disabled={isSubmittingLgpd}
                      className="min-h-[40px] px-5 py-2 rounded-xl bg-[#F05262] hover:brightness-110 text-white text-xs font-bold transition disabled:opacity-50"
                    >
                      {isSubmittingLgpd
                        ? 'Registrando Protocolo...'
                        : 'Protocolar Solicitação de Privacidade / Exclusão'}
                    </button>
                  </div>
                </form>

                {/* Lista de Protocolos LGPD do Titular */}
                {lgpdRequests.length > 0 && (
                  <div className="pt-4 border-t border-[var(--gio-border-subtle)] space-y-2.5">
                    <div className="text-xs font-bold text-[#FFFFFF]">
                      Meus Protocolos de Privacidade Registrados ({lgpdRequests.length})
                    </div>
                    <div className="space-y-2">
                      {lgpdRequests.slice(0, 5).map((req) => (
                        <div
                          key={req.requestId}
                          className="p-3 rounded-xl bg-[#080D18] border border-[var(--gio-border-subtle)] flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs"
                        >
                          <div>
                            <span className="font-mono font-bold text-[#A6C957]">
                              {req.protocol}
                            </span>{' '}
                            &bull; <span className="font-semibold text-white">{req.requestType}</span>
                            <div className="text-[11px] text-[#A5B1C5] truncate max-w-xl">
                              {req.description}
                            </div>
                          </div>
                          <div className="flex items-center gap-2 shrink-0">
                            <span className="text-[11px] tabular-nums text-[#A5B1C5]">
                              {formatDateBr(req.createdAt)}
                            </span>
                            <span className="px-2 py-0.5 rounded bg-[#A6C957]/15 text-[#A6C957] border border-[#A6C957]/35 text-[10px] font-bold">
                              {req.status}
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
        </section>
      </div>
    </div>
  );
};
