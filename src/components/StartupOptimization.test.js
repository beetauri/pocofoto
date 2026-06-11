import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const appSource = readFileSync(new URL('../App.jsx', import.meta.url), 'utf8');
const mainSource = readFileSync(new URL('./MainScreen.jsx', import.meta.url), 'utf8');

test('feed photos are lazy and dynamic background runtime is removed', () => {
  assert.match(mainSource, /alt="Shared moment" loading="lazy" decoding="async"/);
  assert.doesNotMatch(mainSource, /loading="eager"/);
  assert.doesNotMatch(mainSource, /extractPalette|normalizePalette|paletteV2FromLegacy|onBackgroundSourceChange/);
  assert.doesNotMatch(appSource, /backgroundSource|onBackgroundSourceChange/);
});

test('History and Profile mount only after first navigation', () => {
  assert.match(mainSource, /new Set\(\['home'\]\)/);
  assert.match(mainSource, /mountedViews\.has\('history'\) &&/);
  assert.match(mainSource, /mountedViews\.has\('profile'\) &&/);
  assert.match(mainSource, /setMountedViews/);
});

test('Home and History share the paginated photo source', () => {
  assert.match(mainSource, /usePaginatedPhotos\(coupleId\)/);
  assert.match(mainSource, /<HistoryScreen[\s\S]*photos=\{photos\}[\s\S]*onLoadMore=\{loadMorePhotos\}/);
  assert.match(mainSource, /<PhotoLoadMoreSentinel[\s\S]*onLoadMore=\{loadMorePhotos\}/);
});
