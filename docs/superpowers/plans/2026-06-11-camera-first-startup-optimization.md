# Camera-First Startup Optimization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Keep camera startup immediate while limiting initial photo reads to five, paginating older photos in batches of ten, deferring hidden views, and replacing dynamic photo backgrounds with pure black.

**Architecture:** Add a shared `usePaginatedPhotos` hook that owns the only photos listener and merges one-shot older pages. `MainScreen` consumes that state for Home and passes it into a presentational, first-visit-mounted History screen; Profile uses the same first-visit mounting policy. Remove runtime palette/background work without changing Firestore data or backend configuration.

**Tech Stack:** React 19, Vite, Firebase Firestore modular SDK, native image lazy loading, IntersectionObserver, node:test/Vitest, ESLint.

---

## File Structure

- Create `src/hooks/usePaginatedPhotos.js`: newest-five listener, pagination cursor, page merging, loading/error state, and guarded `loadMore`.
- Create `src/hooks/usePaginatedPhotos.test.js`: source-level contract and pure merge-helper tests.
- Create `src/components/LazyViewMounting.test.js`: first-visit mounting and shared History data regression checks.
- Create `src/components/StaticBackground.test.js`: static-black and removed palette/runtime background checks.
- Modify `src/firebase.js`: export `limit` and `startAfter`.
- Modify `src/components/MainScreen.jsx`: consume the hook, remove photo subscription/palette work, add sentinels, lazy-mount History/Profile, and lazy-load feed images.
- Modify `src/components/HistoryScreen.jsx`: remove Firestore ownership and render shared photos plus pagination state.
- Modify `src/components/HistoryScreen.test.js`: assert presentational/shared-data and pagination behavior.
- Modify `src/components/AppBackground.jsx`: reduce to a static background surface.
- Modify `src/App.jsx`: remove background source state and callback wiring.
- Modify `src/index.css`: enforce pure black and style pagination sentinel/retry state without redesigning views.
- Modify `package.json` and `package-lock.json`: patch version bump.

---

### Task 1: Shared Paginated Photo Data

**Files:**
- Create: `src/hooks/usePaginatedPhotos.js`
- Create: `src/hooks/usePaginatedPhotos.test.js`
- Modify: `src/firebase.js`

- [ ] **Step 1: Write failing pagination contract tests**

Create tests that import a pure `mergePhotoPages(firstPage, olderPages)` helper and inspect the hook source for these contracts:

```js
test('merges realtime and older pages in order without duplicate ids', () => {
  const result = mergePhotoPages(
    [{ id: 'new-2' }, { id: 'new-1' }],
    [[{ id: 'new-1' }, { id: 'old-1' }], [{ id: 'old-2' }]]
  );
  assert.deepEqual(result.map((photo) => photo.id), ['new-2', 'new-1', 'old-1', 'old-2']);
});

test('uses a realtime limit of five and older page limit of ten', () => {
  assert.match(source, /limit\(INITIAL_PHOTO_LIMIT\)/);
  assert.match(source, /const INITIAL_PHOTO_LIMIT = 5/);
  assert.match(source, /const PHOTO_PAGE_SIZE = 10/);
  assert.match(source, /startAfter\(cursor\)/);
});
```

- [ ] **Step 2: Run the tests and verify RED**

Run `node --test src/hooks/usePaginatedPhotos.test.js`.

Expected: FAIL because the hook module does not exist.

- [ ] **Step 3: Export Firestore pagination helpers**

In `src/firebase.js`, import and export `limit` and `startAfter` using the existing aliased Firebase pattern:

```js
import {
  limit as realLimit,
  startAfter as realStartAfter
} from 'firebase/firestore';

const limit = realLimit;
const startAfter = realStartAfter;
```

- [ ] **Step 4: Implement the shared hook**

Implement these public exports:

```js
export const INITIAL_PHOTO_LIMIT = 5;
export const PHOTO_PAGE_SIZE = 10;
export function mergePhotoPages(firstPage, olderPages) { /* id-based stable merge */ }
export function usePaginatedPhotos(coupleId) {
  return {
    photos,
    loadingPhotos,
    loadingMorePhotos,
    photoLoadError,
    hasMorePhotos,
    loadMorePhotos
  };
}
```

The first query must use `orderBy('timestamp', 'desc')` and `limit(5)` with `onSnapshot`. `loadMorePhotos` must use `getDocs`, `startAfter` the final loaded document snapshot, `limit(10)`, ignore concurrent calls, preserve loaded pages on error, and set `hasMorePhotos` false when fewer than ten documents return.

- [ ] **Step 5: Run the focused tests and verify GREEN**

