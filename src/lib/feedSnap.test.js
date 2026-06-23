import assert from 'node:assert/strict';
import test from 'node:test';
import { getNearestFeedSnapTop } from './feedSnap.js';

test('getNearestFeedSnapTop returns the closest slide top', () => {
  assert.equal(getNearestFeedSnapTop(0, [0, 844, 1688]), 0);
  assert.equal(getNearestFeedSnapTop(300, [0, 844, 1688]), 0);
  assert.equal(getNearestFeedSnapTop(520, [0, 844, 1688]), 844);
  assert.equal(getNearestFeedSnapTop(1300, [0, 844, 1688]), 1688);
});

test('getNearestFeedSnapTop handles missing slide tops without moving', () => {
  assert.equal(getNearestFeedSnapTop(420, []), 420);
});
