# Palette V2 Background Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix delayed/abrupt photo background changes by storing split top/bottom photo palettes, backfilling existing photos, and making Home photo/camera frames full viewport width.

**Architecture:** Extend `src/lib/photoPalette.js` from whole-photo palettes to `paletteV2`, with pure tested helpers for validation and split-half extraction. The client writes `paletteV2` before creating new photo docs, `MainScreen` uses stored `paletteV2` immediately for active feed photos, and a reusable admin script backfills existing Firestore photo docs. Home-only layout CSS removes horizontal gutters and vertical frame padding without changing History/Profile.

**Tech Stack:** React 19, Vite, Node test runner, Firebase client SDK, Firebase Admin SDK, Sharp for reusable Node image decoding, Firestore rules.

---

## File Structure

- Modify `src/lib/photoPalette.js`: add `normalizePaletteV2`, `buildPaletteV2FromImageData`, `extractPaletteV2FromImageSource`, `extractPaletteV2FromBlob`, and fallback conversion from old `palette`.
- Modify `src/lib/photoPalette.test.js`: add split-half palette and validation tests.
- Modify `src/components/AppBackground.jsx`: accept `paletteV2` and render top/bottom CSS variables.
- Modify `src/App.jsx`: rename/pass background state as paletteV2-compatible data.
- Modify `src/components/MainScreen.jsx`: prefer `photo.paletteV2`, stop late visible extraction from changing the background, extract `paletteV2` before new photo document creation, and use old palette only as fallback.
- Modify `src/index.css`: soften background transition and make Home-only camera/feed frames full viewport width.
- Modify `firestore.rules`: validate optional `paletteV2` on photo create.
- Create `scripts/backfillPhotoPalettes.mjs`: reusable Firebase Admin + Sharp script for existing photos.
- Modify `package.json` and `package-lock.json`: bump `0.2.7 -> 0.2.8`, add `backfill:palettes`, add root dev dependencies `firebase-admin` and `sharp`.

## Task 1: Palette V2 Pure Helpers

**Files:**
- Modify: `src/lib/photoPalette.test.js`
- Modify: `src/lib/photoPalette.js`

- [ ] **Step 1: Write failing paletteV2 tests**

Append these tests to `src/lib/photoPalette.test.js`:

```js
import {
  buildPaletteV2FromImageData,
  normalizePaletteV2,
  paletteV2FromLegacyPalette
} from './photoPalette.js';

test('normalizePaletteV2 returns uppercase split-half colors', () => {
  assert.deepEqual(
    normalizePaletteV2({
      version: 2,
      topColor: '#4f72fc',
      bottomColor: '#1f8f5f',
      colors: ['#4f72fc', '#1f8f5f']
    }),
    {
      version: 2,
      topColor: '#4F72FC',
      bottomColor: '#1F8F5F',
      colors: ['#4F72FC', '#1F8F5F']
    }
  );
});

test('normalizePaletteV2 rejects invalid split-half palettes', () => {
  assert.equal(normalizePaletteV2(null), null);
  assert.equal(normalizePaletteV2({ version: 1, topColor: '#111111', bottomColor: '#222222', colors: ['#111111', '#222222'] }), null);
  assert.equal(normalizePaletteV2({ version: 2, topColor: 'blue', bottomColor: '#222222', colors: ['blue', '#222222'] }), null);
  assert.equal(normalizePaletteV2({ version: 2, topColor: '#111111', bottomColor: '#222222', colors: ['#222222', '#111111'] }), null);
});

test('buildPaletteV2FromImageData extracts top and bottom dominant colors', () => {
  const pixels = new Uint8ClampedArray([
    80, 114, 252, 255,
    80, 114, 252, 255,
    16, 16, 18, 255,
    16, 16, 18, 255,
    31, 143, 95, 255,
    31, 143, 95, 255,
    244, 92, 124, 255,
    31, 143, 95, 255
  ]);

  assert.deepEqual(
    buildPaletteV2FromImageData({ data: pixels, width: 2, height: 4 }),
    {
      version: 2,
      topColor: '#5072FC',
      bottomColor: '#1F8F5F',
      colors: ['#5072FC', '#1F8F5F']
    }
  );
});

test('paletteV2FromLegacyPalette uses first and second legacy colors', () => {
  assert.deepEqual(
    paletteV2FromLegacyPalette({ colors: ['#4f72fc', '#1f8f5f', '#ffffff'] }),
    {
      version: 2,
      topColor: '#4F72FC',
      bottomColor: '#1F8F5F',
      colors: ['#4F72FC', '#1F8F5F']
    }
  );
});
```

