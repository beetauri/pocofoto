import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const analyticsSource = readFileSync(new URL('../analytics.js', import.meta.url), 'utf8');
const appSource = readFileSync(new URL('../App.jsx', import.meta.url), 'utf8');

test('PostHog captures pageviews and scroll depth', () => {
  assert.match(analyticsSource, /capture_pageview:\s*true/);
  assert.match(analyticsSource, /disable_scroll_properties:\s*false/);
  assert.match(analyticsSource, /scroll_root_selector:\s*\[[\s\S]*'\.reels-feed'[\s\S]*'html'/);
  assert.match(analyticsSource, /export function startScrollDepthTracking/);
  assert.match(analyticsSource, /trackEvent\('scroll_depth'/);
  assert.match(appSource, /startScrollDepthTracking\(\)/);
});
