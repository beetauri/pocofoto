# Reliable Push Notifications Design

## Goal

Make Pocofoto push notifications reliable across permission onboarding, authenticated startup, app reloads and updates, token rotation, logout, foreground and background delivery, account switching, and multiple devices. Replace the current ambiguous debug flow with production-safe diagnostics that can independently test the current device and the partner's devices.

## Product Scope

Pocofoto sends push notifications for:

- A new photo from the user's partner.
- A like from the user's partner.
- A new pairing request, including before a couple exists.
- A pairing request being accepted.
- A pairing being removed.

Notifications use detailed previews with the sender's display name and event context. Users have one master notification control for the current device or browser. Per-event preferences and account-wide notification controls are out of scope.

## Permission Onboarding

### Newly Paired Users

- After pairing succeeds, show an in-app notification explanation once.
- The explanation includes `Enable notifications` and `Not now` actions.
- The browser permission request must run directly from the `Enable notifications` user action.
- `Not now` permanently dismisses the automatic explanation for that user on that device.
- The Profile notification control remains available after dismissal.

### Existing Paired Users

- On authenticated startup, detect users who are already paired and have neither granted notification permission nor permanently dismissed the explanation on that device.
- Show the same one-time explanation after the main application screen is ready.
- Do not repeatedly interrupt users who select `Not now`.

### Unpaired Users

- Do not show the automatic notification explanation before pairing.
- Add a manual `Enable notifications` action to the Pairing screen so an unpaired user can opt into pairing-request pushes.
- Use the same permission and token-registration flow as the Profile control.
- Keep this action available after denial with the same generic settings guidance.

### Permission States

- `default`: The Profile control can invoke the browser permission request from a direct user action.
- `granted`: The app silently obtains and synchronizes the current FCM token during authenticated startup.
- `denied`: Keep the Profile control off and show the generic message `Enable notifications in your browser or device settings.` The same Profile control remains visible, but the app does not attempt to reopen a browser prompt it cannot control.
- Unsupported environment: Keep the control off and explain that notifications are unavailable in this browser.

The automatic explanation is only for paired users. Pairing-request pushes can reach an unpaired user who enabled notifications from the Pairing screen or whose current device registration remains active after a previous pairing.

## Profile Notification Control

- Add one master `Notifications` control in Profile.
- The control affects only the current device or browser.
- Turning it on requests permission when necessary, obtains the current token, and registers it to the signed-in user.
- Turning it off deletes the current token from FCM where supported and removes its server registration.
- Turning the control off does not revoke browser-level notification permission.
- The state must distinguish enabled, disabled, permission denied, unsupported, registering, and error conditions.
- Multiple active devices can remain enabled for the same account.

## Token Lifecycle

### Registration And Refresh

When an authenticated session starts and permission is already granted, the app must silently:

1. Wait for the messaging service worker to be ready.
2. Retrieve the current FCM token using the configured VAPID key and service worker registration.
3. Upsert the token registration for the signed-in user.
4. Record the registration's device ID, token fingerprint, user-agent summary, created time, updated time, and last-seen time without exposing the raw token in logs or UI.

Repeat synchronization after:

- A normal app reload.
- A PWA update reload.
- Authentication restoration.
- The app returns online while signed in and permission is granted.
- The user manually enables notifications from Profile.

Repeated synchronization of an unchanged token must be idempotent.

### Ownership

- A token can belong to only one user at a time.
- Registering a token for a user must remove any registration of that token under another user.
- Account switching on the same browser must not leave the previous account subscribed.
- Use a server-controlled token fingerprint or registry to enforce ownership without making raw tokens readable to clients.

### Logout And Disable

- Before logout, attempt to remove the current device's token registration from the signed-in account.
- Logout must still complete if cleanup fails; record a safe diagnostic event for later investigation.
- Manual disable follows the same server cleanup and also deletes the local FCM token where supported.

### Expiry

- A scheduled backend job removes registrations whose `lastSeenAt` has not been refreshed for 60 days.
- Every send continues to remove tokens rejected by FCM as invalid or unregistered.
- Successful FCM acceptance does not by itself extend the 60-day lifetime; active clients refresh `lastSeenAt`.

## Service Worker Ownership

- Keep the PWA update service worker and Firebase messaging service worker as separate registrations with non-overlapping scopes.
- The messaging service worker owns background push receipt, notification display, notification-click behavior, and background diagnostics.
- The page owns foreground message handling and in-app toasts.
- Token registration must consistently use the messaging service worker registration.
- Both service worker scripts must remain uncached so updates propagate predictably.

## Message And Delivery Model

### Payloads

