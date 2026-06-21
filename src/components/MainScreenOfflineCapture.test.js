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
    /export default function MainScreen\(\{[\s\S]*user,[\s\S]*coupleId,[\s\S]*isOnline = true,[\s\S]*onPairingRemoved,[\s\S]*\}\)/
  );
  assert.match(mainScreenSource, /const sendDisabled = captureDisabled \|\| !isOnline/);
});

test('MainScreen persists offline review drafts', () => {
  assert.match(mainScreenSource, /saveOfflineReviewDraft/);
  assert.match(mainScreenSource, /loadOfflineReviewDraft/);
  assert.match(mainScreenSource, /clearOfflineReviewDraft/);
});

test('MainScreen blocks queueing a review photo while offline', () => {
  assert.match(mainScreenSource, /t\('errors\.offlineSend'\)/);
  assert.match(mainScreenSource, /if \(!isOnline\) \{/);
});

test('MainScreen bounds restored draft send attempts so the review UI can recover', () => {
  assert.match(mainScreenSource, /SEND_REVIEW_TIMEOUT_MS/);
  assert.match(mainScreenSource, /uploadBytesResumable/);
  assert.match(mainScreenSource, /task\.cancel\(\)/);
  assert.match(mainScreenSource, /setSendingReviewPhoto\(false\)/);
});

test('MainScreen routes all customer-facing toasts through translations', () => {
  assert.match(mainScreenSource, /t\('notifications:foreground\.photo'\)/);
  assert.match(mainScreenSource, /t\('notifications:foreground\.loved'\)/);
  assert.match(mainScreenSource, /t\('photo\.sentToast'\)/);
  assert.match(mainScreenSource, /t\('errors\.notReady'\)/);
  assert.match(mainScreenSource, /t\('profile:toasts\.nameUpdated'\)/);
  assert.match(mainScreenSource, /t\('controls\.flashUnavailable'\)/);
});
