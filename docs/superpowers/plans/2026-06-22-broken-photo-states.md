# Broken Photo States Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add skeleton loading, one automatic retry, and a consistent broken-photo fallback to Main Feed and History photos for POC-102.

**Architecture:** A focused `ResilientPhotoImage` component owns image loading, automatic retry, stale-event protection, and fallback rendering. History keeps navigation in its tile button, while Main Feed owns the manual retry action through a retry key and status callback.

**Tech Stack:** React 19, Vite, Vitest, Testing Library, shadcn/ui, Tailwind CSS v4, Lucide React, react-i18next

---

## File Map

- Create `src/components/ui/skeleton.jsx`: shadcn Skeleton primitive generated for the existing `radix-luma` theme.
- Create `src/components/ResilientPhotoImage.jsx`: shared image lifecycle, skeleton, automatic retry, and `ImageOff` fallback.
- Create `src/components/ResilientPhotoImage.test.jsx`: behavioral tests for loading, retry, failure, recovery, and source changes.
- Modify `src/components/HistoryScreen.jsx`: render thumbnail-only resilient images while retaining tile navigation.
- Create `src/components/HistoryScreen.test.jsx`: runtime coverage for History fallback and click behavior.
- Modify `src/components/HistoryScreen.test.js`: replace the obsolete full-photo fallback assertion with thumbnail-only source checks.
- Modify `src/components/MainScreen.jsx`: connect per-photo failure state and manual retry to the shared image component.
- Create `src/components/MainScreenPhotoStates.test.js`: focused source-level contract tests for Main Feed wiring without mounting its Firebase-heavy screen.
- Modify `src/locales/en/camera.js`: add the localized Main Feed retry label.
- Modify `src/index.css`: size the shared image states and align fallback/retry visuals with existing photo surfaces.

### Task 1: Add The shadcn Skeleton Primitive

**Files:**
- Create: `src/components/ui/skeleton.jsx`

- [ ] **Step 1: Generate the component through the configured shadcn registry**

Run:

```bash
npx shadcn@latest add skeleton --yes
```

Expected: `src/components/ui/skeleton.jsx` is created and uses `cn` from `@/lib/utils`.

- [ ] **Step 2: Verify the generated component matches the repository configuration**

Run:

```bash
sed -n '1,120p' src/components/ui/skeleton.jsx
```

Expected: the file exports `Skeleton`, includes `data-slot="skeleton"`, and applies the registry's pulse animation and neutral theme class.

- [ ] **Step 3: Run lint on the generated primitive**

Run:

```bash
npx eslint src/components/ui/skeleton.jsx
```

Expected: PASS with no lint errors.

- [ ] **Step 4: Commit the shadcn primitive**

```bash
git add src/components/ui/skeleton.jsx
git commit -m "add photo loading skeleton"
```

### Task 2: Build The Shared Resilient Image Lifecycle

**Files:**
- Create: `src/components/ResilientPhotoImage.jsx`
- Create: `src/components/ResilientPhotoImage.test.jsx`
- Modify: `src/index.css`

- [ ] **Step 1: Write failing lifecycle tests**

Create `src/components/ResilientPhotoImage.test.jsx` with tests that render the component using `src="photo.jpg"`, `alt="Shared moment"`, and a status spy:

