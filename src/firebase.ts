import { initializeApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider, signInWithPopup, signOut, onAuthStateChanged, User } from 'firebase/auth';
import {
  getFirestore,
  doc,
  collection,
  getDocFromServer,
  getDoc,
  getDocs,
  setDoc,
  deleteDoc,
  query,
  where,
  writeBatch,
} from 'firebase/firestore';
import firebaseConfig from '../firebase-applet-config.json';

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app, firebaseConfig.firestoreDatabaseId);
export const auth = getAuth(app);
export const googleProvider = new GoogleAuthProvider();

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

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

export const FIRESTORE_UPGRADE_URL = `https://console.firebase.google.com/project/${firebaseConfig.projectId}/firestore/databases/${firebaseConfig.firestoreDatabaseId}/data?openUpgradeDialog=true`;

const QUOTA_PAUSE_STORAGE_KEY = 'df_firestore_quota_paused_until_v1';
let quotaPausedUntilMs = (() => {
  try {
    const raw = sessionStorage.getItem(QUOTA_PAUSE_STORAGE_KEY);
    const parsed = raw ? Number(raw) : 0;
    return Number.isFinite(parsed) && parsed > Date.now() ? parsed : 0;
  } catch {
    return 0;
  }
})();

const quotaListeners = new Set<(paused: boolean) => void>();

export function isFirestoreQuotaError(error: unknown): boolean {
  if (!error) return false;
  const code = typeof error === 'object' && 'code' in error ? String((error as { code?: unknown }).code || '') : '';
  const msg = error instanceof Error ? error.message : String(error);
  const combined = `${code} ${msg}`.toLowerCase();
  return (
    combined.includes('resource-exhausted') ||
    combined.includes('quota limit exceeded') ||
    combined.includes('quota exceeded') ||
    combined.includes('free daily write units') ||
    combined.includes('free daily read units')
  );
}

export function isFirestoreQuotaPaused(): boolean {
  if (quotaPausedUntilMs > Date.now()) return true;
  if (quotaPausedUntilMs !== 0) {
    quotaPausedUntilMs = 0;
    try {
      sessionStorage.removeItem(QUOTA_PAUSE_STORAGE_KEY);
    } catch {
      // Abaikan
    }
  }
  return false;
}

export function markFirestoreQuotaExceeded(cooldownMs = 30 * 60 * 1000): void {
  const alreadyPaused = isFirestoreQuotaPaused();
  quotaPausedUntilMs = Math.max(quotaPausedUntilMs, Date.now() + cooldownMs);
  try {
    sessionStorage.setItem(QUOTA_PAUSE_STORAGE_KEY, String(quotaPausedUntilMs));
  } catch {
    // Abaikan jika sessionStorage tidak tersedia
  }
  if (!alreadyPaused) {
    console.warn(
      'Kuota harian gratis Firestore sementara tercapai — sinkronisasi otomatis ke Firestore dijeda untuk mencegah retry berlebih. Data tetap tersimpan aman di Server Lokal & Browser.'
    );
    quotaListeners.forEach((fn) => fn(true));
  }
}

export function clearFirestoreQuotaPause(): void {
  quotaPausedUntilMs = 0;
  try {
    sessionStorage.removeItem(QUOTA_PAUSE_STORAGE_KEY);
  } catch {
    // Abaikan
  }
  quotaListeners.forEach((fn) => fn(false));
}

export function onFirestoreQuotaStatusChange(listener: (paused: boolean) => void): () => void {
  quotaListeners.add(listener);
  return () => {
    quotaListeners.delete(listener);
  };
}

export function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null): never {
  if (isFirestoreQuotaError(error)) {
    markFirestoreQuotaExceeded();
  }
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

// Validate Connection to Firestore on boot
async function testConnection() {
  if (isFirestoreQuotaPaused()) return;
  try {
    await getDocFromServer(doc(db, 'test', 'connection'));
  } catch (error) {
    if (isFirestoreQuotaError(error)) {
      markFirestoreQuotaExceeded();
      return;
    }
    if (error instanceof Error && error.message.includes('the client is offline')) {
      console.error('Please check your Firebase configuration.');
    }
  }
}
testConnection();

export {
  signInWithPopup,
  signOut,
  onAuthStateChanged,
  doc,
  collection,
  getDoc,
  getDocs,
  setDoc,
  deleteDoc,
  query,
  where,
  writeBatch,
};
export type { User };
