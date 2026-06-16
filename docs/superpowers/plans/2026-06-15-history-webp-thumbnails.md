# History WebP Thumbnails Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make History load 256px WebP thumbnails instead of full shared photos, while preserving full-size photo quality in Home and backfilling existing photos.

**Architecture:** Add one browser thumbnail utility for new uploads, wire `uploadPhotoBlob` to best-effort upload a 256px WebP thumbnail beside the existing full image, and make History prefer `thumbnailUrl` with `photoUrl` fallback. Add a root Firebase Admin + Sharp backfill script that generates the same 256px WebP thumbnail for existing `couples/{coupleId}/photos/{photoId}` docs and updates only missing thumbnail metadata.

**Tech Stack:** React 19, Vite, Firebase Firestore/Storage, Firebase Admin, Sharp, browser Canvas API, node:test/Vitest, ESLint.

---

## Spec

Use these product decisions:

- Thumbnail format: WebP only.
- Thumbnail size: 256px square.
- Full-size photos: leave current JPEG/full-size behavior alone for this ticket.
- Old photos: backfill existing photo docs with WebP thumbnails.
- Runtime fallback: History renders `photo.thumbnailUrl || photo.photoUrl`.
- Send failure policy: thumbnail generation/upload failures must not block sending the full photo.

Current repo evidence:

- `src/components/HistoryScreen.jsx` currently renders History tiles from `photo.photoUrl`.
- `src/components/MainScreen.jsx` currently uploads one photo blob to `couples/{coupleId}/{timestamp}.jpg` and writes `photoUrl`.
- `src/hooks/usePaginatedPhotos.js` passes photo docs through unchanged, so `thumbnailUrl` will reach History automatically.
- `storage.rules` currently matches `couples/{coupleId}/{fileName}`, which does not cover nested `couples/{coupleId}/thumbnails/{fileName}` paths.
- Root `package.json` already has `firebase-admin` and `sharp`, plus an existing `scripts/backfillPhotoPalettes.mjs` pattern to follow.

## File Structure

- Create `src/lib/photoThumbnails.js`: browser-only canvas helpers for 256px square WebP thumbnail generation.
- Create `src/lib/photoThumbnails.test.js`: source-level tests for thumbnail constants and WebP-only behavior.
- Modify `src/components/MainScreen.jsx`: generate/upload thumbnail best-effort during shared photo upload and include `thumbnailUrl` metadata when available.
- Modify `src/components/HistoryScreen.jsx`: prefer `thumbnailUrl` for grid image source with `photoUrl` fallback.
- Modify `src/components/HistoryScreen.test.js`: assert fallback expression exists and native loading hints remain.
- Modify `src/components/CameraOptimization.test.js`: assert upload flow imports/calls thumbnail helper and does not change full-size JPEG capture.
- Modify `storage.rules`: allow authenticated couple members to write nested thumbnail objects under `couples/{coupleId}/thumbnails/{fileName}`.
- Modify `firestore.rules`: validate optional thumbnail metadata on new photo docs.
- Create `scripts/backfillPhotoThumbnails.mjs`: idempotent dry-run-by-default Admin + Sharp script.
- Modify `package.json` and `package-lock.json`: add `backfill:thumbnails` script and bump app version.

---

### Task 1: Browser Thumbnail Utility

**Files:**
- Create: `src/lib/photoThumbnails.js`
- Create: `src/lib/photoThumbnails.test.js`

- [ ] **Step 1: Write the failing source tests**

Create `src/lib/photoThumbnails.test.js`:

```js
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const source = readFileSync(new URL('./photoThumbnails.js', import.meta.url), 'utf8');

test('History thumbnails are fixed 256px WebP assets', () => {
  assert.match(source, /export const HISTORY_THUMBNAIL_SIZE = 256;/);
  assert.match(source, /export const HISTORY_THUMBNAIL_TYPE = 'image\\/webp';/);
  assert.match(source, /export const HISTORY_THUMBNAIL_EXTENSION = 'webp';/);
});

test('thumbnail helper center-crops and exports WebP only', () => {
  assert.match(source, /function getCenterCrop\\(width, height\\)/);
  assert.match(source, /canvas\\.width = HISTORY_THUMBNAIL_SIZE;/);
  assert.match(source, /canvas\\.height = HISTORY_THUMBNAIL_SIZE;/);
  assert.match(source, /canvas\\.toBlob\\([\\s\\S]*HISTORY_THUMBNAIL_TYPE[\\s\\S]*HISTORY_THUMBNAIL_QUALITY/);
  assert.doesNotMatch(source, /image\\/jpeg/);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
npm run test:unit -- src/lib/photoThumbnails.test.js
```