- [ ] **Step 2: Run tests and verify RED**

Run:

```bash
npm run test:unit
```

Expected: FAIL because `buildPaletteV2FromImageData`, `normalizePaletteV2`, and `paletteV2FromLegacyPalette` are not exported.

- [ ] **Step 3: Implement paletteV2 helpers**

Add these exports to `src/lib/photoPalette.js`:

```js
function dominantColorForRange(data, startRow, endRow, width) {
  const buckets = new Map();

  for (let row = startRow; row < endRow; row += 1) {
    for (let col = 0; col < width; col += 1) {
      const i = (row * width + col) * 4;
      const alpha = data[i + 3];
      if (alpha < 64) continue;

      const r = Math.round(data[i] / 16) * 16;
      const g = Math.round(data[i + 1] / 16) * 16;
      const b = Math.round(data[i + 2] / 16) * 16;
      const hex = rgbToHex(r, g, b);
      buckets.set(hex, (buckets.get(hex) || 0) + 1);
    }
  }

  return Array.from(buckets.entries())
    .sort((a, b) => b[1] - a[1])
    .map(([hex]) => hex)[0] || null;
}

export function normalizePaletteV2(palette) {
  if (!palette || palette.version !== 2) return null;
  if (!HEX_COLOR_PATTERN.test(palette.topColor || '')) return null;
  if (!HEX_COLOR_PATTERN.test(palette.bottomColor || '')) return null;

  const topColor = palette.topColor.toUpperCase();
  const bottomColor = palette.bottomColor.toUpperCase();
  const colors = Array.isArray(palette.colors)
    ? palette.colors.map((color) => typeof color === 'string' ? color.toUpperCase() : color)
    : [];

  if (colors.length !== 2 || colors[0] !== topColor || colors[1] !== bottomColor) return null;

  return { version: 2, topColor, bottomColor, colors };
}

export function buildPaletteV2FromImageData(imageData) {
  if (!imageData?.data || !imageData.width || !imageData.height) return null;

  const split = Math.max(1, Math.floor(imageData.height / 2));
  const topColor = dominantColorForRange(imageData.data, 0, split, imageData.width);
  const bottomColor = dominantColorForRange(imageData.data, split, imageData.height, imageData.width);
  if (!topColor || !bottomColor) return null;

  return normalizePaletteV2({
    version: 2,
    topColor,
    bottomColor,
    colors: [topColor, bottomColor]
  });
}

export function paletteV2FromLegacyPalette(palette) {
  const normalized = normalizePalette(palette);
  if (!normalized) return null;
  const topColor = normalized.colors[0];
  const bottomColor = normalized.colors[1] || normalized.colors[0];
  return normalizePaletteV2({
    version: 2,
    topColor,
    bottomColor,
    colors: [topColor, bottomColor]
  });
}
```

- [ ] **Step 4: Update browser extraction functions**

In `src/lib/photoPalette.js`, update canvas image data reads so `extractPaletteV2FromImageSource` and `extractPaletteV2FromBlob` use `buildPaletteV2FromImageData`:

