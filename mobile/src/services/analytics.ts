import { getAnalytics, logEvent, setAnalyticsCollectionEnabled, setDefaultEventParameters } from '@react-native-firebase/analytics';
import * as amplitude from '@amplitude/analytics-react-native';
import PostHog from 'posthog-react-native';
import * as Sentry from '@sentry/react-native';
import { firebaseApp, firebaseProject } from './firebase';

const analyticsClient = getAnalytics(firebaseApp);
const posthogKey = process.env.EXPO_PUBLIC_POSTHOG_PROJECT_TOKEN || process.env.EXPO_PUBLIC_POSTHOG_KEY || 'phc_qw8P4JmxPeFvWd7ev5w8nY32JsqXCJpvsH4oVJg5i9TF';
const posthogHost = process.env.EXPO_PUBLIC_POSTHOG_HOST || 'https://p.pocofoto.com.tr';
const amplitudeKey = process.env.EXPO_PUBLIC_AMPLITUDE_API_KEY || '';
const sentryDsn = process.env.EXPO_PUBLIC_SENTRY_DSN || '';
const posthogClient = posthogKey ? new PostHog(posthogKey, {
  host: posthogHost,
  captureAppLifecycleEvents: true,
  enableSessionReplay: process.env.EXPO_PUBLIC_POSTHOG_SESSION_REPLAY === 'true'
}) : null;

let initialized = false;

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
  if (amplitudeKey) amplitude.init(amplitudeKey);
  await setAnalyticsCollectionEnabled(
    analyticsClient,
    !__DEV__ || process.env.EXPO_PUBLIC_ENABLE_ANALYTICS === 'true'
  );
  await setDefaultEventParameters(analyticsClient, { app: 'pocofoto-native', firebaseProject });
}

export async function trackEvent(name: string, parameters: Record<string, string | number | boolean | null> = {}) {
  posthogClient?.capture(name, parameters);
  if (amplitudeKey) amplitude.track(name, parameters);
  await logEvent(analyticsClient, name as never, parameters);
}

export function syncSentryUser(user: { uid?: string; email?: string | null; displayName?: string | null } | null) {
  Sentry.setUser(user?.uid ? {
    id: user.uid,
    email: user.email || undefined,
    username: user.displayName || undefined
  } : null);
  if (user?.uid) {
    const identity: Record<string, string> = {};
    if (user.email) identity.email = user.email;
    if (user.displayName) identity.name = user.displayName;
    posthogClient?.identify(user.uid, identity);
    if (amplitudeKey) amplitude.setUserId(user.uid);
  } else {
    posthogClient?.reset();
    if (amplitudeKey) amplitude.reset();
  }
}

export function captureHandledException(error: unknown, context: Record<string, unknown> = {}) {
  Sentry.withScope((scope) => {
    scope.setExtras(context);
    Sentry.captureException(error);
  });
}
