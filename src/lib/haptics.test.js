import assert from 'node:assert/strict';
import test from 'node:test';

import { triggerHaptic } from './haptics.js';

const originalNavigator = globalThis.navigator;

function setNavigator(value) {
  Object.defineProperty(globalThis, 'navigator', {
    value,
    configurable: true
  });
}

test.afterEach(() => {
  if (originalNavigator === undefined) {
    delete globalThis.navigator;
    return;
  }

  setNavigator(originalNavigator);
});

test('triggerHaptic sends the tap pattern to supported browsers', () => {
  const calls = [];
  setNavigator({
    vibrate(pattern) {
      calls.push(pattern);
      return true;
    }
  });

  assert.equal(triggerHaptic('tap'), true);
  assert.deepEqual(calls, [35]);
});

test('triggerHaptic sends the success pattern to supported browsers', () => {
  const calls = [];
  setNavigator({
    vibrate(pattern) {
      calls.push(pattern);
      return true;
    }
  });

  assert.equal(triggerHaptic('success'), true);
  assert.deepEqual(calls, [[35, 60, 35]]);
});

test('triggerHaptic no-ops when vibration is unsupported', () => {
  setNavigator({});

  assert.equal(triggerHaptic('tap'), false);
});

test('triggerHaptic returns false when the browser or system denies vibration', () => {
  setNavigator({
    vibrate() {
      return false;
    }
  });

  assert.equal(triggerHaptic('success'), false);
});

test('triggerHaptic catches vibration errors', () => {
  setNavigator({
    vibrate() {
      throw new Error('blocked');
    }
  });

  assert.equal(triggerHaptic('tap'), false);
});

test('triggerHaptic ignores unknown haptic kinds', () => {
  const calls = [];
  setNavigator({
    vibrate(pattern) {
      calls.push(pattern);
      return true;
    }
  });

  assert.equal(triggerHaptic('warning'), false);
  assert.deepEqual(calls, []);
});
