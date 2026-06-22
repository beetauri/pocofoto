# POC-102: Broken Photo States

## Summary

Add consistent loading and broken-image states to photos in the Main Feed and History. Both surfaces use a shared `ResilientPhotoImage` component for image lifecycle behavior while retaining their existing layout, controls, and navigation responsibilities.

## Goals

- Show a shadcn `Skeleton` while each photo is loading.
- Retry a failed image load automatically once.
- Replace a photo that still cannot load with a centered Lucide `ImageOff` icon on a gray background.
- Allow manual retry from the Main Feed only.
- Keep broken History tiles navigable exactly like regular History tiles.

## Non-Goals

- Changing photo upload, storage, Firestore, or queue behavior.
- Falling back from a History thumbnail to the full-resolution `photoUrl`.
- Adding retry controls or error copy inside History tiles.
- Adding delete controls for remote photos that fail to load.
- Applying this behavior to logos, avatars, camera previews, or captured-photo review.

## Component Design

### `ResilientPhotoImage`

Create a shared component used by the Main Feed and History photo surfaces. It owns only the image lifecycle:

- Render the shadcn `Skeleton` until the image loads.
- Render the image after a successful load.
- Retry the same source once automatically after the first load failure.
- Render a gray fallback with a centered Lucide `ImageOff` after the retry fails.
- Expose final failure and recovery to the parent so the Main Feed can control its retry action.
- Reset loading, retry, and failure state when `src` changes.
- Ignore stale load/error events from a previous source.

The component does not own photo captions, metadata, card layout, History navigation, or retry-button placement.

The automatic and manual retries must force a fresh browser load attempt without changing the underlying persisted photo URL.

## Main Feed Behavior

Replace the raw feed `<img>` with `ResilientPhotoImage` inside the existing photo frame.

State flow:

1. Show a full-frame shadcn `Skeleton` while loading.
2. On the first failure, retry automatically once.
3. If the retry fails, show the gray `ImageOff` fallback.
4. Replace the normal metadata row with one shadcn `Button` labeled **Try loading again**.
5. A manual retry returns the image to its loading state. On success, restore the photo and its normal metadata.

The retry action should follow the visual treatment of the existing failed-upload action row, but it must not show a delete action or failed-upload copy.

Captions remain associated with the photo card. They should not obscure the loading skeleton or broken-photo fallback.

## History Behavior

Replace each History tile's raw `<img>` with `ResilientPhotoImage`, using `thumbnailUrl` as its only source.

State flow:

1. Show a tile-sized shadcn `Skeleton` while loading.
2. On the first failure, retry the thumbnail automatically once.
3. If the retry fails, show the gray `ImageOff` fallback.

The tile remains the existing clickable button. Selecting a broken tile must continue to navigate to that photo in the Main Feed. History shows no retry button, error copy, or fallback to `photoUrl`.

## Styling And Accessibility

- Skeletons and fallbacks fill the existing photo frame or History tile exactly, preventing layout shifts.
- The fallback uses the existing shadcn theme tokens for a neutral gray surface rather than a hard-coded branded color.
- The `ImageOff` icon is decorative because the surrounding photo/card semantics already identify the content.
- The Main Feed retry button remains keyboard accessible and uses the localized label as its accessible name.
- History retains its existing localized **Open photo** accessible name, including when its thumbnail is broken.

## Copy And Localization

Add the Main Feed retry label to the camera translation namespace:

- English: **Try loading again**

No new visible copy is added to History or inside the broken-photo fallback.

## Error Handling

- A failed automatic retry is contained to that photo and does not affect adjacent photos or screen-level loading.
- Manual retry state is local to the selected Main Feed photo.
- Navigating between photos or changing a photo source clears prior failure state.
- The component must avoid an unbounded retry loop.

## Analytics

No new analytics events are required for POC-102. Existing History selection tracking remains unchanged when a broken tile is opened.

## Verification

Add focused tests for:

- Skeleton visibility before image load and removal after success.
- One automatic retry after the first error.
- `ImageOff` fallback after the retry fails.
- Manual retry recovery in the Main Feed.
- State reset when the source changes.
- Main Feed failure UI contains retry but no delete action.
- History failure UI has no retry control and remains clickable.
- History never substitutes `photoUrl` when `thumbnailUrl` fails.

Run the repository verification commands:

```bash
npm test
npm run lint
npm run build
```

## Acceptance Criteria

- Main Feed and History photos show shadcn skeletons while loading.
- Each failed photo load gets exactly one automatic retry.
- A photo that still fails displays a centered `ImageOff` icon on a gray background.
- Main Feed shows a single **Try loading again** action and can recover after a successful manual retry.
- Main Feed broken-photo UI has no delete action.
- History has no retry UI, no error copy, and no full-photo fallback.
- Broken History tiles open the corresponding Main Feed photo like regular tiles.
- Existing photo upload and failed-upload behavior remains unchanged.