```js
export async function extractPaletteV2FromImageSource(source) {
  if (!source || typeof document === 'undefined' || typeof Image === 'undefined') return null;

  try {
    const image = await loadImage(source);
    const canvas = document.createElement('canvas');
    canvas.width = SAMPLE_SIZE;
    canvas.height = SAMPLE_SIZE;
    const context = canvas.getContext('2d', { willReadFrequently: true });
    if (!context) return null;

    context.drawImage(image, 0, 0, SAMPLE_SIZE, SAMPLE_SIZE);
    return buildPaletteV2FromImageData({
      ...context.getImageData(0, 0, SAMPLE_SIZE, SAMPLE_SIZE),
      width: SAMPLE_SIZE,
      height: SAMPLE_SIZE
    });
  } catch (err) {
    console.debug('Photo palette extraction skipped.', err);
    return null;
  }
}

export async function extractPaletteV2FromBlob(blob) {
  if (!blob || typeof URL === 'undefined') return null;

  const objectUrl = URL.createObjectURL(blob);
  try {
    return await extractPaletteV2FromImageSource(objectUrl);
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}
```

- [ ] **Step 5: Run tests and verify GREEN**

Run:

```bash
npm run test:unit
```

Expected: PASS with all palette tests green.

## Task 2: Client UI Uses Stored Palette V2 Immediately

**Files:**
- Modify: `src/App.jsx`
- Modify: `src/components/AppBackground.jsx`
- Modify: `src/components/MainScreen.jsx`
- Modify: `src/index.css`

- [ ] **Step 1: Update `AppBackground` for split colors**

Replace color variable setup in `src/components/AppBackground.jsx` with:

```jsx
const BLACK_PALETTE_V2 = {
  version: 2,
  topColor: '#000000',
  bottomColor: '#000000',
  colors: ['#000000', '#000000']
};

export default function AppBackground({ palette = null }) {
  const activePalette = palette?.version === 2 ? palette : BLACK_PALETTE_V2;
  const style = {
    '--photo-bg-top': activePalette.topColor,
    '--photo-bg-bottom': activePalette.bottomColor
  };

  return (
    <div className="app-background" style={style} aria-hidden="true" />
  );
}
```

- [ ] **Step 2: Update background CSS**

Replace `.app-background` gradients in `src/index.css` with:

```css
.app-background {
  position: fixed;
  inset: 0;
  z-index: 0;
  overflow: hidden;
  pointer-events: none;
  background:
    radial-gradient(ellipse at 50% 18%, color-mix(in srgb, var(--photo-bg-top, #000000) 74%, transparent), transparent 56%),
    radial-gradient(ellipse at 50% 82%, color-mix(in srgb, var(--photo-bg-bottom, #000000) 74%, transparent), transparent 58%),
    linear-gradient(180deg, color-mix(in srgb, var(--photo-bg-top, #000000) 32%, #000000), color-mix(in srgb, var(--photo-bg-bottom, #000000) 34%, #000000)),
    #000000;
  filter: saturate(1.18);
  transition: background 820ms ease, filter 820ms ease;
}
```

Keep `.app-background::after` but soften it:

```css
.app-background::after {
  content: "";
  position: absolute;
  inset: 0;
  background: rgba(0, 0, 0, 0.42);
  backdrop-filter: blur(86px);
  -webkit-backdrop-filter: blur(86px);
}
```

- [ ] **Step 3: Update `MainScreen` imports**

Change the import from `../lib/photoPalette`:

```jsx
import {
  extractPaletteV2FromBlob,
  normalizePalette,
  normalizePaletteV2,
  paletteV2FromLegacyPalette
} from '../lib/photoPalette';
```

- [ ] **Step 4: Prefer stored paletteV2 and remove late visible extraction**

Replace the active photo palette effect in `src/components/MainScreen.jsx` with:

