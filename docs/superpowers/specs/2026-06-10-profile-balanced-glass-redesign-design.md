# Profile Balanced Glass Redesign

## Goal

Redesign Pocofoto's Profile view as a balanced, mobile-first account surface that feels personal and expressive while keeping account management easy to scan. Preserve all current behavior, use registry shadcn components, and keep the redesign scoped to the Profile view.

## Product Direction

The Profile view balances four jobs in this order:

1. Establish the signed-in user's identity.
2. Show the user's Pocofoto relationship without exposing unnecessary account details.
3. Provide compact account and app information.
4. Isolate destructive actions to reduce accidental use.

The design should feel spacious and expressive around identity and relationship content, then become compact and practical for settings. It must retain Pocofoto's dark, intimate visual language rather than resemble a generic settings page.

## Information Architecture

### Identity Header

- Show a simple circular profile avatar with the existing image-or-initials fallback.
- Show display name as the primary heading and email as muted supporting text.
- Keep `Change photo` and `Remove photo` visible below the identity content.
- Keep display-name editing inline rather than opening a dialog or sheet.
- Do not add an avatar halo or other decorative identity treatment in this iteration.

### Partner Card

- Present the partner in a dedicated glass card using avatar and display name.
- Hide the partner's email by default.
- Do not place `Remove pairing` inside this card. The card should communicate connection rather than account risk.

### Account Details

- Show compact rows for the signed-in email and sign-in provider.
- Include the display-name row and its inline editing state in this account group.
- Preserve long-text handling so names and emails do not break the mobile layout.

### About Pocofoto

- Replace the permanently visible legal links and version footer with one compact, expandable `About Pocofoto` row.
- Expanded content includes Privacy Notice, Terms of Use, app version, and build commit.
- When `VITE_ENABLE_PUSH_DEBUG === 'true'`, include a `Diagnostics` subsection inside the expanded About content.
- Diagnostics preserves the existing device-registration action, partner test-push action, loading labels, disabled states, and result message.
- Diagnostics must not render when debug mode is disabled.

### Danger Area

- Place `Remove pairing` and `Log out` together in a visually separated danger area after the normal settings content.
- Keep each action distinct and clearly labeled.
- Require the existing confirmation flow before either action completes.
- Use destructive color selectively here; do not spread red styling across normal profile content.

## Visual System

### Background

- Reuse the app's current photo-derived palette system so the Profile background reacts subtly to the latest photo palette.
- Keep the color wash restrained and subordinate to content.
- Preserve readable contrast when the source palette is unusually bright, dark, or saturated.
- Do not introduce a Profile-only animation or change the behavior of other app backgrounds.

### Glass Cards

- Use translucent dark surfaces, backdrop blur, a thin low-contrast border, and restrained shadow.
- Use large border radii throughout: approximately `20px` to `28px` for cards and grouped surfaces.
- Use pill or fully rounded controls only where the control's shape supports its meaning; avoid turning every row into a pill.
- Keep glass effects visually restrained so text, focus states, and controls remain clear over every photo palette.

### Color And Type

- Continue using Pocofoto's dark neutrals and Geist typography.
- Reserve `#4F72FC` for primary actions, selected states, and keyboard focus emphasis.
- Use muted white for secondary information and existing semantic red for destructive actions.
- Maintain a clear hierarchy: strong display name, quieter account metadata, compact labels, and legible control text.

### Spacing

- Give the identity and partner areas generous vertical spacing.
- Use tighter spacing inside account rows and expanded About content.
- Maintain comfortable touch targets of at least `44px` where controls are interactive.
- Respect top and bottom safe areas and the existing bottom-navigation reserve.

## Components And Ownership

### Profile Component Boundary

- Extract `ProfileView` from `src/components/MainScreen.jsx` into a focused Profile component module.
- Keep data fetching, Firebase mutations, upload orchestration, navigation state, and toast ownership in `MainScreen`.
- Pass existing values, loading states, feature flags, and callbacks into the extracted component through explicit props.
- Keep the native hidden `<input type="file">` owned by the existing parent upload flow. The visible `Change photo` action continues to trigger it.

### Shadcn Components

Use registry shadcn components as the primitive source of truth:

- `Button` for photo, edit, About, diagnostics, logout, and remove-pairing actions.
- `Input` for inline display-name editing.
- `Card` for partner, account, About, and danger group surfaces.
- `Collapsible` for About Pocofoto disclosure.
- `Separator` for clear grouping inside expanded or destructive content.
- `AlertDialog` for logout and remove-pairing confirmation.
- Existing `Spinner` and `Sonner` integrations for loading and global feedback.

