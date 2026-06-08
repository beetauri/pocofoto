# Mobile Hover Policy Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stop touch devices from keeping hover visuals stuck after taps while preserving desktop hover behavior.

**Architecture:** Treat hover as a desktop-only enhancement. Keep persistent visual meaning on explicit state selectors like `.active` and `photo.liked`, and keep mobile feedback on short `:active` or Framer `whileTap` interactions.

**Tech Stack:** React, Vite, Tailwind v4, shadcn-style button variants, Node test runner.

---

### Task 1: Add Desktop-Only Hover Regression Coverage

**Files:**
- Create: `src/components/mobileHoverPolicy.test.js`

- [ ] **Step 1: Write the failing test**

```js
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const stylesheetSource = readFileSync(new URL('../index.css', import.meta.url), 'utf8');
const appButtonSource = readFileSync(new URL('./ui/button.jsx', import.meta.url), 'utf8');
const authScreenSource = readFileSync(new URL('./AuthScreen.jsx', import.meta.url), 'utf8');

function stripDesktopHoverMedia(css) {
  return css.replace(/@media\s*\(hover:\s*hover\)\s*and\s*\(pointer:\s*fine\)\s*\{[\s\S]*?\n\}/g, '');
}

test('app css keeps hover selectors inside desktop pointer media queries', () => {
  assert.doesNotMatch(stripDesktopHoverMedia(stylesheetSource), /:[\w-]*hover\b/);
});

test('app-owned Tailwind hover utilities are desktop-pointer gated', () => {
  const appOwnedButtonSources = [appButtonSource, authScreenSource].join('\n');

  assert.doesNotMatch(appOwnedButtonSources, /(?<!\]:)hover:/);
  assert.match(appOwnedButtonSources, /\[@media\(hover:hover\)_and_\(pointer:fine\)\]:hover:/);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test:unit -- src/components/mobileHoverPolicy.test.js`
Expected: FAIL because existing CSS and Tailwind class strings contain raw hover selectors.

### Task 2: Gate Hover Styling To Desktop Pointers

**Files:**
- Modify: `src/index.css`
- Modify: `src/components/ui/button.jsx`
- Modify: `src/components/AuthScreen.jsx`

- [ ] **Step 1: Move CSS hover selectors into one desktop-pointer media query**

Move `.icon-btn:hover`, `.btn-primary:hover`, update-banner hover styles, camera retry hover, `.camera-tool-btn:hover`, `.nav-item:hover`, menu/profile hover styles into:

```css
@media (hover: hover) and (pointer: fine) {
  selector:hover {
    property: value;
  }
}
```

Keep `.camera-tool-btn.active` and `.nav-item.active` outside the media query so selected state still works on mobile.

- [ ] **Step 2: Replace app-owned Tailwind `hover:` utilities with desktop-pointer variants**

Use literal Tailwind arbitrary media variants:

```txt
[@media(hover:hover)_and_(pointer:fine)]:hover:bg-primary/80
```

- [ ] **Step 3: Bump version**

Update `package.json` and `package-lock.json` from `0.2.13` to `0.2.14`.

### Task 3: Verify

**Files:**
- Test: `src/components/mobileHoverPolicy.test.js`

- [ ] **Step 1: Run focused test**

Run: `npm run test:unit -- src/components/mobileHoverPolicy.test.js`
Expected: PASS.

- [ ] **Step 2: Run full verification**

Run: `npm run test:unit`
Expected: PASS.

Run: `npm run build`
Expected: PASS.
