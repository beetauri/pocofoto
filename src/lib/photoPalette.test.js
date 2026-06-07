import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildPaletteFromImageData,
  buildPaletteV2FromImageData,
  normalizePaletteV2,
  paletteV2FromLegacyPalette,
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

test('normalizePaletteV2 returns uppercase split-half colors', () => {
  assert.deepEqual(
    normalizePaletteV2({
      version: 2,
      topColor: '#4f72fc',
      bottomColor: '#1f8f5f',
      colors: ['#4f72fc', '#1f8f5f']
    }),
    {
      version: 2,
      topColor: '#4F72FC',
      bottomColor: '#1F8F5F',
      colors: ['#4F72FC', '#1F8F5F']
    }
  );
});

test('normalizePaletteV2 rejects invalid split-half palettes', () => {
  assert.equal(normalizePaletteV2(null), null);
  assert.equal(normalizePaletteV2({ version: 1, topColor: '#111111', bottomColor: '#222222', colors: ['#111111', '#222222'] }), null);
  assert.equal(normalizePaletteV2({ version: 2, topColor: 'blue', bottomColor: '#222222', colors: ['blue', '#222222'] }), null);
  assert.equal(normalizePaletteV2({ version: 2, topColor: '#111111', bottomColor: '#222222', colors: ['#222222', '#111111'] }), null);
});

test('buildPaletteV2FromImageData extracts top and bottom dominant colors', () => {
  const pixels = new Uint8ClampedArray([
    80, 114, 252, 255,
    80, 114, 252, 255,
    16, 16, 18, 255,
    16, 16, 18, 255,
    31, 143, 95, 255,
    31, 143, 95, 255,
    244, 92, 124, 255,
    31, 143, 95, 255
  ]);

  assert.deepEqual(
    buildPaletteV2FromImageData({ data: pixels, width: 2, height: 4 }),
    {
      version: 2,
      topColor: '#5072FC',
      bottomColor: '#1F8F5F',
      colors: ['#5072FC', '#1F8F5F']
    }
  );
});

test('paletteV2FromLegacyPalette uses first and second legacy colors', () => {
  assert.deepEqual(
    paletteV2FromLegacyPalette({ colors: ['#4f72fc', '#1f8f5f', '#ffffff'] }),
    {
      version: 2,
      topColor: '#4F72FC',
      bottomColor: '#1F8F5F',
      colors: ['#4F72FC', '#1F8F5F']
    }
  );
});