```jsx
import { fireEvent, render, screen } from '@testing-library/react';
import { expect, it, vi } from 'vitest';

import ResilientPhotoImage from './ResilientPhotoImage';

it('shows a skeleton until the photo loads', () => {
  render(<ResilientPhotoImage src="photo.jpg" alt="Shared moment" />);

  expect(screen.getByTestId('photo-skeleton')).toBeVisible();
  fireEvent.load(screen.getByRole('img', { name: 'Shared moment' }));
  expect(screen.queryByTestId('photo-skeleton')).not.toBeInTheDocument();
});

it('retries automatically once before showing the fallback', () => {
  const onStatusChange = vi.fn();
  render(
    <ResilientPhotoImage
      src="photo.jpg"
      alt="Shared moment"
      onStatusChange={onStatusChange}
    />
  );

  fireEvent.error(screen.getByRole('img', { name: 'Shared moment' }));
  expect(screen.getByRole('img', { name: 'Shared moment' })).toBeInTheDocument();
  expect(screen.queryByTestId('photo-fallback')).not.toBeInTheDocument();

  fireEvent.error(screen.getByRole('img', { name: 'Shared moment' }));
  expect(screen.getByTestId('photo-fallback')).toBeVisible();
  expect(onStatusChange).toHaveBeenLastCalledWith('failed');
});

it('resets after a manual retry key or source change', () => {
  const { rerender } = render(
    <ResilientPhotoImage src="broken.jpg" alt="Shared moment" retryKey={0} />
  );

  fireEvent.error(screen.getByRole('img', { name: 'Shared moment' }));
  fireEvent.error(screen.getByRole('img', { name: 'Shared moment' }));
  expect(screen.getByTestId('photo-fallback')).toBeVisible();

  rerender(<ResilientPhotoImage src="broken.jpg" alt="Shared moment" retryKey={1} />);
  expect(screen.getByTestId('photo-skeleton')).toBeVisible();
  expect(screen.getByRole('img', { name: 'Shared moment' })).toBeInTheDocument();

  rerender(<ResilientPhotoImage src="replacement.jpg" alt="Shared moment" retryKey={1} />);
  expect(screen.getByRole('img', { name: 'Shared moment' })).toHaveAttribute('src', 'replacement.jpg');
});

it('ignores an event from a superseded load attempt', () => {
  const onStatusChange = vi.fn();
  const { rerender } = render(
    <ResilientPhotoImage src="first.jpg" alt="Shared moment" onStatusChange={onStatusChange} />
  );
  const staleImage = screen.getByRole('img', { name: 'Shared moment' });

  rerender(
    <ResilientPhotoImage src="second.jpg" alt="Shared moment" onStatusChange={onStatusChange} />
  );
  fireEvent.error(staleImage);

  expect(screen.getByRole('img', { name: 'Shared moment' })).toHaveAttribute('src', 'second.jpg');
  expect(onStatusChange).not.toHaveBeenCalledWith('failed');
});
```

- [ ] **Step 2: Run the component test and verify it fails**

Run:

```bash
npx vitest run src/components/ResilientPhotoImage.test.jsx
```

Expected: FAIL because `ResilientPhotoImage.jsx` does not exist.

- [ ] **Step 3: Implement the minimal component**

Create `src/components/ResilientPhotoImage.jsx` with this public contract:

```jsx
import { useEffect, useRef, useState } from 'react';
import { ImageOff } from 'lucide-react';

import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';

export const PHOTO_IMAGE_STATUS = {
  LOADING: 'loading',
  LOADED: 'loaded',
  FAILED: 'failed'
};

export default function ResilientPhotoImage({
  src,
  alt,
  className,
  retryKey = 0,
  onStatusChange,
  ...imageProps
}) {
  const [status, setStatus] = useState(PHOTO_IMAGE_STATUS.LOADING);
  const [attempt, setAttempt] = useState(0);
  const activeImageRef = useRef(null);
  const onStatusChangeRef = useRef(onStatusChange);

  useEffect(() => {
    onStatusChangeRef.current = onStatusChange;
  }, [onStatusChange]);

  useEffect(() => {
    setStatus(PHOTO_IMAGE_STATUS.LOADING);
    setAttempt(0);
    onStatusChangeRef.current?.(PHOTO_IMAGE_STATUS.LOADING);
  }, [src, retryKey]);

  function handleLoad(event) {
    if (event.currentTarget !== activeImageRef.current) return;
    setStatus(PHOTO_IMAGE_STATUS.LOADED);
    onStatusChangeRef.current?.(PHOTO_IMAGE_STATUS.LOADED);
  }

  function handleError(event) {
    if (event.currentTarget !== activeImageRef.current) return;
    if (attempt === 0) {
      setAttempt(1);
      return;
    }
    setStatus(PHOTO_IMAGE_STATUS.FAILED);
    onStatusChangeRef.current?.(PHOTO_IMAGE_STATUS.FAILED);
  }

  return (
    <div className={cn('resilient-photo-image', className)} data-status={status}>
      {status === PHOTO_IMAGE_STATUS.LOADING && (
        <Skeleton className="resilient-photo-skeleton" data-testid="photo-skeleton" />
      )}
      {status !== PHOTO_IMAGE_STATUS.FAILED && (
        <img
          ref={activeImageRef}
          key={`${src}:${retryKey}:${attempt}`}
          src={src}
          alt={alt}
          onLoad={handleLoad}
          onError={handleError}
          {...imageProps}
        />
      )}
      {status === PHOTO_IMAGE_STATUS.FAILED && (
        <div className="resilient-photo-fallback" data-testid="photo-fallback">
          <ImageOff aria-hidden="true" />
        </div>
      )}
    </div>
  );
}
```

