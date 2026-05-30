import posthog from 'posthog-js';

const posthogKey = import.meta.env.VITE_POSTHOG_PROJECT_TOKEN || import.meta.env.VITE_POSTHOG_KEY || '';
const posthogHost = import.meta.env.VITE_POSTHOG_HOST || 'https://us.i.posthog.com';

let initialized = false;

function canUseBrowserAnalytics() {
  return typeof window !== 'undefined' && typeof document !== 'undefined';
}

export function initAnalytics() {
  if (initialized || !canUseBrowserAnalytics()) return;

  if (posthogKey) {
    posthog.init(posthogKey, {
      api_host: posthogHost,
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
