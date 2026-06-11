# Camera-First Startup Optimization

## Goal

Make Pocofoto open smoothly with the camera as the primary startup workload, while reducing initial Firestore reads, image downloads, React rendering, and background-processing work.

## Product Priorities

1. Start the camera immediately.
2. Start a lightweight newest-photo query in parallel so recent content is ready after the camera.
3. Do not let History, Profile, older photos, or decorative background work compete with camera startup.
4. Preserve current photo, caption, like, History-to-Home, Profile, offline-draft, and navigation behavior.

## Startup Flow

- Home mounts immediately and requests the camera exactly as it does today.
- A single real-time Firestore query for the newest five photo documents starts in parallel.
- The camera does not wait for the photo query, image loading, Profile data, or History rendering.
- All feed photo images use lazy loading because the camera occupies the initial viewport.
- Older photo documents load in pages of ten when the user approaches the end of the loaded list.
- Pagination appends older records without replacing or duplicating the newest real-time records.

## Shared Photo Data

- Introduce one focused photo-data hook owned by `MainScreen`.
- The hook owns the newest-five `onSnapshot`, pagination cursor, loading states, duplicate removal, and `loadMore` action.
- Home and History consume the same photo array.
- Remove `HistoryScreen`'s independent Firestore query and subscription.
- The newest-five listener remains real-time. Older pages use one-shot `getDocs()` calls with `startAfter()` and `limit(10)`.
- A newly received photo updates the first page without discarding already loaded older pages.
- An empty or failed page marks pagination complete or retryable without blocking the camera or existing photos.

## Image Loading

- Querying photo documents does not itself download the image files.
- Feed and History images use `loading="lazy"` and `decoding="async"`.
- No shared photo image is marked eager during initial camera view.
- Native browser lazy loading is the initial implementation. It provides near-viewport loading without a custom image observer or placeholder system.
- Thumbnails are explicitly deferred to a separate project.

## Pagination Triggers

- Home places a small sentinel after the final loaded photo. An `IntersectionObserver` requests the next ten records as the sentinel approaches the feed viewport.
- History uses the shared list and places its own sentinel at the grid end.
- The hook prevents concurrent duplicate requests, so both sentinels may safely call the same `loadMore` function.
- A compact retry control appears only when an older-page request fails.

## Deferred Views

- Home is the only view mounted at startup.
- History mounts when the user first opens History.
- Profile mounts when the user first opens Profile.
- After first mount, each view stays mounted for fast return navigation and to preserve local UI state.
- The three-panel swipe track remains structurally stable by rendering lightweight empty section shells for views that have not mounted yet.
- Profile document listeners start only after Profile has first mounted. Data required by Home, such as sender names and avatars, may continue using the couple-member profile data needed by the feed; purely Profile UI rendering is deferred.

## Dynamic Background Removal

- Remove photo-derived background images, blur layers, palette transitions, and active-photo background updates from the frontend.
- Render a static pure-black app background for loading, auth, pairing, Home, History, and Profile.
- Remove palette extraction from the photo send path and stop adding new `paletteV2` values from the client.
- Do not delete or migrate existing `palette`, `paletteV2`, or photo fields in Firestore.
- Do not change Firestore rules, indexes, Cloud Functions, Storage objects, or the palette backfill script in this project.
- Existing palette utilities may remain if tests or maintenance scripts still use them; they are no longer imported by the runtime photo flow.

## Component Boundaries

- `src/hooks/usePaginatedPhotos.js`: shared photo subscription and older-page pagination.
- `src/components/HistoryScreen.jsx`: presentational History grid receiving photos and pagination props.
- `src/components/MainScreen.jsx`: camera, navigation, shared hook consumption, lazy view activation, and Home pagination sentinel.
- `src/components/AppBackground.jsx`: static black background only, or remove the component if a root CSS background fully replaces it without changing route behavior.
- `src/App.jsx`: no background source state and no background callback passed into `MainScreen`.
- `src/firebase.js`: export Firestore `limit` and `startAfter` helpers.

## Error Handling

- Initial photo-query failure ends the photo loading state and leaves the camera usable.
- Pagination failure preserves existing photos and allows an explicit retry.
- Duplicate `loadMore` requests are ignored while a request is active.
- Pagination stops after a page returns fewer than ten records.
- Missing or invalid photo URLs do not block the rest of the list.

## Testing

- Unit-test query configuration: newest five, older pages of ten, and cursor use.
- Unit-test page merging and duplicate removal when the real-time first page changes.
- Verify History has no Firestore subscription and consumes shared photo props.
- Verify Home, History, and Profile image loading policy remains lazy/async.
- Verify History and Profile are absent from the initial render and mount on first activation.
- Verify dynamic background props, active-photo processing, palette extraction, and eager feed images are absent.
- Run the complete unit suite, frontend lint, Functions lint, and production build.
- Use a local browser session to confirm camera-first startup, first-visit view mounting, pagination, pure-black background, and History-to-Home navigation.

## Out Of Scope

- Thumbnail generation or backfill.
- Firestore schema, rules, indexes, or stored-data cleanup.
- Cloud Function or Storage changes.
- Camera behavior, capture quality, permissions, or review-flow redesign.
- Visual redesign of Home, History, Profile, navigation, or loading states.
- Production deployment.

## Acceptance Criteria

- Camera request begins immediately on Main startup and is not gated by photos.
- Only the newest five photo documents are subscribed to initially.
- Older photo documents load ten at a time near the end of Home or History.
- Exactly one photo subscription exists for the Main experience.
- Home and History share one ordered, duplicate-free photo list.
- Shared photo images are lazy-loaded and asynchronously decoded.
- History and Profile do not mount until first opened, then remain mounted.
- The app background is pure black with no photo, blur, palette, or transition layer.
- The runtime send path performs no palette extraction and existing Firestore palette data is untouched.
- Current user-visible photo, like, caption, navigation, and Profile behavior remains functional.
- Tests, lint, and build pass, and the package version is bumped in both package files.
