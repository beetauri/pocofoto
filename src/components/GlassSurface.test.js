import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const stylesheetSource = readFileSync(new URL('../index.css', import.meta.url), 'utf8');
const mainScreenSource = readFileSync(new URL('./MainScreen.jsx', import.meta.url), 'utf8');
const buttonSource = readFileSync(new URL('./ui/button.jsx', import.meta.url), 'utf8');

function cssRule(selector) {
  const escapedSelector = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = stylesheetSource.match(new RegExp(`${escapedSelector}\\s*\\{([^}]*)\\}`));
  return match?.[1] || '';
}

function cssRules(selector) {
  const escapedSelector = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return [...stylesheetSource.matchAll(new RegExp(`${escapedSelector}\\s*\\{([^}]*)\\}`, 'g'))]
    .map((match) => match[1]);
}

test('centered glass surfaces do not transform the backdrop-filter element', () => {
  for (const selector of ['.caption-pill', '.bottom-nav']) {
    const rule = cssRule(selector);

    assert.match(rule, /backdrop-filter:\s*blur\(/);
    assert.match(rule, /left:\s*0/);
    assert.match(rule, /right:\s*0/);
    assert.match(rule, /margin-inline:\s*auto/);
    assert.doesNotMatch(rule, /transform:/);
  }
});

test('Retune glass values are applied to the nav and photo overlays', () => {
  const navRule = cssRule('.bottom-nav');
  const statusRule = cssRule('.status-chip');
  const captionRule = cssRule('.caption-pill');

  assert.match(navRule, /background:\s*rgba\(31, 28, 27, 0\.33\)/);
  assert.match(navRule, /box-shadow:\s*0 0 0 1px rgba\(255, 255, 255, 0\.08\)/);
  assert.match(navRule, /backdrop-filter:\s*blur\(16px\)/);
  assert.match(navRule, /border:\s*0/);
  assert.match(statusRule, /background:\s*rgba\(31, 28, 27, 0\.33\)/);
  assert.match(captionRule, /background:\s*rgba\(31, 28, 27, 0\.33\)/);
});

test('Retune icon details are scoped to the grid and mini shutter icons', () => {
  const miniShutterRule = cssRule('.mini-shutter-nav-icon svg');

  assert.match(mainScreenSource, /function GridIcon\(\)[\s\S]*?<LucideGridIcon[^>]*strokeWidth=\{2\.2\}/);
  assert.match(mainScreenSource, /function ShutterIcon\(\{ pressed = false \}\)/);
  assert.match(mainScreenSource, /<motion\.circle[\s\S]*className="shutter-icon-inner"[\s\S]*r="39\.7217"/);
  assert.match(miniShutterRule, /width:\s*44px/);
  assert.match(miniShutterRule, /height:\s*44px/);
});

test('disabled icon controls use color instead of opacity', () => {
  const iconButtonRule = cssRule('.icon-btn');
  const updateBannerIconButtonRule = cssRule('.update-banner-icon-btn');
  const updateBannerActionDisabledRule = cssRule('.update-banner-action:disabled');
  const primaryButtonDisabledRule = cssRule('.btn-primary:disabled,\n.btn-ghost:disabled');
  const emptyStateIconRule = cssRule('.empty-state svg');
  const navItemRule = cssRule('.nav-item');
  const navItemActiveRule = cssRule('.nav-item.active');
  const navItemHoverRule = cssRule('.nav-item:hover');
  const cameraToolDisabledRule = cssRule('.camera-tool-btn:disabled');
  const cameraToolRule = cssRule('.camera-tool-btn');
  const miniButtonDisabledRule = cssRule('.mini-btn:disabled');

  for (const rule of [
    iconButtonRule,
    updateBannerIconButtonRule,
    updateBannerActionDisabledRule,
    primaryButtonDisabledRule,
    emptyStateIconRule,
    navItemRule,
    navItemActiveRule,
    navItemHoverRule,
    cameraToolRule,
    cameraToolDisabledRule,
    miniButtonDisabledRule
  ]) {
    assert.doesNotMatch(rule, /opacity:/);
    assert.doesNotMatch(rule, /color:\s*rgba\(/);
  }

  assert.match(iconButtonRule, /color:\s*var\(--icon-secondary\)/);
  assert.match(updateBannerIconButtonRule, /color:\s*var\(--icon-secondary\)/);
  assert.match(updateBannerActionDisabledRule, /color:\s*var\(--icon-muted\)/);
  assert.match(primaryButtonDisabledRule, /color:\s*var\(--icon-muted\)/);
  assert.match(emptyStateIconRule, /color:\s*var\(--icon-secondary\)/);
  assert.match(navItemRule, /color:\s*var\(--icon-muted\)/);
  assert.match(navItemActiveRule, /color:\s*var\(--icon-primary\)/);
  assert.match(navItemHoverRule, /color:\s*var\(--icon-primary\)/);
  assert.match(cameraToolRule, /color:\s*var\(--icon-secondary\)/);
  assert.doesNotMatch(cameraToolDisabledRule, /opacity:/);
  assert.match(cameraToolDisabledRule, /color:\s*var\(--icon-muted\)/);
  assert.match(miniButtonDisabledRule, /color:\s*var\(--icon-muted\)/);
});

test('all shared Lucide icon states use opaque color instead of opacity', () => {
  const photoFallbackRule = cssRules('.resilient-photo-fallback')
    .find((rule) => /place-items:\s*center/.test(rule));

  assert.ok(photoFallbackRule);
  assert.match(photoFallbackRule, /color:\s*var\(--icon-muted\)/);
  assert.doesNotMatch(photoFallbackRule, /color:\s*(?:rgba\(|rgb\([^)]*\/|hsla\()/);
  assert.doesNotMatch(photoFallbackRule, /opacity:/);
  assert.doesNotMatch(buttonSource, /disabled:opacity-/);
});

test('prefixed backdrop filters precede standard declarations for production CSS transforms', () => {
  assert.doesNotMatch(stylesheetSource, /(?<!-webkit-)backdrop-filter:\s*([^;]+);\s*-webkit-backdrop-filter:\s*\1;/);
  assert.match(stylesheetSource, /-webkit-backdrop-filter:\s*blur\(16px\);\s*backdrop-filter:\s*blur\(16px\);/);
});
