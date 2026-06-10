# Profile Balanced Glass Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the current Profile markup and legacy styling with the approved Balanced Glass Stack using registry shadcn components while preserving every existing Profile behavior.

**Architecture:** Extract a controlled `ProfileView` from `MainScreen.jsx`; keep Firebase, upload, toast, palette, and navigation ownership in `MainScreen`. Move both confirmation flows into the Profile component as controlled shadcn `AlertDialog` instances, and compose the screen from registry `Card`, `Collapsible`, `Separator`, `Button`, `Input`, and `Spinner` primitives.

**Tech Stack:** React 19, Vite 8, Tailwind CSS 4, shadcn `radix-luma`, Radix UI, Lucide React, Vitest, Testing Library, jsdom, Node test runner.

---

## File Map

- Create `src/components/ProfileView.jsx`: Profile presentation, local edit/About/dialog state, and calls to parent callbacks.
- Create `src/components/ProfileView.test.jsx`: interaction-level Profile coverage in jsdom.
- Create `src/test/setup.js`: shared Testing Library cleanup and DOM matcher setup.
- Create `src/components/ui/alert-dialog.jsx`: registry shadcn destructive confirmation primitive.
- Create `src/components/ui/card.jsx`: registry shadcn grouped-surface primitive.
- Create `src/components/ui/collapsible.jsx`: registry shadcn About disclosure primitive.
- Create `src/components/ui/separator.jsx`: registry shadcn grouping primitive.
- Modify `src/components/MainScreen.jsx`: import/render extracted Profile, delete local Profile/avatar/icon/dialog code, preserve hidden file input and parent handlers.
- Modify `src/index.css`: replace legacy Profile and confirmation selectors with Profile shell/avatar styles and semantic glass tokens; leave unrelated screens alone.
- Modify `vite.config.js`: add Vitest jsdom and setup configuration.
- Modify `eslint.config.js`: allow Vitest globals in test files if required by the chosen test syntax.
- Modify `package.json` and `package-lock.json`: add test dependencies, add the Vitest command to `test:unit`, and bump `0.2.20` to `0.2.21`.

## Task 1: Install Registry Primitives And Test Harness

**Files:**
- Create: `src/components/ui/alert-dialog.jsx`
- Create: `src/components/ui/card.jsx`
- Create: `src/components/ui/collapsible.jsx`
- Create: `src/components/ui/separator.jsx`
- Create: `src/test/setup.js`
- Modify: `package.json`
- Modify: `package-lock.json`
- Modify: `vite.config.js`
- Modify: `eslint.config.js`

- [ ] **Step 1: Add the approved shadcn primitives from the installed local CLI**

Run:

```bash
npm exec shadcn -- add alert-dialog card collapsible separator --yes
```

Expected: four registry files exist under `src/components/ui/`; no custom replacement primitives are created.

- [ ] **Step 2: Install interaction-test dependencies**

Run:

```bash
npm install --save-dev vitest jsdom @testing-library/react @testing-library/user-event @testing-library/jest-dom
```

Expected: the packages are added to `devDependencies` and the lockfile updates.

- [ ] **Step 3: Add the shared test setup**

Create `src/test/setup.js`:

```js
import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach } from 'vitest';

afterEach(() => cleanup());
```

- [ ] **Step 4: Configure Vitest without disturbing the production Vite build**

Add to `defineConfig` in `vite.config.js`:

```js
test: {
  environment: 'jsdom',
  setupFiles: ['./src/test/setup.js'],
  css: false,
},
```

Add a test-file override to `eslint.config.js` only if lint reports missing Vitest globals:

```js
{
  files: ['**/*.test.{js,jsx}'],
  languageOptions: {
    globals: {
      ...globals.browser,
      ...globals.node,
    },
  },
},
```

- [ ] **Step 5: Extend the existing unit-test script**

Change `package.json`:

```json
"test:unit": "node --test src/lib/*.test.js src/components/*.test.js && vitest run src/components/*.test.jsx"
```

- [ ] **Step 6: Verify the harness configuration before Profile tests exist**

Run:

```bash
npm run lint
node --test src/lib/*.test.js src/components/*.test.js
```

Expected: lint and all existing Node tests pass. Do not run the combined `test:unit` script until Task 2 creates the first JSX test file because Vitest treats an empty match as an error.

