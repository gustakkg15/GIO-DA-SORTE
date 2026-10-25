/**
 * Utilities for secure authentication, passphrase validation,
 * anti-enumeration error handling, and client-side brute-force throttling.
 */

export interface PassphraseEvaluation {
  isValid: boolean;
  score: 0 | 1 | 2 | 3; // 0 = invalid (< 8 chars), 1 = fair, 2 = strong, 3 = very strong
  label: string;
  feedback: string;
}

/**
 * Validates password / passphrase following modern NIST SP 800-63B standards:
 * - Allows long passphrases and sentences with spaces
 * - Rejects passwords shorter than 8 characters or longer than 256 characters (DoS guard)
 * - Does not impose arbitrary mandatory composition rules (no forced special characters or numbers)
 */
export function evaluatePassphrase(password: string): PassphraseEvaluation {
  const len = password.length;

  if (len === 0) {
    return {
      isValid: false,
      score: 0,
      label: 'Vazio',
      feedback: 'Digite uma senha ou frase-senha segura.',
    };
  }

  if (len < 8) {
    return {
      isValid: false,
      score: 0,
      label: 'Muito curta',
      feedback: `Mínimo de 8 caracteres (${len}/8).`,
    };
  }

  if (len > 256) {
    return {
      isValid: false,
      score: 0,
      label: 'Excede o limite',
      feedback: 'A senha não pode ultrapassar 256 caracteres.',
    };
  }

  // Assess strength naturally (length + entropy / word variety)
  const hasSpaces = /\s/.test(password);
  const hasMixedChars = /[a-zA-Z]/.test(password) && (/\d/.test(password) || /[^\w\s]/.test(password));

  if (len >= 16 || (len >= 12 && hasSpaces)) {
    return {
      isValid: true,
      score: 3,
      label: 'Excelente frase-senha!',
      feedback: 'Muito forte e resistente contra ataques de força bruta.',
    };
  }

  if (len >= 12 || (len >= 9 && hasSpaces) || (len >= 10 && hasMixedChars)) {
    return {
      isValid: true,
      score: 2,
      label: 'Senha forte',
      feedback: 'Boa extensão e proteção para sua conta.',
    };
  }

  return {
    isValid: true,
    score: 1,
    label: 'Razoável',
    feedback: 'Válida. Dica: você pode usar uma frase com várias palavras para maior segurança.',
  };
}

/**
 * Maps Firebase Auth errors into secure, anti-enumeration user-facing messages.
 * Prevents attackers from discovering if an email is registered or which part of credentials was wrong.
 * Never logs credentials or personal info.
 */
export function getGenericAuthErrorMessage(
  error: unknown,
  context: 'login' | 'register' | 'reset' | 'sensitive' = 'login'
): string | null {
  if (!error) return null;

  const rawMsg = error instanceof Error ? error.message : String(error);

  // User closed popup deliberately
  if (rawMsg.includes('popup-closed-by-user') || rawMsg.includes('auth/cancelled-popup-request')) {
    return null;
  }

  // Generic anti-enumeration for login
  if (
    context === 'login' &&
    (rawMsg.includes('auth/user-not-found') ||
      rawMsg.includes('auth/wrong-password') ||
      rawMsg.includes('auth/invalid-credential') ||
      rawMsg.includes('auth/invalid-login-credentials') ||
      rawMsg.includes('auth/user-disabled'))
  ) {
    return 'E-mail ou senha incorretos. Por favor, verifique suas credenciais.';
  }

  // Generic anti-enumeration for password reset
  if (context === 'reset' && (rawMsg.includes('auth/user-not-found') || rawMsg.includes('auth/invalid-email'))) {
    return 'Se este e-mail estiver cadastrado, enviamos as instruções seguras de recuperação para sua caixa de entrada.';
  }

  // Registration error: anti-enumeration / account privacy
  if (context === 'register' && rawMsg.includes('auth/email-already-in-use')) {
    return 'Não foi possível concluir o cadastro com este e-mail. Se já possui uma conta, faça login ou use a opção "Esqueci minha senha".';
  }

  if (context === 'register' && rawMsg.includes('auth/weak-password')) {
    return 'A senha escolhida não atende ao requisito mínimo de 8 caracteres.';
  }

  // Sensitive operations (e.g. changing password with current password re-auth)
  if (context === 'sensitive' && (rawMsg.includes('auth/wrong-password') || rawMsg.includes('auth/invalid-credential'))) {
    return 'Senha atual incorreta. A confirmação de segurança falhou.';
  }

  // Common network and rate limit errors
  if (rawMsg.includes('auth/too-many-requests')) {
    return 'Muitas tentativas sem sucesso vindas deste dispositivo. Por proteção, aguarde alguns instantes antes de tentar novamente.';
  }

  if (rawMsg.includes('auth/invalid-email')) {
    return 'Por favor, insira um endereço de e-mail válido.';
  }

  if (rawMsg.includes('auth/network-request-failed')) {
    return 'Falha de conexão com os servidores de autenticação. Verifique sua conexão com a internet.';
  }

  // Generic fallback without exposing internal code or PII
  return 'Não foi possível concluir a operação no momento. Tente novamente mais tarde.';
}

/**
 * Client-side progressive throttle helper.
 * Enforces exponential delays after repeated consecutive failed attempts in this browser tab,
 * without locking out the account on the server (preventing Denial-of-Service attacks against other users).
 */
const THROTTLE_STORAGE_KEY = 'gio_auth_attempts';

interface ThrottleState {
  count: number;
  lockUntil: number; // timestamp in ms
}

export function getThrottleState(): { isThrottled: boolean; remainingSeconds: number } {
  try {
    const raw = sessionStorage.getItem(THROTTLE_STORAGE_KEY);
    if (!raw) return { isThrottled: false, remainingSeconds: 0 };
    const state: ThrottleState = JSON.parse(raw);
    const now = Date.now();
    if (state.lockUntil > now) {
      const remainingSeconds = Math.ceil((state.lockUntil - now) / 1000);
      return { isThrottled: true, remainingSeconds };
    }
  } catch {
    // Ignore storage issues
  }
  return { isThrottled: false, remainingSeconds: 0 };
}

export function recordFailedAttempt(): { isThrottled: boolean; remainingSeconds: number } {
  try {
    const raw = sessionStorage.getItem(THROTTLE_STORAGE_KEY);
    let count = 1;
    if (raw) {
      const prev: ThrottleState = JSON.parse(raw);
      count = (prev.count || 0) + 1;
    }

    let delaySeconds = 0;
    if (count === 3) delaySeconds = 5;
    else if (count === 4) delaySeconds = 15;
    else if (count === 5) delaySeconds = 30;
    else if (count >= 6) delaySeconds = 60;

    const lockUntil = Date.now() + delaySeconds * 1000;
    sessionStorage.setItem(THROTTLE_STORAGE_KEY, JSON.stringify({ count, lockUntil }));

    return { isThrottled: delaySeconds > 0, remainingSeconds: delaySeconds };
  } catch {
    return { isThrottled: false, remainingSeconds: 0 };
  }
}

export function resetThrottleState(): void {
  try {
    sessionStorage.removeItem(THROTTLE_STORAGE_KEY);
  } catch {
    // Ignore
  }
}
