# App Copy and Localization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rewrite Pocofoto's complete English customer-facing copy in a cute, charming voice and route it through an English-first localization foundation ready for Turkish.

**Architecture:** Initialize one synchronous `i18next` instance before React renders, with browser-language resolution and English fallback. Keep English resources in flow-scoped modules, consume them through `react-i18next`, and keep Cloud Functions push templates in a separate server-side English copy module until recipient locale storage is added with Turkish.

**Tech Stack:** React 19, Vite 8, i18next, react-i18next, Node test runner, Vitest, Testing Library, Firebase Cloud Functions

---

## File Map

**Create:**

- `src/i18n.js` - initializes i18next and resolves supported browser languages
- `src/locales/en/index.js` - composes English namespaces
- `src/locales/en/common.js` - shared actions, navigation, build labels, and global states
- `src/locales/en/auth.js` - sign-in copy and stable authentication errors
- `src/locales/en/pairing.js` - pairing flow, notices, and confirmations
- `src/locales/en/camera.js` - camera, review, feed, upload, and photo-action copy
- `src/locales/en/history.js` - history screen copy
- `src/locales/en/profile.js` - profile, account, about, and destructive-action copy
- `src/locales/en/notifications.js` - prompt, permission, settings, and diagnostic labels
- `src/locales/en/errors.js` - shared offline, update, and fatal-error copy
- `src/lib/i18n.test.js` - fallback, device-language, interpolation, and plural tests
- `functions/pushCopy.js` - English-only push title/body builders
- `functions/pushCopy.test.js` - exact push-copy contract tests

**Modify:**

- `package.json`, `package-lock.json` - add `i18next` and `react-i18next`
- `src/main.jsx` - initialize localization before rendering
- `src/App.jsx` - localize global route and pairing-removal copy
- `src/components/AuthScreen.jsx`
- `src/components/PairingScreen.jsx`
- `src/components/MainScreen.jsx`
- `src/components/HistoryScreen.jsx`
- `src/components/ProfileView.jsx`
- `src/components/NotificationPrompt.jsx`
- `src/components/NotificationSettings.jsx`
- `src/components/ConnectionBanner.jsx`
- `src/components/UpdateBanner.jsx`
- `src/components/SentryErrorFallback.jsx`
- `src/components/ui/dialog.jsx`, `src/components/ui/spinner.jsx` - shared accessibility labels
- `src/hooks/useCamera.js`, `src/hooks/useNotifications.js` - hook-owned user-facing fallback messages
- Copy-sensitive tests under `src/components/*.test.js` and `src/components/*.test.jsx`
- `functions/push.js`, `functions/index.js`, `functions/push.test.js` - consume centralized English push templates

## Copy Contract

Use these rules throughout implementation:

- Signature phrase: **"your person"**
- Tone: affectionate and lightly playful, never childish
- Emojis: only `✨` in selected empty/paired celebrations and `📸` in the new-photo push; nowhere in failures, permissions, or destructive actions
- Errors: short explanation plus recovery action, without raw Firebase/provider text
- Accessibility labels: literal and task-oriented, not whimsical
- Diagnostics: technical labels and raw diagnostic values remain technical

---

### Task 1: Install and Verify the Localization Foundation

**Files:**
- Modify: `package.json`
- Modify: `package-lock.json`
- Create: `src/i18n.js`
- Create: `src/locales/en/index.js`
- Create: `src/locales/en/common.js`
- Create: `src/locales/en/auth.js`
- Create: `src/locales/en/pairing.js`
- Create: `src/locales/en/camera.js`
- Create: `src/locales/en/history.js`
- Create: `src/locales/en/profile.js`
- Create: `src/locales/en/notifications.js`
- Create: `src/locales/en/errors.js`
- Create: `src/lib/i18n.test.js`
- Modify: `src/main.jsx`

- [ ] **Step 1: Install the localization packages**

Run:

```bash
npm install i18next react-i18next
```

Expected: both packages appear under `dependencies`; preserve all existing dependency and lockfile changes.

- [ ] **Step 2: Write the failing localization tests**

