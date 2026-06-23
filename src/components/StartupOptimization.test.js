import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const appSource = readFileSync(new URL('../App.jsx', import.meta.url), 'utf8');
const mainSource = readFileSync(new URL('./MainScreen.jsx', import.meta.url), 'utf8');
const indexCssSource = readFileSync(new URL('../index.css', import.meta.url), 'utf8');

test('feed photos are lazy and dynamic background runtime is removed', () => {
  assert.match(mainSource, /<ResilientPhotoImage/);
  assert.match(mainSource, /alt=\{t\('sharedMoment'\)\}/);
  assert.match(mainSource, /loading="lazy"/);
  assert.match(mainSource, /decoding="async"/);
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
  assert.match(mainSource, /usePaginatedPhotos\(coupleId, localPhotos\)/);
  assert.match(mainSource, /<HistoryScreen[\s\S]*photos=\{photos\}[\s\S]*onLoadMore=\{loadMorePhotos\}/);
  assert.match(mainSource, /<PhotoLoadMoreSentinel[\s\S]*onLoadMore=\{loadMorePhotos\}/);
});

test('Home feed keeps snap paging without hard-stopping every slide', () => {
  assert.match(indexCssSource, /\.reels-feed\s*\{[\s\S]*scroll-snap-type:\s*y mandatory/);
  assert.match(indexCssSource, /\.reels-slide\s*\{[\s\S]*scroll-snap-align:\s*start/);
  assert.doesNotMatch(indexCssSource, /\.reels-slide\s*\{[\s\S]*scroll-snap-stop:\s*always/);
});

test('Home feed settles native scroll to the nearest snap slide', () => {
  assert.match(mainSource, /getNearestFeedSnapTop/);
  assert.match(mainSource, /querySelectorAll\('\.reels-slide'\)/);
  assert.match(mainSource, /setTimeout\(settleFeedScroll/);
});