The callback ref prevents inline parent callbacks from resetting the image, while the active DOM node check ignores late events from replaced image elements. The final implementation must pass the source-change stale-event test and must not mutate the persisted URL to force retries.

- [ ] **Step 4: Add shared layout styles**

Add focused rules to `src/index.css`:

```css
.resilient-photo-image,
.resilient-photo-skeleton,
.resilient-photo-fallback {
  width: 100%;
  height: 100%;
}

.resilient-photo-image {
  position: relative;
  overflow: hidden;
}

.resilient-photo-skeleton,
.resilient-photo-fallback {
  position: absolute;
  inset: 0;
}

.resilient-photo-fallback {
  display: grid;
  place-items: center;
  background: var(--muted);
  color: var(--muted-foreground);
}

.resilient-photo-fallback svg {
  width: 28px;
  height: 28px;
}

.resilient-photo-image img {
  display: block;
  width: 100%;
  height: 100%;
  object-fit: cover;
}
```

- [ ] **Step 5: Run the focused tests and lint**

Run:

```bash
npx vitest run src/components/ResilientPhotoImage.test.jsx
npx eslint src/components/ResilientPhotoImage.jsx src/components/ResilientPhotoImage.test.jsx
```

Expected: PASS; the image retries exactly once and both reset paths return to loading.

- [ ] **Step 6: Commit the shared component**

```bash
git add src/components/ResilientPhotoImage.jsx src/components/ResilientPhotoImage.test.jsx src/index.css
git commit -m "add resilient photo image states"
```

### Task 3: Integrate History Thumbnail States

**Files:**
- Modify: `src/components/HistoryScreen.jsx`
- Create: `src/components/HistoryScreen.test.jsx`
- Modify: `src/components/HistoryScreen.test.js`

- [ ] **Step 1: Write failing History behavior tests**

Create `src/components/HistoryScreen.test.jsx` with a one-photo fixture and `hasMore={false}`. Verify the tile remains the navigation owner after image failure:

```jsx
import { fireEvent, render, screen } from '@testing-library/react';
import { expect, it, vi } from 'vitest';

import HistoryScreen from './HistoryScreen';

const photo = {
  id: 'photo-1',
  thumbnailUrl: 'thumbnail.jpg',
  photoUrl: 'full-photo.jpg'
};

function renderHistory(onSelectPhoto = vi.fn()) {
  const view = render(
    <HistoryScreen
      photos={[photo]}
      loading={false}
      hasMore={false}
      loadingMore={false}
      loadError={null}
      onLoadMore={vi.fn()}
      onSelectPhoto={onSelectPhoto}
    />
  );
  return { ...view, onSelectPhoto };
}

it('uses only the thumbnail and shows no retry control after failure', () => {
  const { container } = renderHistory();
  const image = container.querySelector('img');
  expect(image).toHaveAttribute('src', 'thumbnail.jpg');

  fireEvent.error(image);
  fireEvent.error(container.querySelector('img'));

  expect(screen.getByTestId('photo-fallback')).toBeVisible();
  expect(screen.queryByRole('button', { name: /try/i })).not.toBeInTheDocument();
});

it('opens the feed photo when a broken tile is selected', () => {
  const { container, onSelectPhoto } = renderHistory();
  fireEvent.error(container.querySelector('img'));
  fireEvent.error(container.querySelector('img'));

  fireEvent.click(screen.getByRole('button', { name: 'Open photo' }));
  expect(onSelectPhoto).toHaveBeenCalledWith('photo-1');
});
```

- [ ] **Step 2: Update the source contract tests before implementation**

Replace the raw-image loading-hints test and the obsolete full-photo fallback test in `src/components/HistoryScreen.test.js` with:

```js
test('History grid passes native loading hints to resilient photos', () => {
  assert.match(historyScreenSource, /<ResilientPhotoImage/);
  assert.match(historyScreenSource, /loading="lazy"/);
  assert.match(historyScreenSource, /decoding="async"/);
});

test('History grid uses thumbnails without falling back to full photo URLs', () => {
  assert.match(historyScreenSource, /src=\{photo\.thumbnailUrl\}/);
  assert.doesNotMatch(historyScreenSource, /photo\.thumbnailUrl \|\| photo\.photoUrl/);
});
```