Expected: FAIL because `src/lib/photoThumbnails.js` does not exist yet.

- [ ] **Step 3: Implement the thumbnail utility**

Create `src/lib/photoThumbnails.js`:

```js
export const HISTORY_THUMBNAIL_SIZE = 256;
export const HISTORY_THUMBNAIL_TYPE = 'image/webp';
export const HISTORY_THUMBNAIL_EXTENSION = 'webp';
export const HISTORY_THUMBNAIL_QUALITY = 0.76;

function getCenterCrop(width, height) {
  const size = Math.min(width, height);
  return {
    x: Math.floor((width - size) / 2),
    y: Math.floor((height - size) / 2),
    size
  };
}

function loadImageFromBlob(blob) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    const objectUrl = URL.createObjectURL(blob);

    image.onload = () => {
      URL.revokeObjectURL(objectUrl);
      resolve(image);
    };
    image.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error('Unable to load photo for thumbnail'));
    };
    image.src = objectUrl;
  });
}

export async function createHistoryThumbnailBlob(photoBlob) {
  const image = await loadImageFromBlob(photoBlob);
  if (!image.naturalWidth || !image.naturalHeight) {
    throw new Error('Photo has invalid thumbnail dimensions');
  }

  const canvas = document.createElement('canvas');
  canvas.width = HISTORY_THUMBNAIL_SIZE;
  canvas.height = HISTORY_THUMBNAIL_SIZE;

  const context = canvas.getContext('2d');
  if (!context) throw new Error('Unable to create thumbnail canvas');

  const crop = getCenterCrop(image.naturalWidth, image.naturalHeight);
  context.drawImage(
    image,
    crop.x,
    crop.y,
    crop.size,
    crop.size,
    0,
    0,
    HISTORY_THUMBNAIL_SIZE,
    HISTORY_THUMBNAIL_SIZE
  );

  return new Promise((resolve, reject) => {
    canvas.toBlob((thumbnailBlob) => {
      if (!thumbnailBlob || thumbnailBlob.type !== HISTORY_THUMBNAIL_TYPE) {
        reject(new Error('Unable to encode WebP thumbnail'));
        return;
      }
      resolve(thumbnailBlob);
    }, HISTORY_THUMBNAIL_TYPE, HISTORY_THUMBNAIL_QUALITY);
  });
}
```

- [ ] **Step 4: Run test to verify it passes**

Run:

```bash
npm run test:unit -- src/lib/photoThumbnails.test.js
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/photoThumbnails.js src/lib/photoThumbnails.test.js
git commit -m "add history thumbnail utility"
```

---

### Task 2: Upload New WebP Thumbnails

**Files:**
- Modify: `src/components/MainScreen.jsx`
- Modify: `src/components/CameraOptimization.test.js`

- [ ] **Step 1: Write the failing source tests**

Append to `src/components/CameraOptimization.test.js`:

```js
test('uploads best-effort WebP thumbnails beside full-size shared photos', () => {
  assert.match(source, /createHistoryThumbnailBlob/);
  assert.match(source, /HISTORY_THUMBNAIL_EXTENSION/);
  assert.match(source, /thumbnailUrl/);
  assert.match(source, /thumbnailFormat:\s*'webp'/);
  assert.match(source, /console\.warn\('History thumbnail upload failed\.'/);
});

test('keeps full-size capture as JPEG while thumbnails are separate WebP assets', () => {
  assert.match(source, /canvas\.toBlob\([\\s\\S]*'image\\/jpeg'[\\s\\S]*CAPTURE_JPEG_QUALITY/);
  assert.match(source, /thumbnails\\/\\$\\{timestampStr\\}\\.\$\\{HISTORY_THUMBNAIL_EXTENSION\\}/);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
npm run test:unit -- src/components/CameraOptimization.test.js
```

Expected: FAIL because thumbnail upload is not wired yet.

- [ ] **Step 3: Import the thumbnail helper**

In `src/components/MainScreen.jsx`, add this import near the other local imports:

```js
import {
  createHistoryThumbnailBlob,
  HISTORY_THUMBNAIL_EXTENSION,
  HISTORY_THUMBNAIL_TYPE
} from '../lib/photoThumbnails.js';
```

- [ ] **Step 4: Add a best-effort thumbnail uploader**

