import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const stylesheetSource = readFileSync(new URL('../index.css', import.meta.url), 'utf8');
const mainScreenSource = readFileSync(new URL('./MainScreen.jsx', import.meta.url), 'utf8');

function cssRule(selector) {
  const escapedSelector = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = stylesheetSource.match(new RegExp(`${escapedSelector}\\s*\\{([^}]*)\\}`));
  return match?.[1] || '';
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
  assert.match(navRule, /box-shadow:\s*none/);
  assert.match(navRule, /backdrop-filter:\s*blur\(16px\)/);
  assert.match(navRule, /border:\s*1px solid rgba\(255, 255, 255, 0\.03\)/);
  assert.match(statusRule, /background:\s*rgba\(31, 28, 27, 0\.33\)/);
  assert.match(captionRule, /background:\s*rgba\(31, 28, 27, 0\.33\)/);
});

test('Retune icon details are scoped to the grid and mini shutter icons', () => {
  assert.match(mainScreenSource, /function GridIcon\(\)[\s\S]*?<LucideGridIcon[^>]*strokeWidth=\{2\.2\}/);
  assert.match(mainScreenSource, /<circle[^>]*r="4\.7"[^>]*className="h-px w-px"/);
});