```jsx
useEffect(() => {
  if (!activeFeedPhotoId || !onBackgroundPaletteChange) return;

  const activePhoto = photos.find((photo) => photo.id === activeFeedPhotoId);
  if (!activePhoto) return;

  const paletteV2 = normalizePaletteV2(activePhoto.paletteV2)
    || paletteV2FromLegacyPalette(activePhoto.palette);

  if (!paletteV2) return;

  paletteCacheRef.current.set(activePhoto.id, paletteV2);
  onBackgroundPaletteChange(paletteV2);
}, [activeFeedPhotoId, photos, onBackgroundPaletteChange]);
```

This removes `extractPaletteFromImageSource(activePhoto.photoUrl)` from the visibility path so a late extraction cannot pop the background in moments after the photo appears.

- [ ] **Step 5: Save paletteV2 for new photos**

Change `uploadPhotoBlob` to accept and write `paletteV2`:

```jsx
const uploadPhotoBlob = async (blob, caption = null, paletteV2 = null) => {
  ...
  const normalizedPaletteV2 = normalizePaletteV2(paletteV2);
  if (normalizedPaletteV2) {
    photoPayload.paletteV2 = normalizedPaletteV2;
  }
  ...
};
```

Change `handleSendReviewPhoto` to extract V2 before `addDoc`:

```jsx
const paletteV2 = await extractPaletteV2FromBlob(reviewPhoto.blob);
await uploadPhotoBlob(reviewPhoto.blob, caption, paletteV2);
```

- [ ] **Step 6: Update feed data attribute**

Change the feed photo palette attribute to:

```jsx
const normalizedPaletteV2 = normalizePaletteV2(photo.paletteV2)
  || paletteV2FromLegacyPalette(photo.palette);
```

and:

```jsx
data-photo-palette={normalizedPaletteV2?.colors.join(',') || undefined}
```

- [ ] **Step 7: Run tests/build**

Run:

```bash
npm run test:unit
npm run lint
npm run build
```

Expected: all pass.

## Task 3: Home-Only Full-Viewport Frame Layout

**Files:**
- Modify: `src/index.css`

- [ ] **Step 1: Add Home-only full-width CSS**

Append near the existing `.reels-feed` / `.reels-slide` rules:

```css
.home-screen .reels-feed {
  padding-inline: 0;
}

.home-screen .reels-slide {
  padding: 0 0 var(--feed-nav-reserve);
}

.home-screen .camera-reels-slide {
  justify-content: flex-start;
  gap: clamp(12px, 2vh, 18px);
  padding-top: var(--safe-top);
}

.home-screen .camera-frame {
  width: 100vw;
  max-width: 100vw;
  border-radius: 0;
}

.home-screen .photo-card {
  width: 100vw;
}

.home-screen .reels-slide[data-photo-id] .camera-frame,
.home-screen .camera-live {
  width: 100vw;
  max-width: 100vw;
}

.home-screen .photo-meta-row,
.home-screen .camera-item-controls {
  width: min(100vw, 440px);
  padding-inline: 20px;
}
```

- [ ] **Step 2: Preserve desktop shell cap**

Inside the existing `@media (min-width: 700px)` block, add:

```css
.home-screen .camera-frame,
.home-screen .photo-card,
.home-screen .reels-slide[data-photo-id] .camera-frame,
.home-screen .camera-live {
  width: min(100vw, 440px);
  max-width: min(100vw, 440px);
}
```

- [ ] **Step 3: Run visual verification**

Run:

```bash
npm run build
npm run dev -- --host 127.0.0.1 --port 5174
```

Expected in Browser:

- Auth loads.
- Paired Home, when reachable, uses edge-to-edge camera/feed frames.
- History/Profile widths are unchanged.
- Bottom nav remains usable and not covered by frames.

## Task 4: Firestore Rules For Palette V2

**Files:**
- Modify: `firestore.rules`

- [ ] **Step 1: Add palette validation helpers**

Add near caption helpers:

