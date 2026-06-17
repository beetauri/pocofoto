# Inline Queue Send Visibility Fix Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Keep the newly queued local pending photo visible after tapping Send instead of snapping the feed back to the camera.

**Architecture:** Reuse the existing `pendingScrollPhotoId` + `useLayoutEffect` path in `MainScreen.jsx`, which already waits for a photo to exist in the merged `photos` array and scrolls the feed to that item. The send handler should enqueue the local photo, clear the review overlay, set the pending scroll target to the local photo id, and avoid calling `scrollToCamera('auto')`.

**Tech Stack:** React, existing Node source-level tests, existing feed scroll helper.

---

### Task 1: Add Regression Coverage

**Files:**
- Modify: `src/components/MainScreenLocalQueue.test.js`

- [ ] **Step 1: Add failing test**

Add this test:

```js
test('queued send scrolls to the local pending photo instead of hiding it at the camera', () => {
  assert.match(source, /setPendingScrollPhotoId\(localPhoto\.id\)/);
  assert.doesNotMatch(source, /setLocalPhotos\(\(current\) => appendLocalPhoto\(current, localPhoto\)\)[\s\S]*scrollToCamera\('auto'\)/);
});
```

- [ ] **Step 2: Run red test**

Run:

```bash
node --test src/components/MainScreenLocalQueue.test.js
```

Expected: FAIL because `handleSendReviewPhoto` currently calls `scrollToCamera('auto')`.

### Task 2: Fix Send Scroll Target

**Files:**
- Modify: `src/components/MainScreen.jsx`

- [ ] **Step 1: Replace camera scroll**

Change:

```js
scrollToCamera('auto');
```

to:

```js
setPendingScrollPhotoId(localPhoto.id);
```

inside `handleSendReviewPhoto`.

- [ ] **Step 2: Run targeted tests**

Run:

```bash
node --test src/components/MainScreenLocalQueue.test.js src/components/StartupOptimization.test.js
```

Expected: PASS.

- [ ] **Step 3: Run verification**

Run:

```bash
npm run lint
npm run build
```

Expected: PASS.

## Acceptance Mapping

- Tapping Send keeps the new pending item visible: `setPendingScrollPhotoId(localPhoto.id)` uses the existing feed item scroll effect after the local item appears in `photos`.
- Pending uploading UI is used: existing local item rendering shows `photo-local-status` with `Sending…`.
- No extra image download is introduced: local pending item continues to use the capture object URL.
