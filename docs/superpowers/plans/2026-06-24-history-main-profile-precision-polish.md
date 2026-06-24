# History, Main, and Profile Precision Polish Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Polish History, Main, Profile, and the shared bottom navigation without changing layout, copy, feature placement, or application behavior.

**Architecture:** Keep the implementation CSS-led. Add one source-contract test that locks the approved visual rules, make only targeted JSX motion/class adjustments, and preserve all Firebase, camera, pagination, notification, analytics, and routing logic.

**Tech Stack:** React 19, Vite 8, Framer Motion 12, Tailwind CSS 4, shadcn/Radix components, Vitest, Node test runner, CSS

---

## File Structure

- Create `src/components/InterfacePolish.test.js`: source-contract tests for shared radii, image outlines, press scales, explicit transitions, typography, hit areas, and navigation surface treatment.
- Modify `src/index.css`: shared polish tokens and CSS for History, Main, Profile, and bottom navigation.
- Modify `src/components/HistoryScreen.jsx`: soften only the existing tile entrance animation.
- Modify `src/components/MainScreen.jsx`: correct existing Like and contextual navigation icon motion values; preserve all view and camera behavior.
- Modify `src/components/ProfileView.test.jsx`: update the existing exact Profile CSS contract to the approved shadow-ring treatment.
- Do not modify `src/components/ProfileView.jsx` unless a class hook is proven necessary; the current semantic structure already supports this pass.

### Task 1: Lock the precision-polish contract

**Files:**
- Create: `src/components/InterfacePolish.test.js`
- Modify: `src/components/GlassSurface.test.js`
- Modify: `src/components/ProfileView.test.jsx`
- Test: `src/components/InterfacePolish.test.js`
- Test: `src/components/GlassSurface.test.js`
- Test: `src/components/ProfileView.test.jsx`

- [ ] **Step 1: Write the failing source-contract test**

Create `src/components/InterfacePolish.test.js`:

```js
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const stylesheetSource = readFileSync(new URL('../index.css', import.meta.url), 'utf8');
const historySource = readFileSync(new URL('./HistoryScreen.jsx', import.meta.url), 'utf8');
const mainSource = readFileSync(new URL('./MainScreen.jsx', import.meta.url), 'utf8');

function cssRule(selector) {
  const escapedSelector = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = stylesheetSource.match(new RegExp(`${escapedSelector}\\s*\\{([^}]*)\\}`));
  return match?.[1] || '';
}

test('dark image surfaces use the shared inset pure-white outline', () => {
  const imageRule = cssRule('.camera-frame img,\n.camera-switch-overlay img,\n.review-photo-layer img,\n.history-tile img,\n.profile-avatar');

  assert.match(imageRule, /outline:\s*1px solid rgba\(255, 255, 255, 0\.1\)/);
  assert.match(imageRule, /outline-offset:\s*-1px/);
});

test('interactive controls use explicit transitions and restrained press scale', () => {
  for (const selector of [
    '.camera-tool-btn',
    '.photo-retry-btn',
    '.photo-delete-btn',
    '.like-btn',
    '.nav-item',
    '.history-tile',
    '.profile-action-button,\n.profile-danger-action,\n.profile-about-trigger'
  ]) {
    assert.doesNotMatch(cssRule(selector), /transition:\s*all/);
  }

  for (const selector of [
    '.camera-tool-btn:active',
    '.photo-retry-btn:active',
    '.photo-delete-btn:active',
    '.nav-item:active',
    '.history-tile:active'
  ]) {
    assert.match(cssRule(selector), /transform:\s*scale\(0\.96\)/);
  }

  assert.match(mainSource, /whileTap=\{\{ scale: 0\.96 \}\}/);
  assert.doesNotMatch(mainSource, /whileTap=\{\{ scale: 0\.86 \}\}/);
});

test('headings, supporting text, and dynamic time use stable typography', () => {
  assert.match(cssRule('.history-header h2'), /text-wrap:\s*balance/);
  assert.match(cssRule('.profile-identity h1'), /text-wrap:\s*balance/);
  assert.match(cssRule('.empty-state span'), /text-wrap:\s*pretty/);
  assert.match(cssRule('.profile-identity p'), /text-wrap:\s*pretty/);
  assert.match(cssRule('.photo-meta span'), /font-variant-numeric:\s*tabular-nums/);
});

test('navigation uses a shadow-ring instead of a depth border', () => {
  const navRule = cssRule('.bottom-nav');

  assert.match(navRule, /border:\s*0/);
  assert.match(navRule, /box-shadow:\s*0 0 0 1px rgba\(255, 255, 255, 0\.08\)/);
});

test('Profile cards use a shadow-ring instead of a depth border', () => {
  const profileCardRule = cssRule('.profile-glass-card');

  assert.match(profileCardRule, /border:\s*0/);
  assert.match(profileCardRule, /box-shadow:\s*0 0 0 1px rgba\(255, 255, 255, 0\.08\)/);
});

test('compact Profile links retain at least a 40px target', () => {
  const legalLinkRule = cssRule('.profile-legal-links a');

  assert.match(legalLinkRule, /min-height:\s*40px/);
  assert.match(legalLinkRule, /padding:\s*0 6px/);
});

test('existing contextual icon motion uses the approved values', () => {
  assert.match(mainSource, /initial=\{\{ opacity: 0, scale: 0\.25, filter: 'blur\(4px\)' \}\}/);
  assert.match(mainSource, /animate=\{\{ opacity: 1, scale: 1, filter: 'blur\(0px\)' \}\}/);
  assert.match(mainSource, /exit=\{\{ opacity: 0, scale: 0\.25, filter: 'blur\(4px\)' \}\}/);
  assert.match(mainSource, /transition=\{\{ type: 'spring', duration: 0\.3, bounce: 0 \}\}/);
  assert.match(historySource, /initial=\{\{ opacity: 0, scale: 0\.96 \}\}/);
});
```