```js
function isHexColor(value) {
  return value is string
    && value.matches('^#[0-9A-Fa-f]{6}$');
}

function isValidPaletteV2(paletteV2) {
  return paletteV2 is map
    && paletteV2.keys().hasOnly(['version', 'topColor', 'bottomColor', 'colors'])
    && paletteV2.version == 2
    && isHexColor(paletteV2.topColor)
    && isHexColor(paletteV2.bottomColor)
    && paletteV2.colors is list
    && paletteV2.colors.size() == 2
    && paletteV2.colors[0] == paletteV2.topColor
    && paletteV2.colors[1] == paletteV2.bottomColor;
}

function hasValidOptionalPaletteV2() {
  return !('paletteV2' in request.resource.data)
    || isValidPaletteV2(request.resource.data.paletteV2);
}
```

- [ ] **Step 2: Require optional palette validation on photo create**

Change the `couples/{coupleId}/photos/{photoId}` create rule:

```js
allow create: if isCoupleMember(coupleId)
  && request.resource.data.senderId == request.auth.uid
  && hasValidOptionalCaption()
  && hasValidOptionalPaletteV2();
```

- [ ] **Step 3: Run rules-adjacent verification**

Run:

```bash
npm run lint
```

Expected: app lint still passes. Note: Firestore rules syntax is not checked by ESLint; deploy/emulator verification will validate rules if touched during release.

## Task 5: Reusable Backfill Script

**Files:**
- Create: `scripts/backfillPhotoPalettes.mjs`
- Modify: `package.json`
- Modify: `package-lock.json`

- [ ] **Step 1: Add dependencies and script**

Run:

```bash
npm install -D firebase-admin sharp
```

Update `package.json` scripts:

```json
"backfill:palettes": "node scripts/backfillPhotoPalettes.mjs"
```

- [ ] **Step 2: Create backfill script**

Create `scripts/backfillPhotoPalettes.mjs`:

```js
import admin from 'firebase-admin';
import sharp from 'sharp';

import {
  buildPaletteV2FromImageData,
  normalizePaletteV2
} from '../src/lib/photoPalette.js';

const args = new Set(process.argv.slice(2));
const force = args.has('--force');
const dryRun = args.has('--dry-run');
const limitArg = process.argv.find((arg) => arg.startsWith('--limit='));
const limit = limitArg ? Number(limitArg.split('=')[1]) : Infinity;
const projectIdArg = process.argv.find((arg) => arg.startsWith('--project='));
const projectId = projectIdArg?.split('=')[1] || process.env.GOOGLE_CLOUD_PROJECT || process.env.GCLOUD_PROJECT || 'sixth-bonbon-402909';

if (!Number.isFinite(limit) && limit !== Infinity) {
  throw new Error('--limit must be a number');
}

if (admin.apps.length === 0) {
  admin.initializeApp({
    credential: admin.credential.applicationDefault(),
    projectId
  });
}

const db = admin.firestore();

async function imageDataFromUrl(url) {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Fetch failed: ${response.status} ${response.statusText}`);
  }

  const input = Buffer.from(await response.arrayBuffer());
  const { data, info } = await sharp(input)
    .resize(28, 28, { fit: 'fill' })
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  return {
    data: new Uint8ClampedArray(data),
    width: info.width,
    height: info.height
  };
}