Create `src/lib/i18n.test.js`:

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { createPocofotoI18n, resolveSupportedLanguage } from '../i18n.js';

test('unsupported browser languages fall back to English', () => {
  assert.equal(resolveSupportedLanguage(['tr-TR', 'tr']), 'en');
});

test('English regional variants resolve to English', () => {
  assert.equal(resolveSupportedLanguage(['en-GB']), 'en');
});

test('translations interpolate dynamic names', () => {
  const i18n = createPocofotoI18n({ languages: ['en-US'] });
  assert.equal(
    i18n.t('pairing:removedByPerson', { name: 'Alex' }),
    'Alex ended the pairing. You can find your person again whenever you’re ready.'
  );
});

test('the configured instance supports plural forms', () => {
  const i18n = createPocofotoI18n({ languages: ['en'] });
  i18n.addResourceBundle('en', 'test', {
    moment_one: '{{count}} little moment',
    moment_other: '{{count}} little moments'
  });
  assert.equal(i18n.t('test:moment', { count: 1 }), '1 little moment');
  assert.equal(i18n.t('test:moment', { count: 2 }), '2 little moments');
});
```

- [ ] **Step 3: Run the test to verify it fails**

Run:

```bash
node --test src/lib/i18n.test.js
```

Expected: FAIL because `src/i18n.js` does not exist.

- [ ] **Step 4: Create the i18n bootstrap**

Create `src/i18n.js` with a testable factory and no persisted language choice:

```js
import { createInstance } from 'i18next';
import { initReactI18next } from 'react-i18next';
import { englishResources, namespaces } from './locales/en/index.js';

const supportedLanguages = ['en'];

export function resolveSupportedLanguage(languages = []) {
  for (const language of languages) {
    const baseLanguage = String(language).toLowerCase().split('-')[0];
    if (supportedLanguages.includes(baseLanguage)) return baseLanguage;
  }
  return 'en';
}

export function createPocofotoI18n({ languages = globalThis.navigator?.languages || [] } = {}) {
  const instance = createInstance();
  instance.use(initReactI18next).init({
    resources: { en: englishResources },
    lng: resolveSupportedLanguage(languages),
    fallbackLng: 'en',
    supportedLngs: supportedLanguages,
    ns: namespaces,
    defaultNS: 'common',
    interpolation: { escapeValue: false },
    initImmediate: false,
    react: { useSuspense: false }
  });
  return instance;
}

