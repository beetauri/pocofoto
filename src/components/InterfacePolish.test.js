import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const stylesheetSource = readFileSync(new URL('../index.css', import.meta.url), 'utf8');
const historySource = readFileSync(new URL('./HistoryScreen.jsx', import.meta.url), 'utf8');
const mainSource = readFileSync(new URL('./MainScreen.jsx', import.meta.url), 'utf8');

function cssRule(selector) {
  const escapedSelector = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = stylesheetSource.match(new RegExp(`${escapedSelector}\\s*\\{([^}]*)\\}`));
  return match?.[1] || '';
}

test('dark image surfaces use the shared inset pure-white outline', () => {
  const imageRule = cssRule('.camera-frame img,\n.camera-switch-overlay img,\n.review-photo-layer img,\n.history-tile img,\n.profile-avatar');

  assert.match(imageRule, /outline:\s*1px solid rgba\(255, 255, 255, 0\.1\)/);
  assert.match(imageRule, /outline-offset:\s*-1px/);
});

test('interactive controls use explicit transitions and restrained press scale', () => {
  for (const selector of [
    '.camera-tool-btn',
    '.photo-retry-btn',
    '.photo-delete-btn',
    '.like-btn',
    '.nav-item',
    '.history-tile',
    '.profile-action-button,\n.profile-danger-action,\n.profile-about-trigger'
  ]) {
    assert.doesNotMatch(cssRule(selector), /transition:\s*all/);
  }

  for (const selector of [
    '.camera-tool-btn:active',
    '.photo-retry-btn:active',
    '.photo-delete-btn:active',
    '.nav-item:active',
    '.history-tile:active'
  ]) {
    assert.match(cssRule(selector), /transform:\s*scale\(0\.96\)/);
  }

  assert.match(mainSource, /whileTap=\{\{ scale: 0\.96 \}\}/);
  assert.doesNotMatch(mainSource, /whileTap=\{\{ scale: 0\.86 \}\}/);
});

test('headings, supporting text, and dynamic time use stable typography', () => {
  assert.match(cssRule('.history-header h2'), /text-wrap:\s*balance/);
  assert.match(cssRule('.profile-identity h1'), /text-wrap:\s*balance/);
  assert.match(cssRule('.empty-state span'), /text-wrap:\s*pretty/);
  assert.match(cssRule('.profile-identity p'), /text-wrap:\s*pretty/);
  assert.match(cssRule('.photo-meta span'), /font-variant-numeric:\s*tabular-nums/);
});

test('navigation uses a shadow-ring instead of a depth border', () => {
  const navRule = cssRule('.bottom-nav');

  assert.match(navRule, /border:\s*0/);
  assert.match(navRule, /box-shadow:\s*0 0 0 1px rgba\(255, 255, 255, 0\.08\)/);
});

test('Profile cards use a shadow-ring instead of a depth border', () => {
  const profileCardRule = cssRule('.profile-glass-card');

  assert.match(profileCardRule, /border:\s*0/);
  assert.match(profileCardRule, /box-shadow:\s*[\s\S]*0 0 0 1px rgba\(255, 255, 255, 0\.08\)/);
});

test('compact Profile links retain at least a 40px target', () => {
  const legalLinkRule = cssRule('.profile-legal-links a');

  assert.match(legalLinkRule, /min-height:\s*40px/);
  assert.match(legalLinkRule, /padding:\s*0 6px/);
});

test('existing contextual icon motion uses the approved values', () => {
  assert.match(mainSource, /initial=\{\{ opacity: 0, scale: 0\.25, filter: 'blur\(4px\)' \}\}/);
  assert.match(mainSource, /animate=\{\{ opacity: 1, scale: 1, filter: 'blur\(0px\)' \}\}/);
  assert.match(mainSource, /exit=\{\{ opacity: 0, scale: 0\.25, filter: 'blur\(4px\)' \}\}/);
  assert.match(mainSource, /transition=\{\{ type: 'spring', duration: 0\.3, bounce: 0 \}\}/);
  assert.match(historySource, /initial=\{\{ opacity: 0, scale: 0\.96 \}\}/);
});