- [ ] **Step 2: Update exact-value tests to describe the approved target**

In `src/components/GlassSurface.test.js`, change the navigation expectations:

```js
assert.match(navRule, /box-shadow:\s*0 0 0 1px rgba\(255, 255, 255, 0\.08\)/);
assert.match(navRule, /border:\s*0/);
```

Remove the old `box-shadow: none` and `1px` border expectations.

In the final structural test in `src/components/ProfileView.test.jsx`, replace the exact `.profile-glass-card` expectation with:

```js
expect(css).toContain(`.profile-glass-card {
  overflow: hidden;
  border: 0;
  border-radius: 24px;
  background: rgba(23, 23, 23, 0.68);
  box-shadow:
    0 0 0 1px rgba(255, 255, 255, 0.08),
    0 18px 48px rgba(0, 0, 0, 0.2);
  -webkit-backdrop-filter: blur(24px) saturate(130%);
  backdrop-filter: blur(24px) saturate(130%);
}`);
```

Replace the `.profile-danger-card` border assertion with:

```js
expect(css).toContain(`.profile-danger-card {
  box-shadow:
    0 0 0 1px rgba(255, 255, 255, 0.08),
    0 18px 48px rgba(0, 0, 0, 0.2);
}`);
```

- [ ] **Step 3: Run the focused tests and verify they fail for the intended reasons**

Run:

```bash
node --test src/components/InterfacePolish.test.js src/components/GlassSurface.test.js
npx vitest run src/components/ProfileView.test.jsx
```

Expected: FAIL because the CSS still has the old border/radius/outline/transition values and Main/History still have the old motion scales.

- [ ] **Step 4: Commit the red tests**

```bash
git add src/components/InterfacePolish.test.js src/components/GlassSurface.test.js src/components/ProfileView.test.jsx
git commit -m "test ui precision polish"
```

### Task 2: Polish shared surfaces, imagery, typography, and navigation

**Files:**
- Modify: `src/index.css:52-96`
- Modify: `src/index.css:755-918`
- Modify: `src/index.css:984-1044`
- Modify: `src/index.css:1299-1361`
- Modify: `src/index.css:1508-1570`
- Test: `src/components/InterfacePolish.test.js`
- Test: `src/components/GlassSurface.test.js`

