# Android Haptics Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add subtle Android PWA haptic feedback for the main shutter/send action and successful pairing, while staying silent on unsupported platforms.

**Architecture:** A centralized `src/lib/haptics.js` utility wraps `navigator.vibrate` with semantic `tap` and `success` patterns. UI code calls the utility only after accepted user actions or completed pairing; unsupported browsers, iOS PWAs, desktop, DND/silent/system-disabled vibration, and browser-denied vibration no-op through feature detection or the browser return value.

**Tech Stack:** React, Vite, Web Vibration API, Node test runner.

---

## Product Spec

- Android-supported browsers/PWAs get haptics on by default.
- No visible app setting ships in this phase.
- The web platform does not expose a readable system haptics/accessibility preference; Pocofoto should respect browser/OS behavior by treating `navigator.vibrate(...) === false` as a no-op.
- Ship only two semantic haptics:
  - `tap`: main shutter button when capture/send is accepted.
  - `success`: pairing succeeds.
- Do not vibrate for unsupported platforms, disabled buttons, invalid actions, navigation, background events, failed validation, or camera-not-ready redirects/errors.

### Task 1: Haptics Utility

**Files:**
- Create: `src/lib/haptics.js`
- Create: `src/lib/haptics.test.js`

- [x] **Step 1: Write failing tests**

Add tests for supported `tap`/`success`, unsupported no-op behavior, browser-denied vibration, thrown vibration calls, and unsupported haptic kinds.

- [x] **Step 2: Verify red**

Run: `node --test src/lib/haptics.test.js`
Expected: FAIL because `src/lib/haptics.js` does not exist yet.

- [x] **Step 3: Implement minimal utility**

Create `triggerHaptic(kind = 'tap')` with patterns `{ tap: 10, success: [12, 40, 18] }`, runtime feature detection, try/catch, and boolean return.

- [x] **Step 4: Verify green**

Run: `node --test src/lib/haptics.test.js`
Expected: PASS.

### Task 2: Wire Product Moments

**Files:**
- Modify: `src/components/MainScreen.jsx`
- Modify: `src/App.jsx`
- Create: `src/components/HapticsIntegration.test.js`

- [x] **Step 1: Write failing integration source tests**

Assert `MainScreen` imports `triggerHaptic`, calls `triggerHaptic('tap')` inside `handleCapture` only after `captureDisabled` and camera-slide checks, and calls `triggerHaptic('tap')` in `handleSendReviewPhoto` only after send guards pass. Assert `App.handlePaired` calls `triggerHaptic('success')`.

- [x] **Step 2: Verify red**

Run: `node --test src/components/HapticsIntegration.test.js`
Expected: FAIL because UI files do not call haptics yet.

- [x] **Step 3: Implement wiring**

Import `triggerHaptic` in `MainScreen.jsx` and `App.jsx`; call `tap` after accepted capture/send guards and `success` in `handlePaired`.

- [x] **Step 4: Verify green**

Run: `node --test src/lib/haptics.test.js src/components/HapticsIntegration.test.js`
Expected: PASS.

### Task 3: Full Verification

**Files:**
- No additional files.

- [x] **Step 1: Run unit tests**

Run: `npm run test:unit`
Expected: PASS.

- [x] **Step 2: Run lint**

Run: `npm run lint`
Expected: PASS.

- [x] **Step 3: Run production build**

Run: `npm run build`
Expected: PASS.