Add missing primitives through the shadcn registry. Do not hand-build replacements for registry components.

### Styling Boundary

- Compose the approved Profile appearance with shadcn component APIs, utility classes, and shared semantic tokens.
- Remove or narrow legacy `.profile-*`, `.btn-*`, `.menu-action`, and confirmation selectors that would continue to own migrated Profile appearance.
- Do not leave a hybrid state where old global Profile CSS overrides shadcn variants or internals.
- Do not refactor unrelated screen selectors or restyle shared components outside the Profile surface.

## Interaction States

### Display Name

- Enter edit mode inline from the display-name row.
- Autofocus the input when editing begins.
- Preserve the `2-30` character validation rule.
- Clear stale errors when the user changes the value or cancels.
- Support Enter to save and Escape to cancel.
- Disable edit controls while saving and show the existing loading indicator.
- On success, close edit mode and allow the parent toast flow to report success.
- On failure, keep editing available and show the inline error.

### Profile Photo

- `Change photo` triggers the existing hidden native file input.
- Disable photo actions while an upload is active.
- Disable `Remove photo` when no profile photo exists.
- Preserve existing upload, removal, error, and toast behavior.

### About And Diagnostics

- About is collapsed by default and clearly communicates expand/collapse state.
- Legal links remain keyboard accessible.
- Diagnostics appears only in debug mode and only inside expanded About content.
- Preserve current diagnostics loading, disabled, and result states.

### Destructive Actions

- Opening either destructive action shows a shadcn `AlertDialog` with explicit cancel and confirm actions.
- The dialog copy must distinguish logging out from removing the pairing.
- Cancel returns to Profile without changing state.
- Confirm invokes the existing parent callback exactly once.

## Accessibility

- Preserve the Profile region label and use meaningful section headings or accessible labels.
- Every icon-only edit action requires an accessible name.
- Make Collapsible and AlertDialog state available to assistive technology through their native shadcn/Radix behavior.
- Provide visible keyboard focus using the brand focus treatment.
- Do not rely on color alone to communicate destructive actions, errors, loading, or expansion state.
- Keep contrast readable across all supported photo-derived backgrounds.
- Respect reduced-motion preferences; no new motion is required for this redesign.

## Responsive Behavior

- Treat the installed mobile PWA viewport as the primary layout.
- Keep content in a single readable column within the current app shell.
- Allow safe wrapping or truncation for long display names, emails, partner names, version strings, and diagnostic output.
- Preserve usable spacing and control sizing on narrow devices.
- On wider screens, constrain content width rather than creating a new desktop-specific Profile layout.

## Testing Strategy

Add focused component tests that verify behavior rather than implementation details:

- Identity, partner name, account details, and simple avatar fallback render correctly.
- Partner email is not shown in the partner card.
- Inline display-name edit supports start, cancel, valid save, invalid length, Enter, Escape, loading, and failure states.
- About is collapsed initially and reveals legal/version content when expanded.
- Diagnostics is absent when disabled and available under About when enabled.
- Photo actions respect uploading and missing-photo disabled states.
- Remove pairing and Log out open distinct confirmation dialogs; cancel does nothing and confirm calls the correct callback once.
- Existing Profile-related unit tests, app lint, and production build remain green.

## Out Of Scope

- Backend, Firebase schema, authentication, pairing, upload, or notification behavior changes.
- Changes to Home, History, Pairing, Auth, bottom navigation, or global app flows.
- New Profile features, new legal destinations, new account fields, or partner controls.
- Decorative avatar halos, new illustration assets, or Profile-specific animation.
- Production deployment, branch promotion, or Linear updates.

## Acceptance Criteria

- The Profile follows the approved Balanced Glass Stack hierarchy.
- All current Profile behavior remains functional.
- Partner email is hidden and Remove pairing is located in the danger area.
- About Pocofoto contains legal, version, build, and debug-only diagnostics content.
- Cards use restrained glassmorphism and large `20px` to `28px` radii over the existing photo-derived background.
- Registry shadcn primitives own component behavior and structure without conflicting legacy Profile CSS.
- The layout remains accessible, mobile-first, safe-area aware, and readable across palette variations.
- Focused tests, lint, and build pass without unrelated UI changes.