- [ ] **Step 1: Add the shared photo-radius token**

Add to `:root` beside the existing surface tokens:

```css
--photo-radius: 44px;
```

- [ ] **Step 2: Normalize photo surfaces and typography**

Update the photo frame and shared image treatment:

```css
.camera-frame {
  border-radius: var(--photo-radius);
  box-shadow: 0 0 0 1px rgba(255, 255, 255, 0.05);
}

.camera-frame img,
.camera-switch-overlay img,
.review-photo-layer img,
.history-tile img,
.profile-avatar {
  outline: 1px solid rgba(255, 255, 255, 0.1);
  outline-offset: -1px;
}

.photo-meta span {
  font-variant-numeric: tabular-nums;
}

.empty-state strong,
.history-header h2,
.profile-identity h1,
.profile-alert-title {
  text-wrap: balance;
}

.empty-state span,
.profile-identity p,
.profile-inline-error,
.notification-setting-row p {
  text-wrap: pretty;
}
```

Do not change image dimensions, `aspect-ratio`, `object-fit`, or photo scrolling.

- [ ] **Step 3: Normalize Main control feedback**

Use explicit transitions and `0.96` active scale:

```css
.camera-tool-btn,
.photo-retry-btn,
.photo-delete-btn,
.like-btn {
  transition-property: transform, background-color, color, box-shadow;
  transition-duration: 160ms;
  transition-timing-function: ease-out;
}

.camera-tool-btn:active,
.photo-retry-btn:active,
.photo-delete-btn:active {
  transform: scale(0.96);
}

.camera-tool-btn,
.like-btn {
  box-shadow: 0 0 0 1px rgba(255, 255, 255, 0.06);
}

.camera-retry-btn {
  transition-property: transform, background-color;
  transition-duration: 160ms;
  transition-timing-function: ease-out;
}

.camera-retry-btn:active {
  transform: scale(0.96);
}
```

Keep the shutter’s existing inner-circle press animation unchanged.

- [ ] **Step 4: Replace the bottom-navigation depth border**

Update the navigation rules:

```css
.bottom-nav {
  border: 0;
  box-shadow: 0 0 0 1px rgba(255, 255, 255, 0.08);
}

.nav-item {
  transition-property: transform, background-color, color;
  transition-duration: 160ms;
  transition-timing-function: ease-out;
}

.nav-item.active {
  background: rgba(255, 255, 255, 0.11);
}
```

Keep its dimensions, placement, blur, three-column layout, and safe-area offset unchanged.

- [ ] **Step 5: Polish History CSS without changing its grid**

Add:

```css
.history-header h2 {
  text-wrap: balance;
}

.photo-load-more button,
.history-tile {
  transition-property: transform, background-color, box-shadow;
  transition-duration: 160ms;
  transition-timing-function: ease-out;
}

.photo-load-more button:active,
.history-tile:active {
  transform: scale(0.96);
}

.history-tile {
  box-shadow: 0 0 0 1px rgba(255, 255, 255, 0.06);
}
```

Do not change the three-column grid, `4px` gap, selection callback, pagination sentinel, or failed-image behavior.

- [ ] **Step 6: Run shared and History contract tests**

Run:

```bash
node --test --test-name-pattern="dark image|typography|navigation" src/components/InterfacePolish.test.js
node --test src/components/GlassSurface.test.js src/components/HistoryScreen.test.js
npx vitest run src/components/HistoryScreen.test.jsx
```

Expected: image, typography, History, and navigation assertions pass. Motion and Profile assertions remain intentionally pending for Tasks 3 and 4.

- [ ] **Step 7: Commit shared CSS polish**

```bash
git add src/index.css
git commit -m "polish shared app surfaces"
```

### Task 3: Correct existing History and Main motion values

**Files:**
- Modify: `src/components/HistoryScreen.jsx:60-67`
- Modify: `src/components/MainScreen.jsx:1437-1446`
- Modify: `src/components/MainScreen.jsx:1528-1541`
- Test: `src/components/InterfacePolish.test.js`
- Test: `src/components/MainScreenLikeButton.test.js`

