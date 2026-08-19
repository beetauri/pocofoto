# App Store Release Compliance Fixes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix the five highest-risk Apple submission gaps in the native Pocofoto app while preserving all shared couple photos.

**Architecture:** Keep destructive account operations and safety controls in authenticated Firebase callable Functions. Keep native UI thin by delegating policy rules, consent state, Apple credential mapping, and caption/report validation to small testable domain/service helpers. Serve the required legal pages from the existing web bundle and open them from native settings.

**Tech Stack:** Expo SDK 57, React Native 0.86, Expo Router, React Native Firebase Auth/Firestore/Functions/Storage, Firebase Admin Functions, Vitest, Node test runner, static HTML in `public/`.

---

## Task 1: Add pure backend safety and deletion contracts

**Files:**
- Create: `functions/accountDeletion.js`
- Create: `functions/safety.js`
- Create: `functions/accountDeletion.test.js`
- Create: `functions/safety.test.js`
- Modify: `functions/index.js:1-35,336-404,532-690`
- Modify: `firestore.rules:145-180`

- [ ] **Step 1: Write failing tests for the deletion plan**

Create a pure plan builder whose output makes the preservation boundary explicit:

```js
test('deletion removes only user-owned records and preserves the couple photo tree', () => {
  const plan = buildAccountDeletionPlan({
    uid: 'u1',
    coupleId: 'c1',
    coupleUsers: ['u1', 'u2']
  });

  assert.deepEqual(plan.remainingCoupleUsers, ['u2']);
  assert.ok(plan.deleteUserDocument);
  assert.ok(plan.deleteAuthUser);
  assert.equal(plan.deleteCoupleDocument, false);
  assert.equal(plan.deleteCouplePhotos, false);
  assert.ok(plan.cancelPairingArtifacts);
});

test('deletion preserves a historical couple record when the deleted user was the only member', () => {
  const plan = buildAccountDeletionPlan({ uid: 'u1', coupleId: 'c1', coupleUsers: ['u1'] });
  assert.deepEqual(plan.remainingCoupleUsers, []);
  assert.equal(plan.deleteCoupleDocument, false);
  assert.equal(plan.deleteCouplePhotos, false);
});
```

- [ ] **Step 2: Run the focused tests and verify they fail for missing exports**

Run: `npm --prefix functions test -- accountDeletion.test.js`

Expected: FAIL because `functions/accountDeletion.js` does not yet export `buildAccountDeletionPlan`.

- [ ] **Step 3: Write failing tests for caption/report/block validation**

Add tests for normal captions, configured abusive/sexual-threat patterns, report reasons, missing photo IDs, and cross-couple targets:

```js
test('caption safety rejects configured abusive patterns but permits ordinary captions', () => {
  assert.equal(isCaptionAllowed('good morning ☕'), true);
  assert.equal(isCaptionAllowed('threat-pattern-fixture'), false);
});

test('report input requires a supported reason and photo id', () => {
  assert.doesNotThrow(() => validateReportInput({ photoId: 'p1', reason: 'abuse' }));
  assert.throws(() => validateReportInput({ photoId: '', reason: 'abuse' }), /photo/i);
  assert.throws(() => validateReportInput({ photoId: 'p1', reason: 'made-up' }), /reason/i);
});
```

- [ ] **Step 4: Run the focused safety tests and verify the expected failures**

Run: `npm --prefix functions test -- safety.test.js`

Expected: FAIL because the safety module and validators do not exist.

- [ ] **Step 5: Implement the pure contracts**

`accountDeletion.js` will export `buildAccountDeletionPlan` and a `remainingCoupleUsers` helper. `safety.js` will export `isCaptionAllowed`, `REPORT_REASONS`, and `validateReportInput`. Keep the unsafe-pattern list short, explicit, and covered by fixtures; do not claim it is comprehensive moderation.

- [ ] **Step 6: Run the focused backend tests**

