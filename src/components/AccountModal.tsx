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
} from 'lucide-react';
import {
  auth,
  googleProvider,
  signInWithPopup,
  signOut,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  sendPasswordResetEmail,
  sendEmailVerification,
  updateProfile,
  updatePassword,
  reauthenticateWithCredential,
  EmailAuthProvider,
  User as FirebaseUser,
} from '../firebase';
import { RaffleSettings, Participant, Winner } from '../types';
import {
  evaluatePassphrase,
  getGenericAuthErrorMessage,
  getThrottleState,
  recordFailedAttempt,
  resetThrottleState,
} from '../utils/authSecurity';

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
}

type AuthViewMode = 'login' | 'register' | 'forgot_password';

export const AccountModal: React.FC<AccountModalProps> = ({
  isOpen,
  onClose,
  currentUser,
  syncStatus,
  onSaveToCloud,
  onLoadFromCloud,
}) => {
  const [viewMode, setViewMode] = useState<AuthViewMode>('login');

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

  // Rate Limiting / Throttle Countdown
  const [throttleRemaining, setThrottleRemaining] = useState<number>(0);

  const initialInputRef = useRef<HTMLInputElement>(null);

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

    setLoading(true);
    setErrorMsg(null);
    setSuccessMsg(null);

    try {
      const credential = await createUserWithEmailAndPassword(auth, cleanEmail, password);
      if (cleanName && credential.user) {
        await updateProfile(credential.user, { displayName: cleanName });
      }
      // Send verification email to confirm the address
      if (credential.user) {
        try {
          await sendEmailVerification(credential.user);
        } catch {
          // Non-blocking notice
        }
      }
      resetThrottleState();
      clearForm();
      setSuccessMsg('Conta criada com sucesso! Um link de verificação foi enviado para o seu e-mail.');
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

  // 5. Sign Out
  const handleSignOut = async () => {
    setLoading(true);
    setErrorMsg(null);
    setSuccessMsg(null);

    try {
      await signOut(auth);
      clearForm();
      setShowChangePassword(false);
      setSuccessMsg('Você desconectou da sua conta. Seus dados continuam no seu navegador.');
      setTimeout(() => setSuccessMsg(null), 3500);
    } catch {
      setErrorMsg('Não foi possível encerrar a sessão no momento.');
    } finally {
      setLoading(false);
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
      className="fixed inset-0 z-50 bg-slate-950/85 backdrop-blur-md flex items-center justify-center p-4 overflow-y-auto animate-fade-in"
    >
      <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-md w-full p-6 shadow-2xl space-y-5 animate-slide-up my-8">
        {/* Header */}
        <div className="flex items-center justify-between pb-3 border-b border-slate-800">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-blue-600/20 text-sky-400 flex items-center justify-center border border-blue-500/30">
              <ShieldCheck className="w-4 h-4" />
            </div>
            <div>
              <h2 id="account-modal-title" className="font-display font-bold text-base sm:text-lg text-white">
                {currentUser
                  ? 'Minha Conta de Sorteador'
                  : viewMode === 'login'
                  ? 'Entrar no GIO DA SORTE'
                  : viewMode === 'register'
                  ? 'Criar Nova Conta'
                  : 'Recuperação de Acesso'}
              </h2>
              <span className="text-[11px] text-slate-400 block">
                {currentUser ? 'Perfil Seguro & Sincronização em Nuvem' : 'Acesso autenticado e protegido'}
              </span>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Fechar modal"
            className="p-1.5 text-slate-400 hover:text-white rounded-lg transition hover:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Global Feedback Messages */}
        {successMsg && (
          <div
            role="status"
            aria-live="polite"
            className="p-3 bg-emerald-950/60 border border-emerald-700/80 rounded-xl text-xs text-emerald-200 flex items-start gap-2.5 animate-in fade-in"
          >
            <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
            <span className="leading-relaxed">{successMsg}</span>
          </div>
        )}

        {errorMsg && (
          <div
            role="alert"
            aria-live="assertive"
            className="p-3 bg-rose-950/60 border border-rose-700/80 rounded-xl text-xs text-rose-200 flex items-start gap-2.5 animate-in fade-in"
          >
            <AlertCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
            <span className="leading-relaxed">{errorMsg}</span>
          </div>
        )}

        {/* LOGGED IN USER VIEW */}
        {currentUser ? (
          <div className="space-y-4">
            {/* User Profile Card */}
            <div className="bg-slate-950 border border-slate-800 p-4 rounded-xl flex items-center gap-3.5">
              {currentUser.photoURL ? (
                <img
                  src={currentUser.photoURL}
                  alt={currentUser.displayName || 'Avatar do usuário'}
                  referrerPolicy="no-referrer"
                  className="w-12 h-12 rounded-full border-2 border-blue-500/50 shadow-md object-cover"
                />
              ) : (
                <div className="w-12 h-12 rounded-full bg-gradient-to-br from-blue-600 to-indigo-700 text-white font-bold flex items-center justify-center text-lg border border-blue-400/40">
                  {currentUser.displayName ? currentUser.displayName[0].toUpperCase() : 'S'}
                </div>
              )}

              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="font-bold text-white text-base truncate">
                    {currentUser.displayName || 'Sorteador Autenticado'}
                  </span>
                </div>
                <div className="text-xs text-slate-400 truncate">{currentUser.email}</div>
                <div className="flex items-center gap-2 mt-1">
                  {currentUser.emailVerified ? (
                    <span className="inline-flex items-center gap-1 text-[11px] text-emerald-400 font-semibold bg-emerald-950/60 border border-emerald-800 px-2 py-0.5 rounded-full">
                      <Check className="w-3 h-3" /> E-mail Verificado
                    </span>
                  ) : (
                    <button
                      type="button"
                      onClick={handleSendVerificationEmail}
                      disabled={loading}
                      className="inline-flex items-center gap-1 text-[11px] text-amber-400 hover:text-amber-300 font-semibold bg-amber-950/50 hover:bg-amber-900/50 border border-amber-800/80 px-2 py-0.5 rounded-full transition"
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
                className="p-2 text-slate-400 hover:text-red-400 hover:bg-slate-900 rounded-lg transition"
              >
                <LogOut className="w-5 h-5" />
              </button>
            </div>

            {/* Cloud Sync Status */}
            <div className="bg-blue-950/30 border border-blue-800/40 rounded-xl p-3.5 text-xs text-sky-200 flex items-start gap-2.5">
              <Cloud className="w-4 h-4 text-sky-400 shrink-0 mt-0.5" />
              <div>
                <span className="font-bold text-white block">Sincronização Segura em Nuvem</span>
                <span className="text-sky-300/80">
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
                className="py-2.5 px-3 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs flex items-center justify-center gap-1.5 transition shadow-md shadow-blue-600/30 active:scale-95 disabled:opacity-50"
              >
                <Cloud className="w-4 h-4" />
                <span>Salvar na Nuvem</span>
              </button>

              <button
                type="button"
                disabled={loading}
                onClick={handleManualLoad}
                className="py-2.5 px-3 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold text-xs flex items-center justify-center gap-1.5 transition border border-slate-700 active:scale-95 disabled:opacity-50"
              >
                <RefreshCw className="w-4 h-4" />
                <span>Recarregar da Nuvem</span>
              </button>
            </div>

            {/* Sensitive Action: Change Password (Step-up Verification) */}
            <div className="pt-2 border-t border-slate-800">
              {!showChangePassword ? (
                <button
                  type="button"
                  onClick={() => setShowChangePassword(true)}
                  className="w-full py-2 px-3 text-xs font-semibold text-slate-300 hover:text-white bg-slate-950 hover:bg-slate-800 border border-slate-800 rounded-xl flex items-center justify-center gap-2 transition"
                >
                  <KeyRound className="w-4 h-4 text-sky-400" />
                  <span>Alterar Senha de Acesso (Verificação em 2 Etapas)</span>
                </button>
              ) : (
                <form onSubmit={handleChangePassword} className="bg-slate-950 border border-slate-800 p-4 rounded-xl space-y-3">
                  <div className="flex items-center justify-between pb-1">
                    <span className="text-xs font-bold text-white flex items-center gap-1.5">
                      <KeyRound className="w-3.5 h-3.5 text-sky-400" />
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
                      className="text-[11px] text-slate-400 hover:text-slate-200"
                    >
                      Cancelar
                    </button>
                  </div>

                  <div>
                    <label htmlFor="current-password-input" className="block text-[11px] font-medium text-slate-300 mb-1">
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
                      className="w-full px-3 py-2 text-xs bg-slate-900 border border-slate-700 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>

                  <div>
                    <label htmlFor="new-password-input" className="block text-[11px] font-medium text-slate-300 mb-1">
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
                        className="w-full px-3 py-2 pr-9 text-xs bg-slate-900 border border-slate-700 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                      <button
                        type="button"
                        onClick={() => setShowNewPassword(!showNewPassword)}
                        aria-label={showNewPassword ? 'Ocultar nova senha' : 'Exibir nova senha'}
                        className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white"
                      >
                        {showNewPassword ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                      </button>
                    </div>
                  </div>

                  <div>
                    <label htmlFor="confirm-new-password-input" className="block text-[11px] font-medium text-slate-300 mb-1">
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
                      className="w-full px-3 py-2 text-xs bg-slate-900 border border-slate-700 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>

                  <button
                    type="submit"
                    disabled={loading}
                    className="w-full py-2 px-3 bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs rounded-lg transition disabled:opacity-50"
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
              <div className="grid grid-cols-2 p-1 bg-slate-950 border border-slate-800 rounded-xl text-xs font-bold">
                <button
                  type="button"
                  onClick={() => {
                    setViewMode('login');
                    setErrorMsg(null);
                    setSuccessMsg(null);
                  }}
                  className={`py-2 rounded-lg transition ${
                    viewMode === 'login'
                      ? 'bg-blue-600 text-white shadow-sm'
                      : 'text-slate-400 hover:text-slate-200'
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
                      ? 'bg-blue-600 text-white shadow-sm'
                      : 'text-slate-400 hover:text-slate-200'
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
                  <label htmlFor="login-email" className="block text-xs font-medium text-slate-300 mb-1">
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
                      className="w-full pl-9 pr-3 py-2.5 text-sm bg-slate-950 border border-slate-800 rounded-xl text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition"
                    />
                    <Mail className="w-4 h-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                  </div>
                </div>

                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label htmlFor="login-password" className="block text-xs font-medium text-slate-300">
                      Senha ou Frase-Senha
                    </label>
                    <button
                      type="button"
                      onClick={() => {
                        setViewMode('forgot_password');
                        setErrorMsg(null);
                        setSuccessMsg(null);
                      }}
                      className="text-[11px] text-sky-400 hover:text-sky-300 transition"
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
                      className="w-full pl-9 pr-10 py-2.5 text-sm bg-slate-950 border border-slate-800 rounded-xl text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition"
                    />
                    <Lock className="w-4 h-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      aria-label={showPassword ? 'Ocultar senha' : 'Exibir senha'}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white p-1 rounded transition"
                    >
                      {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>

                {/* Rate limit lock alert */}
                {throttleRemaining > 0 && (
                  <div className="p-2.5 bg-amber-950/40 border border-amber-800/80 rounded-xl text-xs text-amber-300 flex items-center gap-2">
                    <Clock className="w-4 h-4 text-amber-400 shrink-0" />
                    <span>Aguarde {throttleRemaining}s antes de tentar novamente.</span>
                  </div>
                )}

                <button
                  type="submit"
                  disabled={loading || throttleRemaining > 0}
                  className="w-full py-3 px-4 bg-gradient-to-r from-blue-600 via-sky-500 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white font-bold text-sm rounded-xl transition shadow-lg shadow-blue-600/30 flex items-center justify-center gap-2 active:scale-95 disabled:opacity-50 cursor-pointer"
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
                  <label htmlFor="reg-name" className="block text-xs font-medium text-slate-300 mb-1">
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
                      className="w-full pl-9 pr-3 py-2.5 text-sm bg-slate-950 border border-slate-800 rounded-xl text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition"
                    />
                    <User className="w-4 h-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                  </div>
                </div>

                <div>
                  <label htmlFor="reg-email" className="block text-xs font-medium text-slate-300 mb-1">
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
                      className="w-full pl-9 pr-3 py-2.5 text-sm bg-slate-950 border border-slate-800 rounded-xl text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition"
                    />
                    <Mail className="w-4 h-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                  </div>
                </div>

                <div>
                  <label htmlFor="reg-password" className="block text-xs font-medium text-slate-300 mb-1">
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
                      className="w-full pl-9 pr-10 py-2.5 text-sm bg-slate-950 border border-slate-800 rounded-xl text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition"
                    />
                    <Lock className="w-4 h-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      aria-label={showPassword ? 'Ocultar senha' : 'Exibir senha'}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white p-1 rounded transition"
                    >
                      {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>

                  {/* Passphrase Strength Visualizer */}
                  {password.length > 0 && (
                    <div className="mt-2 space-y-1">
                      <div className="h-1.5 w-full bg-slate-800 rounded-full overflow-hidden flex">
                        <div
                          className={`h-full transition-all duration-300 ${
                            registrationPassEvaluation.score === 0
                              ? 'w-1/4 bg-rose-500'
                              : registrationPassEvaluation.score === 1
                              ? 'w-2/4 bg-amber-500'
                              : registrationPassEvaluation.score === 2
                              ? 'w-3/4 bg-sky-500'
                              : 'w-full bg-emerald-500'
                          }`}
                        />
                      </div>
                      <div className="flex items-center justify-between text-[11px]">
                        <span
                          className={`font-semibold ${
                            registrationPassEvaluation.score === 0
                              ? 'text-rose-400'
                              : registrationPassEvaluation.score === 1
                              ? 'text-amber-400'
                              : registrationPassEvaluation.score === 2
                              ? 'text-sky-400'
                              : 'text-emerald-400'
                          }`}
                        >
                          {registrationPassEvaluation.label}
                        </span>
                        <span className="text-slate-400">{registrationPassEvaluation.feedback}</span>
                      </div>
                    </div>
                  )}
                  <p className="text-[11px] text-slate-500 mt-1">
                    Você pode usar frases longas com espaços, letras e palavras. Não forçamos regras de caracteres desnecessárias.
                  </p>
                </div>

                <button
                  type="submit"
                  disabled={loading || (password.length > 0 && !registrationPassEvaluation.isValid)}
                  className="w-full py-3 px-4 bg-gradient-to-r from-emerald-600 via-teal-500 to-blue-600 hover:from-emerald-500 hover:to-teal-500 text-white font-bold text-sm rounded-xl transition shadow-lg shadow-emerald-600/20 flex items-center justify-center gap-2 active:scale-95 disabled:opacity-50 cursor-pointer"
                >
                  <Sparkles className="w-4 h-4" />
                  <span>{loading ? 'Cadastrando...' : 'Criar Conta Segura'}</span>
                </button>
              </form>
            )}

            {/* 3. FORGOT PASSWORD VIEW (Anti-enumeration compliant) */}
            {viewMode === 'forgot_password' && (
              <form onSubmit={handleForgotPassword} className="space-y-3.5">
                <div className="bg-blue-950/30 border border-blue-800/40 p-3 rounded-xl text-xs text-sky-200 leading-relaxed">
                  Digite seu e-mail abaixo. Se houver uma conta registrada, enviaremos um link seguro de uso único para redefinir sua senha.
                </div>

                <div>
                  <label htmlFor="reset-email" className="block text-xs font-medium text-slate-300 mb-1">
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
                      className="w-full pl-9 pr-3 py-2.5 text-sm bg-slate-950 border border-slate-800 rounded-xl text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition"
                    />
                    <Mail className="w-4 h-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full py-3 px-4 bg-blue-600 hover:bg-blue-500 text-white font-bold text-sm rounded-xl transition shadow-md shadow-blue-600/30 flex items-center justify-center gap-2 active:scale-95 disabled:opacity-50 cursor-pointer"
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
                  className="w-full py-2 text-xs font-semibold text-slate-400 hover:text-white flex items-center justify-center gap-1.5 transition"
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
                    <div className="w-full border-t border-slate-800" />
                  </div>
                  <div className="relative flex justify-center text-xs uppercase">
                    <span className="bg-slate-900 px-2 text-slate-500 text-[10px] font-bold tracking-wider">
                      ou conecte com
                    </span>
                  </div>
                </div>

                {/* Google Sign-in Alternative */}
                <button
                  type="button"
                  disabled={loading}
                  onClick={handleGoogleSignIn}
                  className="w-full py-2.5 px-4 bg-slate-950 hover:bg-slate-800 text-slate-200 border border-slate-700/80 hover:border-slate-600 font-semibold text-xs rounded-xl transition flex items-center justify-center gap-2 active:scale-95 disabled:opacity-50 cursor-pointer"
                >
                  <User className="w-4 h-4 text-sky-400" />
                  <span>Continuar com Google</span>
                </button>
              </>
            )}

            {/* Security Guarantee Note */}
            <div className="pt-2 text-[11px] text-slate-500 flex items-center justify-center gap-1.5">
              <ShieldCheck className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
              <span>Criptografia de senhas e autenticação gerenciada por Google Firebase</span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
