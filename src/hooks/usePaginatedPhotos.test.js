import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import {
  INITIAL_PHOTO_LIMIT,
  PHOTO_PAGE_SIZE,
  mergePhotoPages
} from './photoPagination.js';
import { mergeServerAndLocalPhotos } from '../lib/localPhotoQueue.js';

const source = readFileSync(new URL('./usePaginatedPhotos.js', import.meta.url), 'utf8');
const paginationSource = readFileSync(new URL('./photoPagination.js', import.meta.url), 'utf8');

test('uses five realtime photos and pages older photos by ten', () => {
  assert.equal(INITIAL_PHOTO_LIMIT, 5);
  assert.equal(PHOTO_PAGE_SIZE, 10);
  assert.match(paginationSource, /INITIAL_PHOTO_LIMIT = 5/);
  assert.match(paginationSource, /PHOTO_PAGE_SIZE = 10/);
  assert.match(source, /limit\(INITIAL_PHOTO_LIMIT\)/);
  assert.match(source, /startAfter\(cursor\)/);
  assert.match(source, /limit\(PHOTO_PAGE_SIZE\)/);
});

test('merges realtime and older pages without duplicate ids', () => {
  const photos = mergePhotoPages(
    [{ id: 'new-2' }, { id: 'new-1' }],
    [[{ id: 'new-1' }, { id: 'old-1' }], [{ id: 'old-2' }]]
  );
  assert.deepEqual(photos.map((photo) => photo.id), ['new-2', 'new-1', 'old-1', 'old-2']);
});

test('preserves photos displaced from the realtime window after pagination', () => {
  assert.match(source, /displacedPhotos/);
  assert.match(source, /setOlderPages\(\(pages\) => \[displacedPhotos, \.\.\.pages\]\)/);
});

test('exposes a local photo updater for optimistic actions on paginated photos', () => {
  assert.match(source, /const updatePhotoLocal = useCallback/);
  assert.match(source, /setFirstPage\(\(page\) => page\.map\(applyUpdate\)\)/);
  assert.match(source, /setOlderPages\(\(pages\) => pages\.map\(\(page\) => page\.map\(applyUpdate\)\)\)/);
  assert.match(source, /firstPageRef\.current = firstPageRef\.current\.map\(applyUpdate\)/);
  assert.match(source, /updatePhotoLocal/);
});

test('appends local queue photos after merged server pages', () => {
  const serverPhotos = mergePhotoPages(
    [{ id: 'server-2' }, { id: 'server-1' }],
    [[{ id: 'older-1' }]]
  );
  const photos = mergeServerAndLocalPhotos(serverPhotos, [
    { id: 'local-1', localOnly: true },
    { id: 'local-2', localOnly: true }
  ]);

  assert.deepEqual(photos.map((photo) => photo.id), ['server-2', 'server-1', 'older-1', 'local-1', 'local-2']);
});

test('usePaginatedPhotos accepts local photos and exposes server insertion for reconciliation', () => {
  assert.match(source, /export function usePaginatedPhotos\(coupleId, localPhotos = \[\]\)/);
  assert.match(source, /mergeServerAndLocalPhotos\(mergePhotoPages\(firstPage, olderPages\), localPhotos\)/);
  assert.match(source, /const insertServerPhotoLocal = useCallback/);
  assert.match(source, /insertServerPhotoLocal/);
});
