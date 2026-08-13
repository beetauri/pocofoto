# Pocofoto Native Regression and PWA-Parity Audit

Date: 2026-08-13

## Objective

Bring the Expo/React Native app closer to the existing PWA without changing product behavior. Fix concrete correctness regressions first, then improve visual parity and native performance. The native pager, native scrolling, and native camera APIs remain the implementation foundation.

## Evidence captured before implementation

- `mobile` typecheck passes.
- `mobile` lint passes with one import-order warning in `mobile/index.ts`.
- The PWA production build passes, but Vite reports a 1.5 MB main JavaScript chunk.
- Root lint crashes while traversing `mobile` because the root ESLint 10 config loads the mobile Expo plugin with an incompatible rule API. The root config needs to ignore `mobile/**`; mobile lint remains the authoritative check for that app.
- Native notification photo intents currently navigate to Home without forwarding `photoId`, so notification taps cannot target the opened photo.
- The native Home screen silently ignores offline sends and capture/upload failures.
- Reopening the same history photo can be a no-op because the target ref is never reset after the route parameter is consumed.
- Review drafts persist a cache-file URI instead of durable file data, unlike the PWA IndexedDB draft behavior.
- Native remote images have no retry/fallback state, while the PWA does.
- Native review caption width is fixed, while the PWA uses a centered auto-sizing glass pill.
- Native logout does not run the PWA's notification cleanup path before signing out.
- The native photo hook returns a new API object on every render, causing the queue uploader effect to be reconsidered unnecessarily.

## Implementation batches

### Batch 1 — correctness and data lifecycle

1. Update `/Users/bilalsvart/Desktop/Pocofoto/eslint.config.js` to keep the root PWA lint scope separate from the Expo app, and silence the known import-order warning in `/Users/bilalsvart/Desktop/Pocofoto/mobile/index.ts` using the existing project convention.
2. Update `/Users/bilalsvart/Desktop/Pocofoto/mobile/app/(main)/_layout.tsx` to preserve notification `photoId` when routing to Home.
3. Update `/Users/bilalsvart/Desktop/Pocofoto/mobile/app/(main)/index.tsx` so offline sends are disabled and capture/send failures are visible to the user. Keep queue cleanup failures from turning a successfully queued photo into a duplicate-looking review state.
4. Reset the history target guard after `photoId` is consumed so the same photo can be opened repeatedly.
5. Make review drafts durable in `/Users/bilalsvart/Desktop/Pocofoto/mobile/src/services/localStore.ts`; remove the durable draft file when the draft is cleared.
6. Run native notification cleanup before sign-out, matching the PWA behavior without removing notification functionality.

### Batch 2 — PWA visual and interaction parity

1. Add a shared native photo image component with full-image → thumbnail fallback, loading state, and retry action. Use it in Home and Your Moments.
2. Match PWA timestamp behavior for items older than one day.
3. Make the review caption pill auto-size and remain centered, while keeping the native `TextInput` and keyboard behavior.
4. Use the real partner display name when available, with the existing localized fallback.
5. Improve Profile, History, and Pairing safe-area handling and align the profile editing/section treatment with the PWA's glass-card behavior without changing account actions.

### Batch 3 — targeted performance and bundle improvements

1. Memoize the `usePhotos` API object and clear stale local queue rows when the couple scope changes.
2. Memoize feed cards and constrain the native feed's initial/batched render window while preserving vertical paging and camera behavior.
3. Lazy-load PWA route screens so the PWA keeps the same screens and behavior but does not put every screen into the initial bundle.

## Acceptance checklist

- Root lint no longer crashes because of the nested Expo config; mobile lint/typecheck remain independently clean.
- Notification taps preserve the target photo ID.
- Offline send is visibly unavailable; capture and upload failures are visible and recoverable.
- The same history item can be opened more than once.
- A review draft survives app restart while its durable file exists and is cleaned when discarded/sent.
- Own-photo likes remain unavailable; partner likes remain available.
- Feed image failures provide a retry path instead of a blank card.
- Review captions are centered and sized to their content within the PWA width cap.
- Native navigation remains the approved native pager with swipe transitions and the custom liquid-glass tab bar.
- No simulator or device run is used for this pass. Verification is limited to focused lint, typecheck, export/build, and source-level audits.

## Residual findings from the completion audit

The first implementation pass did not prove the entire objective, so the following second-pass items are part of this same plan:

- Notification diagnostics in the native Profile screen hard-code a successful `1/1` result instead of displaying the callable result.
- Native foreground notifications use raw payload text and do not apply the PWA's localized event copy or duplicate-event guard.
- A notification photo outside the first native photo page is never loaded: Home searches the current array but does not request older pages.
- Expo Camera supports `onMountError`, but Home currently only handles permission state and can leave a black camera surface after a mount failure.
- `mobile/index.js` is the configured entry while `mobile/index.ts` contains a second drifting bootstrap implementation.
- The native center tab uses a camera glyph while the PWA uses a Home/house glyph when the live camera is visible.
- Native local-photo status/actions are rendered as a full-image overlay instead of the PWA's metadata-row treatment.
- The native review send control is a plain send glyph rather than the PWA's shutter ring with a send overlay.
- Pairing and Profile notification listeners are scoped below the main route, so notification listeners are torn down during route changes.
- The native AppProvider re-subscribes the user route listener whenever `coupleId` changes because the current pairing ID is captured as an effect dependency.

## Second-pass execution order

1. Correct notification state/data flow: move the provider to the root layout, localize/dedupe foreground messages, display real diagnostics, and make notification intent handling use stable callbacks.
2. Correct deep-link loading and camera failure recovery: paginate until a requested photo is found, and surface `onMountError` with a native retry path.
3. Remove native bootstrap drift by sharing one background notification registration module between both configured entry files.
4. Restore the remaining PWA visual details: Home glyph/mini-shutter transition, review shutter/send composition, and local queue metadata rows.
5. Add missing focused interaction telemetry and safe-area polish in History/Pairing, then run typecheck/lint/export verification for both native platforms plus the PWA build.
