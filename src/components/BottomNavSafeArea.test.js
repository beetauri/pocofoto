import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const stylesheetSource = readFileSync(new URL('../index.css', import.meta.url), 'utf8');
const indexHtmlSource = readFileSync(new URL('../../index.html', import.meta.url), 'utf8');
const viteConfigSource = readFileSync(new URL('../../vite.config.js', import.meta.url), 'utf8');
const appBackgroundSource = readFileSync(new URL('./AppBackground.jsx', import.meta.url), 'utf8');

function cssRule(selector) {
  const escapedSelector = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = stylesheetSource.match(new RegExp(`(?:^|\\n)${escapedSelector}\\s*\\{([^}]*)\\}`));
  return match?.[1] || '';
}

function sourceBlock(source, selector) {
  const start = source.indexOf(`${selector} {`);
  if (start === -1) return '';
  const end = source.indexOf('\n}', start);
  return end === -1 ? '' : source.slice(start, end + 2);
}

test('bottom nav keeps a small iOS safe-area lift without padding', () => {
  const navRule = cssRule('.bottom-nav');

  assert.match(navRule, /bottom:\s*max\(34px,\s*env\(safe-area-inset-bottom\)\)/);
  assert.doesNotMatch(navRule, /padding-bottom/);
});

test('standalone iOS safe-area fallback is not pure black', () => {
  const rootRule = cssRule(':root');
  const htmlRule = cssRule('html');
  const bodyRule = cssRule('body');

  assert.match(rootRule, /--pwa-safe-area-bg:\s*#[0-9a-fA-F]{6}/);
  assert.doesNotMatch(rootRule, /--pwa-safe-area-bg:\s*#000000/i);
  assert.match(htmlRule, /background:\s*var\(--pwa-safe-area-bg\)/);
  assert.match(bodyRule, /background:\s*var\(--pwa-safe-area-bg\)/);
  assert.match(indexHtmlSource, /<meta name="theme-color" content="(?!#000000")[^"]+"/i);
  assert.match(viteConfigSource, /theme_color:\s*'(?!#000000')[^']+'/i);
  assert.match(viteConfigSource, /background_color:\s*'(?!#000000')[^']+'/i);
});

test('pwa stays standalone while root uses viewport height for translucent status bar', () => {
  const rootSizingRule = cssRule('html, body, #root');

  assert.match(viteConfigSource, /display:\s*'standalone'/);
  assert.doesNotMatch(viteConfigSource, /display:\s*'fullscreen'/);
  assert.match(indexHtmlSource, /apple-mobile-web-app-status-bar-style" content="black-translucent"/);
  assert.match(rootSizingRule, /height:\s*100vh/);
  assert.match(rootSizingRule, /min-height:\s*100vh/);
  assert.doesNotMatch(rootSizingRule, /height:\s*100%/);
  assert.doesNotMatch(rootSizingRule, /min-height:\s*100%/);
  assert.doesNotMatch(stylesheetSource, /height:\s*100dvh/);
  assert.doesNotMatch(stylesheetSource, /min-height:\s*100dvh/);
});

test('app background extends behind the bottom iOS safe-area strip', () => {
  const backgroundRule = cssRule('.app-background');
  const backgroundBeforeRule = sourceBlock(stylesheetSource, '.app-background::before');
  const backgroundLayerRule = cssRule('.app-background-layer');
  const backgroundLayerAfterRule = sourceBlock(stylesheetSource, '.app-background-layer::after');

  assert.match(backgroundRule, /bottom:\s*calc\(var\(--safe-bottom\) \* -1\)/);
  assert.match(backgroundRule, /background:\s*var\(--pwa-safe-area-bg\)/);
  assert.match(backgroundBeforeRule, /bottom:\s*0/);
  assert.match(backgroundBeforeRule, /background:\s*var\(--pwa-safe-area-background\)/);
  assert.match(backgroundLayerRule, /bottom:\s*0/);
  assert.match(backgroundLayerAfterRule, /bottom:\s*0/);
});

test('app background parent receives active photo background variables', () => {
  assert.match(appBackgroundSource, /<div\s+className="app-background"\s+aria-hidden="true"\s+style=\{\{/);
  assert.match(appBackgroundSource, /activeSource\.imageUrl[\s\S]*'--photo-bg-image'/);
  assert.match(appBackgroundSource, /'--photo-bg-top':\s*activeSource\.palette\.topColor/);
  assert.match(appBackgroundSource, /'--photo-bg-bottom':\s*activeSource\.palette\.bottomColor/);
});