- [ ] **Step 3: Run both History tests and verify failure**

Run:

```bash
node --test src/components/HistoryScreen.test.js
npx vitest run src/components/HistoryScreen.test.jsx
```

Expected: FAIL because History still computes `thumbnailUrl || photoUrl` and renders a raw image.

- [ ] **Step 4: Replace the History image with the shared component**

In `src/components/HistoryScreen.jsx`:

```jsx
import ResilientPhotoImage from './ResilientPhotoImage';
```

Replace the image block inside the existing `motion.button` with:

```jsx
<ResilientPhotoImage
  src={photo.thumbnailUrl}
  alt=""
  loading="lazy"
  decoding="async"
  draggable={false}
/>
```

Keep the `motion.button`, `onClick`, `aria-label={t('openPhoto')}`, and `trackEvent('history_photo_opened', ...)` unchanged. Do not pass `photo.photoUrl` to the shared component.

- [ ] **Step 5: Adjust History selectors for the wrapper**

Update the existing `.history-tile img` rule in `src/index.css` only if needed so `.resilient-photo-image` fills the tile. Do not add pointer-event rules that would interfere with the parent button.

- [ ] **Step 6: Run the focused History tests**

Run:

```bash
node --test src/components/HistoryScreen.test.js
npx vitest run src/components/HistoryScreen.test.jsx
npx eslint src/components/HistoryScreen.jsx src/components/HistoryScreen.test.jsx
```

Expected: PASS; the broken tile contains the fallback, no retry control exists, and clicking still selects `photo-1`.

- [ ] **Step 7: Commit History integration**

```bash
git add src/components/HistoryScreen.jsx src/components/HistoryScreen.test.jsx src/components/HistoryScreen.test.js src/index.css
git commit -m "add broken states to history photos"
```

### Task 4: Integrate Main Feed Retry States

**Files:**
- Modify: `src/components/MainScreen.jsx`
- Create: `src/components/MainScreenPhotoStates.test.js`
- Modify: `src/locales/en/camera.js`
- Modify: `src/index.css`

- [ ] **Step 1: Add the localized retry copy**

Add this key under `photo` in `src/locales/en/camera.js`:

```js
photo: {
  loadRetry: 'Try loading again',
  sent: 'Sent',
  liked: 'Loved',
  like: 'Love this photo',
  unlike: 'Remove love',
  likedToast: 'Your photo got some love.',
  sentToast: 'Your photo is on its way.'
}
```

- [ ] **Step 2: Write a failing Main Feed source contract test**

Create `src/components/MainScreenPhotoStates.test.js`:

```js
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const mainSource = readFileSync(new URL('./MainScreen.jsx', import.meta.url), 'utf8');

test('Main Feed uses resilient photos and a retry-only load failure action', () => {
  assert.match(mainSource, /<ResilientPhotoImage/);
  assert.match(mainSource, /onStatusChange=\{\(status\) => handlePhotoImageStatus/);
  assert.match(mainSource, /t\('photo\.loadRetry'\)/);
  assert.match(mainSource, /handleRetryPhotoImage\(photo\.id\)/);
});

test('remote load failure branch does not expose the upload delete action', () => {
  assert.match(mainSource, /isPhotoImageFailed/);
  assert.doesNotMatch(
    mainSource,
    /isPhotoImageFailed[\s\S]{0,500}handleDeleteLocalPhoto/
  );
});
```

- [ ] **Step 3: Run the source contract test and verify failure**

Run:

```bash
node --test src/components/MainScreenPhotoStates.test.js
```

Expected: FAIL because Main Feed still renders a raw image and has no remote image retry state.

- [ ] **Step 4: Add per-photo status and retry state**

Import the shared component and shadcn Button:

```jsx
import ResilientPhotoImage, { PHOTO_IMAGE_STATUS } from './ResilientPhotoImage';
import { Button } from '@/components/ui/button';
```

Add state near the other Main Feed state declarations:

```jsx
const [photoImageStatuses, setPhotoImageStatuses] = useState({});
const [photoImageRetryKeys, setPhotoImageRetryKeys] = useState({});
```

Add handlers that update only the affected photo:

