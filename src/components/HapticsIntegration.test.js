import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const mainScreenSource = readFileSync(new URL('./MainScreen.jsx', import.meta.url), 'utf8');
const appSource = readFileSync(new URL('../App.jsx', import.meta.url), 'utf8');

test('MainScreen triggers tap haptics only after accepted shutter capture guards', () => {
  assert.match(mainScreenSource, /import \{ triggerHaptic \} from '\.\.\/lib\/haptics';/);
  assert.match(
    mainScreenSource,
    /const handleCapture = async \(\) => \{[\s\S]*?if \(captureDisabled\) return;[\s\S]*?if \(!cameraSlideIsMostlyVisible\(\)\) \{[\s\S]*?return;[\s\S]*?\}[\s\S]*?if \(cameraStatus !== 'ready'\) \{[\s\S]*?return;[\s\S]*?\}[\s\S]*?triggerHaptic\('tap'\);/
  );
});

test('MainScreen keeps capture haptics before async camera recovery', () => {
  assert.ok(
    mainScreenSource.indexOf("triggerHaptic('tap');") < mainScreenSource.indexOf('await video.play();')
  );
});

test('MainScreen triggers tap haptics only after accepted send guards', () => {
  assert.match(
    mainScreenSource,
    /const handleSendReviewPhoto = \(\) => \{[\s\S]*?if \(!reviewPhoto \|\| sendingReviewPhoto\) return;[\s\S]*?if \(!isOnline\) \{[\s\S]*?return;[\s\S]*?\}[\s\S]*?triggerHaptic\('tap'\);/
  );
});

test('App triggers success haptics when pairing completes', () => {
  assert.match(appSource, /import \{ triggerHaptic \} from '\.\/lib\/haptics';/);
  assert.match(
    appSource,
    /const handlePaired = \(newCoupleId\) => \{[\s\S]*?triggerHaptic\('success'\);[\s\S]*?trackEvent\('pairing_completed'/
  );
});
