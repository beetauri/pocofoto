# Photo Diffused Background Design

## Scope

Add a medium-strength, full-screen diffused background that follows the currently active shared feed photo. The effect replaces the current static animated blob background. It does not change auth, pairing, capture, caption, profile, history, notification, or backend flow behavior beyond storing optional palette metadata on newly sent photo documents.

## Product Rules

- The active visible feed photo sets the app background palette.
- The active palette persists when the user switches to History or Profile.
- If no feed photo palette has ever been resolved in the current session, the app background is pure black.
- The live camera slide stays pure black and does not generate or apply a palette.
- The captured review photo stays pure black and does not apply its palette during review.
- When a reviewed photo is sent, the app may save a palette with the new photo document. That palette only affects the background after the photo exists in the feed and becomes active.
- Remove the current blue blob background elements.

## Visual Behavior

- The background covers the whole viewport behind the app shell.
- Diffusion uses 2-3 colors from the active photo with large blurred radial fields and a dark overlay.
- Strength is medium: visible and photo-derived, but dark enough to preserve control readability.
- Palette changes transition softly instead of snapping.
- Reduced-motion users get the same static diffused state without animation beyond a simple color transition.

## Data Model

New photo documents may include:

```js
palette: {
  colors: ["#4F72FC", "#111111", "#F8F8F8"]
}
```

Rules:

- `palette` is optional.
- `palette.colors` is an array of 1-3 hex colors.
- Existing photos without `palette` still render normally.
- If a feed photo lacks `palette`, the client attempts a lazy extraction once and caches the result in memory.
- If extraction fails, the app keeps the previous palette.

## Architecture

- Add a focused palette utility under `src/lib/photoPalette.js`.
- The utility extracts a small sampled palette from an image URL or blob URL using a tiny canvas.
- The utility normalizes and validates saved palette objects before use.
- `MainScreen` tracks the currently visible feed photo with a lightweight scroll/resize center check and reports its palette upward.
- `App` owns the last active palette so it persists across Home, History, and Profile.
- `AppBackground` becomes a pure CSS-variable driven background layer.

## Performance

- No per-frame extraction.
- Prefer saved Firestore palette for new photos.
- Use tiny canvas sampling for fallback extraction.
- Cache fallback extraction by photo id and URL.
- Do not block capture, feed rendering, or navigation while palette extraction runs.
- Keep the app background pure black until a feed photo palette is available.

## Verification

- Unit-test palette validation and color extraction helpers.
- Run `npm run test:unit`.
- Run `npm run lint`.
- Run `npm run build`.
- Run a browser smoke test for:
  - no photo source shows black background,
  - feed photo applies diffused background,
  - camera/review surfaces do not apply a new palette,
  - active palette persists in History and Profile.
