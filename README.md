# Locket App

Mobile-first photo sharing app built with React, Vite, Firebase Auth, Firestore, and Storage.

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
