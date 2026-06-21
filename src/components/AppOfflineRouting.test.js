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
  assert.match(appSource, /t\('offlineHold'\)/);
  assert.match(appSource, /screen = 'offline-hold'/);
});

test('App does not route to Pairing unless pair state is known and online', () => {
  assert.match(
    appSource,
    /if \(user && !coupleId && pairStateKnown && connectionStatus\.isOnline && !checkingPair\) screen = 'pairing';/
  );
  assert.doesNotMatch(appSource, /if \(user && !coupleId && !checkingPair\) screen = 'pairing';/);
});

test('App reports user route listener failures with routing context', () => {
  assert.match(appSource, /captureHandledException\(error, \{/);
  assert.match(appSource, /operation: 'user-route-listener'/);
  assert.match(appSource, /hasCachedCoupleId: Boolean\(cachedRoute\?\.coupleId\)/);
});

test('App requests metadata changes and delegates pair snapshot decisions', () => {
  assert.match(appSource, /includeMetadataChanges: true/);
  assert.match(appSource, /decidePairSnapshot\(\{/);
  assert.match(appSource, /fromCache: snap\.metadata\.fromCache/);
  assert.match(appSource, /decidePairListenerError\(\{/);
});

test('App clears route storage only for authoritative unpaired decisions', () => {
  assert.match(appSource, /decision\.state === 'unpaired'/);
  assert.match(appSource, /if \(!decision\.persist\) return;/);
  assert.doesNotMatch(appSource, /else if \(connectionStatus\.isOnline\)[\s\S]*clearCachedUserRoute/);
});
