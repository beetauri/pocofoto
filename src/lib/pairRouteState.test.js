import assert from 'node:assert/strict';
import test from 'node:test';

import {
  decidePairListenerError,
  decidePairSnapshot
} from './pairRouteState.js';

test('accepts and persists a couple id from cache or server', () => {
  for (const fromCache of [true, false]) {
    assert.deepEqual(decidePairSnapshot({
      snapshotExists: true,
      snapshotCoupleId: 'couple-a',
      fromCache,
      currentCoupleId: null,
      cachedCoupleId: null
    }), {
      state: 'paired',
      coupleId: 'couple-a',
      persist: true,
      reason: fromCache ? 'cache-paired' : 'server-paired'
    });
  }
});

test('cache-only null cannot downgrade a known pairing', () => {
  assert.deepEqual(decidePairSnapshot({
    snapshotExists: true,
    snapshotCoupleId: null,
    fromCache: true,
    currentCoupleId: null,
    cachedCoupleId: 'couple-a'
  }), {
    state: 'paired',
    coupleId: 'couple-a',
    persist: false,
    reason: 'ignored-cache-unpaired'
  });
});

test('cache-only null without a known pairing remains unknown', () => {
  assert.deepEqual(decidePairSnapshot({
    snapshotExists: false,
    snapshotCoupleId: null,
    fromCache: true,
    currentCoupleId: null,
    cachedCoupleId: null
  }), {
    state: 'unknown',
    coupleId: null,
    persist: false,
    reason: 'cache-unpaired-unconfirmed'
  });
});

test('server-confirmed null is authoritative', () => {
  assert.deepEqual(decidePairSnapshot({
    snapshotExists: true,
    snapshotCoupleId: null,
    fromCache: false,
    currentCoupleId: 'couple-a',
    cachedCoupleId: 'couple-a'
  }), {
    state: 'unpaired',
    coupleId: null,
    persist: true,
    reason: 'server-unpaired'
  });
});

test('listener errors preserve known pairings and otherwise remain unknown', () => {
  assert.deepEqual(decidePairListenerError({
    currentCoupleId: null,
    cachedCoupleId: 'couple-a'
  }), {
    state: 'paired',
    coupleId: 'couple-a',
    persist: false,
    reason: 'listener-error-preserved-pairing'
  });

  assert.deepEqual(decidePairListenerError({
    currentCoupleId: null,
    cachedCoupleId: null
  }), {
    state: 'unknown',
    coupleId: null,
    persist: false,
    reason: 'listener-error-unknown'
  });
});
