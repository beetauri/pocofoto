# Native UI Parity Pass Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Match the Expo app's review screen, photo feed, tab gestures, liquid-glass tab bar, and mini-shutter behavior to the existing Pocofoto PWA without changing business functionality.

**Architecture:** Keep Expo Router's existing `history`, `index`, and `profile` routes. Use Expo Router's supported `TopTabs` pager with `swipeEnabled` and `animationEnabled` for native horizontal tab transitions, while rendering the custom liquid-glass tab bar as the navigator tab-bar overlay. Keep vertical photo paging inside HomeRoute. Use `expo-blur` for iOS blur with its Android translucent fallback, and leave Firebase/photo services unchanged.

**Tech Stack:** Expo SDK 57, React Native 0.86, Expo Router, `expo-blur`, `lucide-react-native`, `react-native-svg`, safe-area context, TypeScript.

---

### Task 1: Add the shared UI primitives and blur dependency

**Files:**
- Create: `mobile/src/state/MainUiProvider.tsx`
- Removed: `mobile/src/navigation/useTabSwipe.ts` (native pager owns tab swipes)
- Create: `mobile/src/components/MiniShutterIcon.tsx`
- Create: `mobile/src/components/LiquidGlassTabBar.tsx`
- Modify: `mobile/package.json`
- Modify: `mobile/package-lock.json`

- [x] **Step 1: Install the Expo-supported blur package**

Run from `/Users/bilalsvart/Desktop/Pocofoto/mobile`:

```bash
npx expo install expo-blur
```

Expected: `expo-blur` is added at the SDK-compatible version and the lockfile changes only for that package and its dependency metadata.

- [x] **Step 2: Implement shared camera visibility state**

`MainUiProvider.tsx` exports `MainUiProvider`, `useMainUi`, and a `MainUiContextValue` with:

```ts
type MainUiContextValue = {
  cameraInView: boolean;
  setCameraInView: (visible: boolean) => void;
};
```

The provider owns `cameraInView` and exposes a memoized value. The hook throws if used outside the provider.

- [x] **Step 3: Use native pager tab swipe behavior**

Use Expo Router's `TopTabs` backed by `react-native-tab-view` and `react-native-pager-view`, with `swipeEnabled: true` and `animationEnabled: true`. Do not add an app-level `PanResponder` or animated route translation. Set `directionalLockEnabled` on the vertical feed/history/profile scroll views so horizontal gestures remain available to the native pager.

- [x] **Step 4: Implement the mini shutter icon**

`MiniShutterIcon.tsx` renders a 28pt custom shutter using `react-native-svg`: a muted outer ring, a small accent ring, and a centered white shutter dot. It accepts `color?: string`, `accentColor?: string`, and `size?: number`, defaults to the tab-bar colors, and has no platform-specific code.

- [x] **Step 5: Implement the liquid-glass tab bar**

`LiquidGlassTabBar.tsx` accepts `MaterialTopTabBarProps` plus `cameraInView: boolean`. Render the existing route order and accessibility labels. Use:

```tsx
<BlurView intensity={52} tint="dark" style={StyleSheet.absoluteFill} />
```

inside a clipped rounded pill, then layer a translucent dark fill, a 1pt white outer stroke, and a top/inner highlight. The selected tab gets a 58pt circular translucent surface. The center icon is `Camera` when `cameraInView` is true and `MiniShutterIcon` otherwise. Preserve the existing active-Home tab behavior: if Home is already focused and the camera is not visible, emit `tabPress` and allow HomeRoute to scroll to the camera slide.

Use `useSafeAreaInsets`, place the host above `Math.max(insets.bottom, 18)`, and keep all touch targets at 58pt or larger.

- [x] **Step 6: Typecheck the primitives before integration**

Run:

```bash
npm run typecheck
```

Expected: PASS. If TypeScript reports an Expo Router or PanResponder type mismatch, correct the new files before continuing.

### Task 2: Integrate the shared tab bar and native pager

**Files:**
- Modify: `mobile/app/(main)/_layout.tsx`
- Modify: `mobile/app/(main)/index.tsx`
- Modify: `mobile/app/(main)/history.tsx`
- Modify: `mobile/src/screens/ProfileScreen.tsx`

- [x] **Step 1: Wrap the native pager navigator in MainUiProvider**

In `_layout.tsx`, wrap `PhotosProvider`'s `TopTabs` and overlays with `MainUiProvider`. Replace the inline `FloatingTabBar` with `LiquidGlassTabBar`, passing the provider's `cameraInView` value. Keep route order, `initialRouteName="index"`, notification routing, and redirect behavior unchanged.

- [x] **Step 2: Publish HomeRoute camera visibility**

In `index.tsx`, replace local `cameraInView` state with `useMainUi()`. Keep the existing FlatList viewability threshold of 58%; update `setCameraInView(viewableItems.some((item) => item.index === 0))` from `onViewableItemsChanged`. Keep the existing active-home `tabPress` listener and camera scroll behavior.

