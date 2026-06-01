# Repository Guidelines

## Project Structure & Module Organization
- `src/` contains the React app: screens in `src/components/`, app bootstrapping in `src/main.jsx`, shared Firebase setup in `src/firebase.js`, and analytics/push helpers in `src/analytics.js` and `src/pushNotifications.js`.
- `functions/` holds Firebase Cloud Functions and its own ESLint config.
- `firestore.rules`, `storage.rules`, and `firestore.indexes.json` define backend access and indexes.
- `public/` is for static assets, `screenshots/` for reference captures, and `dist/` is the generated build output.

## Build, Test, and Development Commands
- `npm run dev` starts the Vite app on `0.0.0.0` for local development.
- `npm run build` creates the production bundle in `dist/`.
- `npm run lint` runs ESLint for the frontend.
- `npm run lint:functions` runs ESLint in `functions/`.
- `npm run emulators` starts Firebase Emulator Suite and imports/exports `.firebase-emulator-data` when available.
- `npm run emulators:fresh` starts emulators with a clean state.
- `npm run preview` serves the production build locally.

## Coding Style & Naming Conventions
- Follow the existing code style: modern ESM, React function components, 2-space indentation in `src/`, and descriptive `camelCase` for variables/hooks.
- Component files use `PascalCase` names such as `AuthScreen.jsx` and `PairingScreen.jsx`.
- Keep Firebase data access and callable logic centralized; avoid scattering backend writes across UI components.
- Let ESLint guide changes. The config already enforces `no-unused-vars` and React Hooks rules.

## Testing Guidelines
- There is no dedicated automated test suite yet.
- Verify changes with `npm run lint`, `npm run build`, and the local emulator flow.
- For pairing or auth changes, validate the happy path in two browser sessions and confirm Firestore updates in the Emulator UI.

## Commit & Pull Request Guidelines
- Commit messages in history are short, imperative, and usually lowercase, for example: `add remove pairing flow` or `pause contact pairing flow`.
- PRs should include a concise summary, linked issue if applicable, and screenshots or screen recordings for UI changes.
- Call out any emulator, rule, or function changes explicitly, since those can affect pairing and auth behavior.

## Security & Configuration Tips
- The app defaults to Firebase emulators in development. Do not commit secrets or local environment values.
- Java 21+ is required for `firebase-tools`; upgrade before running emulators if the local JDK is older.
- When changing data access, update Firestore rules and callable functions together.
