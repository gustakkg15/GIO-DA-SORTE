import React, { useState, useEffect, useRef } from 'react';
import {
  X,
  User,
  Lock,
  Mail,
  Eye,
  EyeOff,
  LogOut,
  Cloud,
  RefreshCw,
  ShieldCheck,
  ShieldAlert,
  CheckCircle2,
  AlertCircle,
  KeyRound,
  ArrowLeft,
  Clock,
  Sparkles,
  Check,
  Link2,
  Unlink,
  AtSign,
} from 'lucide-react';
import {
  auth,
  googleProvider,
  signInWithPopup,
  signInWithCustomToken,
  signOut,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  sendPasswordResetEmail,
  sendEmailVerification,
  updateProfile,
  updatePassword,
  reauthenticateWithCredential,
  reauthenticateWithPopup,
  EmailAuthProvider,
  User as FirebaseUser,
} from '../firebase';
import { RaffleSettings, Participant, Winner, LegalDocumentSlug } from '../types';
import {
  evaluatePassphrase,
  getGenericAuthErrorMessage,
  getThrottleState,
  recordFailedAttempt,
  resetThrottleState,
} from '../utils/authSecurity';
import { recordDocumentAcceptance } from '../utils/legalAndComplianceService';

interface AccountModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentUser: FirebaseUser | null;
  syncStatus: 'synced' | 'saving' | 'offline' | 'error';
  onSaveToCloud: () => Promise<void>;
  onLoadFromCloud: () => Promise<void>;
  settings: RaffleSettings;
  participants: Participant[];
  winners: Winner[];
  onOpenLegalDocument?: (slug: LegalDocumentSlug) => void;
}

type AuthViewMode = 'login' | 'register' | 'forgot_password';