- [ ] **Step 7: Commit the foundation**

```bash
git add package.json package-lock.json vite.config.js eslint.config.js src/test/setup.js src/components/ui/alert-dialog.jsx src/components/ui/card.jsx src/components/ui/collapsible.jsx src/components/ui/separator.jsx
git commit -m "test: add profile interaction harness"
```

## Task 2: Define Profile Behavior With Failing Tests

**Files:**
- Create: `src/components/ProfileView.test.jsx`

- [ ] **Step 1: Create a reusable render helper with complete props**

Start `src/components/ProfileView.test.jsx` with:

```jsx
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import ProfileView from './ProfileView';

function renderProfile(overrides = {}) {
  const props = {
    displayName: 'Bilal',
    email: 'bilal@example.com',
    profilePic: '',
    partnerName: 'Alex',
    partnerEmail: 'alex@example.com',
    partnerPic: '',
    buildVersion: '0.2.21',
    buildCommit: 'abc1234',
    uploading: false,
    removingPairing: false,
    onPickPhoto: vi.fn(),
    onRemovePhoto: vi.fn(),
    onSaveDisplayName: vi.fn().mockResolvedValue(undefined),
    onLogout: vi.fn().mockResolvedValue(undefined),
    onRemovePairing: vi.fn().mockResolvedValue(undefined),
    pushDebugEnabled: false,
    pushDebugResult: '',
    registeringPushDebug: false,
    sendingPushDebug: false,
    onRegisterPushDebug: vi.fn(),
    onSendPushDebug: vi.fn(),
    ...overrides,
  };

  return { user: userEvent.setup(), props, ...render(<ProfileView {...props} />) };
}
```

- [ ] **Step 2: Add identity, relationship, and photo-action tests**

Cover these exact assertions:

```jsx
it('renders identity and partner name without partner email', () => {
  renderProfile();
  expect(screen.getByRole('heading', { name: 'Bilal' })).toBeInTheDocument();
  expect(screen.getByText('Alex')).toBeInTheDocument();
  expect(screen.queryByText('alex@example.com')).not.toBeInTheDocument();
  expect(screen.getByText('B')).toBeInTheDocument();
});

it('disables photo actions for upload and missing-photo states', () => {
  const { rerender, props } = renderProfile();
  expect(screen.getByRole('button', { name: 'Remove photo' })).toBeDisabled();
  rerender(<ProfileView {...props} uploading profilePic="photo.jpg" />);
  expect(screen.getByRole('button', { name: 'Change photo' })).toBeDisabled();
  expect(screen.getByRole('button', { name: 'Remove photo' })).toBeDisabled();
});
```

- [ ] **Step 3: Add inline display-name tests**

Test start/cancel, Enter save, Escape cancel, invalid `2-30` length, rejected save, and pending save. Use `await user.click(...)`, `await user.clear(...)`, `await user.type(...)`, and assert the callback receives the trimmed name exactly once.

Required assertions include:

```jsx
expect(screen.getByText('Display name must be 2-30 characters.')).toBeInTheDocument();
expect(props.onSaveDisplayName).toHaveBeenCalledWith('New Name');
expect(screen.getByText('Could not update display name.')).toBeInTheDocument();
expect(screen.getByRole('status', { name: 'Loading' })).toBeInTheDocument();
```

- [ ] **Step 4: Add About and diagnostics tests**

Verify About starts collapsed, expansion reveals `Privacy Notice`, `Terms of Use`, and `v0.2.21 (abc1234)`, diagnostics are absent by default, and debug mode reveals both existing debug actions only after expansion.

- [ ] **Step 5: Add distinct destructive-dialog tests**

Verify `Remove pairing` and `Log out` each open their own dialog, Cancel does not invoke callbacks, and Confirm invokes the matching callback once. Also verify the remove confirmation is disabled and labeled `Removing...` when `removingPairing` is true.

- [ ] **Step 6: Run the new suite and confirm the expected red state**

Run:

```bash
npx vitest run src/components/ProfileView.test.jsx
```

Expected: FAIL because `src/components/ProfileView.jsx` does not exist.

- [ ] **Step 7: Commit the failing behavioral contract**

```bash
git add src/components/ProfileView.test.jsx
git commit -m "test: define profile redesign behavior"
```