```jsx
function handlePhotoImageStatus(photoId, status) {
  setPhotoImageStatuses((current) => (
    current[photoId] === status
      ? current
      : { ...current, [photoId]: status }
  ));
}

function handleRetryPhotoImage(photoId) {
  setPhotoImageRetryKeys((current) => ({
    ...current,
    [photoId]: (current[photoId] || 0) + 1
  }));
}
```

- [ ] **Step 5: Replace the Main Feed raw image**

Inside the photo map, derive:

```jsx
const photoImageStatus = photoImageStatuses[photo.id] || PHOTO_IMAGE_STATUS.LOADING;
const isPhotoImageLoaded = photoImageStatus === PHOTO_IMAGE_STATUS.LOADED;
const isPhotoImageFailed = photoImageStatus === PHOTO_IMAGE_STATUS.FAILED;
```

Replace the raw image with:

```jsx
<ResilientPhotoImage
  src={photo.photoUrl}
  alt={t('sharedMoment')}
  retryKey={photoImageRetryKeys[photo.id] || 0}
  onStatusChange={(status) => handlePhotoImageStatus(photo.id, status)}
  loading="lazy"
  decoding="async"
  draggable={false}
/>
```

Render captions only when `isPhotoImageLoaded` so they do not obscure either the Skeleton or the fallback.

- [ ] **Step 6: Add the retry-only metadata branch**

Preserve the existing local sending and local failed branches first. Add the remote image failure branch before normal metadata:

```jsx
) : isPhotoImageFailed ? (
  <div className="photo-meta-row photo-local-actions failed photo-image-failed-actions">
    <Button
      className="photo-retry-btn"
      type="button"
      onClick={() => handleRetryPhotoImage(photo.id)}
    >
      {t('photo.loadRetry')}
    </Button>
  </div>
) : (
```

This ordering ensures a failed local upload retains its current retry-and-delete controls instead of being replaced by the remote image state.

- [ ] **Step 7: Align the shadcn Button with the existing failed-action row**

Add a narrow rule in `src/index.css` rather than changing shared Button variants:

```css
.photo-image-failed-actions .photo-retry-btn {
  width: 100%;
}
```

Retain the existing `.photo-retry-btn` visual treatment so the new action matches failed uploads.

- [ ] **Step 8: Run focused Main Feed checks**

Run:

```bash
node --test src/components/MainScreenPhotoStates.test.js src/components/StartupOptimization.test.js
npx eslint src/components/MainScreen.jsx src/locales/en/camera.js
```

Expected: PASS; the Main Feed uses the shared image, local upload controls remain present, and the remote broken-photo branch contains only the loading retry action.

- [ ] **Step 9: Commit Main Feed integration**

```bash
git add src/components/MainScreen.jsx src/components/MainScreenPhotoStates.test.js src/locales/en/camera.js src/index.css
git commit -m "add retry state to feed photos"
```

### Task 5: Complete Regression And Build Verification

**Files:**
- Verify only; modify implementation files only when a failing check identifies a POC-102 regression.

- [ ] **Step 1: Run the complete unit suite**

Run:

```bash
npm run test:unit
```

Expected: PASS. Note that `npm test` is not defined in this repository; `test:unit` is the canonical suite.

- [ ] **Step 2: Run frontend lint**

Run:

```bash
npm run lint
```

Expected: PASS with no ESLint errors.

- [ ] **Step 3: Build the production bundle**

Run:

```bash
npm run build
```

Expected: PASS and a production bundle written to `dist/`.

- [ ] **Step 4: Verify the user-facing flows in a browser**

Run:

```bash
npm run dev
```

Verify at the local URL:

1. Main Feed shows a full-frame skeleton before a photo load completes.
2. A forced broken photo shows the gray centered `ImageOff` state after one automatic retry.
3. Main Feed shows only **Try loading again** and recovers when the source becomes available.
4. History shows tile skeletons and no retry UI for a broken thumbnail.
5. Selecting a broken History tile navigates to the same Main Feed photo.
6. A failed local upload still shows its original retry-and-delete controls.

Expected: all six checks match the approved design on desktop and a mobile viewport.

- [ ] **Step 5: Inspect the final diff for scope**

Run:

```bash
git status --short
git diff --check
git diff --stat HEAD~4..HEAD
```

Expected: only the files listed in this plan changed; no Firebase, upload queue, logo, avatar, camera preview, or captured-review code changed.
