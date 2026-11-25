import { initializeApp, type FirebaseApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider, type Auth } from 'firebase/auth';
import {
  doc,
  getDocFromServer,
  getFirestore,
  initializeFirestore,
  setLogLevel,
  type Firestore,
} from 'firebase/firestore';
import rawAppletConfig from '../../firebase-applet-config.json';

function cleanEnvValue(value: unknown): string {
  if (typeof value !== 'string') return '';
  return value.trim().replace(/^["']|["']$/g, '');
}

const viteEnv = (import.meta as unknown as { env?: Record<string, string | undefined> }).env ?? {};

export const firebaseConfig = {
  apiKey: cleanEnvValue(viteEnv.VITE_FIREBASE_API_KEY) || cleanEnvValue(rawAppletConfig.apiKey),
  authDomain:
    cleanEnvValue(viteEnv.VITE_FIREBASE_AUTH_DOMAIN) || cleanEnvValue(rawAppletConfig.authDomain),
  projectId:
    cleanEnvValue(viteEnv.VITE_FIREBASE_PROJECT_ID) || cleanEnvValue(rawAppletConfig.projectId),
  storageBucket:
    cleanEnvValue(viteEnv.VITE_FIREBASE_STORAGE_BUCKET) || cleanEnvValue(rawAppletConfig.storageBucket),
  messagingSenderId:
    cleanEnvValue(viteEnv.VITE_FIREBASE_MESSAGING_SENDER_ID) ||
    cleanEnvValue(rawAppletConfig.messagingSenderId),
  appId: cleanEnvValue(viteEnv.VITE_FIREBASE_APP_ID) || cleanEnvValue(rawAppletConfig.appId),
  firestoreDatabaseId:
    cleanEnvValue(viteEnv.VITE_FIREBASE_DATABASE_ID) ||
    cleanEnvValue(rawAppletConfig.firestoreDatabaseId),
};

const REQUIRED_ENV_MAP: Array<{ key: keyof typeof firebaseConfig; envName: string }> = [
  { key: 'apiKey', envName: 'VITE_FIREBASE_API_KEY' },
  { key: 'authDomain', envName: 'VITE_FIREBASE_AUTH_DOMAIN' },
  { key: 'projectId', envName: 'VITE_FIREBASE_PROJECT_ID' },
  { key: 'appId', envName: 'VITE_FIREBASE_APP_ID' },
];

const missingFields = REQUIRED_ENV_MAP.filter(({ key }) => !firebaseConfig[key]).map(
  ({ key, envName }) => `${envName} (${key})`
);

let appInstance: FirebaseApp | null = null;
let dbInstance: Firestore | null = null;
let authInstance: Auth | null = null;
let initError: string | null = null;

if (missingFields.length > 0) {
  initError = `Missing Firebase configuration: ${missingFields.join(', ')}.`;
} else {
  try {
    appInstance = initializeApp(firebaseConfig);
    setLogLevel('silent');
    try {
      dbInstance = initializeFirestore(
        appInstance,
        { experimentalAutoDetectLongPolling: true },
        firebaseConfig.firestoreDatabaseId || undefined
      );
    } catch {
      dbInstance = firebaseConfig.firestoreDatabaseId
        ? getFirestore(appInstance, firebaseConfig.firestoreDatabaseId)
        : getFirestore(appInstance);
    }
    authInstance = getAuth(appInstance);
  } catch (err) {
    initError =
      err instanceof Error
        ? `Failed to initialize Firebase client: ${err.message}`
        : 'Failed to initialize Firebase client.';
  }
}

export const firebaseConfigStatus = {
  ok: missingFields.length === 0 && initError === null && authInstance !== null && dbInstance !== null,
  missingFields,
  error: initError,
  projectId: firebaseConfig.projectId,
  authDomain: firebaseConfig.authDomain,
  firestoreDatabaseId: firebaseConfig.firestoreDatabaseId,
};

export const db = dbInstance as Firestore;
export const auth = authInstance as Auth;
export const googleAuthProvider = new GoogleAuthProvider();
googleAuthProvider.setCustomParameters({ prompt: 'select_account' });

export const PRIMARY_OWNER_EMAIL = 'vostematire@gmail.com';

export function formatFirebaseAuthError(err: unknown): string {
  if (!firebaseConfigStatus.ok) {
    return (
      firebaseConfigStatus.error ||
      `Missing Firebase configuration (${firebaseConfigStatus.missingFields.join(', ')}). Check Vercel Environment Variables or firebase-applet-config.json.`
    );
  }

  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    return 'No internet connection detected. Check your network connection and try again.';
  }

  const code =
    typeof err === 'object' && err !== null && 'code' in err && typeof (err as { code?: unknown }).code === 'string'
      ? (err as { code: string }).code
      : '';
  const rawMessage = err instanceof Error ? err.message : String(err || 'Unknown authentication error');
  const host = typeof window !== 'undefined' ? window.location.hostname : 'this domain';
  const origin = typeof window !== 'undefined' ? window.location.origin : 'this origin';

  if (code === 'auth/network-request-failed') {
    return `Failed to connect to Firebase Auth server (auth/network-request-failed). Check your internet connection, disable ad-blockers or VPNs blocking identitytoolkit.googleapis.com, and confirm '${host}' is allowed in Firebase Console → Authentication → Settings → Authorized domains.`;
  }

  if (code === 'auth/unauthorized-domain') {
    return `Domain '${host}' is not authorized for Firebase sign-in (auth/unauthorized-domain). Add '${host}' in Firebase Console → Authentication → Settings → Authorized domains.`;
  }

  if (code === 'auth/operation-not-allowed') {
    return 'Email/Password sign-in is disabled in Firebase Authentication (auth/operation-not-allowed). Use Google Sign-In above, or enable Email/Password under Firebase Console → Authentication → Sign-in method.';
  }

  if (
    code === 'auth/invalid-api-key' ||
    code === 'auth/api-key-not-valid.-please-pass-a-valid-api-key.' ||
    rawMessage.includes('api-key-not-valid')
  ) {
    return 'Invalid Firebase API key (VITE_FIREBASE_API_KEY). Verify your Vercel Environment Variables and firebase-applet-config.json.';
  }

  if (code === 'auth/app-not-authorized') {
    return 'This Firebase app is not authorized to use Firebase Authentication with the configured API key (auth/app-not-authorized).';
  }

  if (code.includes('requests-from-referer') || rawMessage.includes('requests-from-referer')) {
    return `Firebase API key blocked requests from '${origin}'. Add '${origin}/*' to allowed HTTP referrers in Google Cloud Console → APIs & Services → Credentials.`;
  }

  if (code === 'auth/popup-blocked') {
    return `Browser blocked the Google Sign-In popup (auth/popup-blocked). Allow popups for '${host}' or sign in with Email & Password below.`;
  }

  if (code === 'auth/popup-closed-by-user' || code === 'auth/cancelled-popup-request') {
    return `Google Sign-In window was closed before completing login (${code}). Click 'Sign in with Google' to try again.`;
  }

  if (code === 'auth/user-not-found') {
    return 'No Email/Password account was found for that email address (auth/user-not-found). Check the email or use Google Sign-In.';
  }

  if (code === 'auth/invalid-credential' || code === 'auth/wrong-password') {
    return `Incorrect staff email or password (${code}). Check your credentials or click 'Forgot Password?' below.`;
  }

  if (code === 'auth/invalid-email' || code === 'auth/missing-email') {
    return `Please enter a valid staff email address (${code}).`;
  }

  if (code === 'auth/too-many-requests') {
    return 'Too many failed sign-in attempts (auth/too-many-requests). Wait a few minutes or reset your password.';
  }

  if (code === 'auth/user-disabled') {
    return 'This staff account has been disabled in Firebase Authentication (auth/user-disabled).';
  }

  return code ? `Authentication failed (${code}): ${rawMessage}` : rawMessage;
}

async function testConnection() {
  if (!dbInstance) return;
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return;
  try {
    await getDocFromServer(doc(dbInstance, 'test', 'connection'));
  } catch (error) {
    if (error instanceof Error && error.message.includes('the client is offline')) {
      console.warn('Firestore backend unreachable from this browser session; offline fallback active.');
    }
  }
}

void testConnection();
