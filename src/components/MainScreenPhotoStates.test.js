import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const mainSource = readFileSync(new URL('./MainScreen.jsx', import.meta.url), 'utf8');
const cameraCopySource = readFileSync(new URL('../locales/en/camera.js', import.meta.url), 'utf8');

test('Main Feed uses resilient photos and a retry-only load failure action', () => {
  assert.match(mainSource, /<ResilientPhotoImage/);
  assert.match(mainSource, /onStatusChange=\{\(status\) => handlePhotoImageStatus/);
  assert.match(mainSource, /t\('photo\.loadRetry'\)/);
  assert.match(mainSource, /handleRetryPhotoImage\(photo\.id\)/);
  assert.match(cameraCopySource, /loadRetry: 'Try loading again'/);
});

test('remote load failure branch does not expose the upload delete action', () => {
  assert.match(mainSource, /isPhotoImageFailed/);
  assert.doesNotMatch(
    mainSource,
    /isPhotoImageFailed[\s\S]{0,500}handleDeleteLocalPhoto/
  );
});

test('captions render only after the feed image loads', () => {
  assert.match(mainSource, /isPhotoImageLoaded && photoCaption\.length > 0/);
});
