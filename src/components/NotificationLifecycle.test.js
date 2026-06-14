import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const authScreenSource = readFileSync(new URL('./AuthScreen.jsx', import.meta.url), 'utf8');
const appSource = readFileSync(new URL('../App.jsx', import.meta.url), 'utf8');

test('AuthScreen does not request notification permission during sign-in', () => {
  assert.doesNotMatch(authScreenSource, /requestAndRegisterPushToken/);
  assert.doesNotMatch(authScreenSource, /Push registration result/);
});

test('App owns paired-user notification onboarding', () => {
  assert.match(appSource, /<NotificationPrompt/);
  assert.match(appSource, /open=\{notifications\.showPrompt && screen === 'main'\}/);
});