Run: `npm --prefix functions test -- accountDeletion.test.js safety.test.js`

Expected: PASS with all new tests green.

## Task 2: Implement server-side account deletion and safety callables

**Files:**
- Modify: `functions/index.js:1-35,100-160,336-404,532-690`
- Modify: `firestore.rules:145-180`
- Modify: `storage.rules:15-33`
- Test: `functions/accountDeletion.test.js`, `functions/safety.test.js`

- [ ] **Step 1: Extend deletion tests for pending artifacts and private subcollections**

Add assertions that the runtime plan cancels pending pairing requests/codes and recursively removes `users/{uid}` descendants, but never schedules `couples/{coupleId}` or `couples/{coupleId}/photos/*` for deletion.

- [ ] **Step 2: Implement `deleteAccount` as an authenticated callable**

Use Admin SDK operations in this order:

1. require the caller UID and load the profile/couple
2. update the couple’s `users` array to remove the caller, retaining the couple document and all photo data
3. cancel the caller’s pending requests and active codes
4. recursively delete `users/{uid}` and its private subcollections, including FCM registrations
5. delete the Firebase Auth user

Make missing profile/couple membership idempotent. Never call recursive delete on a couple or storage path. Return `{ ok: true }` only after Auth deletion succeeds.

- [ ] **Step 3: Add report and block callables**

Add `reportContent` with authenticated couple-membership validation, supported reasons, and a protected `contentReports` document. Add `blockUser` that records `users/{uid}/private/blockedUsers/{blockedUid}`, ends the active pairing through the existing pairing logic, and prevents future `acceptPairingRequest` and `redeemPairingCode` operations in either blocked direction.

- [ ] **Step 4: Add rules that prevent clients from reading/writing reports or private blocks**

Keep `contentReports` and `users/{uid}/private/blockedUsers/{blockedUid}` denied to direct clients. Functions use Admin SDK and therefore bypass client rules.

- [ ] **Step 5: Run backend lint and tests**

Run: `npm --prefix functions run lint && npm --prefix functions test`

Expected: exit 0 with all tests passing.

## Task 3: Add Sign in with Apple and native account deletion UI

**Files:**
- Modify: `mobile/package.json`
- Modify: `mobile/package-lock.json`
- Modify: `mobile/app.config.js:15-27,41-55`
- Create: `mobile/src/services/appleAuth.ts`
- Create: `mobile/src/services/appleAuth.test.ts`
- Modify: `mobile/src/services/firebase.ts:1-68`
- Modify: `mobile/src/state/AppProvider.tsx:25-205`
- Modify: `mobile/src/screens/AuthScreen.tsx:1-65`
- Modify: `mobile/src/screens/ProfileScreen.tsx:1-220`
- Modify: `mobile/src/locales/en/auth.js`
- Modify: `mobile/src/locales/en/profile.js`

- [ ] **Step 1: Install the current Expo Apple authentication package**

Run: `cd mobile && npx expo install expo-apple-authentication`

Add `'expo-apple-authentication'` to the Expo plugins list. Expo’s plugin must generate `com.apple.developer.applesignin = ['Default']` in the iOS entitlements.

- [ ] **Step 2: Write the failing Apple credential mapping tests**

Test a helper that converts a successful Apple response into the Firebase provider payload and rejects a response without an identity token:

```ts
it('maps Apple identity credentials to the apple.com Firebase provider', () => {
  expect(buildAppleCredentialInput({ identityToken: 'token', nonce: 'nonce' })).toEqual({
    idToken: 'token',
    rawNonce: 'nonce'
  });
});

it('rejects Apple responses without an identity token', () => {
  expect(() => buildAppleCredentialInput({ identityToken: null, nonce: 'nonce' })).toThrow(/identity token/i);
});
```

- [ ] **Step 3: Run the Apple tests and verify the expected failure**

