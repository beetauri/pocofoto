import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import {
  INITIAL_PHOTO_LIMIT,
  PHOTO_PAGE_SIZE,
  mergePhotoPages
} from './photoPagination.js';

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
