# Pocofoto App — Photo Sharing for Two

Mobile-first, Locket-style private photo sharing app for exactly 2 paired users. Sign in with Google, pair via 6-character invite code, instantly send captioned photos to your partner, like photos, browse history, and get data-only push notifications for photos, likes, and pairing events.

Web client lives in `src/` (React 19 + Vite). Native client lives in `mobile/` (Expo SDK 57). Backend is Firebase: Auth, Firestore, Storage, and Cloud Functions (Node 20).

## Features

- **Auth:** Google sign-in (Apple allowed by rules), `users/{uid}` profile merge, two-session emulator-tested flow.
- **Pairing:** 6-char invite codes (`A-Z sans I/O + 2-9`, 1 active/user, 24h TTL), deterministic `coupleId = sortedUids.join('_')`, legacy pairing-request flow, block/unpair support.
- **Photos:** Camera capture → compress → 256px WebP thumbnail + V2 color palette → Storage `couples/{coupleId}/...` → `couples/{id}/photos` doc with 36-char caption. Offline queue, paginated history, resilient image + runtime cache.
- **Likes:** Single allowed photo mutation (`liked` / `couples/{id}.lastLike`).
- **Push:** Explicit opt-in only, VAPID + service worker, per-device `fcmTokens`, server-side dedupe/60-day expiry, foreground toast, `?notification=photo&photoId=` deep links, Profile diagnostics + rate-limited test sends.
- **PWA:** Installable manifest, Workbox cache (fonts + Storage), update prompt, `viewport-fit=cover`, Nunito font.
- **Observability:** PostHog + Amplitude + Firebase Analytics, Sentry tracing/replay/profiling.

## Tech Stack

- **Frontend:** React 19, Vite 8 (`--host 0.0.0.0`), Tailwind 4, shadcn/radix-ui, framer-motion, lucide-react, i18next (en-only), sonner, next-themes, vite-plugin-pwa.
- **Backend:** Firebase 12 client (`firebase` npm) + `firebase-admin` 13 / `firebase-functions` 6: Auth, Firestore (multi-tab persistent cache), Storage, Callable + Firestore + Scheduler functions.
- **Infra:** `firebase.json`, `firestore.rules` / `storage.rules` / `firestore.indexes.json` / `storage.cors.json`, Cloudflare Pages (`CF_PAGES_COMMIT_SHA` in `vite.config.js`), Sentry vite plugin, `sharp` backfills. Prod project `sixth-bonbon-402909`, local emulator project `demo-locket-local`.

## How It Works

1. `src/App.jsx` routes `auth → pairing → main` via `onSnapshot(users/{uid})` + `lib/userRouteCache.js` fallback.
2. `PairingScreen.jsx` calls `createPairingCode` / `redeemPairingCode` Cloud Functions, which transactionally create `couples/{id}` and set both `users.coupleId`.
3. `MainScreen.jsx` + `useCamera.js` + `lib/camera|photoThumbnails|photoPalette.js` upload to Storage then `addDoc(couples/{id}/photos)` and update `couples/{id}.currentPhotoUrl`.
4. Functions triggers send pushes: `onDocumentCreated(photos)` → photo received, `onDocumentUpdated(couples)` on `lastLike` → liked, `onDocumentCreated(pairingRequests)` → pairing request, plus 24h FCM-token and 15m pairing-artifact expiry schedulers.
5. `notifications/notificationClient.js` + `pushNotifications.js` manage SW registration, token register/remove, and diagnostics (`sendTestPushToThisDevice`, `sendTestPushToPartnerDevices`).

## Project Structure

- `src/App.jsx`, `src/main.jsx`, `src/firebase.js` — routing, bootstrap, centralized Firebase init/emulator switch.
- `src/components/` — `AuthScreen`, `PairingScreen`, `MainScreen`, `HistoryScreen`, `ProfileView`, `NotificationPrompt`, `UpdateBanner`, `ConnectionBanner`.
- `src/hooks/` — `useNotifications`, `useCamera`, `usePaginatedPhotos`.
- `src/lib/` — `camera`, `localPhotoQueue`, `photoThumbnails`, `photoPalette`, `haptics`, `connectionStatus`, `userRouteCache`, `pairRouteState`, `notificationDevice`.
- `src/notifications/`, `src/analytics.js`, `src/sentry.js`, `src/pwaUpdates.js`, `src/i18n.js`.
- `functions/` — `index.js`, `push.js`, `pushCopy.js`, `safety.js`, `accountDeletion.js`.
- `mobile/` — Expo native client (v0.0.3, requires dev build).
- `scripts/` — palette/thumbnail backfills, `public/firebase-messaging-sw*.js` — FCM SW, `docs/` — extra docs.

