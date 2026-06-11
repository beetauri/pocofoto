import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildCameraConstraints,
  fitCaptureDimensions,
  normalizeFacingMode
} from './camera.js';

test('uses balanced camera constraints with the requested facing mode', () => {
  assert.deepEqual(buildCameraConstraints('user'), {
    audio: false,
    video: {
      facingMode: { ideal: 'user' },
      width: { ideal: 1920, min: 640 },
      height: { ideal: 1080, min: 480 }
    }
  });
  assert.equal(normalizeFacingMode('invalid'), 'environment');
});

test('limits captures to a 1920 pixel longest side without upscaling', () => {
  assert.deepEqual(fitCaptureDimensions(4032, 3024), { width: 1920, height: 1440 });
  assert.deepEqual(fitCaptureDimensions(1080, 1920), { width: 1080, height: 1920 });
  assert.deepEqual(fitCaptureDimensions(640, 480), { width: 640, height: 480 });
});
