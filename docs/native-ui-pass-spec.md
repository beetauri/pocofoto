# Native UI parity pass

## Goal

Bring the Expo/React Native home, review, feed, and primary navigation surfaces into behavioral and visual parity with the existing PWA without changing photo, caption, profile, pairing, notification, or offline-queue functionality.

## Source of truth

The existing PWA implementation in `src/components/MainScreen.jsx` and `src/index.css` is authoritative for layout and interaction details. The native implementation keeps Expo Router routes and existing Firebase/service boundaries.

## Approved approach

- Keep Expo Router's three tab routes: history, home, and profile.
- Add a shared horizontal swipe layer to route content. A left swipe advances history → home → profile; a right swipe reverses it. Vertical gestures remain owned by each screen's scroll/feed view.
- Add a small shared main-UI state provider for whether the home camera slide is visible. The center tab shows the full camera icon while visible and an animated mini shutter icon when the user is viewing a photo.
- Use `expo-blur` for the custom liquid-glass tab surface. iOS uses native blur; Android uses the supported translucent fallback plus layered highlights and borders.

## Surface requirements

### Review screen

- Captured photo fills the same square camera frame and uses cover cropping.
- Caption input is a centered, auto-sizing glass pill over the image, with the PWA placeholder, white text, white caret, max length, and done-key behavior.
- Left control dismisses the review; center shutter/send control queues the photo; right `Aa` focuses the caption input.
- Sending remains disabled offline or while busy. Draft persistence remains intact.

### Feed

- Each photo slide remains a full-screen vertical snap page.
- The photo frame is full-width within the home feed and square, matching the PWA's `camera-frame` geometry.
- Captions render as a centered glass pill over the lower photo edge.
- Metadata sits below the frame with sender (`You` for the current user, otherwise the existing fallback partner label), relative time, and the existing like/status behavior.
- A sender cannot like their own photo.
- History selection still targets and opens the selected photo slide.

### Navigation

- Tab bar remains floating above the safe-area inset, with three 58pt touch targets and the existing tab order.
- Glass surface uses blur, translucent dark fill, subtle outer stroke, inner highlight, and a selected circular surface.
- Tapping the active Home tab while viewing a photo returns to the camera slide.
- Horizontal swipe changes tabs with a directional threshold while ignoring predominantly vertical gestures.

## Acceptance checks

- TypeScript and ESLint pass with no new errors.
- Expo iOS export succeeds.
- iOS simulator launches the updated app.
- Manual simulator checks cover: camera visible/mini-shutter transition, review input and send/discard controls, feed photo geometry/status, history-to-photo targeting, tab taps, and left/right tab swipes.