const i18n = createPocofotoI18n();
export default i18n;
```

Create `src/locales/en/index.js` to import the eight namespace modules and export:

```js
export const englishResources = { common, auth, pairing, camera, history, profile, notifications, errors };
export const namespaces = Object.keys(englishResources);
```

Start each namespace as a default-exported plain object. Populate keys in Tasks 2-5; add `pairing.removedByPerson` immediately so the foundation test is meaningful.

- [ ] **Step 5: Initialize i18n before React renders**

Add this side-effect import near the top of `src/main.jsx`, before importing `App`:

```js
import './i18n';
```

- [ ] **Step 6: Run the focused test and full baseline**

Run:

```bash
node --test src/lib/i18n.test.js
npm run test:unit
```

Expected: all i18n tests PASS; the existing suite remains green before component migration.

- [ ] **Step 7: Commit the foundation**

```bash
git add package.json package-lock.json src/i18n.js src/locales/en src/lib/i18n.test.js src/main.jsx
git commit -m "add localization foundation"
```

---

### Task 2: Localize Global App States and Shared Controls

**Files:**
- Modify: `src/locales/en/common.js`
- Modify: `src/locales/en/errors.js`
- Modify: `src/App.jsx`
- Modify: `src/components/ConnectionBanner.jsx`
- Modify: `src/components/UpdateBanner.jsx`
- Modify: `src/components/SentryErrorFallback.jsx`
- Modify: `src/components/ui/dialog.jsx`
- Modify: `src/components/ui/spinner.jsx`
- Modify: `src/components/ConnectionBanner.test.jsx`
- Modify: `src/components/SentryErrorFallback.test.jsx`
- Create: `src/components/GlobalCopy.test.jsx`

- [ ] **Step 1: Write failing tests for global copy**

Update existing rendered assertions and add `GlobalCopy.test.jsx` to verify:

```jsx
render(<ConnectionBanner status="offline" />);
expect(screen.getByText('A little offline, but your camera still works.')).toBeInTheDocument();
expect(screen.getByText('Reconnect when you’re ready to send or pair.')).toBeInTheDocument();
```

Also assert the fatal fallback exposes buttons named `Tell us what happened` and `Restart Pocofoto`, and the update banner renders `A fresh little update is ready` plus `Update now`.

- [ ] **Step 2: Run focused tests to verify they fail**

```bash
npx vitest run src/components/ConnectionBanner.test.jsx src/components/SentryErrorFallback.test.jsx src/components/GlobalCopy.test.jsx
```

Expected: FAIL on the new English copy.

- [ ] **Step 3: Add global resource keys**

Populate `common.js` with shared actions and labels:

```js
export default {
  appName: 'Pocofoto',
  version: 'Version',
  actions: {
    cancel: 'Cancel',
    close: 'Close',
    tryAgain: 'Try again',
    notNow: 'Not now'
  },
  loading: 'Loading',
  navigation: {
    primary: 'Primary navigation',
    home: 'Home',
    history: 'History',
    profile: 'Profile',
    scrollToCamera: 'Scroll to camera'
  }
};
```

Populate `errors.js` with the approved global voice:

```js
export default {
  offline: {
    title: 'A little offline, but your camera still works.',
    body: 'Reconnect when you’re ready to send or pair.',
    restored: 'You’re back online.'
  },
  offlineHold: 'Reconnect to finish opening Pocofoto.',
  update: {
    title: 'A fresh little update is ready',
    body: 'Bring Pocofoto up to date for the latest fixes.',
    action: 'Update now',
    dismiss: 'Dismiss update',
    complete: 'Pocofoto is all fresh ✨'
  },
  fatal: {
    eyebrow: 'Something went wrong',
    title: 'Pocofoto needs a quick restart',
    body: 'Your photos are safe. We’ve saved the details so we can look into it.',
    report: 'Tell us what happened',
    reload: 'Restart Pocofoto'
  }
};
```

- [ ] **Step 4: Replace literals with translation hooks**

Use `const { t } = useTranslation(['common', 'errors']);` in each function component. For the Sentry class/error-boundary callback boundary, translate inside the functional fallback component rather than passing translated prose through Sentry configuration.

Replace shared dialog/spinner literals with `useTranslation('common')`, preserving their roles and DOM structure.

- [ ] **Step 5: Run focused and regression tests**

```bash
npx vitest run src/components/ConnectionBanner.test.jsx src/components/SentryErrorFallback.test.jsx src/components/GlobalCopy.test.jsx
npm run test:unit
```

Expected: PASS.

- [ ] **Step 6: Commit global copy**

```bash
git add src/App.jsx src/locales/en/common.js src/locales/en/errors.js src/components/ConnectionBanner.jsx src/components/UpdateBanner.jsx src/components/SentryErrorFallback.jsx src/components/ui/dialog.jsx src/components/ui/spinner.jsx src/components/ConnectionBanner.test.jsx src/components/SentryErrorFallback.test.jsx src/components/GlobalCopy.test.jsx
git commit -m "localize global app copy"
```

---

### Task 3: Rewrite Sign-In and Pairing Copy

**Files:**
- Modify: `src/locales/en/auth.js`
- Modify: `src/locales/en/pairing.js`
- Modify: `src/components/AuthScreen.jsx`
- Modify: `src/components/PairingScreen.jsx`
- Modify: `src/App.jsx`
- Modify: `src/components/AuthScreenTranslation.test.jsx`
- Modify: `src/components/PairingOfflineActions.test.js`
- Create: `src/components/PairingCopy.test.jsx`

- [ ] **Step 1: Write failing behavior tests**

Keep the auth DOM-mutation regression test, but change its expected button to `Continue with Google` from the `auth` namespace. Add rendered pairing tests for the heading, intro, code labels, and logout confirmation:

```jsx
expect(screen.getByRole('heading', { name: 'Find your person' })).toBeInTheDocument();
expect(screen.getByText('Make a one-time code, or enter the one your person sent you.')).toBeInTheDocument();
expect(screen.getByLabelText('Enter your person’s code')).toBeInTheDocument();
```

Mock Firebase listeners and callables using the same module-mocking pattern already used by the component suite.

- [ ] **Step 2: Verify the tests fail**

```bash
npx vitest run src/components/AuthScreenTranslation.test.jsx src/components/PairingCopy.test.jsx
node --test src/components/PairingOfflineActions.test.js
```

Expected: FAIL on missing resources and old literals.

- [ ] **Step 3: Populate auth and pairing resources**

Use these exact primary strings:

```js
// auth.js
export default {
  tagline: 'A little window into your person’s day.',
  continueWithGoogle: 'Continue with Google',
  errors: {
    popupBlocked: 'Your sign-in window was blocked. Allow pop-ups and try again.',
    network: 'We couldn’t reach Google. Check your connection and try again.',
    generic: 'Sign-in didn’t work this time. Give it another try.'
  }
};
```

```js
// pairing.js
export default {
  signedInAs: 'Signed in as',
  title: 'Find your person',
  intro: 'Make a one-time code, or enter the one your person sent you.',
  notifications: {
    title: 'Pairing notifications',
    body: 'Get a little heads-up when your person responds.',
    enable: 'Turn on notifications'
  },
  invites: {
    title: 'Invites waiting for you',
    wantsToPair: 'wants to be your person',
    accept: 'Pair up',
    decline: 'Not this time',
    pending: 'Your invite is on its way',
    cancel: 'Cancel invite',
    declined: 'Invite declined.',
    canceled: 'Invite canceled.'
  },
  code: {
    title: 'Pair with a code',
    intro: 'Share your code with your person, or enter the code they gave you.',
    shareTitle: 'Make your code',
    shareBody: 'Create a one-time code to send to your person.',
    create: 'Create a code',
    createdLabel: 'Your code is ready',
    copy: 'Copy code',
    copied: 'Code copied ✨',
    enterLabel: 'Enter your person’s code',
    enterHelp: 'Type the six characters they shared with you.',
    submit: 'Pair us'
  },
  logout: {
    label: 'Log out',
    title: 'Log out for now?',
    body: 'You’ll need to sign in again before you can pair or share photos.',
    confirm: 'Log out'
  },
  removedDefault: 'The pairing ended. You can find your person again whenever you’re ready.',
  removedByPerson: '{{name}} ended the pairing. You can find your person again whenever you’re ready.',
  errors: {
    offline: 'Pairing needs a connection. Reconnect and try again.',
    accept: 'We couldn’t accept that invite. Try again.',
    decline: 'We couldn’t decline that invite. Try again.',
    cancel: 'We couldn’t cancel that invite. Try again.',
    createCode: 'We couldn’t make a code. Try again.',
    redeemCode: 'That code didn’t work. Check it and try again.',
    notifications: 'We couldn’t turn on notifications. Try again.'
  },
  accessibility: {
    notifications: 'Notifications',
    incomingRequests: 'Incoming pairing invites',
    outgoingRequest: 'Outgoing pairing invite',
    logout: 'Log out'
  }
};
```

Include literal accessibility keys for incoming/outgoing request sections and notification controls. Keep the code placeholder `ABC123` as non-translatable input-format metadata.

- [ ] **Step 4: Migrate auth and pairing components**

Use `useTranslation` and replace stateful prose with keys or translated values. Remove `parseError` exposure of `err.message`; select stable friendly errors by operation. In auth, map `auth/popup-blocked` and network-family codes to their specific keys, ignore `auth/popup-closed-by-user`, and use `auth:errors.generic` for everything else.

Preserve `translate="no"` on the Google button and pairing/status controls that are protected from browser translation DOM mutation.

- [ ] **Step 5: Pass focused and full tests**

```bash
npx vitest run src/components/AuthScreenTranslation.test.jsx src/components/PairingCopy.test.jsx
node --test src/components/PairingOfflineActions.test.js
npm run test:unit
```

Expected: PASS.

- [ ] **Step 6: Commit auth and pairing copy**

```bash
git add src/App.jsx src/locales/en/auth.js src/locales/en/pairing.js src/components/AuthScreen.jsx src/components/PairingScreen.jsx src/components/AuthScreenTranslation.test.jsx src/components/PairingOfflineActions.test.js src/components/PairingCopy.test.jsx
git commit -m "rewrite auth and pairing copy"
```

---

### Task 4: Rewrite Camera, Feed, and History Copy

**Files:**
- Modify: `src/locales/en/camera.js`
- Modify: `src/locales/en/history.js`
- Modify: `src/components/MainScreen.jsx`
- Modify: `src/components/HistoryScreen.jsx`
- Modify: `src/hooks/useCamera.js`
- Modify: `src/hooks/useCamera.test.jsx`
- Modify: `src/components/MainScreenOfflineCapture.test.js`
- Modify: `src/components/MainScreenLocalQueue.test.js`
- Modify: `src/components/MainScreenLikeButton.test.js`
- Modify: `src/components/HistoryScreen.test.js`
- Create: `src/components/CameraCopy.test.jsx`

- [ ] **Step 1: Write failing copy tests**

Add assertions for the camera startup state, caption field, upload state, failed upload actions, empty feed, and empty history:

```jsx
expect(screen.getByText('Waking up your camera…')).toBeInTheDocument();
expect(screen.getByLabelText('Add a caption')).toHaveAttribute('placeholder', 'Add a little note…');
expect(screen.getByText('Your little photo story starts here ✨')).toBeInTheDocument();
```

Update source-contract tests to look for translation keys instead of retired prose while preserving their behavioral assertions.

- [ ] **Step 2: Run the focused tests to verify failure**

```bash
npx vitest run src/components/CameraCopy.test.jsx
node --test src/components/MainScreenOfflineCapture.test.js src/components/MainScreenLocalQueue.test.js src/components/MainScreenLikeButton.test.js src/components/HistoryScreen.test.js
```

Expected: FAIL on new copy and absent `t(...)` calls.

- [ ] **Step 3: Populate camera and history resources**

Use these copy groups:

```js
// camera.js
export default {
  screenLabel: 'Home',
  startup: {
    title: 'Waking up your camera…',
    body: 'Allow camera access to capture your next little moment.',
    switching: 'Switching camera'
  },
  review: {
    captionPlaceholder: 'Add a little note…',
    captionLabel: 'Add a caption',
    discard: 'Discard photo',
    send: 'Send to your person',
    addCaption: 'Add a caption'
  },
  controls: {
    label: 'Camera controls',
    capture: 'Take photo',
    flash: 'Toggle flash',
    switchCamera: 'Switch camera'
  },
  queue: {
    sending: 'Sending to your person…',
    queued: 'Waiting to send',
    failed: 'This photo didn’t make it through.',
    retry: 'Try sending again',
    delete: 'Delete failed photo'
  },
  photo: {
    sent: 'Sent',
    liked: 'Loved',
    like: 'Love this photo',
    unlike: 'Remove love'
  },
  empty: {
    title: 'Your little photo story starts here ✨',
    body: 'Tap the shutter to send the first moment to your person.'
  },
  errors: {
    unavailable: 'This browser can’t use the camera.',
    denied: 'Camera access is blocked. Allow it in your browser settings and try again.',
    timeout: 'Check the browser camera prompt, then try again.',
    start: 'The camera couldn’t start. Give it another try.',
    switch: 'We couldn’t switch cameras.',
    restore: 'We couldn’t bring the camera back. Try again.',
    offlineSend: 'Reconnect to send this photo to your person.',
    capture: 'That photo didn’t work. Give it another try.',
    upload: 'This photo couldn’t be sent. Try again when you’re ready.'
  }
};
```

```js
// history.js
export default {
  title: 'Your moments',
  empty: {
    title: 'No little moments here yet ✨',
    body: 'The photos you share will gather here.'
  },
  openPhoto: 'Open photo',
  loadMore: 'Show me more',
  tryAgain: 'Try again'
};
```

- [ ] **Step 4: Migrate MainScreen and HistoryScreen**

Add `useTranslation(['camera', 'history', 'common'])` to the screens and `useTranslation('camera')` to `useCamera`. Translate JSX, hook-owned camera errors, `aria-label` branches, toast/error creation, queue states, pagination actions, navigation labels, and image alt text. Preserve `translate="no"` and `.notranslate` on the photo status chip; translate the string values before they enter that protected node.

Do not change camera lifecycle, queue ordering, scrolling, upload behavior, or animation timing.

- [ ] **Step 5: Run focused and full tests**

```bash
npx vitest run src/components/CameraCopy.test.jsx src/hooks/useCamera.test.jsx
node --test src/components/MainScreenOfflineCapture.test.js src/components/MainScreenLocalQueue.test.js src/components/MainScreenLikeButton.test.js src/components/HistoryScreen.test.js
npm run test:unit
```

Expected: PASS.

- [ ] **Step 6: Commit camera and history copy**

```bash
git add src/locales/en/camera.js src/locales/en/history.js src/components/MainScreen.jsx src/components/HistoryScreen.jsx src/hooks/useCamera.js src/hooks/useCamera.test.jsx src/components/CameraCopy.test.jsx src/components/MainScreenOfflineCapture.test.js src/components/MainScreenLocalQueue.test.js src/components/MainScreenLikeButton.test.js src/components/HistoryScreen.test.js
git commit -m "rewrite camera and history copy"
```

---

### Task 5: Rewrite Profile and Notification Copy

**Files:**
- Modify: `src/locales/en/profile.js`
- Modify: `src/locales/en/notifications.js`
- Modify: `src/components/ProfileView.jsx`
- Modify: `src/components/NotificationPrompt.jsx`
- Modify: `src/components/NotificationSettings.jsx`
- Modify: `src/hooks/useNotifications.js`
- Modify: `src/hooks/useNotifications.test.jsx`
- Modify: `src/components/ProfileView.test.jsx`
- Modify: `src/components/NotificationPrompt.test.jsx`
- Modify: `src/components/NotificationSettings.test.jsx`

- [ ] **Step 1: Update tests with the new voice**

Assert these primary outcomes:

```jsx
expect(screen.getByText('Your person')).toBeInTheDocument();
expect(screen.getByRole('button', { name: 'Edit your name' })).toBeEnabled();
expect(screen.getByText('Want a little heads-up?')).toBeInTheDocument();
expect(screen.getByRole('button', { name: 'Turn on notifications' })).toBeEnabled();
```

Keep all existing edit, save, cancel, loading, destructive-action, and diagnostics behavior assertions.

- [ ] **Step 2: Verify focused tests fail**

```bash
npx vitest run src/components/ProfileView.test.jsx src/components/NotificationPrompt.test.jsx src/components/NotificationSettings.test.jsx
```

Expected: FAIL on new copy.

- [ ] **Step 3: Populate profile and notification resources**

Use the following customer-facing copy while retaining literal diagnostic terminology:

```js
// profile.js
export default {
  screenLabel: 'Profile',
  pairedWith: 'Your person',
  account: 'Your account',
  displayName: 'Display name',
  email: 'Email',
  signIn: 'Signed in with',
  google: 'Google',
  editName: 'Edit your name',
  cancelNameEdit: 'Cancel name edit',
  saveName: 'Save your name',
  nameLengthError: 'Your name needs to be between 2 and 30 characters.',
  nameSaveError: 'We couldn’t save your name. Try again.',
  about: 'About Pocofoto',
  privacy: 'Privacy Notice',
  terms: 'Terms of Use',
  removePairing: {
    title: 'Stop pairing with your person?',
    body: 'You’ll both keep your accounts, but this shared photo space will close.',
    confirm: 'Stop pairing'
  },
  logout: {
    title: 'Log out for now?',
    body: 'Your shared photos will be here when you come back.',
    confirm: 'Log out'
  }
};
```

```js
// notifications.js
export default {
  prompt: {
    title: 'Want a little heads-up?',
    body: 'Know when your person sends a photo, loves one, or responds to pairing.',
    enable: 'Turn on notifications'
  },
  setting: {
    title: 'Notifications',
    enabled: 'This device is ready for little updates from your person.',
    disabled: 'Turn on notifications for little updates from your person.',
    denied: 'Allow notifications in your browser or device settings.',
    unsupported: 'Notifications aren’t available in this browser.',
    permissionOnly: 'Permission is allowed, but this device still needs to register.',
    on: 'On',
    off: 'Off'
  },
  errors: {
    enable: 'We couldn’t turn on notifications. Try again.',
    unavailable: 'Notifications aren’t available on this device.'
  },
  foreground: {
    photo: 'A new photo from your person',
    loved: 'Your photo got some love',
    pairingRequest: 'A new pairing invite',
    pairingAccepted: 'You found your person ✨',
    pairingRemoved: 'Your pairing has ended',
    generic: 'A little update from Pocofoto'
  },
  diagnostics: {
    toggle: 'Notification diagnostics',
    permission: 'Permission',
    serviceWorker: 'Service worker',
    device: 'Device',
    token: 'Token',
    registration: 'Registration',
    partnerDevices: 'Partner devices',
    noTest: 'No test sent yet.',
    noDevices: 'No registered devices',
    register: 'Register this device',
    testThis: 'Test this device',
    testPartner: 'Test your person’s devices',
    cooldown: 'Test cooldown is active.'
  }
};
```

- [ ] **Step 4: Migrate profile and notification components**

Use `useTranslation` in the three components and in `useNotifications` for all labels, help text, permission outcomes, foreground fallback messages, button text, confirmation dialogs, accessibility names, and validation errors. Prefer the localized payload `data.body` when present, then map notification `type` to the `foreground` keys. Keep raw diagnostic values such as permission state, device ID, token fingerprint, counts, and registration reason unchanged.

- [ ] **Step 5: Run focused and full tests**

```bash
npx vitest run src/components/ProfileView.test.jsx src/components/NotificationPrompt.test.jsx src/components/NotificationSettings.test.jsx src/hooks/useNotifications.test.jsx
npm run test:unit
```

Expected: PASS.

- [ ] **Step 6: Commit profile and notification copy**

```bash
git add src/locales/en/profile.js src/locales/en/notifications.js src/components/ProfileView.jsx src/components/NotificationPrompt.jsx src/components/NotificationSettings.jsx src/hooks/useNotifications.js src/hooks/useNotifications.test.jsx src/components/ProfileView.test.jsx src/components/NotificationPrompt.test.jsx src/components/NotificationSettings.test.jsx
git commit -m "rewrite profile and notification copy"
```

---

### Task 6: Centralize and Refresh English Push Copy

**Files:**
- Create: `functions/pushCopy.js`
- Create: `functions/pushCopy.test.js`
- Modify: `functions/push.js`
- Modify: `functions/index.js`
- Modify: `functions/push.test.js`

- [ ] **Step 1: Write failing push-copy contract tests**

Create `functions/pushCopy.test.js`:

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { pushCopy } from './pushCopy.js';

test('photo notification uses the Pocofoto voice', () => {
  assert.deepEqual(pushCopy.photoReceived('Alex'), {
    title: 'A little photo from your person 📸',
    body: 'Alex sent you a moment.'
  });
});

test('like notification stays warm and clear', () => {
  assert.deepEqual(pushCopy.photoLiked('Alex'), {
    title: 'Your photo got some love',
    body: 'Alex loved your photo.'
  });
});

test('pairing notifications describe the exact event', () => {
  assert.equal(pushCopy.pairingRequest('Alex').body, 'Alex wants to be your person.');
  assert.equal(pushCopy.pairingAccepted('Alex').body, 'Alex paired up with you.');
  assert.equal(pushCopy.pairingRemoved('Alex').body, 'Alex ended the pairing.');
});
```