- [x] **Step 3: Preserve native pager ownership of horizontal gestures**

Do not attach custom gesture handlers to the routes. Keep the vertical `FlatList`/`ScrollView` behavior intact and use `directionalLockEnabled` so the native `TopTabs` pager handles horizontal movement.

- [x] **Step 4: Confirm existing route behavior is preserved**

Verify in code that:

- notification photo intents still route to Home
- history tiles still navigate with `photoId`
- tapping active Home while scrolled still returns to camera
- profile settings and pairing actions remain untouched

### Task 3: Match the review input and send/discard flow

**Files:**
- Modify: `mobile/app/(main)/index.tsx`
- Modify: `mobile/src/styles/global.ts`

- [x] **Step 1: Replace the generic caption field with the PWA glass pill**

In the review overlay, keep the captured `Image` full-frame with `resizeMode="cover"`. Replace the `globalStyles.input` styling with a dedicated `captionEditor` wrapper positioned at the bottom of the frame. Use a single-line `TextInput` with:

```tsx
maxLength={36}
returnKeyType="done"
blurOnSubmit
onSubmitEditing={() => captionRef.current?.blur()}
placeholder={t('review.captionPlaceholder')}
placeholderTextColor="rgba(255,255,255,0.58)"
textAlign="center"
```

The editor must be a centered pill with transparent input background, 42–48pt minimum height, horizontal padding, rounded full corners, dark translucent fill, white text, and a subtle white border. Keep the existing draft persistence effect and caption value unchanged.

- [x] **Step 2: Match review controls to the PWA**

Keep the existing control semantics and replace the visual implementation so review mode shows: X on the left, the accent-ring send shutter in the center, and `Aa` on the right. The right control focuses the input. Disable all review controls while sending. The normal camera mode retains flash, capture, and switch-camera behavior.

- [x] **Step 3: Preserve send behavior**

Do not change `preparePhoto`, `enqueuePhoto`, offline gating, local draft clearing, or queue state. Sending still queues the photo and returns to the live camera slide.

### Task 4: Match the feed photo layout and metadata

**Files:**
- Modify: `mobile/app/(main)/index.tsx`

- [x] **Step 1: Match PWA slide geometry**

Keep full-screen vertical paging, but make the photo frame square and full-width within the Home feed's horizontal bounds. Use the available window width minus the feed's 20pt side gutters, cap no smaller than 220pt, and reserve space for the bottom nav/control row. Keep image `resizeMode="cover"`, rounded frame clipping, and the existing local queue overlay.

- [x] **Step 2: Add the PWA metadata row**

Render the sender label (`You` for the current user, otherwise `t('yourPerson')`) and the existing relative time label below the frame. Preserve the existing status chip for sent photos and heart button only for partner photos. Keep the sender guard in both UI and `PhotosProvider.likePhoto`.

- [x] **Step 3: Keep captions as a photo overlay**

Render a centered, non-interactive glass caption pill over the lower edge of a loaded photo frame. Do not move caption persistence or serialization; only change presentation.

- [x] **Step 4: Preserve history targeting**

Keep the existing `photoId` parameter lookup, `scrollToIndex(photoIndex + 1)`, and parameter cleanup. The target must still land on the matching vertical feed slide.

### Task 5: Verify the complete pass

**Files:**
- No new files.

- [x] **Step 1: Run static checks**

Run from `mobile`:

```bash
npm run typecheck
npm run lint
npx expo export --platform ios --output-dir /tmp/pocofoto-expo-export-ui-pass
```

Expected: typecheck passes, lint has no new errors, and the iOS export completes.

- [x] **Step 2: Build and install the iOS simulator app if native dependencies changed**

Run the configured XcodeBuildMCP simulator build/install flow for scheme `Pocofoto`, then launch the app. Because `expo-blur` is native, do not rely on a stale dev-client binary.

- [x] **Step 3: Manually verify the requested interactions**

Check the iOS simulator in this order:

1. Home camera is visible and the center tab shows the full camera icon.
2. Scroll to a photo; the center tab morphs to the mini shutter and tapping it returns to camera.
3. Capture a photo; the review image, glass caption pill, X, send shutter, and `Aa` control are visible and usable.
4. Enter a caption, submit/blur it, discard once, then capture/send once; confirm the queue/feed behavior is unchanged.
5. Inspect a feed photo: square full-width frame, overlay caption, sender/time metadata, partner-only like button, sender status chip.
6. Tap a history tile and confirm the feed lands on that photo.
7. Verify the native `TopTabs` pager is configured with horizontal swiping and animated transitions; verify vertical scrolling remains configured within each route.
8. Verify the glass tab bar remains above the safe area and all three buttons remain accessible.

- [x] **Step 4: Report verification honestly**

Report the exact commands and simulator checks completed. Do not claim Android runtime verification unless an Android device/emulator is actually available; the shared implementation must remain platform-safe.
