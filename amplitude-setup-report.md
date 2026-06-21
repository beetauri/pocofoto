<wizard-report>
# Amplitude post-wizard report

Amplitude analytics has been integrated into Pocofoto, a paired photo-sharing PWA built with React + Vite. The `@amplitude/unified` SDK was installed and wired into the existing `src/analytics.js` wrapper, so all 30+ existing `trackEvent()` calls throughout the codebase now flow to Amplitude automatically alongside PostHog and Firebase Analytics. Session Replay (100% sample rate) and Guides & Surveys are enabled out of the box. Three new events were added to fill gaps not yet tracked.

## Files changed

| File | Change | Notes |
|---|---|---|
| `.env` | Added `VITE_AMPLITUDE_API_KEY` | Public browser key for Vite |
| `src/analytics.js` | Added Amplitude `initAll()`, `track()`, `setUserId()`, `identify()`, `reset()` | Wired alongside PostHog + Firebase |
| `src/hooks/useNotifications.js` | Added import + 2 track calls | Notification permission funnel events |
| `src/hooks/useCamera.js` | Added import + 1 track call | Camera denial detection |

## SDK initialization

`@amplitude/unified` is initialized in `src/analytics.js` inside `initAnalytics()`, which is called from `src/App.jsx` on mount. The full autocapture suite, Session Replay (sampleRate: 1), and Guides & Surveys (engagement) are all configured in a single `initAll()` call.

## Events instrumented (approved plan — 3 events)

| Event | File | Properties |
|---|---|---|
| `Notification Permission Enabled` | `src/hooks/useNotifications.js` | `permission` |
| `Notification Prompt Dismissed` | `src/hooks/useNotifications.js` | `permission` |
| `Camera Access Denied` | `src/hooks/useCamera.js` | `facing_mode`, `error_name` |

## Event plan reconciliation

All 3 events from the approved plan are accounted for:

**Instrumented (3)**
- `Notification Permission Enabled` — `src/hooks/useNotifications.js` (enable callback, when result.status === 'registered')
- `Notification Prompt Dismissed` — `src/hooks/useNotifications.js` (dismissPrompt callback)
- `Camera Access Denied` — `src/hooks/useCamera.js` (acquire() catch block, when status === 'denied')

**Covered by autocapture (0)**
No planned events were moved to autocapture — the 3 events above are all state-change outcomes that autocapture cannot observe.

**Dropped (0)**
No planned events were dropped.

## Existing events now flowing to Amplitude

The following events were already tracked via `trackEvent()` and now automatically send to Amplitude via the updated wrapper (no code changes needed):

- `app_open`, `session_started`, `auth_signed_out`, `screen_view`
- `signup_login_attempted`, `signup_login_succeeded`, `signup_login_failed`
- `pairing_flow_entry`, `pairing_code_created`, `pairing_code_redeemed`
- `pairing_request_accepted`, `pairing_request_declined`, `pairing_request_canceled`
- `pairing_completed`, `pairing_removed`, `pairing_remove_confirmed`
- `photo_review_opened`, `photo_review_dismissed`, `photo_send_queued`, `photo_sent`, `photo_liked`
- `photo_review_draft_restored`, `camera_ready`, `camera_switched`
- `profile_photo_updated`, `profile_photo_removed`, `display_name_updated`
- `push_foreground_received`, `main_view_changed`
- `pwa_update_banner_dismissed`, `pwa_update_banner_update_clicked`
- `scroll_depth`, `history_photo_opened`

**Note on event naming:** The codebase uses an established snake_case convention (30+ calls). These event names flow as-is to Amplitude — they will appear in snake_case in the Amplitude UI. The 3 new events use Title Case as required by the approved plan.

## Session Replay & Guides

- **Session Replay** is enabled at `sampleRate: 1` (100% of sessions recorded). Reduce this before launch if bandwidth cost is a concern.
- **Guides & Surveys** (engagement plugin) is enabled with empty config — the plugin reads remote configuration from Amplitude.

## User identification

`identifyUser(userId, { email, displayName })` is called from `src/App.jsx` and `src/components/AuthScreen.jsx` after sign-in. The updated wrapper now calls `amplitude.setUserId(userId)` and `amplitude.identify()` with an `Identify` object. `amplitude.reset()` is called from `resetAnalytics()` on sign-out to unlink future events from the current user.

## Next steps

### Set the API key for production

`VITE_AMPLITUDE_API_KEY` is currently in `.env` (committed). Before shipping, move it to a deployment environment variable in your hosting platform (Firebase Hosting, Vercel, Netlify, etc.):

Set `VITE_AMPLITUDE_API_KEY` in your deployment platform's environment variables dashboard (Firebase Hosting, Vercel, Netlify, etc.). The value is already stored in your local `.env` file — copy it from there. Since this is a public browser key it is safe to commit, but hosting platforms provide a cleaner solution via their env settings UI.

### Reduce Session Replay sample rate for production

`sessionReplay: { sampleRate: 1 }` records 100% of sessions. For production with real users, consider reducing to `0.1` (10%) to manage storage costs. Comment out the line entirely to disable replay.

### Run `amplitude-wizard dashboard` once users are active

Chart and dashboard creation is deferred until your events are ingested. Run:

```
amplitude-wizard dashboard
```

after your first real users have triggered the flows above.
</wizard-report>