- [ ] **Step 2: Verify the new tests fail**

```bash
node --test functions/pushCopy.test.js
```

Expected: FAIL because `functions/pushCopy.js` does not exist.

- [ ] **Step 3: Implement the English push-copy module**

Create pure builders in `functions/pushCopy.js`:

```js
const personName = (name) => name || 'Your person';

export const pushCopy = {
  photoReceived: (name) => ({
    title: 'A little photo from your person 📸',
    body: `${personName(name)} sent you a moment.`
  }),
  photoLiked: (name) => ({
    title: 'Your photo got some love',
    body: `${personName(name)} loved your photo.`
  }),
  pairingRequest: (name) => ({
    title: 'Someone wants to pair up',
    body: `${personName(name)} wants to be your person.`
  }),
  pairingAccepted: (name) => ({
    title: 'You found your person ✨',
    body: `${personName(name)} paired up with you.`
  }),
  pairingRemoved: (name) => ({
    title: 'Your pairing has ended',
    body: `${personName(name)} ended the pairing.`
  }),
  debugPartner: (name) => ({
    title: 'Pocofoto test notification',
    body: `${personName(name)} sent a test notification.`
  }),
  debugDevice: () => ({
    title: 'Pocofoto test notification',
    body: 'This device is ready for Pocofoto notifications.'
  })
};
```

