import posthog from 'posthog-js';
import { logEvent } from 'firebase/analytics';
import { analytics } from './firebase';

const posthogKey = import.meta.env.VITE_POSTHOG_PROJECT_TOKEN || import.meta.env.VITE_POSTHOG_KEY || 'phc_qw8P4JmxPeFvWd7ev5w8nY32JsqXCJpvsH4oVJg5i9TF';
const posthogHost = import.meta.env.VITE_POSTHOG_HOST || 'https://p.pocofoto.com.tr';
const scrollDepthThresholds = [25, 50, 75, 90];

let initialized = false;
let stopScrollDepthTracking = null;

function canUseBrowserAnalytics() {
  return typeof window !== 'undefined' && typeof document !== 'undefined';
}

function toGoogleAnalyticsEventName(eventName) {
  if (eventName === '$pageview') return 'page_view';
  return eventName.replace(/^\$+/, '').replace(/[^a-zA-Z0-9_]/g, '_').slice(0, 40);
}

function isDocumentScrollRoot(root) {
  return root === window
    || root === document
    || root === document.documentElement
    || root === document.body;
}

function getScrollRootName(root) {
  if (isDocumentScrollRoot(root)) return 'html';
  if (root.matches?.('.reels-feed')) return '.reels-feed';
  return root.id ? `#${root.id}` : root.tagName?.toLowerCase() || 'unknown';
}

function getScrollMetrics(root) {
  if (isDocumentScrollRoot(root)) {
    const element = document.scrollingElement || document.documentElement;
    const viewportHeight = window.innerHeight || element.clientHeight || 0;
    const scrollHeight = Math.max(
      element.scrollHeight || 0,
      document.body?.scrollHeight || 0,
      viewportHeight
    );
    const depthPixels = Math.min(scrollHeight, (window.scrollY || element.scrollTop || 0) + viewportHeight);
    const depthPercent = scrollHeight <= viewportHeight ? 100 : Math.round((depthPixels / scrollHeight) * 100);

    return { depthPixels, depthPercent };
  }

  const viewportHeight = root.clientHeight || 0;
  const scrollHeight = Math.max(root.scrollHeight || 0, viewportHeight);
  const depthPixels = Math.min(scrollHeight, (root.scrollTop || 0) + viewportHeight);
  const depthPercent = scrollHeight <= viewportHeight ? 100 : Math.round((depthPixels / scrollHeight) * 100);

  return { depthPixels, depthPercent };
}

function getTrackedScrollRoot(target) {
  if (!target || isDocumentScrollRoot(target)) return document.documentElement;
  if (target.matches?.('.reels-feed')) return target;
  return target.closest?.('.reels-feed') || document.documentElement;
}

export function initAnalytics() {
  if (initialized || !canUseBrowserAnalytics()) return;

  if (posthogKey) {
    posthog.init(posthogKey, {
      api_host: posthogHost,
      defaults: '2026-05-30',
      capture_pageview: true,
      capture_pageleave: true,
      autocapture: true,
      rageclick: true,
      capture_copied_text: true,
      capture_dead_clicks: true,
      capture_exceptions: true,
      capture_heatmaps: true,
      capture_performance: {
        network_timing: true,
        web_vitals: true,
        web_vitals_attribution: true
      },
      disable_session_recording: false,
      disable_scroll_properties: false,
      enable_recording_console_log: true,
      mask_all_element_attributes: false,
      mask_all_text: false,
      mask_personal_data_properties: false,
      opt_out_capturing_by_default: false,
      opt_out_persistence_by_default: false,
      person_profiles: 'always',
      respect_dnt: false,
      scroll_root_selector: ['.reels-feed', 'html'],
      session_recording: {
        maskAllInputs: false,
        maskInputOptions: {
          color: false,
          date: false,
          'datetime-local': false,
          email: false,
          month: false,
          number: false,
          range: false,
          search: false,
          tel: false,
          text: false,
          time: false,
          url: false,
          week: false,
          textarea: false,
          select: false,
          password: false
        },
        maskTextSelector: null,
        recordBody: true,
        recordHeaders: true,
        sampleRate: 1
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

export function startScrollDepthTracking() {
  if (!canUseBrowserAnalytics()) return () => {};
  if (stopScrollDepthTracking) return stopScrollDepthTracking;

  const capturedThresholdsByRoot = new Map();

  function handleScroll(event) {
    const root = getTrackedScrollRoot(event?.target);
    const rootName = getScrollRootName(root);
    const metrics = getScrollMetrics(root);
    const capturedThresholds = capturedThresholdsByRoot.get(rootName) || new Set();

    for (const threshold of scrollDepthThresholds) {
      if (metrics.depthPercent >= threshold && !capturedThresholds.has(threshold)) {
        capturedThresholds.add(threshold);
        trackEvent('scroll_depth', {
          threshold,
          depthPercent: metrics.depthPercent,
          depthPixels: metrics.depthPixels,
          scrollRoot: rootName,
          pathname: window.location.pathname
        });
      }
    }

    capturedThresholdsByRoot.set(rootName, capturedThresholds);
  }

  window.addEventListener('scroll', handleScroll, { capture: true, passive: true });
  handleScroll({ target: document.documentElement });

  stopScrollDepthTracking = () => {
    window.removeEventListener('scroll', handleScroll, { capture: true });
    stopScrollDepthTracking = null;
  };

  return stopScrollDepthTracking;
}
