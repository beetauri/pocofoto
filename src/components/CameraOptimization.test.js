import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const source = readFileSync(new URL('./MainScreen.jsx', import.meta.url), 'utf8');

test('delegates camera lifecycle to one hook and keeps the preview mounted', () => {
  assert.match(source, /useCamera\(\{/);
  assert.match(source, /<video ref=\{videoRef\} playsInline muted autoPlay \/>/);
  assert.match(source, /camera-switch-overlay/);
  assert.doesNotMatch(source, /const requestCamera =/);
  assert.doesNotMatch(source, /setFacingMode\(/);
});

test('resizes and compresses camera captures before upload', () => {
  assert.match(source, /getCoverCrop\(video\.videoWidth, video\.videoHeight\)/);
  assert.match(source, /fitCaptureDimensions\(crop\.width, crop\.height\)/);
  assert.match(source, /CAPTURE_JPEG_QUALITY/);
});

test('uploads best-effort WebP thumbnails beside full-size shared photos', () => {
  assert.match(source, /createHistoryThumbnailBlob/);
  assert.match(source, /HISTORY_THUMBNAIL_EXTENSION/);
  assert.match(source, /thumbnailUrl/);
  assert.match(source, /thumbnailFormat:\s*'webp'/);
  assert.match(source, /console\.warn\('History thumbnail upload failed\.'/);
});

test('keeps full-size capture as JPEG while thumbnails are separate WebP assets', () => {
  assert.match(source, /canvas\.toBlob\([\s\S]*'image\/jpeg'[\s\S]*CAPTURE_JPEG_QUALITY/);
  assert.match(source, /thumbnails\/\$\{timestampStr\}\.\$\{HISTORY_THUMBNAIL_EXTENSION\}/);
});
