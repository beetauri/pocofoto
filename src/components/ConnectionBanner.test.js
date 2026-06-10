import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const bannerSource = readSource('./ConnectionBanner.jsx');
const alertSource = readSource('./ui/alert.jsx');
const appSource = readSource('../App.jsx');
const stylesheetSource = readSource('../index.css');

function readSource(path) {
  try {
    return readFileSync(new URL(path, import.meta.url), 'utf8');
  } catch {
    return '';
  }
}

function cssRule(selector) {
  const escapedSelector = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = stylesheetSource.match(new RegExp(`${escapedSelector}\\s*\\{([^}]*)\\}`));
  return match?.[1] || '';
}

test('ConnectionBanner uses the shadcn Alert primitive', () => {
  assert.match(bannerSource, /from ['"]\.\/ui\/alert['"]/);
  assert.match(bannerSource, /AlertTitle/);
  assert.match(bannerSource, /AlertDescription/);
  assert.match(alertSource, /data-slot="alert"/);
  assert.match(alertSource, /data-slot="alert-title"/);
  assert.match(alertSource, /data-slot="alert-description"/);
});

test('ConnectionBanner renders offline and restored states with status semantics', () => {
  assert.match(bannerSource, /status === ['"]offline['"]/);
  assert.match(bannerSource, /status === ['"]restored['"]/);
  assert.match(bannerSource, /You're offline/);
  assert.match(bannerSource, /Capture still works\. Reconnect to send or pair\./);
  assert.match(bannerSource, /Back online/);
  assert.match(bannerSource, /connection-banner--offline/);
  assert.match(bannerSource, /connection-banner--restored/);
  assert.match(bannerSource, /role="status"/);
  assert.match(bannerSource, /aria-live="polite"/);
});

test('App renders ConnectionBanner from connection status store', () => {
  assert.match(appSource, /import ConnectionBanner from ['"]\.\/components\/ConnectionBanner['"]/);
  assert.match(appSource, /connectionStatusStore/);
  assert.match(appSource, /useState\(\(\) => connectionStatusStore\.getSnapshot\(\)\)/);
  assert.match(appSource, /connectionStatusStore\.subscribe/);
  assert.match(appSource, /<ConnectionBanner\s+status=\{connectionStatus\.status\}\s*\/>/);
  assert.match(appSource, /offsetForConnectionBanner=\{connectionStatus\.status === ['"]offline['"] \|\| connectionStatus\.status === ['"]restored['"]\}/);
});

test('ConnectionBanner CSS uses safe-area positioning and state variants', () => {
  const bannerRule = cssRule('.connection-banner');
  const alertRule = cssRule('.connection-banner [data-slot="alert"]');
  const offlineRule = cssRule('.connection-banner--offline [data-slot="alert"]');
  const restoredRule = cssRule('.connection-banner--restored [data-slot="alert"]');
  const updateOffsetRule = cssRule('.update-banner.has-connection-banner-offset');

  assert.match(bannerRule, /top:\s*calc\(var\(--safe-top\) \+ 12px\)/);
  assert.match(bannerRule, /z-index:\s*1300/);
  assert.match(bannerRule, /width:\s*min\(420px,\s*calc\(100vw - 24px\)\)/);
  assert.match(alertRule, /backdrop-filter:\s*blur\(/);
  assert.match(offlineRule, /rgb\(239 68 68/);
  assert.match(restoredRule, /rgb\(34 197 94/);
  assert.match(updateOffsetRule, /top:\s*calc\(var\(--safe-top\) \+ 88px\)/);
});
