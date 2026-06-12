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

test('PostHog records detailed replay, console, network, and exception diagnostics', () => {
  assert.match(analyticsSource, /enable_recording_console_log:\s*true/);
  assert.match(analyticsSource, /capture_dead_clicks:\s*true/);
  assert.match(analyticsSource, /capture_exceptions:\s*true/);
  assert.match(analyticsSource, /capture_heatmaps:\s*true/);
  assert.match(analyticsSource, /capture_performance:\s*\{[\s\S]*network_timing:\s*true[\s\S]*web_vitals:\s*true[\s\S]*web_vitals_attribution:\s*true/);
  assert.match(analyticsSource, /capture_copied_text:\s*true/);
  assert.match(analyticsSource, /person_profiles:\s*'always'/);
  assert.match(analyticsSource, /mask_all_element_attributes:\s*false/);
  assert.match(analyticsSource, /mask_all_text:\s*false/);
  assert.match(analyticsSource, /mask_personal_data_properties:\s*false/);
  assert.match(analyticsSource, /maskAllInputs:\s*false/);
  assert.match(analyticsSource, /recordBody:\s*true/);
  assert.match(analyticsSource, /recordHeaders:\s*true/);
  assert.match(analyticsSource, /sampleRate:\s*1/);
});