- [ ] **Step 1: Soften the existing History tile entrance**

Change only the initial scale:

```jsx
initial={{ opacity: 0, scale: 0.96 }}
animate={{ opacity: 1, scale: 1 }}
transition={{ delay: i * 0.025 }}
```

Keep the existing stagger and photo-opening behavior.

- [ ] **Step 2: Correct Like press feedback**

Change:

```jsx
whileTap={{ scale: 0.96 }}
```

Do not change optimistic state, Firestore writes, rollback, color, or icon fill.

- [ ] **Step 3: Correct the existing Home/shutter contextual icon transition**

Use the same values for both navigation branches:

```jsx
<motion.span
  key="home"
  initial={{ opacity: 0, scale: 0.25, filter: 'blur(4px)' }}
  animate={{ opacity: 1, scale: 1, filter: 'blur(0px)' }}
  exit={{ opacity: 0, scale: 0.25, filter: 'blur(4px)' }}
  transition={{ type: 'spring', duration: 0.3, bounce: 0 }}
>
  <HomeIcon />
</motion.span>
```

```jsx
<motion.span
  key="shutter"
  className="mini-shutter-nav-icon"
  initial={{ opacity: 0, scale: 0.25, filter: 'blur(4px)' }}
  animate={{ opacity: 1, scale: 1, filter: 'blur(0px)' }}
  exit={{ opacity: 0, scale: 0.25, filter: 'blur(4px)' }}
  transition={{ type: 'spring', duration: 0.3, bounce: 0 }}
>
  <ShutterIcon />
</motion.span>
```

Keep `AnimatePresence mode="wait" initial={false}` unchanged.

- [ ] **Step 4: Run focused motion and behavior tests**

Run:

```bash
node --test --test-name-pattern="interactive controls|contextual icon motion" src/components/InterfacePolish.test.js
node --test src/components/MainScreenLikeButton.test.js
npx vitest run src/components/HistoryScreen.test.jsx
```

Expected: PASS.

- [ ] **Step 5: Commit motion corrections**

```bash
git add src/components/HistoryScreen.jsx src/components/MainScreen.jsx
git commit -m "refine ui motion feedback"
```

### Task 4: Polish Profile surfaces and compact targets

**Files:**
- Modify: `src/index.css:1572-2055`
- Test: `src/components/InterfacePolish.test.js`
- Test: `src/components/ProfileView.test.jsx`

- [ ] **Step 1: Replace Profile card depth borders with shadow-rings**

Update:

```css
.profile-glass-card {
  overflow: hidden;
  border: 0;
  border-radius: 24px;
  background: rgba(23, 23, 23, 0.68);
  box-shadow:
    0 0 0 1px rgba(255, 255, 255, 0.08),
    0 18px 48px rgba(0, 0, 0, 0.2);
  -webkit-backdrop-filter: blur(24px) saturate(130%);
  backdrop-filter: blur(24px) saturate(130%);
}

.profile-danger-card {
  box-shadow:
    0 0 0 1px rgba(255, 255, 255, 0.08),
    0 18px 48px rgba(0, 0, 0, 0.2);
}
```

Retain `.profile-field-row` borders because they are structural dividers.

- [ ] **Step 2: Make nested About radii concentric**

The About card has `6px` padding. Keep the outer `24px` card radius and change the inner trigger to `18px`:

```css
.profile-about-trigger {
  border-radius: 18px;
}
```

- [ ] **Step 3: Normalize Profile interaction feedback**

Add:

```css
.profile-action-button,
.profile-danger-action,
.profile-about-trigger,
.profile-alert-button,
.notification-switch,
.notification-diagnostics-toggle,
.notification-diagnostics-actions .btn-ghost {
  transition-property: transform, background-color, color, box-shadow;
  transition-duration: 160ms;
  transition-timing-function: ease-out;
}

.profile-action-button:active,
.profile-danger-action:active,
.profile-about-trigger:active,
.profile-alert-button:active,
.notification-switch:active,
.notification-diagnostics-toggle:active,
.notification-diagnostics-actions .btn-ghost:active {
  transform: scale(0.96);
}
```

