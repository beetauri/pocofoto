import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const historyScreenSource = readFileSync(new URL('./HistoryScreen.jsx', import.meta.url), 'utf8');
const stylesheetSource = readFileSync(new URL('../index.css', import.meta.url), 'utf8');

function cssRule(selector) {
  const escapedSelector = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = stylesheetSource.match(new RegExp(`${escapedSelector}\\s*\\{([^}]*)\\}`));
  return match?.[1] || '';
}

test('History grid passes native loading hints to resilient photos', () => {
  assert.match(historyScreenSource, /<ResilientPhotoImage/);
  assert.match(historyScreenSource, /loading="lazy"/);
  assert.match(historyScreenSource, /decoding="async"/);
});

test('History grid uses thumbnails without falling back to full photo URLs', () => {
  assert.match(historyScreenSource, /src=\{photo\.thumbnailUrl\}/);
  assert.doesNotMatch(historyScreenSource, /photo\.thumbnailUrl \|\| photo\.photoUrl/);
});

test('History consumes shared photos without a duplicate Firestore listener', () => {
  assert.match(historyScreenSource, /photos,\s*loading,\s*hasMore,\s*loadingMore,\s*loadError,\s*onLoadMore/);
  assert.doesNotMatch(historyScreenSource, /from ['"]\.\.\/firebase['"]/);
  assert.doesNotMatch(historyScreenSource, /onSnapshot|collection\(|query\(/);
});

test('History grid uses compact Retune layout values', () => {
  const screenRule = cssRule('.history-screen');
  const headerRule = cssRule('.history-header');
  const gridRule = cssRule('.history-grid');
  const tileRule = cssRule('.history-tile');

  assert.match(screenRule, /padding:\s*calc\(var\(--safe-top\) \+ 18px\) 4px calc\(var\(--safe-bottom\) \+ 104px\)/);
  assert.match(screenRule, /align-items:\s*flex-start/);
  assert.match(screenRule, /justify-content:\s*flex-start/);
  assert.match(headerRule, /width:\s*100%/);
  assert.match(gridRule, /gap:\s*4px/);
  assert.match(tileRule, /width:\s*auto/);
  assert.match(tileRule, /height:\s*auto/);
  assert.match(tileRule, /align-self:\s*stretch/);
  assert.match(tileRule, /justify-self:\s*stretch/);
});

test('History self badge is removed', () => {
  assert.doesNotMatch(historyScreenSource, /history-badge/);
  assert.doesNotMatch(historyScreenSource, />You<\/span>/);
  assert.doesNotMatch(stylesheetSource, /\.history-badge/);
});

test('History sources customer copy from its translation namespace', () => {
  assert.match(historyScreenSource, /useTranslation\('history'\)/);
  assert.match(historyScreenSource, /t\('title'\)/);
  assert.match(historyScreenSource, /t\('empty\.title'\)/);
  assert.match(historyScreenSource, /t\('openPhoto'\)/);
});
