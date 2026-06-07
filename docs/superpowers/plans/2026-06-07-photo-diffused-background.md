# Photo Diffused Background Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the static blob background with a medium-strength, photo-derived diffused background that follows active feed photos and persists across History/Profile.

**Architecture:** Add a small palette utility with tests, save palettes on newly sent photos, track the visible feed photo in `MainScreen`, and let `App` own the last active palette. `AppBackground` renders only CSS-driven diffusion from the latest palette and defaults to pure black.

**Tech Stack:** React 19, Vite, Node test runner, Firebase Firestore/Storage, CSS radial gradients.

---

## File Structure

- Create `src/lib/photoPalette.js`: palette validation, tiny-canvas extraction, and blob palette helper.
- Create `src/lib/photoPalette.test.js`: Node unit tests for validation and deterministic sampling behavior.
- Modify `src/App.jsx`: own `backgroundPalette` state and pass it into `AppBackground`; pass callback to `MainScreen`.
- Modify `src/components/AppBackground.jsx`: remove animated blob rendering and use CSS custom properties.
- Modify `src/components/MainScreen.jsx`: save palette on send, observe active feed photos, lazily resolve missing palettes, and report active feed palettes upward.
- Modify `src/index.css`: replace blob CSS with full-screen diffused palette CSS.
- Modify `package.json` and `package-lock.json`: bump version from `0.2.6` to `0.2.7` and add `test:unit`.

## Task 1: Palette Utility And Unit Tests

- [x] Add `src/lib/photoPalette.test.js` first with tests for:
  - valid palettes normalize to 1-3 uppercase hex colors,
  - invalid palettes return `null`,
  - sampled pixels produce a deterministic three-color palette.
- [x] Run `node --test src/lib/photoPalette.test.js` and confirm it fails because `photoPalette.js` does not exist.
- [x] Add `src/lib/photoPalette.js` with `normalizePalette`, `extractPaletteFromImageSource`, `extractPaletteFromBlob`, and `buildPaletteFromImageData`.
- [x] Run `node --test src/lib/photoPalette.test.js` and confirm it passes.

## Task 2: Background Rendering

- [x] Replace `AppBackground` animated blob JSX with a simple palette-driven layer.
- [x] Update `src/index.css` so `.app-background` is black by default and uses three CSS variables for full-screen diffused radial gradients.
- [x] Ensure no `.app-background-blob*` CSS or JSX remains.

## Task 3: Feed Palette State

- [x] Add `backgroundPalette` state in `App.jsx`.
- [x] Pass `palette={backgroundPalette}` into `AppBackground`.
- [x] Pass `onBackgroundPaletteChange={setBackgroundPalette}` into `MainScreen`.
- [x] In `MainScreen`, observe only feed photo slides, not camera/review slides.
- [x] When the active feed photo changes, use saved `photo.palette` first.
- [x] If saved palette is absent, lazily extract from `photo.photoUrl`, cache by `photo.id` and `photo.photoUrl`, and keep the previous palette if extraction fails.

## Task 4: Save Palette On New Photos

- [x] During `handleSendReviewPhoto`, extract a palette from the local review blob before calling `uploadPhotoBlob`.
- [x] Extend `uploadPhotoBlob(blob, caption, palette)` and include `palette` on the new photo doc only when valid.
- [x] Do not apply the review palette directly to the background.

## Task 5: Version, Linear, And Verification

- [x] Bump `package.json` and `package-lock.json` from `0.2.6` to `0.2.7`.
- [x] Create or update the Linear issue for this implementation.
- [x] Run `npm run test:unit`.
- [x] Run `npm run lint`.
- [x] Run `npm run build`.
- [x] Run a browser smoke test against a local preview/dev server.
- [ ] Commit, push `main`, fast-forward/push `production`, deploy live assets if required, and update Linear with verification evidence.
