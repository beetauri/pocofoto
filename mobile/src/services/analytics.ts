import { getAnalytics, logEvent, setAnalyticsCollectionEnabled, setDefaultEventParameters } from '@react-native-firebase/analytics';
import * as amplitude from '@amplitude/analytics-react-native';
import PostHog from 'posthog-react-native';
import * as Sentry from '@sentry/react-native';
import { firebaseApp, firebaseProject } from './firebase';
import { loadAnalyticsConsent, persistAnalyticsConsent } from '../domain/analyticsConsent';

export { loadAnalyticsConsent } from '../domain/analyticsConsent';

const posthogKey = process.env.EXPO_PUBLIC_POSTHOG_PROJECT_TOKEN || process.env.EXPO_PUBLIC_POSTHOG_KEY || '';
const posthogHost = process.env.EXPO_PUBLIC_POSTHOG_HOST || 'https://p.pocofoto.com.tr';
const amplitudeKey = process.env.EXPO_PUBLIC_AMPLITUDE_API_KEY || '';
const sentryDsn = process.env.EXPO_PUBLIC_SENTRY_DSN || '';

type AnalyticsClient = ReturnType<typeof getAnalytics>;

let analyticsClient: AnalyticsClient | null = null;
let posthogClient: PostHog | null = null;
let amplitudeInitialized = false;
let initialized = false;
let analyticsEnabled = false;
let currentUser: { uid?: string; email?: string | null; displayName?: string | null } | null = null;

function createAnalyticsClients() {
  if (!analyticsClient) analyticsClient = getAnalytics(firebaseApp);
  if (!posthogClient && posthogKey) {
    posthogClient = new PostHog(posthogKey, {
      host: posthogHost,
      captureAppLifecycleEvents: true,
      enableSessionReplay: process.env.EXPO_PUBLIC_POSTHOG_SESSION_REPLAY === 'true'
    });
  }
  if (amplitudeKey && !amplitudeInitialized) {
    amplitude.init(amplitudeKey, undefined, { optOut: false });
    amplitudeInitialized = true;
  }
}

async function enableProviders() {
  createAnalyticsClients();
  if (!analyticsClient) return;
  await setAnalyticsCollectionEnabled(analyticsClient, true);
  await setDefaultEventParameters(analyticsClient, { app: 'pocofoto-native', firebaseProject });
  if (amplitudeInitialized) amplitude.setOptOut(false);
  if (currentUser?.uid) {
    const identity: Record<string, string> = {};
    if (currentUser.email) identity.email = currentUser.email;
    if (currentUser.displayName) identity.name = currentUser.displayName;
    posthogClient?.identify(currentUser.uid, identity);
    if (amplitudeInitialized) amplitude.setUserId(currentUser.uid);
  }
}

async function disableProviders() {
  if (analyticsClient) await setAnalyticsCollectionEnabled(analyticsClient, false);
  posthogClient?.reset();
  if (amplitudeInitialized) {
    amplitude.setOptOut(true);
    amplitude.reset();
  }
}

export async function initAnalytics() {
  if (initialized) return;
  initialized = true;
  if (sentryDsn) {
    Sentry.init({
      dsn: sentryDsn,
      enableAutoSessionTracking: true,
      tracesSampleRate: __DEV__ ? 0 : 0.1
    });
  }
  analyticsEnabled = await loadAnalyticsConsent();
  if (analyticsEnabled) await enableProviders();
}

export async function setAnalyticsConsent(enabled: boolean) {
  await persistAnalyticsConsent(enabled);
  analyticsEnabled = enabled;
  if (enabled) await enableProviders();
  else await disableProviders();
}

export function isAnalyticsEnabled() {
  return analyticsEnabled;
}

export async function trackEvent(name: string, parameters: Record<string, string | number | boolean | null> = {}) {
  if (!analyticsEnabled || !analyticsClient) return;
  posthogClient?.capture(name, parameters);
  if (amplitudeInitialized) amplitude.track(name, parameters);
  await logEvent(analyticsClient, name as never, parameters);
}

export function syncSentryUser(user: { uid?: string; email?: string | null; displayName?: string | null } | null) {
  currentUser = user;
  Sentry.setUser(user?.uid ? {
    id: user.uid,
    email: user.email || undefined,
    username: user.displayName || undefined
  } : null);
  if (!analyticsEnabled) return;
  if (user?.uid) {
    const identity: Record<string, string> = {};
    if (user.email) identity.email = user.email;
    if (user.displayName) identity.name = user.displayName;
    posthogClient?.identify(user.uid, identity);
    if (amplitudeInitialized) amplitude.setUserId(user.uid);
  } else {
    posthogClient?.reset();
    if (amplitudeInitialized) amplitude.reset();
  }
}

export function captureHandledException(error: unknown, context: Record<string, unknown> = {}) {
  Sentry.withScope((scope) => {
    scope.setExtras(context);
    Sentry.captureException(error);
  });
}