Run `node --test src/hooks/usePaginatedPhotos.test.js`.

Expected: all hook tests PASS.

- [ ] **Step 6: Commit the data layer**

```bash
git add src/firebase.js src/hooks/usePaginatedPhotos.js src/hooks/usePaginatedPhotos.test.js
git commit -m "add paginated photo data"
```

---

### Task 2: Remove Duplicate History Subscription

**Files:**
- Modify: `src/components/HistoryScreen.jsx`
- Modify: `src/components/HistoryScreen.test.js`
- Modify: `src/components/MainScreen.jsx`

- [ ] **Step 1: Write failing History ownership tests**

Add assertions that `HistoryScreen` accepts `photos`, `loading`, `hasMore`, `loadingMore`, `loadError`, and `onLoadMore`; does not import Firebase; and does not contain `onSnapshot`, `query`, or `collection`.

- [ ] **Step 2: Run the History test and verify RED**

Run `node --test src/components/HistoryScreen.test.js`.

Expected: FAIL because History still owns a Firestore listener.

- [ ] **Step 3: Convert History to a presentational view**

Change the component boundary to:

```jsx
export default function HistoryScreen({
  photos,
  loading,
  hasMore,
  loadingMore,
  loadError,
  onLoadMore,
  onSelectPhoto
})
```

Keep existing empty/loading/grid behavior. Add an observed end sentinel and a retry button that calls `onLoadMore`. Preserve `loading="lazy"`, `decoding="async"`, and History selection tracking.

- [ ] **Step 4: Connect MainScreen to the shared hook**

Replace local photo state and the unlimited photo `onSnapshot` effect with `usePaginatedPhotos(coupleId)`. Pass shared data and pagination actions to History. Preserve the current seed-photo safeguard, like updates, active-photo tracking required by Home, and History-to-Home selection behavior.

- [ ] **Step 5: Run focused tests and verify GREEN**

Run:

```bash
node --test src/hooks/usePaginatedPhotos.test.js src/components/HistoryScreen.test.js
```

Expected: all focused tests PASS.

- [ ] **Step 6: Commit shared History data**

```bash
git add src/components/MainScreen.jsx src/components/HistoryScreen.jsx src/components/HistoryScreen.test.js
git commit -m "share paginated photos with history"
```

---

### Task 3: Lazy Image Loading and Home Pagination

**Files:**
- Modify: `src/components/MainScreen.jsx`
- Modify: `src/index.css`
- Create: `src/components/PhotoLoadingPolicy.test.js`

- [ ] **Step 1: Write failing image-policy tests**

Assert every shared feed `<img>` uses `loading="lazy"` and `decoding="async"`, no shared photo uses `loading="eager"`, and Main renders a Home pagination sentinel wired to `loadMorePhotos`.

- [ ] **Step 2: Run the test and verify RED**

Run `node --test src/components/PhotoLoadingPolicy.test.js`.

Expected: FAIL because feed images are eager and Home has no pagination sentinel.

- [ ] **Step 3: Apply lazy image policy**

Update the feed image to:

```jsx
<img
  src={photo.photoUrl}
  alt="Shared moment"
  loading="lazy"
  decoding="async"
  draggable={false}
/>
```

- [ ] **Step 4: Add the Home end sentinel**

Add a small reusable local `PhotoLoadMoreSentinel` component using `IntersectionObserver` with the feed as root and a positive `rootMargin`. It calls the guarded hook action only when `hasMorePhotos` is true and exposes retry UI when `photoLoadError` exists.

- [ ] **Step 5: Run focused tests and verify GREEN**

Run `node --test src/components/PhotoLoadingPolicy.test.js src/components/HistoryScreen.test.js`.

Expected: all image and History tests PASS.

- [ ] **Step 6: Commit image and Home pagination work**

```bash
git add src/components/MainScreen.jsx src/components/PhotoLoadingPolicy.test.js src/index.css
git commit -m "lazy load paginated photos"
```

---

### Task 4: First-Visit Mount History and Profile

**Files:**
- Modify: `src/components/MainScreen.jsx`
- Create: `src/components/LazyViewMounting.test.js`

- [ ] **Step 1: Write failing first-visit mounting tests**

Assert Main initializes visited views with Home only, marks a view visited in `goToView`, and conditionally renders History/Profile content while retaining all three `.shell-view` track sections.

- [ ] **Step 2: Run the test and verify RED**

Run `node --test src/components/LazyViewMounting.test.js`.

Expected: FAIL because History and Profile currently mount at startup.

- [ ] **Step 3: Implement persistent first-visit mounting**

Add state equivalent to:

```js
const [mountedViews, setMountedViews] = useState(() => new Set(['home']));

const goToView = (view) => {
  setMountedViews((current) => current.has(view)
    ? current
    : new Set([...current, view]));
  // preserve existing Home re-tap and navigation behavior
};
```

Render lightweight section shells for all three positions, but only render `HistoryScreen` or `ProfileView` after its key enters `mountedViews`. Ensure swipe navigation marks the destination mounted before changing `activeView`.

- [ ] **Step 4: Run focused tests and verify GREEN**

Run `node --test src/components/LazyViewMounting.test.js src/components/HistoryScreen.test.js`.

Expected: all mounting and History tests PASS.

- [ ] **Step 5: Commit deferred view mounting**

```bash
git add src/components/MainScreen.jsx src/components/LazyViewMounting.test.js
git commit -m "defer hidden main views"
```

---

### Task 5: Remove Dynamic Background Runtime

**Files:**
- Modify: `src/App.jsx`
- Modify: `src/components/AppBackground.jsx`
- Modify: `src/components/MainScreen.jsx`
- Modify: `src/index.css`
- Create: `src/components/StaticBackground.test.js`

- [ ] **Step 1: Write failing static-background tests**

Assert App has no `backgroundSource` state or `onBackgroundSourceChange` prop, Main has no palette imports/extraction/background callback, feed rendering has no palette normalization, and `AppBackground` renders only a static class with no image/blur/motion source.

- [ ] **Step 2: Run the test and verify RED**

Run `node --test src/components/StaticBackground.test.js`.

Expected: FAIL because the dynamic background and palette send path still exist.

- [ ] **Step 3: Remove background source wiring**

Delete `backgroundSource` state from `App`, render `<AppBackground />` without a source, and remove the callback prop from `MainScreen`.

- [ ] **Step 4: Make AppBackground static black**

Reduce `AppBackground.jsx` to a static decorative surface:

```jsx
export default function AppBackground() {
  return <div className="app-background app-background--static" aria-hidden="true" />;
}
```

Set the app/root background and `.app-background--static` to `#000`, removing obsolete blob, blur, image, transition, and animation rules that are no longer referenced.

- [ ] **Step 5: Remove runtime palette work**

From `MainScreen`, remove palette utility imports, cache refs, active-photo background effect, palette normalization during feed rendering, palette extraction timeout logic, and the `paletteV2` upload argument/payload. Do not edit `firestore.rules`, scripts, Functions, or existing stored documents.

- [ ] **Step 6: Run focused tests and verify GREEN**

Run `node --test src/components/StaticBackground.test.js src/components/PhotoLoadingPolicy.test.js`.

Expected: all background and image-policy tests PASS.

- [ ] **Step 7: Commit static background work**

```bash
git add src/App.jsx src/components/AppBackground.jsx src/components/MainScreen.jsx src/components/StaticBackground.test.js src/index.css
git commit -m "remove dynamic photo background"
```

---

### Task 6: Version, Regression Verification, and Browser QA

**Files:**
- Modify: `package.json`
- Modify: `package-lock.json`

- [ ] **Step 1: Bump the patch version**

Run `npm version patch --no-git-tag-version` and verify both package files move from `0.2.22` to `0.2.23`.

- [ ] **Step 2: Run all automated checks**

Run:

```bash
npm run test:unit
npm run lint
npm run lint:functions
npm run build
```

Expected: every command exits 0. The build should no longer include runtime photo-background work in the main application path.

- [ ] **Step 3: Start local development services**

Start Firebase emulators with `npm run emulators` and the Vite server with `npm run dev`. Keep both sessions running for browser QA.

- [ ] **Step 4: Verify camera-first startup in the browser**

Using two seeded/emulator users where needed, confirm:

- camera requests/starts immediately after Main opens;
- background remains pure black with no blurred photo layer;
- only five initial photo documents appear in the loaded list;
- shared photos load lazily below the camera;
- approaching the list end adds up to ten older records without duplicates;
- History is created on first History navigation and uses the already loaded list;
- Profile is created on first Profile navigation;
- returning to either view preserves its mounted state;
- History selection still opens the matching Home photo;
- capture, review, caption, send, like, and Profile actions still work.

- [ ] **Step 5: Inspect network and listener behavior**

Confirm there is one photos query listener, no second History photos listener, no palette extraction delay before upload, and no photo-derived background image request.

- [ ] **Step 6: Stop local sessions and commit the release version**

```bash
git add package.json package-lock.json
git commit -m "bump version for startup optimization"
```

- [ ] **Step 7: Review final diff**

Run `git status --short` and `git diff HEAD~6 --stat`. Confirm no Firestore rules, indexes, Functions, backfill scripts, generated `dist/`, or unrelated user changes were included.