- [ ] **Step 4: Consume the builders without changing event contracts**

In `functions/push.js`, spread the relevant copy builder into each event while preserving `eventId`, `type`, `photoId`, and `link`. In `functions/index.js`, use `debugPartner` and `debugDevice` for diagnostic pushes. Do not add locale fields or change token registration.

- [ ] **Step 5: Run function tests and lint**

```bash
node --test functions/pushCopy.test.js functions/push.test.js
npm run lint:functions
```

Expected: PASS.

- [ ] **Step 6: Commit push copy**

```bash
git add functions/pushCopy.js functions/pushCopy.test.js functions/push.js functions/index.js functions/push.test.js
git commit -m "refresh English push copy"
```

---

### Task 7: Audit Every User-Facing String and Verify the App

**Files:**
- Modify: any copy-bearing file identified by the audit, limited to the approved scope
- Modify: matching copy-sensitive tests

- [ ] **Step 1: Scan for remaining JSX and state-message literals**

Run:

```bash
rg -n --glob '*.{js,jsx}' ">[[:space:]]*[A-Za-z][^<{]*<|aria-label=\"[A-Za-z]|placeholder=\"[A-Za-z]|set(Error|Notice|Toast)\(['\"]" src
```

Expected: only approved technical diagnostics, build metadata, brand names, input-format placeholders, and test fixtures remain. Move every other customer-facing literal into its flow namespace.

