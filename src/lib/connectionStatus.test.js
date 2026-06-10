import assert from 'node:assert/strict';
import test from 'node:test';

import {
  createConnectionStatusStore,
  getInitialConnectionStatus
} from './connectionStatus.js';

test('initial connection status reads navigator online state', () => {
  assert.equal(getInitialConnectionStatus({ onLine: false }).status, 'offline');
  assert.equal(getInitialConnectionStatus({ onLine: true }).status, 'online');
});

test('store emits offline then restored and clears restored after delay', () => {
  const listeners = {};
  const timers = [];
  const win = {
    navigator: { onLine: true },
    addEventListener(type, handler) {
      listeners[type] = handler;
    },
    removeEventListener(type) {
      delete listeners[type];
    },
    setTimeout(handler, delay) {
      timers.push({ handler, delay });
      return timers.length;
    },
    clearTimeout() {}
  };

  const store = createConnectionStatusStore(win, { restoredDuration: 3000 });
  const states = [];
  const unsubscribe = store.subscribe((state) => states.push(state.status));

  win.navigator.onLine = false;
  listeners.offline();
  win.navigator.onLine = true;
  listeners.online();

  assert.deepEqual(states, ['offline', 'restored']);
  assert.equal(timers[0].delay, 3000);

  timers[0].handler();
  assert.equal(store.getSnapshot().status, 'online');

  unsubscribe();
  store.destroy();
});
