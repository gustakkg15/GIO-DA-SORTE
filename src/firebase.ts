import { initializeApp, getApps, getApp } from 'firebase/app';
import {
  getAuth,
  GoogleAuthProvider,
  signInWithPopup,
  signOut,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  sendPasswordResetEmail,
  sendEmailVerification,
  updateProfile,
  updatePassword,
  reauthenticateWithCredential,
  EmailAuthProvider,
  type User,
  type Auth,
} from 'firebase/auth';
import { getFirestore, doc, getDocFromServer, setLogLevel } from 'firebase/firestore';
import firebaseConfig from '../firebase-applet-config.json' with { type: 'json' };

// Silence benign @firebase/firestore internal gRPC 'Disconnecting idle stream' messages in Node.js/browser
setLogLevel('silent');

/**
 * Singleton Firebase App initialization.
 * Prevents multiple app initializations across Vite HMR and server restarts.
 */
const app = getApps().length > 0 ? getApp() : initializeApp(firebaseConfig);

/* CRITICAL: The app will break without specifying the firestoreDatabaseId */
export const db = getFirestore(app, firebaseConfig.firestoreDatabaseId);

/**
 * Singleton Firebase Authentication instance.
 * Exported safely for consumption across App.tsx and all client components.
 */
export const auth: Auth = getAuth(app);
export const googleProvider = new GoogleAuthProvider();

/**
 * Safe accessor for the Firebase Auth instance.
 */
export function getFirebaseAuth(): Auth {
  return auth;
}

/**
 * Helper to safely extract the current user's Firebase ID Token.
 * Returns null if unauthenticated or on transient error.
 */
export async function getCurrentUserToken(forceRefresh = false): Promise<string | null> {
  if (!auth.currentUser) return null;
  try {
    return await auth.currentUser.getIdToken(forceRefresh);
  } catch (err) {
    console.warn('[FirebaseAuth] Aviso ao obter ID Token:', err);
    return null;
  }
}

// Safely expose auth to window for browser diagnostics and console verification when running in browser
if (typeof window !== 'undefined') {
  (window as unknown as { firebaseAuth?: Auth }).firebaseAuth = auth;
}

export const OperationType = {
  CREATE: 'create',
  UPDATE: 'update',
  DELETE: 'delete',
  LIST: 'list',
  GET: 'get',
  WRITE: 'write',
} as const;

export type OperationType = (typeof OperationType)[keyof typeof OperationType];

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
    providerInfo?: {
      providerId?: string | null;
      email?: string | null;
    }[];
  };
}

export function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null): never {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo:
        auth.currentUser?.providerData?.map((provider) => ({
          providerId: provider.providerId,
          email: provider.email,
        })) || [],
    },
    operationType,
    path,
  };
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

/**
 * Validates connection to Firestore on initialization (browser only to avoid idle Node gRPC Listen streams)
 */
async function testConnection() {
  if (typeof window === 'undefined') return;
  try {
    await getDocFromServer(doc(db, 'test', 'connection'));
  } catch (error) {
    if (error instanceof Error && error.message.includes('the client is offline')) {
      console.warn('Firestore is currently running in offline persistence mode.');
    }
  }
}

if (typeof window !== 'undefined') {
  testConnection();
}

export {
  signInWithPopup,
  signOut,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  sendPasswordResetEmail,
  sendEmailVerification,
  updateProfile,
  updatePassword,
  reauthenticateWithCredential,
  EmailAuthProvider,
};
export type { User, Auth };
