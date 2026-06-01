import posthog from 'posthog-js';
import { logEvent } from 'firebase/analytics';
import { analytics } from './firebase';

const posthogKey = import.meta.env.VITE_POSTHOG_PROJECT_TOKEN || import.meta.env.VITE_POSTHOG_KEY || 'phc_qw8P4JmxPeFvWd7ev5w8nY32JsqXCJpvsH4oVJg5i9TF';
const posthogHost = import.meta.env.VITE_POSTHOG_HOST || 'https://pocofoto.com.tr';

let initialized = false;

function canUseBrowserAnalytics() {
  return typeof window !== 'undefined' && typeof document !== 'undefined';
}

function toGoogleAnalyticsEventName(eventName) {
  if (eventName === '$pageview') return 'page_view';
  return eventName.replace(/^\$+/, '').replace(/[^a-zA-Z0-9_]/g, '_').slice(0, 40);
}

export function initAnalytics() {
  if (initialized || !canUseBrowserAnalytics()) return;

  if (posthogKey) {
    posthog.init(posthogKey, {
      api_host: posthogHost,
      defaults: '2026-05-30',
      capture_pageview: false,
      capture_pageleave: true,
      autocapture: true,
      session_recording: {
        maskAllInputs: true,
        maskTextSelector: 'input, textarea, [data-ph-mask]'
      }
    });
  }

  initialized = true;
}

export function trackEvent(eventName, properties = {}) {
  if (!canUseBrowserAnalytics()) return;
  if (posthogKey) {
    posthog.capture(eventName, properties);
  }
  if (analytics) {
    logEvent(analytics, toGoogleAnalyticsEventName(eventName), properties);
  }
}

export function identifyUser(userId, properties = {}) {
  if (!canUseBrowserAnalytics() || !posthogKey || !userId) return;
  posthog.identify(userId, properties);
}

export function resetAnalytics() {
  if (!canUseBrowserAnalytics() || !posthogKey) return;
  posthog.reset();
}

export function capturePageView(properties = {}) {
  trackEvent('$pageview', properties);
}
