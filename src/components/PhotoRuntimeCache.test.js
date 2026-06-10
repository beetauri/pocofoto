import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const viteConfigSource = readFileSync(new URL('../../vite.config.js', import.meta.url), 'utf8');

test('Firebase Storage photos use a viewed-photo stale-while-revalidate runtime cache', () => {
  assert.match(viteConfigSource, /cacheName:\s*'firebase-storage-cache'/);
  assert.match(viteConfigSource, /handler:\s*'StaleWhileRevalidate'/);
  assert.match(viteConfigSource, /maxEntries:\s*80/);
  assert.match(viteConfigSource, /maxAgeSeconds:\s*60 \* 60 \* 24 \* 30/);
});