Run: `cd mobile && npx vitest run src/services/appleAuth.test.ts`

Expected: FAIL because `appleAuth.ts` does not yet export the helper.

- [ ] **Step 4: Implement Apple authentication**

Use `expo-apple-authentication` on iOS with requested name/email scopes. Use React Native Firebase’s current `OAuthProvider('apple.com').credential({ idToken, rawNonce })` shape, then `signInWithCredential(authClient, credential)`. Preserve first-login Apple name/email when available and set provider metadata to `apple` in the user document.

- [ ] **Step 5: Add the native Apple button and delete-account action**

Show an Apple button on iOS next to Google. In Profile, add a destructive “Delete account” action with explicit confirmation. Call `deleteAccount`, clear cached routing, sign out locally, and return to `/`. Keep photo history untouched in the success copy. Disable the action while it is in flight and show a retryable error on failure.

- [ ] **Step 6: Run native typecheck, focused tests, and config evaluation**

Run:

```bash
cd mobile
npx vitest run src/services/appleAuth.test.ts
npm run typecheck
npx expo config --json
```

Expected: tests and typecheck pass; the config includes the Apple plugin and the iOS Apple Sign-In entitlement after prebuild.

## Task 4: Add working legal/support links and UGC safety UI

**Files:**
- Create: `public/privacy/index.html`
- Create: `public/terms/index.html`
- Create: `public/support/index.html`
- Create: `mobile/src/domain/legalLinks.ts`
- Create: `mobile/src/domain/legalLinks.test.ts`
- Modify: `mobile/src/screens/ProfileScreen.tsx:1-220`
- Modify: `mobile/src/screens/PairingScreen.tsx:1-250`
- Modify: `mobile/app/(main)/index.tsx:1-520`
- Modify: `mobile/src/services/firebase.ts:71-85`
- Modify: `mobile/src/locales/en/profile.js`
- Modify: `mobile/src/locales/en/pairing.js`
- Modify: `mobile/src/locales/en/camera.js`

- [ ] **Step 1: Write failing legal-link tests**

```ts
it('returns the public legal URLs used by native settings', () => {
  expect(legalLinks).toEqual({
    privacy: 'https://pocofoto.com.tr/privacy',
    terms: 'https://pocofoto.com.tr/terms',
    support: 'https://pocofoto.com.tr/support'
  });
});
```

- [ ] **Step 2: Run the legal-link test and verify it fails**

Run: `cd mobile && npx vitest run src/domain/legalLinks.test.ts`

Expected: FAIL because the legal-link module does not exist.

- [ ] **Step 3: Implement legal links and native actions**

Add a small `openLegalLink` helper that calls `Linking.openURL` only for the known URLs. Render Privacy, Terms, and Support as accessible `Pressable` controls in Profile. Add Report to each partner photo and a Block and end pairing action in Profile. Report calls `reportContent` with a reason; block calls `blockUser`; both have busy/error states.

- [ ] **Step 4: Add the public pages**

Create readable static pages with the actual collection/retention/deletion behavior, shared-photo preservation rule, report instructions, support contact, and links between all three pages. Do not use placeholder text or an empty website.

- [ ] **Step 5: Add caption filtering before queue/upload**

Reuse the backend-safe pattern contract in a mobile domain helper so the native client rejects known unsafe captions before local queueing. The server must also validate it so direct clients cannot bypass the client check.

- [ ] **Step 6: Run focused tests and build the web pages**

Run:

```bash
cd mobile && npx vitest run src/domain/legalLinks.test.ts src/domain/captionSafety.test.ts
cd .. && npm run build
```

Expected: focused tests pass and `dist/privacy/index.html`, `dist/terms/index.html`, and `dist/support/index.html` exist.

## Task 5: Gate analytics consent and declare privacy data