- Send data-only FCM messages so there is one explicit notification display owner.
- Do not include an FCM `notification` payload while also calling `showNotification()` in the messaging service worker.
- Include a stable event ID, event type, sender display name, relevant entity IDs, destination hint, title, and body in message data.
- Use web-push urgency and time-to-live values appropriate to each event. Test pushes should have a short lifetime.

### Background

- The messaging service worker displays one system notification per event per device.
- Store a bounded set of recently displayed event IDs in service-worker-accessible storage.
- Ignore a repeated event ID that has already been displayed on that device.
- Use stable notification tags where replacement is preferable to stacking, but do not collapse distinct photos, likes, or pairing events into one event.

### Foreground

- When Pocofoto is open and receives an event, show one in-app toast only.
- Do not display a system notification in the foreground.
- Use the same event-ID deduplication rule to prevent repeated toasts.
- Continue relying on realtime application data for content updates; the push is an attention signal, not the source of record.

### Multiple Devices

- Send each event to every active registration belonging to the recipient.
- One event may produce one notification on each active device.
- Duplicate token values must be removed before multicast sends.

## Notification Content And Destinations

### Content

- New photo: `<sender> sent you a photo.`
- Like: `<sender> liked your photo.`
- Pairing request: `<sender> wants to pair with you.`
- Pairing accepted: `<sender> accepted your pairing request.`
- Pairing removed: `<sender> removed your pairing.`

Use safe fallback copy such as `Your person` when a display name is unavailable.

### Click Behavior

- Pairing request, accepted, and removed events open the relevant pairing state or screen.
- Photo and like events open Home and focus the referenced photo when it is already available in the loaded photo collection.
- If the referenced photo is not available, open Home normally.
- Do not add a routing framework, dedicated photo-detail route, or forced historical photo fetch for this iteration.
- When an existing Pocofoto window is available, focus and navigate it instead of opening a duplicate window.

## Pairing Event Triggers

- Pairing-request push targets the request recipient and does not require an existing couple.
- Pairing-accepted push targets the original request sender after the couple is created.
- Pairing-removed push targets the former partner using the relationship data captured before removal.
- Backend triggers or callable flows must emit a stable event ID and guarantee that retrying the same backend event does not create a second logical notification.
- Firestore in-app notification records can continue to support pairing UI, but push delivery must not depend on a client observing those records.

## Production Notification Diagnostics

### Placement

- Keep diagnostics available in production Profile.
- Place them under a collapsed `Notification diagnostics` disclosure.
- Never show raw FCM tokens.

### Status

Show:

- Browser messaging support.
- Notification permission state.
- Messaging service worker registration and active state.
- Current device ID and token fingerprint.
- Whether the current token is registered to the signed-in account.
- Last successful registration or refresh time.
- Current device enabled state.
- Partner active-token count when paired.
- Most recent test result with token, accepted, failed, and stale-deleted counts.

The UI must clearly distinguish `FCM accepted the message` from `the device displayed the notification`.

### Test This Device

- Send a test only to the calling user's current registered device.
- Require the caller to provide the current device ID, not a raw token.
- Reject the request if the device is not registered to the caller.
- Return zero-token and disabled states as explicit non-success outcomes.

### Test Partner's Devices

- Send a test to every active device registered to the caller's current partner.
- Reject unpaired or invalid relationship states.
- Return the partner's targeted-token, accepted, failed, and stale-deleted counts.
- A zero-token result must not be labelled successful.

### Cooldown

- Apply a server-enforced 10-second cooldown per calling user across both test actions.
- Return the remaining cooldown in a structured resource-exhausted error.
- Disable both test actions in the UI while a request is running and during the known cooldown.

## Backend Send Behavior

- Centralize event construction and multicast sending in shared backend helpers.
- Deduplicate token values before calling FCM.
- Log event type, event ID, recipient ID, targeted count, accepted count, failure count, stale deletion count, and failure codes.
- Do not log full tokens, full user agents, notification bodies containing personal text, or private account fields.
- Treat `tokenCount: 0` as a distinct `no_registered_devices` outcome.
- Continue deleting invalid and unregistered tokens based on per-token FCM responses.
- Preserve per-token response ordering when mapping failures back to stored registrations.

## Data Model

Each device registration needs these logical fields:

- `deviceId`: Stable identifier generated and retained by this browser installation.
- `token`: Raw FCM token, backend-readable only.
- `tokenFingerprint`: Short safe fingerprint used by diagnostics and logs.
- `userAgent`: Bounded browser summary.
- `createdAt`: First registration time.
- `updatedAt`: Last material update time.
- `lastSeenAt`: Last successful authenticated synchronization.
- `permission`: Last reported permission state.
- `enabled`: Whether Pocofoto notifications are enabled for this device.

Store the permanent automatic-prompt dismissal locally per user and device. It is an onboarding preference for that installation, not an account-wide notification preference.

