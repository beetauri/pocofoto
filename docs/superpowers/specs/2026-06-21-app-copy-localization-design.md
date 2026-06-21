# Pocofoto App Copy and Localization Foundation

**Date:** 2026-06-21
**Status:** Approved design

## Goal

Rewrite Pocofoto's complete English user-facing copy so the app feels cute, charming, and intimate without becoming childish or unclear. At the same time, introduce a localization foundation that allows Turkish to be added later without another copy-architecture rewrite.

## Voice

Pocofoto should sound warm, affectionate, and lightly playful.

- Use **"your person"** as the signature relationship phrase everywhere it fits naturally.
- Prefer short, conversational sentences over product or engineering language.
- Use emojis sparingly, only for celebrations and selected empty states.
- Keep errors gentle but direct: say what happened and what the person can do next.
- Never make failures, privacy, permissions, destructive actions, or accessibility labels vague for the sake of personality.
- Avoid baby talk, excessive exclamation marks, jokes during failures, and copy that assumes a specific relationship type.

## Localization Architecture

Use `i18next` with `react-i18next` rather than a hand-built copy object.

- English is the only shipped locale in this phase and is the fallback language.
- Translation resources are grouped by product flow: `common`, `auth`, `pairing`, `camera`, `history`, `profile`, `notifications`, and `errors`.
- Components render copy through translation keys instead of importing prose constants directly.
- Dynamic values use interpolation. Count-dependent text uses plural-aware keys rather than string concatenation.
- The app resolves language from the browser or device automatically.
- Unsupported languages fall back to English.
- No language selector or persisted language preference is included in this phase.
- Resource structure and keys must be suitable for adding Turkish without changing component APIs.

## Copy Coverage

The audit and rewrite cover all customer-facing strings, including states that are easy to miss:

- Sign-in screen, progress, and authentication errors
- Pairing introduction, codes, invitations, pending states, confirmations, and notices
- Camera startup, permission guidance, controls, review state, captions, sending, failed uploads, and empty feed
- Photo status and like controls
- History headings, empty state, loading, pagination, and failures
- Profile labels, display-name editing, account information, about content, logout, and pairing removal
- Notification prompt, settings, permission guidance, and user-facing outcomes
- Offline, reconnection, update, loading, and fatal-error states
- Buttons, placeholders, dialog controls, `aria-label` values, and screen-reader-only text
- User-visible push notification titles and bodies, while retaining English-only delivery in this phase

Raw provider messages must not be shown directly when a stable, friendly application error can replace them. Developer-only logs and notification diagnostics remain technical and are not rewritten for charm.

## Server and Push Boundary

Push-notification templates remain English in this phase. They should be inventoried and kept clearly separated from client translation resources so Turkish server-side templates can be introduced later.

Recipient locale storage, locale-aware token registration, and server-side locale selection are deferred until the Turkish translation phase. English remains the reliable fallback for every push path.

## Implementation Boundaries

- Preserve current behavior, layout, event tracking, and Firebase data flows.
- Do not redesign screens or add new animations as part of the copy work.
- Do not change technical identifiers, analytics event names, database fields, or callable function contracts.
- Do not use browser auto-translation as the localization mechanism.
- Keep existing `translate="no"` protections where DOM mutation could break interactive state; application-managed localization replaces the need for browser translation elsewhere.
- Do not add Turkish strings, RTL behavior, or a language picker in this phase.

## Verification

- Add focused localization tests for English fallback, automatic language resolution, interpolation, and pluralization.
- Update existing copy-sensitive tests to assert translated output or stable translation behavior rather than obsolete literal strings.
- Confirm every visible string and accessibility label comes from the localization layer, except approved technical diagnostics and build metadata.
- Confirm auth and photo-status interactions remain safe from browser translation DOM rewrites.
- Run `npm run test:unit`, `npm run lint`, and `npm run build`.
- Manually check the auth, pairing, camera/feed, history, profile, notification, offline, update, and error flows for tone consistency and clipping caused by revised copy.

## Success Criteria

The English app reads as one consistent voice across primary screens and edge cases. All customer-facing client copy is localization-ready, English fallback is dependable, and Turkish can be added later primarily by supplying translations plus the separately scoped push-locale work.
