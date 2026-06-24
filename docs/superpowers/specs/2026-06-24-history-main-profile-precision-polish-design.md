# History, Main, and Profile Precision Polish

**Date:** 2026-06-24  
**Status:** Approved design  
**Scope:** History, Main, Profile, and the shared bottom navigation

## Goal

Make the three primary Pocofoto views feel more coherent and tactile without changing their layouts, copy, feature placement, navigation behavior, diagnostics, or data flows.

This is a precision-polish pass. It is not a visual redesign or component-architecture refactor.

## Constraints

- Preserve all existing user flows and interactions.
- Preserve current copy and localization keys.
- Preserve the camera-first layout, square photo presentation, History grid, Profile information hierarchy, and bottom-navigation placement.
- Preserve the existing notification diagnostics and settings UI structure.
- Do not add new entrance choreography or decorative effects.
- Do not extract shared UI primitives in this pass.
- Keep the current dark visual identity and blue accent.
- Respect reduced-motion preferences where the existing implementation supports them.

## Visual System

### Surfaces and radii

| Before | After |
| --- | --- |
| Dark surfaces use a mixture of faint borders, no elevation, and unrelated radii | Use a small shared set of dark surface treatments with subtle pure-white shadow-rings |
| Nested rounded elements are visually close but do not consistently follow concentric-radius relationships | Adjust nearby parent and child radii so the outer radius accounts for the inner radius and padding |
| The `65px` photo radius is visually disconnected from the rest of the interface | Reduce it to a large but system-aligned radius while preserving the square photo layout |

Cards and controls will use shadow-rings for depth. Structural dividers inside Profile remain borders because they separate rows rather than create elevation.

### Images

| Before | After |
| --- | --- |
| Feed photos, History thumbnails, review photos, and avatars depend on surrounding contrast for edge definition | Add an inset `1px` pure-white outline at `10%` opacity |
| Image edge treatment varies by context | Apply one neutral dark-mode image-outline treatment without changing image sizing or cropping |

### Typography

| Before | After |
| --- | --- |
| Headings and supporting text use default wrapping | Use balanced wrapping for headings and pretty wrapping for short supporting text |
| Relative timestamps can shift slightly as their digits change | Use tabular numerals on dynamic relative-time labels |
| Font smoothing is defined on `body` | Preserve the existing antialiasing and ensure it remains applied at the root rendering level |

No font family, copy, font-size hierarchy, or localization changes are included.

## Interaction System

### Press feedback

| Before | After |
| --- | --- |
| Press scales vary by control; the Like button scales to `0.86` | Appropriate buttons use interruptible `scale(0.96)` feedback |
| Some buttons have no tactile response | Add the same restrained press treatment where it does not conflict with an existing gesture |
| Transition declarations vary by component | Transition only the properties that change, such as transform, background color, color, opacity, or box-shadow |

The camera shutter keeps its purpose-built inner-circle animation. It will not receive a second competing scale effect.

### Hit areas

| Before | After |
| --- | --- |
| Primary controls are already large, but compact links and icon actions are inconsistent | Ensure interactive targets reach at least `40×40px` without changing their visible composition |
| Compact Profile links rely on text bounds | Expand their target area without overlapping neighboring targets |

### Existing Motion

| Before | After |
| --- | --- |
| Existing Framer Motion values use mixed scale ranges and timings | Correct only existing outlier values to restrained, consistent motion |
| History tiles enter with a pronounced `0.92` scale | Soften the existing tile animation without adding new choreography |
| Contextual icon transitions use ad hoc values | Where an existing contextual icon transition is touched, align it with the established opacity, scale, and blur treatment |

This pass adds no new page-level staggered entrances. Existing route and view transitions remain structurally unchanged.

## View-Specific Changes

### History

| Before | After |
| --- | --- |
| Header, grid, loading state, and retry state have limited visual hierarchy | Refine spacing, wrapping, surface treatment, and control feedback while preserving the grid and pagination behavior |
| Thumbnail tiles have minimal edge definition | Add the shared image outline and consistent tile radius |
| Tile press and entrance motion use different scales | Align the press state to `0.96` and soften the existing entrance scale |

Broken-photo behavior remains unchanged: failed tiles have no retry action and still open the corresponding Main-feed photo.

### Main

| Before | After |
| --- | --- |
| Camera/photo frames use a radius that is disconnected from the surrounding controls | Use the system-aligned large radius without changing frame dimensions |
| Camera controls, retry actions, Like, status chips, and queue actions use mixed surface treatments | Normalize dark surfaces, shadow-rings, explicit transitions, and tactile feedback |
| Feed image edges blend into the black background | Add the shared inset image outline |
| Like feedback scales to `0.86` | Change to `0.96` |

Camera capture, review, caption, send, queue, image retry, scrolling, and swipe behavior remain unchanged.

### Profile

| Before | After |
| --- | --- |
| Glass cards, outline buttons, avatars, field rows, links, and destructive actions use several unrelated edge treatments | Normalize card shadow-rings, concentric radii, avatar outlines, button feedback, and row separation |
| Heading and supporting values can wrap unevenly | Add balanced and pretty wrapping where appropriate |
| Compact edit, About, legal, and destructive actions have inconsistent tactile treatment | Standardize explicit transitions, `0.96` press feedback, and minimum target sizes |

Name editing, photo actions, notification settings, diagnostics, About content, pairing removal, logout, and the decorative easter-egg asset remain unchanged.

### Shared bottom navigation

| Before | After |
| --- | --- |
| The glass container uses a faint hard border and no depth | Replace the depth border with a subtle pure-white shadow-ring |
| Active and inactive items are functional but visually close | Clarify active-state surface contrast while preserving icon colors and placement |
| Navigation transitions are declared separately with mixed timing | Normalize explicit transform, background-color, and color transitions |

The navigation remains a three-item centered glass pill with the same swipe and tap behavior.

## Implementation Boundaries

Primary edit surfaces:

- `src/index.css`
- `src/components/HistoryScreen.jsx`
- `src/components/MainScreen.jsx`
- `src/components/ProfileView.jsx`

JSX changes must be limited to class hooks, existing Motion-value corrections, and accessibility-preserving target adjustments required by this design. No state, Firebase, analytics, pagination, camera, upload, notification, or routing logic should change.

## Verification

Run:

1. `npm run test:unit`
2. `npm run lint`
3. `npm run build`

Then perform focused visual checks at mobile width for:

- History loading, populated grid, failed thumbnail, load-more retry, and photo selection.
- Main camera-ready, camera-error, review/caption, feed photo, liked/unliked, queued/failed upload, and failed-image retry states.
- Profile identity, name editing/error, notification settings and diagnostics, About open/closed, and destructive dialogs.
- Bottom navigation active states, repeated Home tap, and horizontal view swipes.
- No clipped content at safe-area boundaries.
- No overlapping interactive hit areas.
- No unexpected first-load animation or image-size change.

## Out of Scope

- New layouts or screen composition.
- Copy or localization changes.
- New components or shared primitive extraction.
- Changes to camera, feed, History pagination, Profile data, notifications, or Firebase behavior.
- New animations, gradients, illustrations, or assets.
- Desktop-specific redesign.
