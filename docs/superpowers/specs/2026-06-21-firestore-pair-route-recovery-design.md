# Firestore Pair Route Recovery Design

## Goal

Recover the currently affected paired user in one release and permanently prevent Pocofoto from routing a known paired user to Pairing because of a stale cache-only Firestore snapshot or a listener failure.

## Production Evidence

PostHog and production Firestore establish the failure sequence:

- The affected Android user previously started with `session_started.hasCoupleId: true` and reached `main`.
- On 2026-06-21 at 14:45:04 Europe/Istanbul, the app rendered `main` and switched to `pairing` 214 ms later.
- Subsequent launches reported `session_started.hasCoupleId: false` and remained on Pairing.
- The production `users/{uid}` document still contains the correct `coupleId`.
- The production couple document exists and still contains both members.
- A normal PWA Cache Storage reset cannot repair this state because Firestore persistence is stored separately in IndexedDB.

The current route listener treats every snapshot as authoritative. A cache-only snapshot with a missing or null `coupleId` can therefore overwrite a known-good local route. The listener error path also treats an online browser as proof that the user is unpaired, even though `navigator.onLine` does not prove Firestore connectivity.

## Approved Approach

Ship one release containing two coordinated protections:

1. A one-time Firestore persistence reset restricted to the affected Firebase user.
2. A permanent metadata-aware route policy that requires server confirmation before downgrading a known paired route.

The reset recovers the current device. The route policy fixes the underlying behavior and protects every user.

## One-Time Recovery

Create a small recovery module that runs during Firebase startup after Authentication restores the current user but before any Firestore read, write, or listener starts.

The module will:

- compare a SHA-256 digest of the restored Firebase UID with the affected-user digest `e83bfb2a4c7fee83e80ede04fa70edbaa69829e97ba1a0ee0b159afa06dbae39`
- check the local epoch key `pocofoto:firestore-recovery:pair-route-v1`
- call Firebase `clearIndexedDbPersistence(db)` only when the digest matches and the epoch is incomplete
- record the epoch only after a successful clear
- return a structured status for diagnostics
- continue startup without marking completion when clearing fails

Hash comparison avoids publishing the raw Firebase UID in the client bundle. The UID is not a credential, but there is no reason to expose it directly.

Firebase Authentication persistence is separate and must remain untouched. Pocofoto's `local-photo-queue` and `offline-review-drafts` IndexedDB databases are also separate and must remain untouched. Firebase documents that `clearIndexedDbPersistence()` clears cached documents and pending Firestore writes; this tradeoff is accepted for the single affected user because their route is already unusable.

The recovery can fail with `failed-precondition` when another Pocofoto tab or window still owns Firestore. In that case the app continues with the permanent route guard, the epoch remains incomplete, and the recovery retries on a later launch after other tabs are closed.

## Permanent Route Policy

Move snapshot interpretation into a pure `pairRouteState` module. The module accepts:

- whether the user snapshot exists
- snapshot `coupleId`
- `snapshot.metadata.fromCache`
- the current in-memory `coupleId`
- the cached route `coupleId`

It returns a decision containing the route state, effective `coupleId`, whether local route storage should change, and a diagnostic reason.

### Decision Rules

| Input | Decision |
| --- | --- |
| Any snapshot containing a `coupleId` | Paired; use and persist that ID |
| Cache-only null/missing snapshot with a known current or cached `coupleId` | Preserve paired route; do not overwrite storage |
| Cache-only null/missing snapshot without a known `coupleId` | Pair state unknown; show Offline Hold, not Pairing |
| Server-confirmed null/missing snapshot | Unpaired; clear the cached route and show Pairing |
| Listener error with a known current or cached `coupleId` | Preserve paired route |
| Listener error without a known `coupleId` | Pair state unknown; show Offline Hold |

The Firestore listener will use `includeMetadataChanges: true` so a cache result followed by server confirmation produces a second decision even when document fields are unchanged.

An explicit successful pairing removal remains authoritative through the existing `handlePairingRemoved` flow. The new policy only prevents unverified cache and error states from silently behaving like confirmed pairing removal.

## Diagnostics

Add Sentry breadcrumbs for route decisions with these non-sensitive fields:

- `reason`
- `fromCache`
- `hasSnapshotCoupleId`
- `hadKnownCoupleId`
- resulting route state

Listener failures remain captured as handled exceptions with their Firebase error code. Recovery reports one of `not-targeted`, `already-completed`, `cleared`, or `failed`; failures include the error code. Raw UID and `coupleId` values must not be attached to Sentry.

## Files

- Create `src/lib/firestoreRecovery.js`: affected-user matching, epoch handling, and persistence clearing.
- Create `src/lib/firestoreRecovery.test.js`: one-time, non-target, success, and failure behavior.
- Create `src/lib/pairRouteState.js`: pure snapshot and listener-error decisions.
- Create `src/lib/pairRouteState.test.js`: route decision matrix.
- Modify `src/firebase.js`: wait for restored Auth state and run recovery before Firestore use.
- Modify `src/App.jsx`: use metadata-aware route decisions and preserve unknown states.
- Modify `src/sentry.js`: add a narrow breadcrumb helper.
- Modify `src/lib/firebasePersistence.test.js`: assert startup recovery ordering.
- Modify `src/components/AppOfflineRouting.test.js`: assert metadata-aware listener wiring.
- Modify `src/lib/sentryConfig.test.js`: test route breadcrumb context.
- Modify `package.json` and `package-lock.json`: bump `0.3.2` to `0.3.3`.

## Testing

Automated tests must prove:

- non-target users never clear Firestore persistence
- the target clears exactly once and Authentication storage is never accessed
- a failed clear does not write the epoch marker
- cache-paired snapshots establish a paired route
- cache-only null snapshots cannot downgrade a known paired route
- cache-only null snapshots with no known route remain unknown
- server-confirmed null snapshots produce Pairing and clear route storage
- listener errors preserve a known paired route
- listener errors without a known route remain unknown
- `App.jsx` requests metadata changes and reports route decisions

Run `npm run test:unit`, `npm run lint`, and `npm run build`.

## Release Verification

Push the verified `0.3.3` commit to `main` and allow Cloudflare Pages CI/CD to deploy it. After the affected user applies the PWA update and closes any duplicate Pocofoto tabs:

1. Confirm the recovery status is `cleared` or `already-completed`.
2. Confirm PostHog records `session_started.hasCoupleId: true`.
3. Confirm the route progresses through Auth/Offline Hold to Main without a subsequent Pairing event.
4. Confirm the production user and couple documents remain unchanged.
5. Confirm no new `user-route-listener` Sentry issue is emitted for that launch.

## Rollback And Cleanup

If the release regresses startup, revert the Firebase startup recovery wiring while retaining the pure route policy where possible. The recovery marker is harmless if left behind.

After production confirms the affected user is recovered, remove the affected-user digest and startup clearing call in the next routine release. Keep the permanent route policy, tests, and diagnostics.

## Non-Goals

- Clearing PWA Cache Storage, service workers, Firebase Authentication, local photo queues, or review drafts.
- Repairing production Firestore documents; current server data is already correct.
- Redesigning Pairing UI or changing explicit pairing-removal behavior.
- Resetting Firestore persistence for all users.