Do not add a scale to text inputs or the avatar.

- [ ] **Step 4: Expand compact legal-link targets**

Update:

```css
.profile-legal-links a {
  display: inline-flex;
  align-items: center;
  min-height: 40px;
  padding: 0 6px;
}
```

Keep the links’ current text, prevented navigation behavior, and center alignment.

- [ ] **Step 5: Preserve exact diagnostics and notification structure**

Make no changes to:

- `src/components/NotificationSettings.jsx`
- `ProfileView`’s `notificationControls` props
- diagnostics labels, buttons, data rows, or open/closed behavior
- logout and remove-pairing dialog actions

Confirm the diff contains CSS-only Profile changes.

- [ ] **Step 6: Run Profile tests**

Run:

```bash
node --test --test-name-pattern="Profile cards|compact Profile links" src/components/InterfacePolish.test.js
npx vitest run src/components/ProfileView.test.jsx src/components/NotificationSettings.test.jsx
```

Expected: PASS.

- [ ] **Step 7: Commit Profile polish**

```bash
git add src/index.css src/components/ProfileView.test.jsx
git commit -m "polish profile surfaces"
```

### Task 5: Full verification and visual regression pass

**Files:**
- Verify: `src/index.css`
- Verify: `src/components/HistoryScreen.jsx`
- Verify: `src/components/MainScreen.jsx`
- Verify: `src/components/ProfileView.jsx`
- Verify: `src/components/InterfacePolish.test.js`

- [ ] **Step 1: Run the complete automated suite**

Run:

```bash
npm run test:unit
npm run lint
npm run build
```

Expected:

- Unit tests pass.
- ESLint exits with no errors.
- Vite produces `dist/` successfully.

- [ ] **Step 2: Check CSS quality constraints**

Run:

```bash
rg -n "transition:\\s*all|will-change:\\s*all|scale\\(0\\.[0-8][0-9]\\)|whileTap=\\{\\{ scale: 0\\.[0-8][0-9]" src/index.css src/components/HistoryScreen.jsx src/components/MainScreen.jsx src/components/ProfileView.jsx
```

Expected: no matches in the touched UI.

- [ ] **Step 3: Inspect the implementation diff**

Run:

```bash
git diff --check
git diff -- src/index.css src/components/HistoryScreen.jsx src/components/MainScreen.jsx src/components/ProfileView.jsx src/components/InterfacePolish.test.js src/components/GlassSurface.test.js src/components/ProfileView.test.jsx
```

Expected:

- No whitespace errors.
- No data, Firebase, camera, upload, notification, analytics, pagination, routing, copy, or localization changes.
- Existing unrelated `README.md` changes remain untouched.

- [ ] **Step 4: Perform focused mobile visual checks**

Start the app:

```bash
npm run dev
```

At a mobile viewport no wider than `440px`, verify:

- History: loading, empty, populated, broken thumbnail, load-more retry, tile press, and photo selection.
- Main: camera-ready, camera error/retry, capture review, caption, send, feed photo, Like, queued/failed upload, and image retry.
- Profile: identity, avatar fallback/image, name edit/error, notification settings and diagnostics, About open/closed, legal targets, logout dialog, and remove-pairing dialog.
- Bottom navigation: each active state, Home-to-shutter icon swap, repeated Home tap, and horizontal view swipe.
- Safe-area padding is intact and no hit areas overlap.

- [ ] **Step 5: Commit any verification-only corrections**

If visual verification required a correction, rerun the relevant focused tests plus `npm run lint` and `npm run build`, then commit only the correction:

```bash
git add src/index.css src/components/HistoryScreen.jsx src/components/MainScreen.jsx src/components/ProfileView.jsx src/components/InterfacePolish.test.js src/components/GlassSurface.test.js src/components/ProfileView.test.jsx
git commit -m "fix ui polish regressions"
```

If no correction was needed, do not create an empty commit.