In `src/components/MainScreen.jsx`, add this helper directly above `uploadPhotoBlob`:

```js
  const uploadHistoryThumbnail = async (blob, timestampStr) => {
    try {
      const thumbnailBlob = await createHistoryThumbnailBlob(blob);
      const thumbnailPath = `couples/${coupleId}/thumbnails/${timestampStr}.${HISTORY_THUMBNAIL_EXTENSION}`;
      const thumbnailRef = ref(storage, thumbnailPath);
      await uploadBytes(thumbnailRef, thumbnailBlob, {
        contentType: HISTORY_THUMBNAIL_TYPE
      });
      return await getDownloadURL(thumbnailRef);
    } catch (err) {
      console.warn('History thumbnail upload failed.', err);
      return null;
    }
  };
```

- [ ] **Step 5: Update `uploadPhotoBlob` to write thumbnail metadata when available**

In `src/components/MainScreen.jsx`, replace the beginning of `uploadPhotoBlob` through `photoPayload` creation with:

```js
  const uploadPhotoBlob = async (blob, caption = null) => {
    const timestampStr = new Date().toISOString();
    const filename = `couples/${coupleId}/${Date.now()}.jpg`;
    const storageRef = ref(storage, filename);
    await uploadBlobWithTimeout(storageRef, blob);
    const url = await getDownloadURL(storageRef);
    const thumbnailUrl = await uploadHistoryThumbnail(blob, timestampStr);

    const photoPayload = {
      photoUrl: url,
      senderId: user.uid,
      timestamp: timestampStr,
      liked: false
    };

    if (thumbnailUrl) {
      photoPayload.thumbnailUrl = thumbnailUrl;
      photoPayload.thumbnailSize = 256;
      photoPayload.thumbnailFormat = 'webp';
    }
```

Keep the existing caption block, `addDoc`, couple `updateDoc`, and `trackEvent` code after this block unchanged.

- [ ] **Step 6: Run test to verify it passes**

Run:

```bash
npm run test:unit -- src/components/CameraOptimization.test.js
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/components/MainScreen.jsx src/components/CameraOptimization.test.js
git commit -m "upload history thumbnails for new photos"
```

---

### Task 3: Render Thumbnails In History

**Files:**
- Modify: `src/components/HistoryScreen.jsx`
- Modify: `src/components/HistoryScreen.test.js`

- [ ] **Step 1: Write the failing History tests**

Add this test to `src/components/HistoryScreen.test.js`:

```js
test('History grid prefers thumbnails and falls back to full photo URLs', () => {
  assert.match(historyScreenSource, /const historyImageUrl = photo\.thumbnailUrl \|\| photo\.photoUrl;/);
  assert.match(historyScreenSource, /src=\{historyImageUrl\}/);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
npm run test:unit -- src/components/HistoryScreen.test.js
```

Expected: FAIL because History still uses `photo.photoUrl` directly.

- [ ] **Step 3: Update History image rendering**

In `src/components/HistoryScreen.jsx`, replace the current `photos.map` body with this shape:

```jsx
            {photos.map((photo, i) => {
              const historyImageUrl = photo.thumbnailUrl || photo.photoUrl;
              return (
                <motion.button
                  className="history-tile"
                  type="button"
                  initial={{ opacity: 0, scale: 0.92 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ delay: i * 0.025 }}
                  key={photo.id}
                  onClick={() => {
                    trackEvent('history_photo_opened', { photoId: photo.id });
                    onSelectPhoto?.(photo.id);
                  }}
                  aria-label="Open photo"
                >
                  <img
                    src={historyImageUrl}
                    alt=""
                    loading="lazy"
                    decoding="async"
                    draggable={false}
                  />
                </motion.button>
              );
            })}
```

- [ ] **Step 4: Run test to verify it passes**

Run:

```bash
npm run test:unit -- src/components/HistoryScreen.test.js
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/components/HistoryScreen.jsx src/components/HistoryScreen.test.js
git commit -m "use thumbnails in history grid"
```

---

### Task 4: Rules For Thumbnail Metadata And Storage Paths

**Files:**
- Modify: `firestore.rules`
- Modify: `storage.rules`

- [ ] **Step 1: Update Firestore thumbnail metadata validation**

In `firestore.rules`, add these functions after `hasValidOptionalPaletteV2()`:

