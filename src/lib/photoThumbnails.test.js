import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const source = readFileSync(new URL('./photoThumbnails.js', import.meta.url), 'utf8');

test('History thumbnails are fixed 256px WebP assets', () => {
  assert.match(source, /export const HISTORY_THUMBNAIL_SIZE = 256;/);
  assert.match(source, /export const HISTORY_THUMBNAIL_TYPE = 'image\/webp';/);
  assert.match(source, /export const HISTORY_THUMBNAIL_EXTENSION = 'webp';/);
});

test('thumbnail helper center-crops and exports WebP only', () => {
  assert.match(source, /function getCenterCrop\(width, height\)/);
  assert.match(source, /canvas\.width = HISTORY_THUMBNAIL_SIZE;/);
  assert.match(source, /canvas\.height = HISTORY_THUMBNAIL_SIZE;/);
  assert.match(source, /canvas\.toBlob\([\s\S]*HISTORY_THUMBNAIL_TYPE[\s\S]*HISTORY_THUMBNAIL_QUALITY/);
  assert.doesNotMatch(source, /image\/jpeg/);
});
