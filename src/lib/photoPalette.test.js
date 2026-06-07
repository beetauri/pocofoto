import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildPaletteFromImageData,
  normalizePalette
} from './photoPalette.js';

test('normalizePalette returns uppercase one to three hex colors', () => {
  assert.deepEqual(
    normalizePalette({ colors: ['#4f72fc', '#111111', '#f8f8f8', '#ffffff'] }),
    { colors: ['#4F72FC', '#111111', '#F8F8F8'] }
  );
});

test('normalizePalette rejects invalid palette shapes', () => {
  assert.equal(normalizePalette(null), null);
  assert.equal(normalizePalette({ colors: [] }), null);
  assert.equal(normalizePalette({ colors: ['blue'] }), null);
  assert.equal(normalizePalette({ colors: ['#fff'] }), null);
  assert.equal(normalizePalette({ colors: ['#123456', '#badbad00'] }), null);
});

test('buildPaletteFromImageData samples visible pixels into deterministic colors', () => {
  const pixels = new Uint8ClampedArray([
    80, 114, 252, 255,
    80, 114, 252, 255,
    244, 92, 124, 255,
    244, 92, 124, 255,
    16, 16, 18, 255,
    16, 16, 18, 255,
    255, 255, 255, 0
  ]);

  assert.deepEqual(
    buildPaletteFromImageData({ data: pixels }),
    { colors: ['#5072FC', '#F45C7C', '#101012'] }
  );
});