```js
    function hasValidOptionalThumbnailUrl() {
      return !('thumbnailUrl' in request.resource.data)
        || (request.resource.data.thumbnailUrl is string
          && request.resource.data.thumbnailUrl.matches('https://.*'));
    }

    function hasValidOptionalThumbnailSize() {
      return !('thumbnailSize' in request.resource.data)
        || request.resource.data.thumbnailSize == 256;
    }

    function hasValidOptionalThumbnailFormat() {
      return !('thumbnailFormat' in request.resource.data)
        || request.resource.data.thumbnailFormat == 'webp';
    }

    function hasValidOptionalThumbnailMetadata() {
      return hasValidOptionalThumbnailUrl()
        && hasValidOptionalThumbnailSize()
        && hasValidOptionalThumbnailFormat();
    }
```

Then update the `couples/{coupleId}/photos/{photoId}` create rule:

```js
        allow create: if isCoupleMember(coupleId)
          && request.resource.data.senderId == request.auth.uid
          && hasValidOptionalCaption()
          && hasValidOptionalPaletteV2()
          && hasValidOptionalThumbnailMetadata();
```

- [ ] **Step 2: Update Storage rules for nested thumbnails**

In `storage.rules`, replace the existing `match /couples/{coupleId}/{fileName}` block with:

```js
    match /couples/{coupleId}/{allPaths=**} {
      allow read: if signedIn() && currentCoupleId() == coupleId;
      allow write: if signedIn()
        && currentCoupleId() == coupleId
        && request.resource.size < 10 * 1024 * 1024
        && request.resource.contentType.matches('image/.*');
    }
```

- [ ] **Step 3: Run validation commands**

Run:

```bash
npm run lint
npm run build
```

Expected: both PASS. Firebase rules are not covered by ESLint, so also run an emulator smoke test in Task 7.

- [ ] **Step 4: Commit**

```bash
git add firestore.rules storage.rules
git commit -m "allow history thumbnail metadata"
```

---

### Task 5: Existing Photo Backfill

**Files:**
- Create: `scripts/backfillPhotoThumbnails.mjs`
- Modify: `package.json`
- Modify: `package-lock.json`

- [ ] **Step 1: Add the npm script and version bump**

In `package.json`, update:

```json
"version": "0.2.37"
```

Add this script next to `backfill:palettes`:

```json
"backfill:thumbnails": "node scripts/backfillPhotoThumbnails.mjs"
```

Run:

```bash
npm install --package-lock-only
```

Expected: `package-lock.json` updates the root package version to `0.2.37` without installing new packages.

- [ ] **Step 2: Create the backfill script**

Create `scripts/backfillPhotoThumbnails.mjs`:

```js
#!/usr/bin/env node

import process from 'node:process';
import { randomUUID } from 'node:crypto';
import { applicationDefault, getApps, initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { getStorage } from 'firebase-admin/storage';
import sharp from 'sharp';

const DEFAULT_PROJECT_ID = 'sixth-bonbon-402909';
const THUMBNAIL_SIZE = 256;
const THUMBNAIL_CONTENT_TYPE = 'image/webp';
const THUMBNAIL_FORMAT = 'webp';

function printHelp() {
  console.log(`
Backfill 256px WebP History thumbnails for existing Pocofoto photos.

Usage:
  npm run backfill:thumbnails -- [options]

Options:
  --write             Persist Storage uploads and Firestore updates. Default is dry-run.
  --dry-run           Preview work without writing updates.
  --force             Recompute photos that already have thumbnailUrl.
  --limit N           Scan at most N photo documents.
  --project-id ID     Firebase project id. Defaults to ${DEFAULT_PROJECT_ID}.
  --bucket NAME       Firebase Storage bucket. Defaults to the app default bucket.
  --help              Show this help.

Environment:
  FIREBASE_PROJECT_ID, GCLOUD_PROJECT, or GOOGLE_CLOUD_PROJECT may override the default project.
  FIREBASE_STORAGE_BUCKET may override the default bucket.
  Uses Firebase Admin application default credentials.