**Files:**
- Create: `mobile/src/domain/analyticsConsent.ts`
- Create: `mobile/src/domain/analyticsConsent.test.ts`
- Modify: `mobile/src/services/analytics.ts:1-67`
- Modify: `mobile/src/state/AppProvider.tsx:60-80`
- Modify: `mobile/src/screens/ProfileScreen.tsx:49-220`
- Modify: `mobile/src/locales/en/profile.js`
- Modify: `mobile/app.config.js:15-27`

- [ ] **Step 1: Write failing consent tests**

```ts
it('starts with analytics disabled and records explicit opt-in', () => {
  expect(readAnalyticsConsent({ getItem: () => null })).toBe(false);
  expect(writeAnalyticsConsent(true)).toBe('true');
});

it('supports withdrawal', () => {
  expect(writeAnalyticsConsent(false)).toBe('false');
});
```

- [ ] **Step 2: Run the consent tests and verify the expected failure**

Run: `cd mobile && npx vitest run src/domain/analyticsConsent.test.ts`

Expected: FAIL because the consent module does not exist.

- [ ] **Step 3: Implement consent-gated analytics**

Persist consent in AsyncStorage. Do not construct or capture PostHog events until consent is true. Gate Firebase Analytics and Amplitude with the same setting. On withdrawal, disable Firebase collection and reset PostHog/Amplitude identities. Keep Sentry separate and document its crash/diagnostic behavior in the privacy page.

- [ ] **Step 4: Add the profile consent control**

Render an Analytics toggle with current state and explanatory copy. Toggling off must be available after sign-in and must not affect camera, pairing, photos, or account deletion.

- [ ] **Step 5: Configure the app-owned privacy manifest through Expo config**

Add `ios.privacyManifests` to `mobile/app.config.js` with app-owned categories for name, email, user ID, photos/videos, other user content, product interaction, crash data, and other diagnostics. Mark tracking false unless the actual SDK configuration changes. Use Apple’s documented purpose identifiers and keep third-party SDK manifests supplied by their packages.

- [ ] **Step 6: Run focused consent tests and config inspection**

Run:

```bash
cd mobile
npx vitest run src/domain/analyticsConsent.test.ts
npm run typecheck
npx expo config --json
```

Expected: tests/typecheck pass and the evaluated iOS config contains non-empty `privacyManifests.NSPrivacyCollectedDataTypes`.

## Task 6: Full verification and release evidence

**Files:**
- Modify only files required by failing verification; do not alter unrelated dirty work.

- [ ] **Step 1: Run all native and backend checks**

```bash
cd mobile
npm run lint
npm run typecheck
npm test -- --run
cd ../functions
npm run lint
npm test
cd ..
npm run lint
npm run build
```

- [ ] **Step 2: Regenerate native iOS project and inspect release settings**

Run from `mobile/`: `npx expo prebuild --platform ios --no-install`.

Inspect the generated `PrivacyInfo.xcprivacy`, Apple Sign-In entitlement, production APNs entitlement, bundle identifier, and version/build values. Do not commit ignored generated files unless the repository’s existing release workflow requires them.

- [ ] **Step 3: Build and smoke-test the iOS Release app**

Run the existing Release device/simulator path with Xcode 26.6. Exercise Google sign-in, Apple sign-in, paired history, report, block/unpair, analytics opt-in/withdrawal, and account deletion. Verify that the remaining partner still sees all couple photos after deletion.

- [ ] **Step 4: Verify public URLs and App Store metadata inputs**

Run `curl -I` against `/privacy`, `/terms`, and `/support`. Confirm the App Store Connect privacy URL, support URL, age-rating answers, export compliance, EU trader status, review credentials, and review notes separately.

- [ ] **Step 5: Review the final diff and request code review**

Run `git diff --check`, `git status --short`, and inspect the diff for unrelated changes. Keep the pre-existing `README.md`, `mobile/app.config.js`, `mobile/eas.json`, and icon changes in the user’s worktree unless they are directly required by this plan.