## Error Handling

- Permission denial is a valid product state, not an exception.
- Missing VAPID configuration, unsupported messaging, service worker failure, token retrieval failure, authentication failure, and server registration failure must produce distinct internal result codes.
- Notification setup must never block sign-in, app startup, pairing completion, logout, photo sending, or liking.
- Surface concise Profile and diagnostic messages while retaining structured analytics and server logs for investigation.
- Retry silent synchronization when connectivity returns, but do not repeatedly reopen permission UI.

## Analytics And Observability

Track safe structured events for:

- Permission explanation shown.
- `Enable notifications` selected.
- `Not now` selected.
- Browser permission accepted or denied.
- Registration started, completed, skipped, or failed.
- Token ownership moved, disabled, removed, expired, or rejected by FCM.
- Push send started and completed by event type.
- Foreground receipt and toast display.
- Background service-worker receipt and system display.
- Notification click and resolved destination.
- Current-device and partner diagnostic tests.

Do not treat FCM acceptance as proof of display. Client receipt and click telemetry provide separate delivery-adjacent evidence.

## Testing Strategy

### Client Unit Tests

- Permission-state mapping and Profile control states.
- One-time prompt eligibility for newly paired and existing paired users.
- Manual notification enablement for unpaired users from the Pairing screen without an automatic prompt.
- Permanent `Not now` behavior per user and device.
- Silent startup synchronization only when permission is granted.
- Idempotent registration on reload and update paths.
- Logout cleanup remains non-blocking.
- Foreground event deduplication and toast mapping.
- Diagnostics formatting, zero-token handling, and cooldown state.

### Service Worker Tests

- Data-only payload parsing.
- One system notification per unique event ID.
- Duplicate event suppression.
- Notification content and destination mapping.
- Existing-window focus with open-window fallback.

### Backend Tests

- Unique token fan-out across multiple devices.
- Token ownership transfer between users.
- Current-device diagnostic authorization.
- Partner diagnostic relationship authorization.
- Ten-second per-user cooldown across both test actions.
- Zero-token outcomes are not successful.
- Invalid-token cleanup preserves response-to-registration ordering.
- Sixty-day scheduled expiry.
- Idempotent pairing, photo, and like event sends.

### Manual Verification

- Validate two paired accounts using separate browsers or installed PWAs.
- Validate permission states `default`, `granted`, and `denied`.
- Validate foreground, background, closed-PWA, reload, and update-reload behavior.
- Validate logout followed by account switching on the same browser.
- Validate two active devices on one account each receive one notification.
- Validate all five event types and both diagnostic test actions.
- Confirm production Functions logs and client diagnostics agree on targeted and accepted counts.

## Rollout

- Deploy backend schema and callable/trigger support before enabling the new client lifecycle.
- Keep registration APIs backward compatible during rollout so existing clients continue functioning.
- Enable startup synchronization for granted users immediately; it repairs missing production registrations without reopening permission prompts.
- Keep the existing send logs until the replacement diagnostics have been verified in production.
- Do not remove legacy token documents until registrations have been migrated or expired.

## Out Of Scope

- Per-notification-type settings.
- Account-wide enable or disable across all devices.
- Quiet hours, notification schedules, or digest notifications.
- Private lock-screen preview mode.
- A new routing framework or dedicated photo-detail screen.
- Guaranteed delivery after FCM acceptance.
- Platform-specific permission recovery instructions.
- Production deployment or branch promotion as part of the implementation itself.

## Acceptance Criteria

- New and existing paired users receive the approved one-time permission explanation.
- Unpaired users can manually enable pairing-request pushes from the Pairing screen without receiving an automatic permission explanation.
- Selecting `Not now` permanently stops automatic prompting on that user and device while Profile remains available.
- Previously denied users retain the same Profile notification control and receive generic settings guidance.
- Granted returning users silently register or refresh their token after reload, PWA update, authentication restoration, and reconnection.
- Logout and manual disable detach the current device without blocking the primary action on cleanup failure.
- A token cannot remain owned by multiple accounts.
- Photos, likes, pairing requests, pairing acceptance, and pairing removal generate the approved detailed push notifications.
- Foreground events produce one in-app toast and no system notification.
- Background events produce at most one system notification per event per device.
- Every active device for the recipient is targeted once.
- Tokens not refreshed for 60 days and tokens rejected as invalid are removed.
- Notification clicks use the approved practical destinations without new routing infrastructure.
- Production Profile contains collapsed, safe diagnostics with both current-device and partner-device tests.
- Test pushes enforce a server-side 10-second per-user cooldown.
- Zero-token sends are clearly reported as `no_registered_devices`, not success.
- Focused client, service-worker, and backend tests pass alongside app lint, Functions lint, and production build.
