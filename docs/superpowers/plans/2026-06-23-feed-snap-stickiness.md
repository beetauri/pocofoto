# Feed Snap Stickiness Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix sticky vertical scrolling between the live camera slide and the newest photo slide without changing feed order or adding forced auto-scroll.

**Architecture:** Keep the existing single Home `.reels-feed` and slide structure. Reduce over-constrained CSS snap behavior by removing the mandatory per-slide `scroll-snap-stop: always` while preserving mandatory vertical snap alignment.

**Tech Stack:** React, Vite, CSS scroll snap, Node test runner source checks.

---

### Task 1: Regression Test For Feed Snap Rules

**Files:**
- Modify: `src/components/StartupOptimization.test.js`
- Modify: `src/index.css`

- [ ] **Step 1: Write the failing test**

Add this test to `src/components/StartupOptimization.test.js`:

```js
test('Home feed keeps snap paging without hard-stopping every slide', () => {
  assert.match(indexCssSource, /\.reels-feed\s*\{[\s\S]*scroll-snap-type:\s*y mandatory/);
  assert.match(indexCssSource, /\.reels-slide\s*\{[\s\S]*scroll-snap-align:\s*start/);
  assert.doesNotMatch(indexCssSource, /\.reels-slide\s*\{[\s\S]*scroll-snap-stop:\s*always/);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- src/components/StartupOptimization.test.js`

Expected: FAIL because `.reels-slide` currently sets `scroll-snap-stop: always`.

- [ ] **Step 3: Write minimal implementation**

In `src/index.css`, remove the `scroll-snap-stop: always;` declaration from `.reels-slide`.

- [ ] **Step 4: Run focused test to verify it passes**

Run: `npm test -- src/components/StartupOptimization.test.js`

Expected: PASS.

- [ ] **Step 5: Run full verification**

Run:

```bash
npm run lint
npm run build
```

Expected: both commands exit 0.

### Task 2: Manual Browser Check

**Files:**
- No file changes.

- [ ] **Step 1: Start local dev server**

Run: `npm run dev -- --host 127.0.0.1`

Expected: Vite serves a local URL.

- [ ] **Step 2: Inspect Home feed behavior**

Use the local app or browser automation to check that `.reels-feed` still has `scroll-snap-type: y mandatory`, `.reels-slide` still has `scroll-snap-align: start`, and `.reels-slide` no longer has `scroll-snap-stop: always`.

- [ ] **Step 3: Stop dev server**

Stop the local server after the check.

### Task 3: iOS Scroll Settle Fallback

**Files:**
- Create: `src/lib/feedSnap.js`
- Create: `src/lib/feedSnap.test.js`
- Modify: `src/components/MainScreen.jsx`
- Modify: `src/components/StartupOptimization.test.js`

- [ ] **Step 1: Add nearest-snap helper test**

Run: `node --test src/lib/feedSnap.test.js`

Expected before implementation: FAIL because `src/lib/feedSnap.js` does not exist.

- [ ] **Step 2: Add nearest-snap helper**

Implement `getNearestFeedSnapTop(scrollTop, slideTops)` so it returns the closest slide top and keeps the current scroll top when no slide tops are available.

- [ ] **Step 3: Wire Home feed scroll settling**

In `src/components/MainScreen.jsx`, listen for `.reels-feed` scroll events, debounce until scrolling quiets down, collect `.reels-slide` `offsetTop` values, and scroll to the nearest top. This is a fallback for iOS/PWA cases where native CSS snap leaves the feed parked between slides.

- [ ] **Step 4: Verify**

Run:

```bash
node --test src/lib/feedSnap.test.js src/components/StartupOptimization.test.js
npm run test:unit
npm run lint
npm run build
```

Expected: all commands exit 0.