async function backfill() {
  const couples = await db.collection('couples').get();
  let seen = 0;
  let updated = 0;
  let skipped = 0;
  let failed = 0;

  for (const coupleDoc of couples.docs) {
    const photos = await coupleDoc.ref.collection('photos').get();

    for (const photoDoc of photos.docs) {
      if (seen >= limit) break;
      seen += 1;

      const photo = photoDoc.data();
      const currentPalette = normalizePaletteV2(photo.paletteV2);

      if (currentPalette && !force) {
        skipped += 1;
        console.log(`skip ${photoDoc.ref.path}`);
        continue;
      }

      if (!photo.photoUrl) {
        failed += 1;
        console.warn(`missing photoUrl ${photoDoc.ref.path}`);
        continue;
      }

      try {
        const imageData = await imageDataFromUrl(photo.photoUrl);
        const paletteV2 = buildPaletteV2FromImageData(imageData);
        if (!paletteV2) {
          failed += 1;
          console.warn(`no palette ${photoDoc.ref.path}`);
          continue;
        }

        if (!dryRun) {
          await photoDoc.ref.update({ paletteV2 });
        }

        updated += 1;
        console.log(`${dryRun ? 'dry-run ' : ''}update ${photoDoc.ref.path} ${paletteV2.colors.join(' ')}`);
      } catch (error) {
        failed += 1;
        console.warn(`fail ${photoDoc.ref.path}: ${error.message}`);
      }
    }

    if (seen >= limit) break;
  }

  console.log(JSON.stringify({ seen, updated, skipped, failed, dryRun, force }, null, 2));
}

await backfill();
```

- [ ] **Step 3: Run script dry-run**

Run:

```bash
npm run backfill:palettes -- --dry-run --limit=3
```

Expected:

- Script authenticates with Application Default Credentials or fails clearly with an auth setup error.
- If authenticated, prints per-photo skip/update/fail lines and a JSON summary.
- Does not write Firestore docs in dry-run mode.

- [ ] **Step 4: Run full backfill after dry-run succeeds**

Run:

```bash
npm run backfill:palettes
```

Expected:

- Existing photos without valid `paletteV2` are updated.
- Script prints final summary with `failed: 0` or specific fetch/decode failures.

## Task 6: Version, Linear, Verification, Release

**Files:**
- Modify: `package.json`
- Modify: `package-lock.json`
- Linear: create/update issue for Palette V2 background fix

- [ ] **Step 1: Bump version**

Change root package version from `0.2.7` to `0.2.8` in `package.json` and `package-lock.json`.

- [ ] **Step 2: Sync Linear**

Create or update a Pocofoto Linear issue with:

```md
Palette V2 background fix:
- stored split-half paletteV2
- reusable backfill script
- Home-only full viewport frames
- no camera/review background diffusion
- verification and backfill summary
```

- [ ] **Step 3: Full verification**

Run:

```bash
npm run test:unit
npm run lint
npm run build
```

Expected: all commands exit 0.

- [ ] **Step 4: Browser verification**

Run local dev:

```bash
npm run dev -- --host 127.0.0.1 --port 5174
```

Expected in Browser:

- Current auth screen renders and fallback background is pure black.
- In paired state, Home frames are full viewport width.
- Active feed photo with `paletteV2` updates background immediately.
- History/Profile preserve the current palette.
- Console warnings/errors are empty or explained.

- [ ] **Step 5: Commit and release**

Run:

```bash
git add package.json package-lock.json firestore.rules src/App.jsx src/components src/lib scripts docs/superpowers/plans/2026-06-07-palette-v2-background.md
git commit -m "fix: store split photo background palettes"
git push origin main
git push origin main:production
npm run build
npx wrangler --cwd dist pages deploy . --project-name pocofoto --branch production --commit-hash "$(git rev-parse --short HEAD)" --commit-message "fix: store split photo background palettes"
```

Expected:

- `origin/main` and `origin/production` point at the same commit.
- Cloudflare Pages deploy succeeds.
- Live Browser check shows version `v0.2.8 (<commit>)`.

## Self-Review Checklist

- Spec coverage: palette lag, split-half extraction, backfill script, new-photo metadata, Home-only layout, black camera/review behavior, History/Profile persistence, error handling, and verification all have tasks.
- Placeholder scan: no placeholders, TODOs, or vague future steps remain.
- Type consistency: `paletteV2`, `normalizePaletteV2`, `extractPaletteV2FromBlob`, and `buildPaletteV2FromImageData` names are consistent across tasks.
