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
  assert.match(source, /fitCaptureDimensions\(video\.videoWidth, video\.videoHeight\)/);
  assert.match(source, /CAPTURE_JPEG_QUALITY/);
});
