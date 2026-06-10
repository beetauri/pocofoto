import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const appSource = readFileSync(new URL('../App.jsx', import.meta.url), 'utf8');
const mainScreenSource = readFileSync(new URL('./MainScreen.jsx', import.meta.url), 'utf8');

test('App passes online state to MainScreen', () => {
  assert.match(appSource, /<MainScreen[\s\S]*isOnline=\{connectionStatus\.isOnline\}/);
});

test('MainScreen accepts and uses online state for review send', () => {
  assert.match(
    mainScreenSource,
    /export default function MainScreen\(\{ user, coupleId, isOnline = true, onPairingRemoved, onBackgroundSourceChange \}\)/
  );
  assert.match(mainScreenSource, /const sendDisabled = captureDisabled \|\| !isOnline/);
});

test('MainScreen persists offline review drafts', () => {
  assert.match(mainScreenSource, /saveOfflineReviewDraft/);
  assert.match(mainScreenSource, /loadOfflineReviewDraft/);
  assert.match(mainScreenSource, /clearOfflineReviewDraft/);
});

test('MainScreen blocks upload when trying to send offline', () => {
  assert.match(mainScreenSource, /Reconnect to send/);
  assert.match(mainScreenSource, /if \(!isOnline\) \{/);
});
