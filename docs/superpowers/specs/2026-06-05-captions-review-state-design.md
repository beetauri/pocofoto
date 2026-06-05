# Captions Review State Design

## Scope

Implement the v1 caption experience for Pocofoto. This includes the captured-photo review state, a text-only caption pill, caption persistence, and the feed layout change needed for captions. This does not include the future drawer, weather, location, time, or decorative sticker caption types.

## UX Flow

1. The user taps the shutter on the live camera.
2. The app captures the current frame locally and enters review mode without uploading or creating a Firestore photo.
3. The captured photo replaces the live preview in the same square camera frame position.
4. A bottom-center caption pill appears on the captured photo with the lowercase placeholder `add a caption`.
5. Tapping the caption pill or the `Aa` control focuses the native text input. No drawer or modal opens in v1.
6. When the keyboard opens, the captured photo shifts slightly upward to recenter in the shrunken viewport. Lower controls may be covered by the keyboard.
7. The left control becomes `X`. Tapping it immediately discards the captured photo and typed caption, then returns to live camera.
8. The center shutter keeps its existing shutter form. In review mode it shows a `send-horizontal` icon and sends the photo when tapped.
9. The right control becomes `Aa`. In v1 it focuses caption editing. It should be structured so a future implementation can wire it to the caption drawer.
10. While sending, controls are disabled and the same shutter button shows a spinner to prevent duplicate sends.
11. On send success, the captured photo layer, including the caption pill, moves straight upward with a slight fade. The live camera then returns to view.
12. The newly sent photo appears as the newest feed item below the camera, but the app does not auto-scroll to it.
13. On send failure, the app stays in review mode with the captured photo and caption intact, and shows a short error toast.

## Caption Behavior

- V1 supports only text captions.
- Caption input is single-line only.
- Captions do not wrap.
- Caption font size does not shrink.
- The max caption length is 27 characters.
- There is no visible character counter.
- The input stops accepting additional characters once the max is reached.
- Typed spaces are preserved exactly.
- Whitespace-only captions count as captions.
- If no caption is typed at all, no caption pill appears on sent/feed photos.
- The review placeholder is `add a caption`.
- The caption pill hugs the typed content, growing and shrinking with the text.
- The pill style is transparent, dark, blurred, and bottom-centered on the photo.
- Review and feed use the same caption pill styling and placement so preview matches the delivered photo.
- Captions render in the main feed only, not on History grid thumbnails.
- If a History thumbnail opens a photo in the main feed, that feed photo displays its caption.

## Feed Layout

Every feed photo uses the same layout, whether or not it has a caption:

- The photo remains in the rounded photo frame.
- A caption pill appears inside the photo near the bottom center only when the photo has a caption object.
- Metadata moves outside the photo frame and sits below it.
- Metadata layout is sender name on the left, grey time to its right, and the action/status on the far right.
- For the current user's photos, the right side shows the existing `Sent` or `Liked` status chip.
- For partner photos, the right side shows the heart like button.

## Data Model

New captioned photo docs store captions as a future-proof object:

```js
caption: {
  type: "text",
  text: "exactly typed text"
}
```

Rules:

- If the user typed nothing, omit `caption`.
- If the user typed spaces, store those spaces exactly.
- If the user typed text, store that text exactly.
- V1 only allows `type: "text"`.
- `text` must be a string with length from 1 to 27.
- `text` must not contain line breaks.

This object shape leaves room for later caption/sticker types, for example:

```js
caption: {
  type: "weather",
  text: "72°",
  weather: { ... }
}
```

## Backend And Rules

- Photo creation should allow either no `caption` field or a valid v1 caption object.
- Existing uncaptioned photos continue rendering normally.
- Existing push notification copy stays unchanged and does not include caption text.
- Firestore rules should reject invalid caption shapes, oversized text, non-text v1 types, and line breaks.

## Implementation Shape

- Add review state in `src/components/MainScreen.jsx`: captured blob, captured object URL, caption text, sending state, and success animation state.
- Change `handleCapture` so it captures locally first instead of uploading immediately.
- Add a send handler for reviewed photos.
- Extend the upload/write path to accept an optional caption object.
- Remove the current auto-scroll-to-new-photo behavior after send.
- Keep the camera stream running during review so returning to live camera is instant.
- Add caption pill/input UI inside the camera frame and sent photo frame.
- Move photo metadata markup outside `.camera-frame`.
- Update `firestore.rules` for the v1 caption object.
- Update Linear `PCO-61` and `PCO-62` to reflect this v1 scope. Leave `PCO-63` as the future drawer/stickers ticket.

## Verification

- Run `npm run lint`.
- Run `npm run build`.
- Start the app locally and do a visual/browser pass if the dev server starts cleanly.
- Verify capture enters review mode without sending.
- Verify `X` discards the local capture only.
- Verify send persists the photo once.
- Verify send failure keeps review state intact.
- Verify caption text persists exactly, including leading/trailing spaces.
- Verify captions do not render in History thumbnails.
