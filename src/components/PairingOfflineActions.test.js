import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const appSource = readFileSync(new URL('../App.jsx', import.meta.url), 'utf8');
const pairingScreenSource = readFileSync(new URL('./PairingScreen.jsx', import.meta.url), 'utf8');

test('App passes online state to PairingScreen', () => {
  assert.match(appSource, /<PairingScreen[\s\S]*isOnline=\{connectionStatus\.isOnline\}/);
});

test('PairingScreen accepts online state with a safe default', () => {
  assert.match(
    pairingScreenSource,
    /export default function PairingScreen\(\{ user, isOnline = true, onPaired, initialNotice = '', onNoticeConsumed \}\)/
  );
});

test('PairingScreen shows offline pairing copy', () => {
  assert.match(pairingScreenSource, /Pairing needs connection/);
});

test('PairingScreen disables online-only pairing actions while offline', () => {
  assert.equal(
    pairingScreenSource.match(/disabled=\{!isOnline \|\| workingId === request\.id\}/g)?.length,
    2
  );
  assert.match(pairingScreenSource, /disabled=\{!isOnline \|\| workingId === 'cancel'\}/);
  assert.match(pairingScreenSource, /disabled=\{!isOnline \|\| workingId === 'create-code'\}/);
  assert.match(pairingScreenSource, /disabled=\{!isOnline \|\| workingId === 'redeem-code' \|\| inputCode\.length < 6\}/);
  assert.match(pairingScreenSource, /disabled=\{!isOnline \|\| workingId === 'redeem-code'\}/);
});
