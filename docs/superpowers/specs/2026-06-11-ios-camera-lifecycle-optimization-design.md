# iOS Camera Lifecycle Optimization

## Goal

Make Pocofoto's camera feel immediate and stable on iOS: request access as soon as Home opens, avoid duplicate camera starts, switch lenses without a full loading screen, recover after iOS background suspension, and upload consistently sized high-quality captures.

## Product Decisions

- Request camera access immediately when the paired Main experience mounts.
- Preserve camera-first startup; do not add a pre-permission Start Camera button.
- Remember the last-used front or rear camera on the device.
- Keep the camera running while the user visits History or Profile.
- Automatically resume the remembered camera when the app returns from the iOS background.
- During front/back switching, freeze the current frame and show only a subtle spinner.
- If switching fails, restore the previous camera and show a brief toast.
- Resize shared photo captures to a maximum dimension of 1920px and encode JPEG near quality `0.9`.

## Permission Boundary

- Pocofoto must call `getUserMedia()` to start capture and cannot persist, grant, or bypass iOS camera permission itself.
- If iOS/Safari is configured to Ask, the system may prompt on each new standalone app session.
- The app will distinguish permission denial from camera startup failure and keep actionable retry copy.
- This project will not attempt browser-specific permission workarounds or misleading local permission state.

## Camera Lifecycle

- Extract camera lifecycle ownership from `MainScreen` into a focused hook.
- Keep exactly one persistent `<video>` element mounted for the live preview.
- On startup, request the locally remembered facing mode, defaulting to rear camera.
- Use one camera request per lifecycle action. Changing `facingMode` must not trigger a second request through an effect dependency.
- A stream is not considered ready when `getUserMedia()` resolves. Readiness requires the candidate stream to be attached to the video and produce a playable first frame.
- Record camera timing milestones for diagnostics: request started, stream acquired, first frame ready, switch completed, and resume completed.

## Camera Constraints

- Request `audio: false`.
- Request the chosen `facingMode` as an ideal constraint rather than an exact requirement.
- Prefer a balanced HD stream with ideal width `1920`, ideal height `1080`, and practical minimums that do not reject older devices.
- Do not require a specific frame rate or lens device ID in this iteration.
- Accept the resolution selected by iOS and resize only the final capture output.

## Switching Flow

1. Ignore additional switch taps while a switch is active.
2. Draw the current video frame into a temporary canvas and expose it as a frozen preview.
3. Keep the persistent video element mounted behind the frozen preview.
4. Request the opposite facing mode exactly once.
5. Attach the candidate stream to the same video element and await `playing` or a valid first frame with a bounded timeout.
6. On success, update the active facing mode, store it locally, remove the frozen overlay, and stop the previous stream.
7. On failure, stop the failed candidate, reattach or continue the previous stream, remove the overlay, retain the previous facing mode, and show a toast.

The old stream may need to be stopped before requesting the opposite camera on iOS devices that cannot open both cameras concurrently. The lifecycle helper will first attempt the seamless path, then use a controlled fallback that preserves the frozen frame while reacquiring the previous camera if necessary.

## Background And Resume

- Listen for document visibility changes inside the camera lifecycle hook.
- When the app becomes hidden, record that the camera may be suspended; do not intentionally stop a healthy stream solely because History/Profile is visible.
- When the app becomes visible, inspect the current video track and preview readiness.
- If the track ended, became muted without recovery, or the video no longer has playable dimensions, automatically request the remembered camera once.
- Keep the frozen last frame or black camera surface visible during resume; do not show the full startup permission instructions unless access truly needs user action.

## Capture Processing

- Capture from the current video dimensions only after the preview is ready.
- Calculate output dimensions that preserve aspect ratio and cap the longest side at 1920px.
- Draw directly from the video to the output-sized canvas; avoid creating a full-resolution intermediate canvas.
- Mirror front-camera captures so the saved image matches the preview behavior.
- Encode as JPEG at quality `0.9`.
- Preserve the existing review, offline draft, caption, send timeout, upload, and Firestore behavior.

## Component Boundaries

- Create `src/hooks/useCamera.js`: stream acquisition, first-frame readiness, switching, visibility resume, remembered mode, frozen preview state, and cleanup.
- Create `src/lib/camera.js`: pure helpers for constraints, capture dimensions, remembered mode validation, and media-track health.
- Modify `src/components/MainScreen.jsx`: consume the hook, keep one video mounted, render frozen overlay/switch spinner, and use the capture-sizing helper.
- Modify `src/index.css`: subtle switching overlay and stable preview states.
- Do not modify Firebase, Firestore rules, Storage rules, Cloud Functions, or photo document shape.

## UI States

- `requesting`: initial camera acquisition; show existing startup camera state.
- `ready`: live preview is producing frames.
- `switching`: keep frozen preview visible with a subtle spinner; capture and switch controls are disabled.
- `resuming`: automatically restore after iOS suspension with minimal visual interruption.
- `denied`: show blocked-access copy and retry action.
- `error`: show camera-unavailable copy and retry action.

The full camera loading state is reserved for initial startup and unrecoverable resume. Normal lens switching must not replace the preview with the current “Starting camera” screen.

## Error Handling

- Bound stream acquisition and first-frame waits independently so errors identify the delayed stage.
- Stop stale or superseded candidate streams.
- Never stop the known-good previous stream until the replacement is proven playable, except when iOS requires exclusive camera access.
- Prevent overlapping startup, resume, retry, and switch requests with one request coordinator.
- Clean up every active or candidate stream when `MainScreen` unmounts or the signed-in route changes.

## Testing And Verification

- Unit-test camera constraints, remembered-mode validation, capture scaling, and track-health helpers.
- Add source/component contracts proving only one startup request and one switch request exist.
- Test switch success, rapid repeated taps, candidate failure, previous-camera restoration, and stale request cleanup with mocked media streams.
- Test visibility return with healthy and ended tracks.
- Verify the video element remains mounted during `switching`.
- Verify a 4032x3024 source becomes 1920x1440, portrait dimensions scale correctly, and smaller sources are not enlarged.
- Run unit tests, frontend lint, Functions lint, and production build.
- On a physical iPhone PWA, measure startup request-to-first-frame time, switch time, background resume, remembered camera, capture dimensions, and permission behavior under both Ask and Allow settings.

## Out Of Scope

- Changing or bypassing iOS permission policy.
- Simultaneously maintaining front and rear camera streams.
- Camera lens selection beyond front/rear facing mode.
- Flash/torch implementation, zoom, focus, exposure, frame-rate controls, or video recording.
- Profile-photo processing changes.
- Backend, Firestore, Storage, or thumbnail changes.
- Production deployment until separately requested.

## Acceptance Criteria

- Startup requests the remembered camera once and marks ready only after a playable frame.
- Switching makes exactly one logical replacement request and never shows the full startup loading screen.
- The current frame stays visible during switching with a subtle progress indicator.
- A failed switch returns to the previous camera and shows a toast.
- Rapid switch taps do not create overlapping streams.
- History/Profile navigation does not intentionally stop the stream.
- Returning from iOS background automatically resumes an interrupted camera.
- Last-used front/rear mode persists across launches.
- Shared captures preserve aspect ratio, never upscale, cap the longest side at 1920px, and encode at JPEG quality `0.9`.
- Existing capture review, captions, offline drafts, sending, and navigation remain functional.
