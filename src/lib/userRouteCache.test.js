import assert from 'node:assert/strict';
import test from 'node:test';

import {
  clearCachedUserRoute,
  getCachedUserRoute,
  setCachedUserRoute
} from './userRouteCache.js';

function createStorage(initialEntries = {}) {
  const values = new Map(Object.entries(initialEntries));

  return {
    getItem(key) {
      return values.has(key) ? values.get(key) : null;
    },
    setItem(key, value) {
      values.set(key, String(value));
    },
    removeItem(key) {
      values.delete(key);
    }
  };
}

test('stores and reads a user-scoped route', () => {
  const storage = createStorage();

  setCachedUserRoute('user-a', { coupleId: 'couple-a', ignored: true }, storage);
  setCachedUserRoute('user-b', { coupleId: 'couple-b' }, storage);

  const route = getCachedUserRoute('user-a', storage);
  const storedRoute = JSON.parse(storage.getItem('pocofoto:user-route:user-a'));
  assert.equal(route.coupleId, 'couple-a');
  assert.match(route.updatedAt, /^\d{4}-/);
  assert.deepEqual(Object.keys(storedRoute).sort(), ['coupleId', 'updatedAt']);
  assert.equal(getCachedUserRoute('user-b', storage).coupleId, 'couple-b');
});

test('clears only the selected user route', () => {
  const storage = createStorage();

  setCachedUserRoute('user-a', { coupleId: 'couple-a' }, storage);
  setCachedUserRoute('user-b', { coupleId: 'couple-b' }, storage);
  clearCachedUserRoute('user-a', storage);

  assert.equal(getCachedUserRoute('user-a', storage), null);
  assert.equal(getCachedUserRoute('user-b', storage).coupleId, 'couple-b');
});

test('handles missing storage and invalid JSON safely', () => {
  const storage = createStorage({
    'pocofoto:user-route:user-a': '{bad json'
  });

  assert.equal(getCachedUserRoute('user-a', storage), null);
  assert.doesNotThrow(() => setCachedUserRoute('user-a', { coupleId: 'couple-a' }, null));
  assert.doesNotThrow(() => clearCachedUserRoute('user-a', null));
});
