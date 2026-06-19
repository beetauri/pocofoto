# Complete Sentry Observability Design

## Goal

Expand Pocofoto's Sentry integration into a complete production observability setup with readable stack traces, authenticated user context, balanced tracing and profiling, console logs, React crash recovery, and user feedback linked to captured errors.

## Runtime Architecture

Create `src/sentry.js` as the single owner of Sentry configuration and user identity. `src/main.jsx` will import the initializer before PWA registration and render the application inside `Sentry.ErrorBoundary`.

The SDK will use these production sample rates:

- Traces: 20%
- Browser profiles: 10% of sessions, following active traces
- Session Replay: 10% of normal sessions
- Error-triggered Replay: 100%

Development will retain full tracing for local diagnostics while disabling build-time uploads. Runtime events will include `environment` and a release name formatted as `pocofoto@<package-version>+<commit>`.

## Error And Log Collection

The integration will retain automatic browser error and unhandled rejection capture and add:

- `consoleLoggingIntegration` for debug, info, log, warn, error, trace, and assert output
- `extraErrorDataIntegration` for enumerable custom error fields
- `httpClientIntegration` for failed browser HTTP requests
- `browserProfilingIntegration` in trace lifecycle mode

The existing broad `dataCollection` defaults remain enabled. This intentionally permits Sentry to collect Firebase user identity, cookies, HTTP headers and bodies, query parameters, and stack context where supported.

## Authenticated User Context

The Firebase auth observer in `App.jsx` will synchronize Sentry identity with analytics identity:

- Signed in: set Firebase UID, email, and display name
- Signed out: clear Sentry's user context

No secret Firebase credentials or auth tokens will be added as explicit Sentry attributes.

## React Crash Recovery And Feedback

Wrap the root application with `Sentry.ErrorBoundary`. Add a Pocofoto-styled fallback component that:

- explains that the app encountered an unexpected problem
- offers a reload action
- offers a `Report this problem` action
- opens Sentry's crash report dialog with the exact captured event ID
- pre-fills the current user's email and display name from Sentry scope

The fallback must remain usable on narrow mobile screens and must not expose raw error messages or stack traces to the user.

## Source Maps And Releases

Install `@sentry/vite-plugin` as a development dependency. `vite.config.js` will:

- generate hidden production source maps
- configure the Sentry Vite plugin with `SENTRY_AUTH_TOKEN`, `SENTRY_ORG`, and `SENTRY_PROJECT`
- use the same release name as the browser SDK
- delete source-map files after successful upload so they are not published
- skip upload configuration when the required Sentry build variables are absent, preserving local and test builds

Cloudflare Pages must provide all three unprefixed variables at build time. `SENTRY_AUTH_TOKEN` must never be exposed through a `VITE_` variable.

## Sentry Web UI

No additional redeploy was required before implementation because the previous build did not contain the Vite plugin. After the completed implementation is deployed:

1. Confirm the Cloudflare Pages build succeeds for the release commit.
2. Confirm the release appears in Sentry.
3. Confirm an artifact bundle appears under Project Settings > Source Maps.
4. Configure alert routing only if the default Sentry notifications are insufficient. Alert routing changes who gets notified; it does not affect event collection.

The current browser ad blocker prevents direct inspection of Source Maps and Alert Settings pages. Verification will use build output and the Sentry UI once those pages are accessible.

## Verification

Add focused tests for:

- Sentry production and development sample-rate configuration
- release and environment metadata
- Firebase user identity set/clear behavior
- crash fallback report and reload actions
- Vite source-map plugin gating when build secrets are absent

Run `npm run test:unit`, `npm run lint`, and `npm run build`. A credentialed production-equivalent build must additionally show a successful Sentry source-map upload without leaving `.map` files in `dist`.