export const AccountModal: React.FC<AccountModalProps> = ({
  isOpen,
  onClose,
  currentUser,
  syncStatus,
  onSaveToCloud,
  onLoadFromCloud,
  onOpenLegalDocument,
}) => {
  const [viewMode, setViewMode] = useState<AuthViewMode>('login');
  const [acceptedTermsOnRegister, setAcceptedTermsOnRegister] = useState(false);

  // Form Fields
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  // Sensitive Step-Up Action State (Password Change)
  const [showChangePassword, setShowChangePassword] = useState(false);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmNewPassword, setConfirmNewPassword] = useState('');
  const [showNewPassword, setShowNewPassword] = useState(false);

  // Operation States
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Phase 11: TikTok Login (Flow 1), @username Visual Lookup, and Account Linking (Flow 2)
  const [showUsernameLookup, setShowUsernameLookup] = useState(false);
  const [visualTikTokUsername, setVisualTikTokUsername] = useState('');
  const [usernameLookupNotice, setUsernameLookupNotice] = useState<string | null>(null);

  const [linkedTikTokProfile, setLinkedTikTokProfile] = useState<{
    linked: boolean;
    openId: string | null;
    displayName?: string;
    avatarUrl?: string;
    username?: string;
    scope?: string | null;
  }>({ linked: false, openId: null });
  const [showLinkStepUpModal, setShowLinkStepUpModal] = useState(false);
  const [linkReauthPassword, setLinkReauthPassword] = useState('');
  const [tiktokLoading, setTiktokLoading] = useState(false);

  // Rate Limiting / Throttle Countdown
  const [throttleRemaining, setThrottleRemaining] = useState<number>(0);

  const initialInputRef = useRef<HTMLInputElement>(null);

  // Fetch linked TikTok identity status when authenticated user opens modal
  useEffect(() => {
    if (!isOpen || !currentUser) {
      setLinkedTikTokProfile({ linked: false, openId: null });
      return;
    }

    let cancelled = false;
    (async () => {
      try {
        const idToken = await currentUser.getIdToken();
        const res = await fetch('/api/tiktok/auth/identity', {
          headers: { Authorization: `Bearer ${idToken}` },
        });
        const data = await res.json().catch(() => ({}));
        if (!cancelled && res.ok && data.linked) {
          setLinkedTikTokProfile({
            linked: true,
            openId: data.openId || null,
            displayName: data.profile?.display_name || currentUser.displayName || 'Criador TikTok',
            avatarUrl: data.profile?.avatar_url || currentUser.photoURL || '',
            username: data.profile?.username || undefined,
            scope: data.scope || 'user.info.basic',
          });
          return;
        }
        if (!cancelled && currentUser.uid.startsWith('gio_tt_')) {
          setLinkedTikTokProfile({
            linked: true,
            openId: 'Verificado via TikTok OAuth',
            displayName: currentUser.displayName || 'Criador TikTok',
            avatarUrl: currentUser.photoURL || '',
            scope: 'user.info.basic',
          });
        }
      } catch {
        // Ignore transient status fetch error
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [isOpen, currentUser]);

  // Listen for TikTok OAuth popup callback messages (Flow 1 LOGIN & Flow 2 LINK)
  useEffect(() => {
    if (!isOpen) return;

    const handlePopupMessage = async (event: MessageEvent) => {
      if (event.origin !== window.location.origin) return;
      const payload = event.data;
      if (!payload || typeof payload !== 'object' || payload.provider !== 'tiktok') return;

      if (payload.type === 'OAUTH_AUTH_ERROR') {
        setTiktokLoading(false);
        setErrorMsg(
          String(payload.error || 'Não foi possível concluir a autenticação com o TikTok.')
        );
        return;
      }

      if (payload.type === 'OAUTH_AUTH_SUCCESS') {
        try {
          if (payload.flowMode === 'LINK') {
            setLinkedTikTokProfile({
              linked: true,
              openId: payload.user?.open_id || null,
              displayName: payload.user?.display_name || 'Criador TikTok',
              avatarUrl: payload.user?.avatar_url || '',
              username: payload.user?.username || undefined,
              scope: payload.scope || 'user.info.basic',
            });
            setShowLinkStepUpModal(false);
            setLinkReauthPassword('');
            setSuccessMsg(
              'Conta TikTok vinculada com sucesso à sua conta GIO da Sorte!'
            );
          } else {
            // Flow 1: LOGIN with Firebase Custom Token issued by backend
            if (payload.firebaseCustomToken) {
              await signInWithCustomToken(auth, String(payload.firebaseCustomToken));
              resetThrottleState();
              setSuccessMsg('Autenticado com sucesso via TikTok OAuth 2.0!');
            } else {
              setErrorMsg(
                'O servidor não retornou o token de sessão Firebase após a validação do TikTok.'
              );
            }
          }
        } catch (err) {
          const msg = getGenericAuthErrorMessage(err, 'login');
          setErrorMsg(msg || 'Falha ao estabelecer sessão Firebase após login com TikTok.');
        } finally {
          setTiktokLoading(false);
        }
      }
    };

    window.addEventListener('message', handlePopupMessage);
    return () => window.removeEventListener('message', handlePopupMessage);
  }, [isOpen]);

  // Check rate limit on mount and run timer
  useEffect(() => {
    if (!isOpen) return;

    const checkThrottle = () => {
      const state = getThrottleState();
      setThrottleRemaining(state.isThrottled ? state.remainingSeconds : 0);
    };

    checkThrottle();
    const timer = setInterval(() => {
      setThrottleRemaining((prev) => {
        if (prev <= 1) return 0;
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [isOpen]);

  // Focus initial field on view change
  useEffect(() => {
    if (isOpen) {
      setErrorMsg(null);
      setSuccessMsg(null);
      setTimeout(() => {
        initialInputRef.current?.focus();
      }, 50);
    }
  }, [isOpen, viewMode, currentUser]);

  // Close on ESC key
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  // Clear credentials from memory
  const clearForm = () => {
    setPassword('');
    setCurrentPassword('');
    setNewPassword('');
    setConfirmNewPassword('');
  };

  // 1. Login with Email & Password
  const handleEmailLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (throttleRemaining > 0) return;

    const cleanEmail = email.trim();
    if (!cleanEmail || !password) {
      setErrorMsg('Preencha seu e-mail e sua senha.');
      return;
    }

    setLoading(true);
    setErrorMsg(null);
    setSuccessMsg(null);

    try {
      await signInWithEmailAndPassword(auth, cleanEmail, password);
      resetThrottleState();
      clearForm();
      setSuccessMsg('Login efetuado com sucesso!');
      setTimeout(() => setSuccessMsg(null), 3000);
    } catch (err) {
      const throttle = recordFailedAttempt();
      if (throttle.isThrottled) {
        setThrottleRemaining(throttle.remainingSeconds);
      }
      const genericMsg = getGenericAuthErrorMessage(err, 'login');
      setErrorMsg(genericMsg);
    } finally {
      setLoading(false);
      setPassword(''); // Immediate memory zeroing
    }
  };

  // 2. Register Account with Email & Password
  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanEmail = email.trim();
    const cleanName = displayName.trim();

    if (!cleanEmail) {
      setErrorMsg('Informe um endereço de e-mail válido.');
      return;
    }

    const passEval = evaluatePassphrase(password);
    if (!passEval.isValid) {
      setErrorMsg(passEval.feedback);
      return;
    }

    if (!acceptedTermsOnRegister) {
      setErrorMsg('Você precisa ler e aceitar os Termos de Uso e a Política de Privacidade para criar sua conta.');
      return;
    }

    setLoading(true);
    setErrorMsg(null);
    setSuccessMsg(null);

    try {
      const credential = await createUserWithEmailAndPassword(auth, cleanEmail, password);
      if (cleanName && credential.user) {
        await updateProfile(credential.user, { displayName: cleanName });
      }
      if (credential.user) {
        await Promise.all([
          recordDocumentAcceptance({
            userId: credential.user.uid,
            userEmail: cleanEmail,
            documentId: 'termos-de-uso',
            version: '1.0.0',
            context: 'CADASTRO',
          }),
          recordDocumentAcceptance({
            userId: credential.user.uid,
            userEmail: cleanEmail,
            documentId: 'politica-de-privacidade',
            version: '1.0.0',
            context: 'CADASTRO',
          }),
        ]).catch(() => {});

        try {
          await sendEmailVerification(credential.user);
        } catch {
          // Non-blocking notice
        }
      }
      resetThrottleState();
      clearForm();
      setSuccessMsg('Conta criada com sucesso e aceite dos Termos registrado! Um link de verificação foi enviado para o seu e-mail.');
      setTimeout(() => setSuccessMsg(null), 4000);
    } catch (err) {
      const genericMsg = getGenericAuthErrorMessage(err, 'register');
      setErrorMsg(genericMsg);
    } finally {
      setLoading(false);
      setPassword(''); // Immediate memory zeroing
    }
  };

  // 3. Request Password Reset Link (Anti-Enumeration Compliant)
  const handleForgotPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanEmail = email.trim();

    if (!cleanEmail) {
      setErrorMsg('Informe o e-mail cadastrado para enviarmos as instruções.');
      return;
    }

    setLoading(true);
    setErrorMsg(null);
    setSuccessMsg(null);

    try {
      await sendPasswordResetEmail(auth, cleanEmail);
      // Standard anti-enumeration response
      setSuccessMsg(
        'Se houver uma conta associada a este e-mail, as instruções de redefinição foram enviadas para a sua caixa de entrada. Verifique também a pasta de spam.'
      );
    } catch (err) {
      // Return anti-enumeration message even on error
      const msg = getGenericAuthErrorMessage(err, 'reset');
      setSuccessMsg(msg || 'Instruções enviadas com sucesso.');
    } finally {
      setLoading(false);
    }
  };

  // 4. Google OAuth Sign-In
  const handleGoogleSignIn = async () => {
    setLoading(true);
    setErrorMsg(null);
    setSuccessMsg(null);

    try {
      await signInWithPopup(auth, googleProvider);
      resetThrottleState();
      setSuccessMsg('Conectado via Google com sucesso!');
      setTimeout(() => setSuccessMsg(null), 3000);
    } catch (err) {
      const genericMsg = getGenericAuthErrorMessage(err, 'login');
      if (genericMsg) setErrorMsg(genericMsg);
    } finally {
      setLoading(false);
    }
  };

  // 5. Operation 1 — Logout GIO (Ends only browser session; preserves TikTok authorization & active LIVE workers)
  const handleSignOut = async () => {
    setLoading(true);
    setErrorMsg(null);
    setSuccessMsg(null);

    try {
      if (currentUser) {
        const idToken = await currentUser.getIdToken().catch(() => '');
        if (idToken) {
          await fetch('/api/auth/gio-logout', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${idToken}`,
            },
            body: JSON.stringify({}),
          }).catch(() => {});
        }
      }
      await signOut(auth);
      clearForm();
      setShowChangePassword(false);
      setShowLinkStepUpModal(false);
      setLinkedTikTokProfile({ linked: false, openId: null });
      setSuccessMsg(
        'Sessão GIO encerrada neste navegador. Autorização TikTok e workers de LIVE ativos e autorizados foram preservados.'
      );
      setTimeout(() => setSuccessMsg(null), 3500);
    } catch {
      setErrorMsg('Não foi possível encerrar a sessão no momento.');
    } finally {
      setLoading(false);
    }
  };

  // 5B. Phase 11 — Flow 1: First Access / Login with TikTok OAuth 2.0
  const handleTikTokLoginOAuth = async () => {
    setTiktokLoading(true);
    setErrorMsg(null);
    setSuccessMsg(null);

    try {
      const res = await fetch('/api/tiktok/auth/login/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.url) {
        setErrorMsg(
          data.error ||
            'Não foi possível iniciar o login com TikTok OAuth 2.0. Verifique as credenciais no servidor.'
        );
        setTiktokLoading(false);
        return;
      }

      window.location.assign(data.url);
    } catch {
      setErrorMsg('Erro de conexão ao iniciar autenticação oficial com o TikTok.');
      setTiktokLoading(false);
    }
  };

  // 5C. Phase 11 — Secondary @username Visual Lookup (Requires Official OAuth to Authenticate)
  const handleUsernameVisualLookup = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanHandle = visualTikTokUsername.replace(/^@/, '').trim();
    if (!cleanHandle) {
      setErrorMsg('Informe seu @usuário do TikTok para identificação visual.');
      return;
    }

    setErrorMsg(null);
    try {
      const res = await fetch('/api/tiktok/auth/username-login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: cleanHandle }),
      });
      const data = await res.json().catch(() => ({}));
      setUsernameLookupNotice(
        data.error ||
          `Perfil @${cleanHandle} identificado visualmente. Por segurança, @usuário nunca autentica sozinho: clique abaixo para confirmar a propriedade via TikTok OAuth oficial.`
      );
    } catch {
      setUsernameLookupNotice(
        `Perfil @${cleanHandle} selecionado. Conclua a verificação via TikTok OAuth oficial para entrar.`
      );
    }
  };

  // 5D. Phase 11.1 — Flow 2: Link TikTok to Existing GIO Account (Cryptographic Step-Up Reauthentication)
  // After Firebase `reauthenticateWithCredential` or `reauthenticateWithPopup`, `getIdToken(true)` forces
  // Firebase to mint a fresh ID Token with updated `auth_time` and `firebase.sign_in_provider`, which the
  // backend verifies cryptographically without trusting client boolean flags.
  const startAuthenticatedTikTokLinkFlow = async () => {
    if (!currentUser) return;
    const freshIdToken = await currentUser.getIdToken(true);
    const res = await fetch('/api/tiktok/auth/link/start', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${freshIdToken}`,
      },
      body: JSON.stringify({
        reauthIdToken: freshIdToken,
      }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data.url) {
      throw new Error(
        data.error || 'Não foi possível iniciar a vinculação da conta TikTok.'
      );
    }
    window.location.assign(data.url);
  };

  const handleLinkWithPasswordReauth = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentUser || !currentUser.email) return;
    if (!linkReauthPassword) {
      setErrorMsg('Confirme sua senha atual para autorizar a vinculação do TikTok.');
      return;
    }

    setTiktokLoading(true);
    setErrorMsg(null);
    setSuccessMsg(null);

    try {
      const cred = EmailAuthProvider.credential(currentUser.email, linkReauthPassword);
      await reauthenticateWithCredential(currentUser, cred);
      setLinkReauthPassword('');
      await startAuthenticatedTikTokLinkFlow();
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Falha na confirmação de senha.';
      setErrorMsg(msg);
      setTiktokLoading(false);
    }
  };

  const handleLinkWithGoogleReauth = async () => {
    if (!currentUser) return;
    setTiktokLoading(true);
    setErrorMsg(null);
    setSuccessMsg(null);

    try {
      await reauthenticateWithPopup(currentUser, googleProvider);
      await startAuthenticatedTikTokLinkFlow();
    } catch (err) {
      const msg =
        err instanceof Error
          ? err.message
          : 'Falha na confirmação Google Auth para vincular TikTok.';
      setErrorMsg(msg);
      setTiktokLoading(false);
    }
  };

  // 5E. Operation 2 — Desvinculação TikTok (Revokes tokens & stops dependent tasks; preserves GIO account & raffle history)
  const handleUnlinkTikTok = async () => {
    if (!currentUser) return;
    setTiktokLoading(true);
    setErrorMsg(null);
    setSuccessMsg(null);

    try {
      const idToken = await currentUser.getIdToken();
      const res = await fetch('/api/tiktok/auth/unlink', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${idToken}`,
        },
        body: JSON.stringify({}),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setErrorMsg(data.error || 'Não foi possível desconectar a conta TikTok.');
        return;
      }
      setLinkedTikTokProfile({ linked: false, openId: null });
      setSuccessMsg(
        'Conta TikTok desvinculada e tokens revogados com sucesso! Tarefas dependentes foram encerradas e sua conta GIO, configurações e histórico de sorteios foram preservados.'
      );
    } catch {
      setErrorMsg('Erro ao desvincular conta TikTok.');
    } finally {
      setTiktokLoading(false);
    }
  };

  // 6. Sensitive Step-Up Operation: Change Password with Current Password Re-Auth
  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentUser || !currentUser.email) return;

    if (!currentPassword) {
      setErrorMsg('Digite sua senha atual para autorizar esta alteração sensível.');
      return;
    }

    const passEval = evaluatePassphrase(newPassword);
    if (!passEval.isValid) {
      setErrorMsg(`Nova senha inválida: ${passEval.feedback}`);
      return;
    }

    if (newPassword !== confirmNewPassword) {
      setErrorMsg('A confirmação não coincide com a nova senha.');
      return;
    }

    setLoading(true);
    setErrorMsg(null);
    setSuccessMsg(null);

    try {
      // Step-up verification: Re-authenticate with current credentials
      const credential = EmailAuthProvider.credential(currentUser.email, currentPassword);
      await reauthenticateWithCredential(currentUser, credential);

      // Perform protected password update
      await updatePassword(currentUser, newPassword);

      setCurrentPassword('');
      setNewPassword('');
      setConfirmNewPassword('');
      setShowChangePassword(false);
      setSuccessMsg('Senha atualizada com sucesso! Todas as sessões anteriores foram invalidadas.');
      setTimeout(() => setSuccessMsg(null), 4000);
    } catch (err) {
      const genericMsg = getGenericAuthErrorMessage(err, 'sensitive');
      setErrorMsg(genericMsg);
    } finally {
      setLoading(false);
      setCurrentPassword('');
      setNewPassword('');
      setConfirmNewPassword('');
    }
  };

  // 7. Send Verification Email
  const handleSendVerificationEmail = async () => {
    if (!currentUser) return;
    setLoading(true);
    setErrorMsg(null);
    setSuccessMsg(null);

    try {
      await sendEmailVerification(currentUser);
      setSuccessMsg('E-mail de confirmação enviado! Verifique sua caixa de entrada.');
      setTimeout(() => setSuccessMsg(null), 4000);
    } catch (err) {
      const genericMsg = getGenericAuthErrorMessage(err, 'sensitive');
      setErrorMsg(genericMsg);
    } finally {
      setLoading(false);
    }
  };

  // 8. Manual Cloud Sync Actions
  const handleManualSave = async () => {
    setLoading(true);
    setErrorMsg(null);
    try {
      await onSaveToCloud();
      setSuccessMsg('Todos os participantes e configurações foram salvos na sua conta na nuvem!');
      setTimeout(() => setSuccessMsg(null), 3000);
    } catch {
      setErrorMsg('Não foi possível salvar na nuvem neste momento.');
    } finally {
      setLoading(false);
    }
  };

  const handleManualLoad = async () => {
    setLoading(true);
    setErrorMsg(null);
    try {
      await onLoadFromCloud();
      setSuccessMsg('Dados sincronizados da nuvem com sucesso!');
      setTimeout(() => setSuccessMsg(null), 3000);
    } catch {
      setErrorMsg('Nenhum dado encontrado na sua conta na nuvem.');
    } finally {
      setLoading(false);
    }
  };

  const registrationPassEvaluation = evaluatePassphrase(password);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="account-modal-title"
      className="fixed inset-0 z-50 bg-[#050D20]/85 backdrop-blur-md flex items-center justify-center p-4 overflow-y-auto animate-fade-in"
    >
      <div className="bg-[#0B1730] border border-[#182943] rounded-2xl max-w-md w-full p-6 shadow-2xl space-y-5 animate-slide-up my-8">
        {/* Header with Official Logo */}
        <div className="flex items-center justify-between pb-3 border-b border-[#182943]">
          <div className="flex items-center gap-2.5">
            <img
              src="/icon.svg"
              alt="GIO DA SORTE"
              className="w-10 h-10 object-contain shrink-0 drop-shadow-[0_0_8px_rgba(0,169,255,0.35)]"
            />
            <div>
              <h2 id="account-modal-title" className="font-display font-bold text-base sm:text-lg text-[#F8FAFC]">
                {currentUser
                  ? 'Minha Conta — GIO DA SORTE'
                  : viewMode === 'login'
                  ? 'Entrar no GIO DA SORTE'
                  : viewMode === 'register'
                  ? 'Criar Conta — GIO DA SORTE'
                  : 'Recuperação de Acesso'}
              </h2>
              <span className="text-[11px] text-[#94A3B8] block">
                {currentUser ? 'Perfil Seguro & Sincronização em Nuvem' : 'Acesso autenticado e protegido'}
              </span>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Fechar modal"
            className="p-1.5 text-[#94A3B8] hover:text-[#F8FAFC] rounded-lg transition hover:bg-[#101F3D] focus:outline-none focus:ring-2 focus:ring-[#00A9FF]"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Global Feedback Messages */}
        {successMsg && (
          <div
            role="status"
            aria-live="polite"
            className="p-3 bg-[#20C997]/15 border border-[#20C997]/40 rounded-xl text-xs text-[#20C997] flex items-start gap-2.5 animate-in fade-in"
          >
            <CheckCircle2 className="w-4 h-4 text-[#20C997] shrink-0 mt-0.5" />
            <span className="leading-relaxed">{successMsg}</span>
          </div>
        )}

        {errorMsg && (
          <div
            role="alert"
            aria-live="assertive"
            className="p-3 bg-[#F05262]/15 border border-[#F05262]/40 rounded-xl text-xs text-[#F05262] flex items-start gap-2.5 animate-in fade-in"
          >
            <AlertCircle className="w-4 h-4 text-[#F05262] shrink-0 mt-0.5" />
            <span className="leading-relaxed">{errorMsg}</span>
          </div>
        )}

        {/* LOGGED IN USER VIEW */}
        {currentUser ? (
          <div className="space-y-4">
            {/* User Profile Card */}
            <div className="bg-[#101F3D] border border-[#182943] p-4 rounded-xl flex items-center gap-3.5">
              {currentUser.photoURL ? (
                <img
                  src={currentUser.photoURL}
                  alt={currentUser.displayName || 'Avatar do usuário'}
                  referrerPolicy="no-referrer"
                  className="w-12 h-12 rounded-full border-2 border-[#00A9FF]/50 shadow-md object-cover"
                />
              ) : (
                <div className="w-12 h-12 rounded-full bg-gradient-to-br from-[#0866F5] to-[#00A9FF] text-[#F8FAFC] font-bold flex items-center justify-center text-lg border border-[#35B9F5]/40">
                  {currentUser.displayName ? currentUser.displayName[0].toUpperCase() : 'S'}
                </div>
              )}

              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="font-bold text-[#F8FAFC] text-base truncate">
                    {currentUser.displayName || 'Sorteador Autenticado'}
                  </span>
                </div>
                <div className="text-xs text-[#94A3B8] truncate">{currentUser.email}</div>
                <div className="flex items-center gap-2 mt-1">
                  {currentUser.emailVerified ? (
                    <span className="inline-flex items-center gap-1 text-[11px] text-[#20C997] font-semibold bg-[#20C997]/15 border border-[#20C997]/40 px-2 py-0.5 rounded-full">
                      <Check className="w-3 h-3" /> E-mail Verificado
                    </span>
                  ) : (
                    <button
                      type="button"
                      onClick={handleSendVerificationEmail}
                      disabled={loading}
                      className="inline-flex items-center gap-1 text-[11px] text-[#F5B942] hover:brightness-110 font-semibold bg-[#F5B942]/15 border border-[#F5B942]/40 px-2 py-0.5 rounded-full transition"
                    >
                      <ShieldAlert className="w-3 h-3" /> Verificar E-mail
                    </button>
                  )}
                </div>
              </div>

              <button
                type="button"
                onClick={handleSignOut}
                disabled={loading}
                title="Desconectar da conta"
                aria-label="Desconectar da conta"
                className="p-2 text-[#94A3B8] hover:text-[#F05262] hover:bg-[#050D20] rounded-lg transition"
              >
                <LogOut className="w-5 h-5" />
              </button>
            </div>

            {/* Cloud Sync Status */}
            <div className="bg-[#050D20] border border-[#0866F5]/40 rounded-xl p-3.5 text-xs text-[#F8FAFC] flex items-start gap-2.5">
              <Cloud className="w-4 h-4 text-[#00A9FF] shrink-0 mt-0.5" />
              <div>
                <span className="font-bold text-[#F8FAFC] block">Sincronização Segura em Nuvem</span>
                <span className="text-[#94A3B8]">
                  Seus participantes e configurações são salvos com controle de acesso exclusivo para a sua conta.
                </span>
              </div>
            </div>

            {/* Cloud Actions */}
            <div className="grid grid-cols-2 gap-2.5">
              <button
                type="button"
                disabled={loading}
                onClick={handleManualSave}
                className="py-2.5 px-3 rounded-xl bg-[#0866F5] hover:bg-[#00A9FF] text-[#F8FAFC] font-bold text-xs flex items-center justify-center gap-1.5 transition shadow-md shadow-[#0866F5]/30 active:scale-95 disabled:opacity-50"
              >
                <Cloud className="w-4 h-4" />
                <span>Salvar na Nuvem</span>
              </button>

              <button
                type="button"
                disabled={loading}
                onClick={handleManualLoad}
                className="py-2.5 px-3 rounded-xl bg-[#101F3D] hover:bg-[#182943] text-[#F8FAFC] font-bold text-xs flex items-center justify-center gap-1.5 transition border border-[#182943] active:scale-95 disabled:opacity-50"
              >
                <RefreshCw className="w-4 h-4 text-[#00A9FF]" />
                <span>Recarregar da Nuvem</span>
              </button>
            </div>

            {/* Phase 11: Linked TikTok Identity Management (Flow 2 Link & Unlink) */}
            <div className="bg-[#101F3D] border border-[#182943] rounded-xl p-3.5 space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Link2 className="w-4 h-4 text-[#00A9FF]" />
                  <span className="text-xs font-bold text-[#F8FAFC]">
                    Identidade TikTok OAuth 2.0
                  </span>
                </div>
                <span
                  className={`text-[10px] font-bold px-2 py-0.5 rounded-md border ${
                    linkedTikTokProfile.linked
                      ? 'bg-[#20C997]/15 text-[#20C997] border-[#20C997]/40'
                      : 'bg-[#050D20] text-[#94A3B8] border-[#182943]'
                  }`}
                >
                  {linkedTikTokProfile.linked ? 'VINCULADA' : 'NÃO VINCULADA'}
                </span>
              </div>

              {linkedTikTokProfile.linked ? (
                <div className="space-y-2.5">
                  <div className="bg-[#050D20] border border-[#182943] rounded-lg p-2.5 flex items-center justify-between gap-2">
                    <div className="min-w-0">
                      <div className="text-xs font-bold text-[#F8FAFC] truncate">
                        {linkedTikTokProfile.displayName || 'Criador TikTok'}
                        {linkedTikTokProfile.username
                          ? ` (@${linkedTikTokProfile.username.replace(/^@/, '')})`
                          : ''}
                      </div>
                      <div className="text-[11px] text-[#94A3B8] truncate">
                        open_id verificado • Escopo: {linkedTikTokProfile.scope || 'user.info.basic'}
                      </div>
                    </div>
                    <button
                      type="button"
                      disabled={tiktokLoading || loading}
                      onClick={handleUnlinkTikTok}
                      className="px-2.5 py-1.5 rounded-lg bg-[#F05262]/15 hover:bg-[#F05262]/25 border border-[#F05262]/40 text-[#F05262] text-[11px] font-bold flex items-center gap-1 transition shrink-0 disabled:opacity-50"
                    >
                      <Unlink className="w-3.5 h-3.5" />
                      <span>Desconectar TikTok</span>
                    </button>
                  </div>
                  <p className="text-[11px] text-[#94A3B8] leading-relaxed">
                    Desconectar o TikTok revoga os tokens OAuth sem excluir sua conta GIO nem interromper sorteios ou workers de LIVE ativos.
                  </p>
                </div>
              ) : !showLinkStepUpModal ? (
                <div className="space-y-2">
                  <p className="text-[11px] text-[#94A3B8] leading-relaxed">
                    Vincule sua conta oficial do TikTok a esta conta GIO para entrar com 1 clique mantendo seus sorteios e plano.
                  </p>
                  <button
                    type="button"
                    disabled={tiktokLoading || loading}
                    onClick={() => {
                      setShowLinkStepUpModal(true);
                      setErrorMsg(null);
                    }}
                    className="w-full py-2 px-3 rounded-lg bg-[#0866F5] hover:bg-[#00A9FF] text-[#F8FAFC] font-bold text-xs flex items-center justify-center gap-1.5 transition"
                  >
                    <Link2 className="w-3.5 h-3.5" />
                    <span>Vincular Conta TikTok (Exige Confirmação)</span>
                  </button>
                </div>
              ) : (
                <div className="bg-[#050D20] border border-[#00A9FF]/40 rounded-lg p-3 space-y-2.5">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-[#F8FAFC] flex items-center gap-1.5">
                      <ShieldCheck className="w-3.5 h-3.5 text-[#00A9FF]" />
                      Confirmação de Segurança Obrigatória
                    </span>
                    <button
                      type="button"
                      onClick={() => {
                        setShowLinkStepUpModal(false);
                        setLinkReauthPassword('');
                      }}
                      className="text-[11px] text-[#94A3B8] hover:text-[#F8FAFC]"
                    >
                      Cancelar
                    </button>
                  </div>
                  <p className="text-[11px] text-[#94A3B8] leading-relaxed">
                    Por segurança, confirme sua identidade atual (Senha ou Google Auth) antes de vincular um perfil do TikTok. Contas TikTok já vinculadas a outro usuário são bloqueadas.
                  </p>
                  {currentUser.email && (
                    <form onSubmit={handleLinkWithPasswordReauth} className="space-y-2">
                      <input
                        type="password"
                        value={linkReauthPassword}
                        onChange={(e) => setLinkReauthPassword(e.target.value)}
                        placeholder="Digite sua senha atual para confirmar"
                        className="w-full px-3 py-2 text-xs bg-[#101F3D] border border-[#182943] rounded-lg text-[#F8FAFC] placeholder-[#64748B] focus:outline-none focus:ring-2 focus:ring-[#00A9FF]"
                      />
                      <button
                        type="submit"
                        disabled={tiktokLoading}
                        className="w-full py-2 px-3 rounded-lg bg-[#0866F5] hover:bg-[#00A9FF] text-[#F8FAFC] font-bold text-xs transition disabled:opacity-50"
                      >
                        {tiktokLoading ? 'Verificando...' : 'Confirmar Senha e Abrir TikTok OAuth'}
                      </button>
                    </form>
                  )}
                  <button
                    type="button"
                    disabled={tiktokLoading}
                    onClick={handleLinkWithGoogleReauth}
                    className="w-full py-2 px-3 rounded-lg bg-[#101F3D] hover:bg-[#182943] border border-[#182943] text-[#F8FAFC] font-semibold text-xs transition disabled:opacity-50"
                  >
                    Confirmar com Google Auth e Vincular TikTok
                  </button>
                </div>
              )}
            </div>

            {/* Sensitive Action: Change Password (Step-up Verification) */}
            <div className="pt-2 border-t border-[#182943]">
              {!showChangePassword ? (
                <button
                  type="button"
                  onClick={() => setShowChangePassword(true)}
                  className="w-full py-2 px-3 text-xs font-semibold text-[#94A3B8] hover:text-[#F8FAFC] bg-[#050D20] hover:bg-[#101F3D] border border-[#182943] rounded-xl flex items-center justify-center gap-2 transition"
                >
                  <KeyRound className="w-4 h-4 text-[#00A9FF]" />
                  <span>Alterar Senha de Acesso (Verificação em 2 Etapas)</span>
                </button>
              ) : (
                <form onSubmit={handleChangePassword} className="bg-[#050D20] border border-[#182943] p-4 rounded-xl space-y-3">
                  <div className="flex items-center justify-between pb-1">
                    <span className="text-xs font-bold text-[#F8FAFC] flex items-center gap-1.5">
                      <KeyRound className="w-3.5 h-3.5 text-[#00A9FF]" />
                      Alterar Senha (Requer Senha Atual)
                    </span>
                    <button
                      type="button"
                      onClick={() => {
                        setShowChangePassword(false);
                        setCurrentPassword('');
                        setNewPassword('');
                        setConfirmNewPassword('');
                      }}
                      className="text-[11px] text-[#94A3B8] hover:text-[#F8FAFC]"
                    >
                      Cancelar
                    </button>
                  </div>

                  <div>
                    <label htmlFor="current-password-input" className="block text-[11px] font-medium text-[#94A3B8] mb-1">
                      Senha Atual (Verificação de Segurança)
                    </label>
                    <input
                      id="current-password-input"
                      type="password"
                      autoComplete="current-password"
                      required
                      value={currentPassword}
                      onChange={(e) => setCurrentPassword(e.target.value)}
                      placeholder="Sua senha atual"
                      className="w-full px-3 py-2 text-xs bg-[#101F3D] border border-[#182943] rounded-lg text-[#F8FAFC] placeholder-[#64748B] focus:outline-none focus:ring-2 focus:ring-[#00A9FF]"
                    />
                  </div>

                  <div>
                    <label htmlFor="new-password-input" className="block text-[11px] font-medium text-[#94A3B8] mb-1">
                      Nova Senha ou Frase-Senha (Mín. 8 caracteres)
                    </label>
                    <div className="relative">
                      <input
                        id="new-password-input"
                        type={showNewPassword ? 'text' : 'password'}
                        autoComplete="new-password"
                        required
                        value={newPassword}
                        onChange={(e) => setNewPassword(e.target.value)}
                        placeholder="Nova senha ou frase longa"
                        className="w-full px-3 py-2 pr-9 text-xs bg-[#101F3D] border border-[#182943] rounded-lg text-[#F8FAFC] placeholder-[#64748B] focus:outline-none focus:ring-2 focus:ring-[#00A9FF]"
                      />
                      <button
                        type="button"
                        onClick={() => setShowNewPassword(!showNewPassword)}
                        aria-label={showNewPassword ? 'Ocultar nova senha' : 'Exibir nova senha'}
                        className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[#94A3B8] hover:text-[#F8FAFC]"
                      >
                        {showNewPassword ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                      </button>
                    </div>
                  </div>

                  <div>
                    <label htmlFor="confirm-new-password-input" className="block text-[11px] font-medium text-[#94A3B8] mb-1">
                      Confirmar Nova Senha
                    </label>
                    <input
                      id="confirm-new-password-input"
                      type="password"
                      autoComplete="new-password"
                      required
                      value={confirmNewPassword}
                      onChange={(e) => setConfirmNewPassword(e.target.value)}
                      placeholder="Repita a nova senha"
                      className="w-full px-3 py-2 text-xs bg-[#101F3D] border border-[#182943] rounded-lg text-[#F8FAFC] placeholder-[#64748B] focus:outline-none focus:ring-2 focus:ring-[#00A9FF]"
                    />
                  </div>

                  <button
                    type="submit"
                    disabled={loading}
                    className="w-full py-2 px-3 bg-[#0866F5] hover:bg-[#00A9FF] text-[#F8FAFC] font-bold text-xs rounded-lg transition disabled:opacity-50"
                  >
                    Confirmar e Atualizar Senha
                  </button>
                </form>
              )}
            </div>
          </div>
        ) : (
          /* UNATHENTICATED VIEWS: LOGIN / REGISTER / FORGOT */
          <div className="space-y-4">
            {/* View Selector Tabs (Login vs Register) */}
            {viewMode !== 'forgot_password' && (
              <div className="grid grid-cols-2 p-1 bg-[#050D20] border border-[#182943] rounded-xl text-xs font-bold">
                <button
                  type="button"
                  onClick={() => {
                    setViewMode('login');
                    setErrorMsg(null);
                    setSuccessMsg(null);
                  }}
                  className={`py-2 rounded-lg transition ${
                    viewMode === 'login'
                      ? 'bg-[#0866F5] text-[#F8FAFC] shadow-sm'
                      : 'text-[#94A3B8] hover:text-[#F8FAFC]'
                  }`}
                >
                  Entrar
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setViewMode('register');
                    setErrorMsg(null);
                    setSuccessMsg(null);
                  }}
                  className={`py-2 rounded-lg transition ${
                    viewMode === 'register'
                      ? 'bg-[#0866F5] text-[#F8FAFC] shadow-sm'
                      : 'text-[#94A3B8] hover:text-[#F8FAFC]'
                  }`}
                >
                  Criar Conta
                </button>
              </div>
            )}

            {/* 1. LOGIN FORM */}
            {viewMode === 'login' && (
              <form onSubmit={handleEmailLogin} className="space-y-3.5">
                <div>
                  <label htmlFor="login-email" className="block text-xs font-medium text-[#94A3B8] mb-1">
                    E-mail
                  </label>
                  <div className="relative">
                    <input
                      ref={initialInputRef}
                      id="login-email"
                      type="email"
                      autoComplete="email"
                      required
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="seu.email@exemplo.com"
                      className="w-full pl-9 pr-3 py-2.5 text-sm bg-[#050D20] border border-[#182943] rounded-xl text-[#F8FAFC] placeholder-[#64748B] focus:outline-none focus:ring-2 focus:ring-[#00A9FF] focus:border-transparent transition"
                    />
                    <Mail className="w-4 h-4 text-[#64748B] absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                  </div>
                </div>

                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label htmlFor="login-password" className="block text-xs font-medium text-[#94A3B8]">
                      Senha ou Frase-Senha
                    </label>
                    <button
                      type="button"
                      onClick={() => {
                        setViewMode('forgot_password');
                        setErrorMsg(null);
                        setSuccessMsg(null);
                      }}
                      className="text-[11px] text-[#00A9FF] hover:text-[#35B9F5] transition"
                    >
                      Esqueceu a senha?
                    </button>
                  </div>
                  <div className="relative">
                    <input
                      id="login-password"
                      type={showPassword ? 'text' : 'password'}
                      autoComplete="current-password"
                      required
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="••••••••"
                      className="w-full pl-9 pr-10 py-2.5 text-sm bg-[#050D20] border border-[#182943] rounded-xl text-[#F8FAFC] placeholder-[#64748B] focus:outline-none focus:ring-2 focus:ring-[#00A9FF] focus:border-transparent transition"
                    />
                    <Lock className="w-4 h-4 text-[#64748B] absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      aria-label={showPassword ? 'Ocultar senha' : 'Exibir senha'}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-[#94A3B8] hover:text-[#F8FAFC] p-1 rounded transition"
                    >
                      {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>

                {/* Rate limit lock alert */}
                {throttleRemaining > 0 && (
                  <div className="p-2.5 bg-[#F5B942]/15 border border-[#F5B942]/40 rounded-xl text-xs text-[#F5B942] flex items-center gap-2">
                    <Clock className="w-4 h-4 text-[#F5B942] shrink-0" />
                    <span>Aguarde {throttleRemaining}s antes de tentar novamente.</span>
                  </div>
                )}

                <button
                  type="submit"
                  disabled={loading || throttleRemaining > 0}
                  className="w-full py-3 px-4 bg-gradient-to-r from-[#0866F5] to-[#00A9FF] hover:from-[#00A9FF] hover:to-[#35B9F5] text-[#F8FAFC] font-bold text-sm rounded-xl transition shadow-lg shadow-[#0866F5]/30 flex items-center justify-center gap-2 active:scale-95 disabled:opacity-50 cursor-pointer"
                >
                  <Lock className="w-4 h-4" />
                  <span>{loading ? 'Entrando...' : 'Entrar com E-mail'}</span>
                </button>
              </form>
            )}

            {/* 2. REGISTRATION FORM */}
            {viewMode === 'register' && (
              <form onSubmit={handleRegister} className="space-y-3.5">
                <div>
                  <label htmlFor="reg-name" className="block text-xs font-medium text-[#94A3B8] mb-1">
                    Nome ou Canal (Opcional)
                  </label>
                  <div className="relative">
                    <input
                      ref={initialInputRef}
                      id="reg-name"
                      type="text"
                      autoComplete="name"
                      value={displayName}
                      onChange={(e) => setDisplayName(e.target.value)}
                      placeholder="Ex: Gusta Games"
                      className="w-full pl-9 pr-3 py-2.5 text-sm bg-[#050D20] border border-[#182943] rounded-xl text-[#F8FAFC] placeholder-[#64748B] focus:outline-none focus:ring-2 focus:ring-[#00A9FF] focus:border-transparent transition"
                    />
                    <User className="w-4 h-4 text-[#64748B] absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                  </div>
                </div>

                <div>
                  <label htmlFor="reg-email" className="block text-xs font-medium text-[#94A3B8] mb-1">
                    E-mail
                  </label>
                  <div className="relative">
                    <input
                      id="reg-email"
                      type="email"
                      autoComplete="email"
                      required
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="seu.email@exemplo.com"
                      className="w-full pl-9 pr-3 py-2.5 text-sm bg-[#050D20] border border-[#182943] rounded-xl text-[#F8FAFC] placeholder-[#64748B] focus:outline-none focus:ring-2 focus:ring-[#00A9FF] focus:border-transparent transition"
                    />
                    <Mail className="w-4 h-4 text-[#64748B] absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                  </div>
                </div>

                <div>
                  <label htmlFor="reg-password" className="block text-xs font-medium text-[#94A3B8] mb-1">
                    Senha ou Frase-Senha (Mínimo 8 caracteres)
                  </label>
                  <div className="relative">
                    <input
                      id="reg-password"
                      type={showPassword ? 'text' : 'password'}
                      autoComplete="new-password"
                      required
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="Ex: chuva de moedas no gio 2026"
                      className="w-full pl-9 pr-10 py-2.5 text-sm bg-[#050D20] border border-[#182943] rounded-xl text-[#F8FAFC] placeholder-[#64748B] focus:outline-none focus:ring-2 focus:ring-[#00A9FF] focus:border-transparent transition"
                    />
                    <Lock className="w-4 h-4 text-[#64748B] absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      aria-label={showPassword ? 'Ocultar senha' : 'Exibir senha'}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-[#94A3B8] hover:text-[#F8FAFC] p-1 rounded transition"
                    >
                      {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>

                  {/* Passphrase Strength Visualizer */}
                  {password.length > 0 && (
                    <div className="mt-2 space-y-1">
                      <div className="h-1.5 w-full bg-[#182943] rounded-full overflow-hidden flex">
                        <div
                          className={`h-full transition-all duration-300 ${
                            registrationPassEvaluation.score === 0
                              ? 'w-1/4 bg-[#F05262]'
                              : registrationPassEvaluation.score === 1
                              ? 'w-2/4 bg-[#F5B942]'
                              : registrationPassEvaluation.score === 2
                              ? 'w-3/4 bg-[#00A9FF]'
                              : 'w-full bg-[#20C997]'
                          }`}
                        />
                      </div>
                      <div className="flex items-center justify-between text-[11px]">
                        <span
                          className={`font-semibold ${
                            registrationPassEvaluation.score === 0
                              ? 'text-[#F05262]'
                              : registrationPassEvaluation.score === 1
                              ? 'text-[#F5B942]'
                              : registrationPassEvaluation.score === 2
                              ? 'text-[#00A9FF]'
                              : 'text-[#20C997]'
                          }`}
                        >
                          {registrationPassEvaluation.label}
                        </span>
                        <span className="text-[#94A3B8]">{registrationPassEvaluation.feedback}</span>
                      </div>
                    </div>
                  )}
                  <p className="text-[11px] text-[#64748B] mt-1">
                    Você pode usar frases longas com espaços, letras e palavras. Não forçamos regras de caracteres desnecessárias.
                  </p>
                </div>

                {/* Explicit Legal Acceptance Checkbox (Fase 11) */}
                <label className="p-3 rounded-xl bg-[#050D20] border border-[#182943] flex items-start gap-2.5 text-[11px] text-[#94A3B8] cursor-pointer">
                  <input
                    type="checkbox"
                    checked={acceptedTermsOnRegister}
                    onChange={(e) => setAcceptedTermsOnRegister(e.target.checked)}
                    className="mt-0.5 w-4 h-4 accent-[#00A9FF] shrink-0"
                  />
                  <span>
                    Declaro que li e concordo expressamente com os{' '}
                    <button
                      type="button"
                      onClick={() => {
                        onClose();
                        onOpenLegalDocument?.('termos-de-uso');
                      }}
                      className="text-[#00A9FF] underline hover:text-[#F8FAFC] font-semibold"
                    >
                      Termos de Uso
                    </button>{' '}
                    e com a{' '}
                    <button
                      type="button"
                      onClick={() => {
                        onClose();
                        onOpenLegalDocument?.('politica-de-privacidade');
                      }}
                      className="text-[#00A9FF] underline hover:text-[#F8FAFC] font-semibold"
                    >
                      Política de Privacidade (LGPD)
                    </button>{' '}
                    do GIO DA SORTE.
                  </span>
                </label>

                <button
                  type="submit"
                  disabled={loading || (password.length > 0 && !registrationPassEvaluation.isValid)}
                  className="w-full py-3 px-4 bg-gradient-to-r from-[#0866F5] to-[#00A9FF] hover:from-[#00A9FF] hover:to-[#35B9F5] text-[#F8FAFC] font-bold text-sm rounded-xl transition shadow-lg shadow-[#0866F5]/25 flex items-center justify-center gap-2 active:scale-95 disabled:opacity-50 cursor-pointer"
                >
                  <Sparkles className="w-4 h-4" />
                  <span>{loading ? 'Cadastrando...' : 'Criar Conta Segura'}</span>
                </button>
              </form>
            )}

            {/* 3. FORGOT PASSWORD VIEW (Anti-enumeration compliant) */}
            {viewMode === 'forgot_password' && (
              <form onSubmit={handleForgotPassword} className="space-y-3.5">
                <div className="bg-[#050D20] border border-[#0866F5]/40 p-3 rounded-xl text-xs text-[#94A3B8] leading-relaxed">
                  Digite seu e-mail abaixo. Se houver uma conta registrada, enviaremos um link seguro de uso único para redefinir sua senha.
                </div>

                <div>
                  <label htmlFor="reset-email" className="block text-xs font-medium text-[#94A3B8] mb-1">
                    E-mail Cadastrado
                  </label>
                  <div className="relative">
                    <input
                      ref={initialInputRef}
                      id="reset-email"
                      type="email"
                      autoComplete="email"
                      required
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="seu.email@exemplo.com"
                      className="w-full pl-9 pr-3 py-2.5 text-sm bg-[#050D20] border border-[#182943] rounded-xl text-[#F8FAFC] placeholder-[#64748B] focus:outline-none focus:ring-2 focus:ring-[#00A9FF] focus:border-transparent transition"
                    />
                    <Mail className="w-4 h-4 text-[#64748B] absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full py-3 px-4 bg-[#0866F5] hover:bg-[#00A9FF] text-[#F8FAFC] font-bold text-sm rounded-xl transition shadow-md shadow-[#0866F5]/30 flex items-center justify-center gap-2 active:scale-95 disabled:opacity-50 cursor-pointer"
                >
                  <KeyRound className="w-4 h-4" />
                  <span>{loading ? 'Enviando...' : 'Enviar Link de Recuperação'}</span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setViewMode('login');
                    setErrorMsg(null);
                    setSuccessMsg(null);
                  }}
                  className="w-full py-2 text-xs font-semibold text-[#94A3B8] hover:text-[#F8FAFC] flex items-center justify-center gap-1.5 transition"
                >
                  <ArrowLeft className="w-3.5 h-3.5" />
                  <span>Voltar para tela de login</span>
                </button>
              </form>
            )}

            {/* Divider */}
            {viewMode !== 'forgot_password' && (
              <>
                <div className="relative my-3">
                  <div className="absolute inset-0 flex items-center">
                    <div className="w-full border-t border-[#182943]" />
                  </div>
                  <div className="relative flex justify-center text-xs uppercase">
                    <span className="bg-[#0B1730] px-2 text-[#64748B] text-[10px] font-bold tracking-wider">
                      ou conecte com
                    </span>
                  </div>
                </div>

                {/* Phase 11: Primary TikTok OAuth Login + Secondary @username Visual Lookup + Google Sign-In */}
                <div className="space-y-2.5">
                  <button
                    type="button"
                    disabled={loading || tiktokLoading}
                    onClick={handleTikTokLoginOAuth}
                    className="w-full py-2.5 px-4 bg-gradient-to-r from-[#0866F5] to-[#00A9FF] hover:brightness-110 text-[#F8FAFC] font-bold text-xs rounded-xl transition flex items-center justify-center gap-2 shadow-md shadow-[#0866F5]/25 active:scale-95 disabled:opacity-50 cursor-pointer"
                  >
                    <Sparkles className="w-4 h-4 text-[#F5B942]" />
                    <span>
                      {tiktokLoading ? 'Conectando ao TikTok OAuth...' : 'Continuar com TikTok (OAuth Oficial)'}
                    </span>
                  </button>

                  {!showUsernameLookup ? (
                    <button
                      type="button"
                      disabled={loading || tiktokLoading}
                      onClick={() => {
                        setShowUsernameLookup(true);
                        setUsernameLookupNotice(null);
                      }}
                      className="w-full py-2 px-3 bg-[#050D20] hover:bg-[#101F3D] text-[#94A3B8] hover:text-[#F8FAFC] border border-[#182943] font-semibold text-xs rounded-xl transition flex items-center justify-center gap-1.5 cursor-pointer"
                    >
                      <AtSign className="w-3.5 h-3.5 text-[#00A9FF]" />
                      <span>Entrar com @usuário do TikTok (Busca Visual + OAuth)</span>
                    </button>
                  ) : (
                    <div className="bg-[#050D20] border border-[#182943] rounded-xl p-3 space-y-2.5">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-bold text-[#F8FAFC] flex items-center gap-1.5">
                          <AtSign className="w-3.5 h-3.5 text-[#00A9FF]" />
                          Identificação Visual por @usuário
                        </span>
                        <button
                          type="button"
                          onClick={() => {
                            setShowUsernameLookup(false);
                            setUsernameLookupNotice(null);
                          }}
                          className="text-[11px] text-[#94A3B8] hover:text-[#F8FAFC]"
                        >
                          Fechar
                        </button>
                      </div>
                      <form onSubmit={handleUsernameVisualLookup} className="flex gap-2">
                        <input
                          type="text"
                          value={visualTikTokUsername}
                          onChange={(e) => setVisualTikTokUsername(e.target.value)}
                          placeholder="@seu_usuario_tiktok"
                          className="flex-1 px-3 py-2 text-xs bg-[#101F3D] border border-[#182943] rounded-lg text-[#F8FAFC] placeholder-[#64748B] focus:outline-none focus:ring-2 focus:ring-[#00A9FF]"
                        />
                        <button
                          type="submit"
                          className="px-3 py-2 rounded-lg bg-[#101F3D] hover:bg-[#182943] border border-[#00A9FF]/40 text-[#00A9FF] font-bold text-xs transition"
                        >
                          Localizar
                        </button>
                      </form>
                      <p className="text-[11px] text-[#94A3B8] leading-relaxed">
                        {usernameLookupNotice ||
                          'Por segurança, o @usuário serve apenas como identificação visual e nunca autentica a conta sozinho. A propriedade da conta é validada via TikTok OAuth 2.0.'}
                      </p>
                      <button
                        type="button"
                        disabled={tiktokLoading}
                        onClick={handleTikTokLoginOAuth}
                        className="w-full py-2 px-3 rounded-lg bg-[#0866F5] hover:bg-[#00A9FF] text-[#F8FAFC] font-bold text-xs transition"
                      >
                        Verificar Propriedade com TikTok OAuth
                      </button>
                    </div>
                  )}

                  {/* Google Sign-in Alternative */}
                  <button
                    type="button"
                    disabled={loading || tiktokLoading}
                    onClick={handleGoogleSignIn}
                    className="w-full py-2.5 px-4 bg-[#101F3D] hover:bg-[#182943] text-[#F8FAFC] border border-[#182943] hover:border-[#00A9FF]/50 font-semibold text-xs rounded-xl transition flex items-center justify-center gap-2 active:scale-95 disabled:opacity-50 cursor-pointer"
                  >
                    <User className="w-4 h-4 text-[#00A9FF]" />
                    <span>Continuar com Google</span>
                  </button>
                </div>
              </>
            )}

            {/* Security Guarantee Note */}
            <div className="pt-2 text-[11px] text-[#64748B] flex items-center justify-center gap-1.5">
              <ShieldCheck className="w-3.5 h-3.5 text-[#20C997] shrink-0" />
              <span>Criptografia de senhas e autenticação gerenciada por Google Firebase</span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
