# iOS Camera Lifecycle Optimization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace Pocofoto's duplicated camera requests with a single managed lifecycle that switches smoothly, resumes after iOS suspension, remembers facing mode, and caps uploaded captures at 1920px.

**Architecture:** Move camera state and stream coordination into `useCamera`, backed by pure camera helpers. Keep one video element mounted, prove candidate streams playable before committing them, preserve a frozen frame during switches, and let `MainScreen` retain product UI and capture-review ownership.

**Tech Stack:** React 19 hooks, MediaDevices/getUserMedia, MediaStreamTrack, HTMLVideoElement, Canvas API, localStorage, Page Visibility API, node:test/Vitest, ESLint.

---

## File Structure

- Create `src/lib/camera.js`: constraints, facing-mode persistence, capture dimensions, track health, and first-frame wait helper.
- Create `src/lib/camera.test.js`: pure helper coverage.
- Create `src/hooks/useCamera.js`: startup, switching, resume, request coordination, stream cleanup, and frozen preview state.
- Create `src/hooks/useCamera.test.jsx`: mocked stream lifecycle behavior.
- Modify `src/components/MainScreen.jsx`: consume the hook, keep video mounted, render switching overlay, and resize captures.
- Create `src/components/CameraLifecycle.test.js`: source-level lifecycle regression contracts.
- Modify `src/index.css`: frozen-frame and subtle switching indicator styles.
- Modify `package.json` and `package-lock.json`: patch version bump.

---

### Task 1: Pure Camera Helpers

**Files:**
- Create: `src/lib/camera.js`
- Create: `src/lib/camera.test.js`

- [ ] Add tests for `normalizeFacingMode`, `getStoredFacingMode`, `setStoredFacingMode`, `buildCameraConstraints`, `fitCaptureDimensions`, and `isUsableVideoTrack`.
- [ ] Verify helper tests fail because the module does not exist.
- [ ] Implement constants `DEFAULT_FACING_MODE = 'environment'`, `CAMERA_FACING_MODE_KEY = 'pocofoto:camera-facing-mode'`, `MAX_CAPTURE_DIMENSION = 1920`, and `CAPTURE_JPEG_QUALITY = 0.9`.
- [ ] Implement balanced constraints with ideal `1920x1080`, non-exact facing mode, and `audio: false` at the hook call boundary.
- [ ] Implement aspect-ratio scaling that never enlarges a source.
- [ ] Run `node --test src/lib/camera.test.js`; expect all tests to pass.

### Task 2: First-Frame And Request Coordination

**Files:**
- Modify: `src/lib/camera.js`
- Modify: `src/lib/camera.test.js`
- Create: `src/hooks/useCamera.js`
- Create: `src/hooks/useCamera.test.jsx`

- [ ] Add tests proving a stream is not ready merely when `getUserMedia()` resolves and becomes ready only after the video reports playable dimensions/`playing`.
- [ ] Add tests proving stale candidate streams are stopped and overlapping requests are ignored or superseded deterministically.
- [ ] Implement `waitForVideoFrame(video, stream, timeoutMs)` with event cleanup and a bounded timeout.
- [ ] Implement `useCamera({ videoRef, onError })` with one coordinator ref, active/candidate stream refs, initial remembered mode, and statuses `requesting`, `ready`, `switching`, `resuming`, `denied`, and `error`.
- [ ] Ensure hook cleanup stops both active and candidate streams exactly once.
- [ ] Run focused helper and hook tests; expect all to pass.

### Task 3: Single Startup And Smooth Switching

**Files:**
- Modify: `src/hooks/useCamera.js`
- Modify: `src/hooks/useCamera.test.jsx`
- Modify: `src/components/MainScreen.jsx`
- Create: `src/components/CameraLifecycle.test.js`
- Modify: `src/index.css`

- [ ] Add regression tests for exactly one startup call and one replacement call per switch.
- [ ] Add tests for ignored repeated switch taps and previous-camera restoration on failure.
- [ ] Remove `cameraStream`, `cameraStatus`, `cameraError`, request-version, and facing-mode lifecycle ownership from `MainScreen`.
- [ ] Remove the effect whose dependencies retrigger `requestCamera(facingMode)` after `setFacingMode`.
- [ ] Keep `<video ref={videoRef} playsInline muted autoPlay />` mounted in every non-review camera state.
- [ ] Before switching, draw the current frame to a 1:1 camera-frame-sized canvas and retain its data URL/object URL as the frozen overlay.
- [ ] Call `switchCamera()` once; after candidate first frame, commit mode, persist it, remove overlay, then stop the old stream.
- [ ] If seamless acquisition fails because iOS requires exclusive access, stop the old stream behind the frozen overlay, retry once, and reacquire the old mode if replacement fails.
- [ ] Style `.camera-switch-overlay` as a full-frame frozen image with a small centered spinner; do not render “Starting camera” during switching.
- [ ] Run focused camera tests; expect all to pass.

### Task 4: iOS Background Resume

**Files:**
- Modify: `src/hooks/useCamera.js`
- Modify: `src/hooks/useCamera.test.jsx`

- [ ] Add tests for returning visible with a healthy track, ended track, and missing playable video dimensions.
- [ ] Register one `visibilitychange` listener in the hook.
- [ ] On visible, leave a healthy active stream untouched.
- [ ] On visible with an interrupted stream, request the remembered mode once with status `resuming`.
- [ ] Preserve the previous frozen frame while resuming and return to actionable denied/error UI only if recovery fails.
- [ ] Confirm History/Profile view changes do not stop or reacquire the camera.
- [ ] Run focused hook tests; expect all to pass.

### Task 5: Capture Resize And Encoding

**Files:**
- Modify: `src/components/MainScreen.jsx`
- Modify: `src/components/CameraLifecycle.test.js`
- Modify: `src/lib/camera.test.js`

- [ ] Add tests for landscape `4032x3024 -> 1920x1440`, portrait `3024x4032 -> 1440x1920`, and no enlargement below 1920px.
- [ ] Replace full-stream canvas dimensions with `fitCaptureDimensions(video.videoWidth, video.videoHeight)`.
- [ ] Draw directly into the resized canvas and preserve front-camera mirroring using the hook's committed facing mode.
- [ ] Encode with `CAPTURE_JPEG_QUALITY` and preserve the existing review blob flow.
- [ ] Add analytics timing fields for stream acquisition and first-frame readiness without logging image or permission-sensitive data.
- [ ] Run focused capture tests; expect all to pass.

### Task 6: Final Tests, Version, And Device Verification

**Files:**
- Modify: `package.json`
- Modify: `package-lock.json`

- [ ] Run `npm version patch --no-git-tag-version` and verify both package files match.
- [ ] Run `npm run test:unit`, `npm run lint`, `npm run lint:functions`, and `npm run build`; all must exit 0.
- [ ] Start the local app and verify desktop browser fallback behavior with mocked/available cameras.
- [ ] On a physical iPhone installed PWA, verify immediate permission request, remembered mode, startup first-frame timing, frozen-frame switching, failed-switch recovery, background resume, and 1920px capture output.
- [ ] Test iOS Camera permission under both Ask and Allow and document that remaining repeat prompts are system-controlled.
- [ ] Confirm no Firebase, Firestore rules, Storage rules, Functions, photo schema, profile-photo path, or unrelated workspace files changed.
- [ ] Commit the implementation with a concise imperative message after device verification.

## Release Gate

- Do not deploy automatically after implementation.
- When the user requests live deployment, push the verified release commit `main -> production` and let the configured CI/CD pipeline deploy it.
- Do not run Wrangler.