`);
}

function parseArgs(argv) {
  const options = {
    dryRun: true,
    force: false,
    help: false,
    limit: null,
    projectId:
      process.env.FIREBASE_PROJECT_ID
      || process.env.GCLOUD_PROJECT
      || process.env.GOOGLE_CLOUD_PROJECT
      || DEFAULT_PROJECT_ID,
    bucket: process.env.FIREBASE_STORAGE_BUCKET || null
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--help' || arg === '-h') {
      options.help = true;
    } else if (arg === '--write') {
      options.dryRun = false;
    } else if (arg === '--dry-run') {
      options.dryRun = true;
    } else if (arg === '--force') {
      options.force = true;
    } else if (arg === '--limit') {
      const rawLimit = argv[i + 1];
      i += 1;
      const limit = Number.parseInt(rawLimit, 10);
      if (!Number.isInteger(limit) || limit < 1) throw new Error('--limit requires a positive integer.');
      options.limit = limit;
    } else if (arg.startsWith('--limit=')) {
      const limit = Number.parseInt(arg.slice('--limit='.length), 10);
      if (!Number.isInteger(limit) || limit < 1) throw new Error('--limit requires a positive integer.');
      options.limit = limit;
    } else if (arg === '--project-id') {
      const projectId = argv[i + 1];
      i += 1;
      if (!projectId) throw new Error('--project-id requires a value.');
      options.projectId = projectId;
    } else if (arg.startsWith('--project-id=')) {
      const projectId = arg.slice('--project-id='.length);
      if (!projectId) throw new Error('--project-id requires a value.');
      options.projectId = projectId;
    } else if (arg === '--bucket') {
      const bucket = argv[i + 1];
      i += 1;
      if (!bucket) throw new Error('--bucket requires a value.');
      options.bucket = bucket;
    } else if (arg.startsWith('--bucket=')) {
      const bucket = arg.slice('--bucket='.length);
      if (!bucket) throw new Error('--bucket requires a value.');
      options.bucket = bucket;
    } else {
      throw new Error(`Unknown option: ${arg}`);
    }
  }

  return options;
}

function isCouplePhotoDoc(docRef) {
  return /^couples\/[^/]+\/photos\/[^/]+$/.test(docRef.path);
}

function coupleIdFromPhotoDoc(docRef) {
  return docRef.path.split('/')[1];
}

async function createThumbnailBuffer(photoUrl) {
  const response = await fetch(photoUrl);
  if (!response.ok) throw new Error(`Photo fetch failed with HTTP ${response.status}`);

  const contentType = response.headers.get('content-type') || '';
  if (contentType && !contentType.toLowerCase().startsWith('image/')) {
    throw new Error(`Photo fetch returned non-image content-type: ${contentType}`);
  }

  const input = Buffer.from(await response.arrayBuffer());
  return sharp(input)
    .rotate()
    .resize(THUMBNAIL_SIZE, THUMBNAIL_SIZE, { fit: 'cover', position: 'centre' })
    .webp({ quality: 76 })
    .toBuffer();
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    printHelp();
    return;
  }

  if (!getApps().length) {
    initializeApp({
      credential: applicationDefault(),
      projectId: options.projectId,
      storageBucket: options.bucket || `${options.projectId}.firebasestorage.app`
    });
  }

  const db = getFirestore();
  const bucket = getStorage().bucket(options.bucket || undefined);
  let query = db.collectionGroup('photos');
  if (options.limit) query = query.limit(options.limit);

  console.log(`Starting thumbnail backfill for project ${options.projectId}.`);
  console.log(`Bucket: ${bucket.name}.`);
  console.log(`Mode: ${options.dryRun ? 'dry-run' : 'write'}${options.force ? ', force' : ''}${options.limit ? `, limit ${options.limit}` : ''}.`);

  const snapshot = await query.get();
  const summary = {
    scanned: 0,
    skippedPath: 0,
    skippedExisting: 0,
    skippedMissingUrl: 0,
    prepared: 0,
    uploaded: 0,
    updated: 0,
    failed: 0
  };

  for (const doc of snapshot.docs) {
    summary.scanned += 1;

    if (!isCouplePhotoDoc(doc.ref)) {
      summary.skippedPath += 1;
      console.log(`skip path ${doc.ref.path}`);
      continue;
    }

    const data = doc.data();
    if (data.thumbnailUrl && !options.force) {
      summary.skippedExisting += 1;
      console.log(`skip existing ${doc.ref.path}`);
      continue;
    }

    if (!data.photoUrl || typeof data.photoUrl !== 'string') {
      summary.skippedMissingUrl += 1;
      console.log(`skip missing-photoUrl ${doc.ref.path}`);
      continue;
    }

    try {
      const coupleId = coupleIdFromPhotoDoc(doc.ref);
      const objectPath = `couples/${coupleId}/thumbnails/${doc.id}.${THUMBNAIL_FORMAT}`;
      summary.prepared += 1;
      console.log(`${options.dryRun ? 'prepare' : 'write'} ${doc.ref.path} -> ${objectPath}`);

      if (!options.dryRun) {
        const thumbnailBuffer = await createThumbnailBuffer(data.photoUrl);
        const file = bucket.file(objectPath);
        const downloadToken = randomUUID();
        await file.save(thumbnailBuffer, {
          resumable: false,
          metadata: {
            contentType: THUMBNAIL_CONTENT_TYPE,
            cacheControl: 'public, max-age=31536000',
            metadata: {
              firebaseStorageDownloadTokens: downloadToken
            }
          }
        });
        summary.uploaded += 1;

        const thumbnailUrl = `https://firebasestorage.googleapis.com/v0/b/${bucket.name}/o/${encodeURIComponent(objectPath)}?alt=media&token=${downloadToken}`;
        await doc.ref.update({
          thumbnailUrl,
          thumbnailSize: THUMBNAIL_SIZE,
          thumbnailFormat: THUMBNAIL_FORMAT
        });
        summary.updated += 1;
      }
    } catch (err) {
      summary.failed += 1;
      console.error(`fail ${doc.ref.path}: ${err.message}`);
    }
  }

  console.log('Thumbnail backfill summary:', summary);
  if (options.dryRun) {
    console.log('Dry-run only. Re-run with --write to upload thumbnails and update photo docs.');
  }
}