- [ ] **Step 2: Scan for raw provider errors reaching the UI**

```bash
rg -n "err(or)?\?*\.message|parseError|Firebase:" src/components src/App.jsx
```

Expected: no raw provider message is rendered; logs may still contain technical errors.

- [ ] **Step 3: Verify namespace and key coverage**

```bash
rg -n "useTranslation|\bt\(" src/App.jsx src/components src/locales/en
```

Expected: every customer-facing component uses the appropriate namespace; no missing-key warnings appear during tests or build.

- [ ] **Step 4: Run all automated verification**

```bash
npm run test:unit
npm run lint
npm run lint:functions
npm run build
```

Expected: all commands exit 0.

- [ ] **Step 5: Run the local app and manually inspect every flow**

```bash
npm run dev
```

Check auth, pairing, camera startup/review/feed, failed and queued uploads, history, profile editing, notification prompt/settings, offline/reconnected banners, update banner, confirmations, and fatal fallback. Confirm copy fits without clipping, focus names remain literal, only approved emoji placements appear, and no behavior/layout changed.

- [ ] **Step 6: Commit audit fixes**

```bash
git add src functions
git commit -m "complete app copy audit"
```

Do not include unrelated pre-existing worktree changes in this commit.

---

## Deferred Turkish Phase

The later Turkish plan will add `tr` resource modules, add `tr` to `supportedLanguages`, test Turkish plural/interpolation behavior, store locale per notification device, and select server push copy by recipient locale. It will not require changing component translation APIs created here.