## Task 3: Build The Extracted Profile With Shadcn

**Files:**
- Create: `src/components/ProfileView.jsx`
- Modify: `src/components/ProfileView.test.jsx`

- [ ] **Step 1: Create Profile-local avatar and initials helpers**

Implement `initialsFor` and `Avatar` in `ProfileView.jsx`. Use a semantic `img` with an empty alt for decorative user imagery, preserve image-error fallback, and render initials in a circular element carrying `data-size="lg"` or `data-size="md"` for styling.

- [ ] **Step 2: Implement the approved component hierarchy**

Use this top-level structure:

```jsx
<section className="profile-screen" aria-label="Profile">
  <div className="profile-content">
    <header className="profile-identity">...</header>
    <Card className="profile-glass-card profile-partner-card">...</Card>
    <Card className="profile-glass-card profile-account-card">...</Card>
    <Card className="profile-glass-card profile-about-card">...</Card>
    <Card className="profile-glass-card profile-danger-card">...</Card>
  </div>
</section>
```

The partner card receives `partnerName` and `partnerPic`, but no `partnerEmail` prop or text.

- [ ] **Step 3: Implement inline display-name editing**

Preserve the current local state and validation logic. Replace native controls with `Button`, `Input`, and `Spinner`; keep autofocus, Enter, Escape, loading, cancel, and inline error behavior. Use Lucide `Pencil`, `Check`, and `X` icons with screen-reader labels on icon-only buttons.

- [ ] **Step 4: Implement About with Collapsible**

Use `Collapsible`, `CollapsibleTrigger asChild`, and `CollapsibleContent`. Add a chevron whose orientation follows `open`, legal links, version/build, and a debug-only Diagnostics subsection separated with `Separator`.

- [ ] **Step 5: Implement the danger area and AlertDialogs**

Keep separate local open states for logout and remove pairing. Use `AlertDialogCancel` and `AlertDialogAction`; prevent duplicate remove submissions while `removingPairing` is true. Dialog confirm handlers call `onLogout` or `onRemovePairing` exactly once.

- [ ] **Step 6: Run focused tests and fix only contract mismatches**

Run:

```bash
npx vitest run src/components/ProfileView.test.jsx
```

Expected: PASS for identity, edit, About, diagnostics, photo, and danger behavior.

- [ ] **Step 7: Commit the component**

```bash
git add src/components/ProfileView.jsx src/components/ProfileView.test.jsx
git commit -m "feat: build balanced profile view"
```

## Task 4: Integrate Profile And Remove Parent Dialog State

**Files:**
- Modify: `src/components/MainScreen.jsx`

- [ ] **Step 1: Import the extracted Profile component**

Add:

```js
import ProfileView from './ProfileView';
```

Remove Profile-only icon imports and helper functions from `MainScreen.jsx`: `Check`, `Link2Off`, `LogOut`, `Pencil`, `X`, `initialsFor`, `Avatar`, and the inline `ProfileView` definition.

- [ ] **Step 2: Remove obsolete dialog-open state**

Delete `confirmLogout`, `confirmRemovePairing`, and both custom `AnimatePresence` confirmation blocks. Keep `removingPairing` because it represents the async mutation state.

- [ ] **Step 3: Pass direct callbacks into ProfileView**

Render:

```jsx
<ProfileView
  displayName={displayName}
  email={user.email}
  profilePic={profilePic}
  partnerName={partnerName}
  partnerPic={partnerPhoto}
  buildVersion={buildVersion}
  buildCommit={buildCommit}
  uploading={uploading}
  removingPairing={removingPairing}
  onPickPhoto={() => profileFileRef.current?.click()}
  onRemovePhoto={handleRemoveProfilePhoto}
  onSaveDisplayName={handleSaveDisplayName}
  onLogout={handleLogout}
  onRemovePairing={handleRemovePairing}
  pushDebugEnabled={pushDebugEnabled}
  pushDebugResult={pushDebugResult}
  registeringPushDebug={registeringPushDebug}
  sendingPushDebug={sendingPushDebug}
  onRegisterPushDebug={handleRegisterPushDebug}
  onSendPushDebug={handleSendPushDebug}
/>
```

Do not move or change the hidden native file input.

- [ ] **Step 4: Verify structural cleanup**