main().catch((err) => {
  console.error(`Thumbnail backfill aborted: ${err.message}`);
  process.exitCode = 1;
});
```

- [ ] **Step 3: Run a dry-run against a tiny limit**

Run:

```bash
npm run backfill:thumbnails -- --dry-run --limit 3
```

Expected: script prints a dry-run summary and does not write Firestore or Storage.

- [ ] **Step 4: Commit**

```bash
git add package.json package-lock.json scripts/backfillPhotoThumbnails.mjs
git commit -m "add history thumbnail backfill"
```

---

### Task 6: Full Verification

**Files:**
- No new files.

- [ ] **Step 1: Run unit tests**

Run:

```bash
npm run test:unit
```

Expected: PASS.

- [ ] **Step 2: Run lint**

Run:

```bash
npm run lint
```

Expected: PASS.

- [ ] **Step 3: Run production build**

Run:

```bash
npm run build
```

Expected: PASS.

- [ ] **Step 4: Run emulator smoke test**

Run:

```bash
npm run emulators:fresh
```

In another terminal:

```bash
npm run dev
```

Expected manual checks:

- Sign in and pair two local users.
- Send a new photo.
- Confirm the new photo doc has `photoUrl`, `thumbnailUrl`, `thumbnailSize: 256`, and `thumbnailFormat: "webp"`.
- Open History and confirm grid image requests use the thumbnail URL.
- Tap a History tile and confirm Home opens the full photo as before.

- [ ] **Step 5: Run backfill dry-run**

Run:

```bash
npm run backfill:thumbnails -- --dry-run --limit 10
```

Expected: PASS with prepared/skipped summary. Do not run `--write` until production credentials and target bucket are confirmed.

- [ ] **Step 6: Commit verification fixes if needed**

If verification required fixes:

```bash
git add src scripts package.json package-lock.json firestore.rules storage.rules
git commit -m "verify history thumbnail optimization"
```

If no fixes were needed, do not create an empty commit.

---

### Task 7: Linear And Release Notes

**Files:**
- Modify only if implementation creates a changelog or release note file.

- [ ] **Step 1: Update Linear ticket `PCO-90`**

Add an implementation comment with:

```md
Implemented:
- New uploads create best-effort 256px WebP History thumbnails.
- History uses `thumbnailUrl || photoUrl`.
- Added idempotent existing-photo thumbnail backfill script.
- Full-size photos remain unchanged for this ticket.

Verification:
- `npm run test:unit`
- `npm run lint`
- `npm run build`
- emulator send-photo smoke test
- `npm run backfill:thumbnails -- --dry-run --limit 10`
```

- [ ] **Step 2: Prepare release**

If the user asks to ship live, use the Pocofoto live release flow: push `main`, align `production`, and verify deployment path through GitHub/Cloudflare Pages. Do not use Wrangler for the current Pocofoto release path.

---

## Self-Review

- Spec coverage: 256px WebP thumbnails, `photoUrl` fallback, old-photo backfill, new-upload generation, rules, tests, and verification are all mapped to tasks.
- Placeholder scan: no unresolved placeholder steps remain.
- Type consistency: metadata names are consistently `thumbnailUrl`, `thumbnailSize`, and `thumbnailFormat`; thumbnail constants are consistently `HISTORY_THUMBNAIL_*`.
