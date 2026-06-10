import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const appSource = readFileSync(new URL('../App.jsx', import.meta.url), 'utf8');

test('App seeds signed-in routing from the user route cache', () => {
  assert.match(appSource, /getCachedUserRoute/);
  assert.match(appSource, /setCachedUserRoute/);
  assert.match(appSource, /clearCachedUserRoute/);
  assert.match(appSource, /cachedRoute\?\.coupleId/);
});

test('App tracks pairStateKnown and renders OfflineHoldScreen while offline routing is unknown', () => {
  assert.match(appSource, /const \[pairStateKnown, setPairStateKnown\] = useState\(false\)/);
  assert.match(appSource, /function OfflineHoldScreen\(\)/);
  assert.match(appSource, /Reconnect to finish loading Pocofoto\./);
  assert.match(appSource, /screen = 'offline-hold'/);
});

test('App does not route to Pairing unless pair state is known and online', () => {
  assert.match(
    appSource,
    /if \(user && !coupleId && pairStateKnown && connectionStatus\.isOnline && !checkingPair\) screen = 'pairing';/
  );
  assert.doesNotMatch(appSource, /if \(user && !coupleId && !checkingPair\) screen = 'pairing';/);
});
