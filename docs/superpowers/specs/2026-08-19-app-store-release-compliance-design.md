# App Store Release Compliance Design

**Date:** 2026-08-19

**Goal:** Remove the five highest-risk Apple submission gaps from the native Pocofoto app while preserving the couple’s shared photo history.

## Scope and decisions

Account deletion means deleting only the requesting person’s Firebase Auth account, profile, private subcollections, notification registrations, pending pairing data, and membership in the couple’s `users` list. The `couples/{coupleId}` document and every document/file below `couples/{coupleId}/photos` remain intact. The remaining partner keeps access to the shared history; old photos remain attributable by `senderId` but do not require the deleted profile to render.

The native app will use these public URLs:

- `https://pocofoto.com.tr/privacy`
- `https://pocofoto.com.tr/terms`
- `https://pocofoto.com.tr/support`

The existing web app will serve static public pages at those paths. The native profile will open them with `Linking.openURL`, and the App Store Connect metadata will use the privacy and support URLs.

## Architecture

### Account deletion

Add an authenticated `deleteAccount` callable Function. It will:

1. Load the requesting user and any current couple.
2. Remove the user from the couple membership list without deleting the couple or its photos. If no members remain, the couple record is retained as historical data.
3. Cancel the user’s pending pairing requests and active pairing codes.
4. Recursively delete the user document and its private subcollections, including notification records and FCM token records. It must not recursively delete the couple document or any couple storage path.
5. Delete the Firebase Auth user with the Admin SDK.

The client will require an explicit confirmation, call the Function, sign out locally, clear its route cache, and return to the auth screen. A failed request leaves the account signed in and shows a retryable error.

### Sign in with Apple

Add `expo-apple-authentication` and configure its iOS plugin/capability. The auth screen will provide Sign in with Apple alongside Google. Apple credentials will be exchanged for a Firebase `OAuthProvider('apple.com')` credential. The app will continue to create/update the same `users/{uid}` profile shape, with provider metadata set to `apple` or `google`.

The Apple button will be available only on iOS. Google remains available on both platforms. The app’s App Store review notes will explain both paths.

### Legal and support access

Add minimal, readable static HTML pages to `public/privacy`, `public/terms`, and `public/support`. They will explain the actual native/web collection, sharing, retention, deletion, couple-photo behavior, support channel, and abuse reporting route. Native links will be visible in the profile’s About section and will have accessible labels and failure feedback.

### Private-pair UGC safety

Add a compact safety surface rather than an AI moderation pipeline:

- Caption filtering runs before upload and rejects a small, explicit list of abusive/sexual-threat patterns with a neutral retry message.
- Each shared photo has a Report action. Reports are written through an authenticated callable Function to a protected `contentReports/{reportId}` document containing reporter, couple, photo, optional target user, reason, and timestamp. The callable validates couple membership and photo ownership/context.
- A profile safety action lets a user block/unpair the other member. The existing `removePairing` path becomes the block action and is labeled clearly as ending access to the shared couple. The blocked user cannot immediately recreate the same pairing through the same active couple.
- The public Support page provides a contact address and explains how reports are handled. No public user directory or anonymous discovery is introduced.

### Privacy controls and declarations

Analytics initialization will be gated by an explicit native consent setting. Default state is disabled until the user opts in. Profile settings will expose Analytics on/off, and disabling it will stop Firebase Analytics, reset PostHog/Amplitude identities, and prevent future event capture. Sentry error reporting remains separate and is described in the privacy copy.

The app-owned `PrivacyInfo.xcprivacy` will declare the data categories the app directly collects, linked/tracking flags, and purposes. Third-party SDK manifests remain managed by their SDKs. App Store Connect privacy answers must match the code and the public privacy page.

## Error handling and safety boundaries

- Account deletion is idempotent enough for retries: missing profile, missing couple, already-canceled requests, or already-removed membership do not delete couple photos.
- Callable Functions reject unauthenticated callers and cross-couple report targets.
- Client actions are disabled while a destructive or report request is in flight.
- Report failures do not delete or hide the photo locally; the user receives a retryable message.
- Caption filtering is conservative and user-visible; it is not presented as comprehensive content moderation.
- No client-only account deletion or storage deletion is used for the server-owned account data.

## Testing and verification

Add tests before implementation for:

- deletion planning preserves couple/photo paths while deleting user-owned paths
- deletion handles unpaired, paired, and already-detached users
- Apple credential mapping creates the expected Firebase provider credential
- caption filtering rejects configured unsafe patterns and permits normal captions
- report payload validation rejects missing/cross-couple photos
- analytics consent gates capture and supports withdrawal
- native legal actions expose the three URLs

Then run the native lint, typecheck, unit tests, Expo config evaluation, iOS Release archive/build, and a device/simulator smoke flow covering Google, Apple, deletion, paired photo history, report, and analytics withdrawal. Confirm App Store Connect privacy metadata and review credentials separately because they are not stored in this repository.

## Non-goals

- deleting shared couple photos when an account is deleted
- full image/video AI moderation
- public user search or open social networking
- subscriptions, in-app purchases, or new monetization
- changing the existing web product’s core photo behavior
