# Like Button Active Regression Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restore immediate active liked state when a user taps the like button.

**Architecture:** `usePaginatedPhotos` owns the photo arrays rendered by `MainScreen`, so it needs a narrow local updater for optimistic UI changes. `MainScreen.handleLikePhoto` should apply the local `liked` change before Firestore writes and roll it back if a write fails.

**Tech Stack:** React, Vite, Firebase Firestore, Node test runner.

---

### Task 1: Regression Tests

**Files:**
- Modify: `src/hooks/usePaginatedPhotos.test.js`
- Create: `src/components/MainScreenLikeButton.test.js`

- [ ] **Step 1: Write failing tests**

Add a hook test that expects `updatePhotoLocal` to be exposed and a MainScreen source test that expects `handleLikePhoto` to call it before `updateDoc` and roll back in `catch`.

- [ ] **Step 2: Verify red**

Run: `node --test src/hooks/usePaginatedPhotos.test.js src/components/MainScreenLikeButton.test.js`
Expected: FAIL because current `0.2.25` code has no `updatePhotoLocal`.

### Task 2: Optimistic Like Fix

**Files:**
- Modify: `src/hooks/usePaginatedPhotos.js`
- Modify: `src/components/MainScreen.jsx`

- [ ] **Step 1: Restore local updater**

Add `updatePhotoLocal(photoId, updater)` to update `firstPage`, `olderPages`, and `firstPageRef`.

- [ ] **Step 2: Use updater in `handleLikePhoto`**

Destructure `updatePhotoLocal`, set `{ liked: nextLiked }` before Firestore writes, write `nextLiked`, and roll back to `{ liked: isLiked }` on error.

- [ ] **Step 3: Verify green**

Run: `node --test src/hooks/usePaginatedPhotos.test.js src/components/MainScreenLikeButton.test.js`
Expected: PASS.

### Task 3: Release Metadata And Verification

**Files:**
- Modify: `package.json`
- Modify: `package-lock.json`

- [ ] **Step 1: Bump version**

Change app version from `0.2.25` to `0.2.26`.

- [ ] **Step 2: Run project checks**

Run: `npm run test:unit`, `npm run lint`, and `npm run build`.
Expected: all pass.
