# Palette V2 Background Design

## Scope

Fix the photo-diffused background lag and abruptness by moving feed background color data to stored split-half palette metadata. Also update the Home surface so the live camera frame and feed photo frames use the full viewport width. This is a visual/background performance improvement only; it does not change auth, pairing, captions, likes, notifications, History behavior, or Profile behavior.

## Problems To Fix

- Background changes can lag behind the visible photo when a photo lacks stored palette metadata and client-side extraction starts only after the photo becomes active.
- The current palette model blends a few whole-photo colors, so it does not preserve common top/bottom photo structure such as blue sky above green ground.
- Home camera/feed frames still have horizontal gutters and vertical slide padding that make photos smaller than the available Home viewport.

## Product Decisions

- Existing uploaded photos should be backfilled with stored palette metadata.
- The backfill should be a reusable repo script, not a one-off local snippet.
- New photos should extract palette metadata before the Firestore photo document is created, so the feed item appears with palette already attached.
- Live camera and captured review preview stay pure black and do not drive the app background.
- The active feed photo drives the app background.
- The active background persists into History and Profile.
- If no active feed palette exists yet, the app background is pure black.
- Home only: live camera and feed photo frames take the full viewport width with no side gutter. History and Profile layouts stay unchanged.

## Palette V2 Data Model

Each photo document may include:

```js
paletteV2: {
  version: 2,
  topColor: "#4F72FC",
  bottomColor: "#1F8F5F",
  colors: ["#4F72FC", "#1F8F5F"]
}
```

Rules:

- `paletteV2` is optional for backward compatibility.
- `version` must be `2`.
- `topColor` is the dominant sampled color from the top half of the photo.
- `bottomColor` is the dominant sampled color from the bottom half of the photo.
- `colors` is `[topColor, bottomColor]` for simple rendering and validation.
- All colors are uppercase `#RRGGBB`.
- Existing `palette` metadata can remain during migration but `paletteV2` takes precedence.

## Extraction Behavior

- Divide the source image into two horizontal halves.
- Sample each half through a small canvas, avoiding full-resolution pixel scans.
- Ignore mostly transparent pixels.
- Prefer a stable dominant color per half, with light quantization to avoid choosing one noisy pixel.
- Extraction should run:
  - before creating a new sent photo document,
  - in the reusable backfill script for existing photos.
- Runtime extraction on active-photo visibility should become a fallback only, not the normal path.

## Background Rendering

- `AppBackground` renders a two-zone diffused background:
  - top field uses `paletteV2.topColor`,
  - bottom field uses `paletteV2.bottomColor`.
- The transition between palettes should be softer than the current change.
- The background should update immediately on active feed photo changes because palette data is already available in the photo document.
- If the active photo has no `paletteV2`, use older `palette` only as a temporary fallback.
- If neither palette exists, keep the previous background rather than popping to a late extracted color. If no previous palette exists, keep pure black.

## Backfill Script

Add a reusable script under `scripts/` that:

- Connects to the Firebase project using the existing app/admin setup available to the repo.
- Scans `couples/{coupleId}/photos/{photoId}` documents.
- Skips photos that already have valid `paletteV2`.
- Supports `--force` to recompute palettes.
- Supports a small `--limit` for safe test runs.
- Downloads or fetches each `photoUrl`, extracts split-half palette metadata, and updates only `paletteV2`.
- Logs progress, skips, failures, and a final summary.
- Does not modify captions, likes, timestamps, sender fields, or couple summary docs.

## Home Layout

- Apply full-width frame changes only inside `.home-screen`.
- Remove horizontal feed gutter for Home camera/feed slides.
- Remove vertical slide padding/margins around Home camera/feed frames.
- Keep safe-area and bottom navigation usable.
- Keep History and Profile untouched.
- Feed metadata/actions may remain below the photo, but the photo/camera frame itself should use the full viewport width.

## Error Handling

- If new-photo palette extraction fails, do not block sending indefinitely. Create the photo without `paletteV2`, keep the previous background, and let backfill repair it later.
- If backfill cannot fetch or decode an image, log the failure and continue.
- If CORS prevents browser fallback extraction, keep the previous palette and do not visibly pop in a late background.

## Verification

- Unit-test paletteV2 validation and split-half extraction.
- Run a small backfill dry/test run before full backfill.
- Run full backfill and verify documents receive `paletteV2`.
- Verify a photo with blue top and green bottom produces a blue-ish top background and green-ish bottom background.
- Verify active feed photo changes update the background without delayed pop-in.
- Verify live camera and review preview keep black background.
- Verify History/Profile preserve the current feed palette.
- Verify Home camera/feed frames are full viewport width while History/Profile are unchanged.
- Run `npm run test:unit`, `npm run lint`, and `npm run build`.