Run:

```bash
rg -n "confirmLogout|confirmRemovePairing|function ProfileView|partnerEmail=" src/components/MainScreen.jsx
```

Expected: no matches.

- [ ] **Step 5: Run focused tests and lint**

```bash
npx vitest run src/components/ProfileView.test.jsx
npm run lint
```

Expected: both pass.

- [ ] **Step 6: Commit integration**

```bash
git add src/components/MainScreen.jsx
git commit -m "refactor: integrate extracted profile view"
```

## Task 5: Apply The Balanced Glass Visual System

**Files:**
- Modify: `src/index.css`
- Modify: `src/components/ProfileView.test.jsx`

- [ ] **Step 1: Add a narrow structural style test before CSS changes**

Add a source-level test to `ProfileView.test.jsx` or a separate Node test that verifies the Profile source uses all four glass cards and that `src/index.css` contains:

```css
.profile-glass-card {
  border-radius: 24px;
  background: rgba(23, 23, 23, 0.68);
  backdrop-filter: blur(24px) saturate(130%);
}
```

Also assert old selectors `.profile-info-row`, `.profile-unpair-button`, `.profile-link-row`, `.profile-debug-panel`, `.profile-version`, `.confirm-backdrop`, and `.confirm-sheet` are absent after migration.

- [ ] **Step 2: Run the structural test and confirm it fails**

Run:

```bash
npm run test:unit
```

Expected: FAIL because legacy selectors still exist and the new glass rule is not present.

- [ ] **Step 3: Replace only the Profile CSS block**

Keep `.profile-screen` safe-area scrolling, then implement:

```css
.profile-content {
  display: grid;
  gap: 14px;
  width: min(100%, 560px);
  margin: 0 auto;
}

.profile-glass-card {
  overflow: hidden;
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 24px;
  background: rgba(23, 23, 23, 0.68);
  box-shadow: 0 18px 48px rgba(0, 0, 0, 0.2);
  backdrop-filter: blur(24px) saturate(130%);
  -webkit-backdrop-filter: blur(24px) saturate(130%);
}
```

Use `20px` to `28px` radii across grouped surfaces, preserve `44px` minimum touch targets, and use semantic tokens for text, border, primary, and destructive colors. Do not add Profile-only background animation; the existing `AppBackground` palette remains visible through transparent Profile surfaces.

- [ ] **Step 4: Remove conflicting legacy ownership**

Delete the migrated Profile selectors and the two custom confirmation blocks. Preserve selectors used by other screens, including shared `.btn-*` and `.menu-action`, unless `rg` proves a selector is Profile-only.

- [ ] **Step 5: Verify CSS, unit behavior, and build**

Run:

```bash
npm run test:unit
npm run lint
npm run build
```

Expected: all pass; generated CSS includes backdrop-filter and large-radius Profile surfaces.

- [ ] **Step 6: Commit styling**

```bash
git add src/index.css src/components/ProfileView.test.jsx
git commit -m "style: apply profile glass hierarchy"
```

## Task 6: Version Bump And End-To-End Verification

**Files:**
- Modify: `package.json`
- Modify: `package-lock.json`

- [ ] **Step 1: Bump the Pocofoto patch version**

Run:

```bash
npm version 0.2.21 --no-git-tag-version
```

Expected: both package files report `0.2.21`.

- [ ] **Step 2: Run the complete local verification suite**

```bash
npm run test:unit
npm run lint
npm run build
git diff --check
```

Expected: all commands pass with no whitespace errors.

- [ ] **Step 3: Inspect the final change boundary**

Run:

```bash
git status --short
git diff --stat acee859..HEAD
rg -n "profile-info-row|profile-unpair-button|profile-debug-panel|confirm-backdrop|confirm-sheet" src
```

Expected: changes are limited to the planned Profile, registry, test/config, CSS, and package files; the legacy Profile/confirmation selectors return no matches.

- [ ] **Step 4: Commit the release metadata**

```bash
git add package.json package-lock.json
git commit -m "chore: bump version to 0.2.21"
```

- [ ] **Step 5: Final commit audit**

```bash
git log --oneline -6
git status --short
```

Expected: the planned commits are present and the worktree is clean. Do not push, deploy, promote branches, or update Linear unless separately requested.