## Data Model (Firestore)

- `users/{uid}` + `users/{uid}/private/*`, `users/{uid}/notifications/*`, `users/{uid}/fcmTokens/{deviceId}`
- `pairingCodes/{CODE}`, `pairingRequests/{id}`, `fcmTokenRegistry/{fingerprint}`, `contentReports/{id}`
- `couples/{sortedUidPair}` + `couples/{id}/photos/{id}`
- Storage: `users/{uid}/{file}` (8 MB avatars), `couples/{coupleId}/**` (10 MB member photos)

See `firestore.rules`, `storage.rules`, and `functions/index.js` as source of truth.

## Local Development

Local development uses Firebase Local Emulator Suite by default. The app connects to:

- Auth emulator: `127.0.0.1:9099`
- Firestore emulator: `127.0.0.1:8080`
- Storage emulator: `127.0.0.1:9199`
- Emulator UI: `127.0.0.1:4000`

### Prerequisites

- Node.js and npm
- Java 21 or newer for `firebase-tools`
- Project dependencies installed with `npm install`

This machine was found with Java 8 during setup. `firebase-tools` 15 requires Java 21 or newer, so upgrade Java before starting the emulators.

### Run Locally

Terminal 1:

```sh
npm run emulators
```

Terminal 2:

```sh
npm run dev
```

Open the Vite URL shown in the terminal, usually `http://localhost:5173/`.

### Fresh Emulator State

Use this when you want no imported persisted emulator data:

```sh
npm run emulators:fresh
```

The normal `npm run emulators` command imports `.firebase-emulator-data` when it exists and exports emulator state back to that directory on exit. The directory is ignored by git.

### Auth Emulator

Use `Continue with Google` in the app. In local development, Firebase Auth emulator handles the local Google-provider sign-in flow. You can also inspect users in the Emulator UI.

To test pairing:

1. Sign in as user A and create an invite code.
2. Open a second normal or incognito browser window.
3. Sign in as user B through the Auth emulator.
4. Enter user A's invite code.
5. Confirm `users`, `invites`, `couples`, and `couples/{id}/photos` appear in the Firestore emulator.

## Firebase Modes

By default in Vite dev, the app connects to Firebase emulators.

Set either flag to bypass emulator connections:

```sh
VITE_USE_REAL_FIREBASE=true
```

or:

```sh
VITE_USE_FIREBASE_EMULATORS=false
```

Production builds use hosted Firebase unless explicitly configured otherwise.

## Push Notifications

Notification permission is requested only from an explicit user action:

- the paired-user onboarding prompt after pairing succeeds or on the next open for already paired users
- the manual `Enable notifications` control in Profile or on the unpaired Pairing screen

Granted browsers silently refresh the current device token on signed-in app startup. Signing out or disabling notifications removes only the current browser/device registration. The backend owns token storage in `fcmTokenRegistry`, deduplicates sends by token, expires inactive registrations after 60 days, and sends data-only FCM payloads for photos, likes, pairing requests, accepted pairing, removed pairing, and diagnostics tests.

The Profile screen includes collapsed production diagnostics under `Notification diagnostics`. It shows current-device status and has two test actions:

- `Test this device` sends a push to the current browser registration.
- `Test partner's devices` sends a push to active devices for the paired partner.

Test sends are server-rate-limited to one request every 10 seconds per signed-in user.

## Scripts

```sh
npm run dev
npm run lint
npm run build
npm run preview
npm run emulators
npm run emulators:fresh
```

## Security Rules

The included Firestore and Storage rules are permissive prototype rules: authenticated users can read and write app data and files. Tighten these before production deployment.
