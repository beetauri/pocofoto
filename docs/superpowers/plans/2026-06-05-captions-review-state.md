# Captions Review State Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the v1 captured-photo review state with text-only captions, caption persistence, and the feed metadata layout update.

**Architecture:** Keep the implementation inside the existing `MainScreen.jsx` flow because capture, upload, feed rendering, and camera controls already live there. Add small helper functions for caption normalization/validation and reviewed-photo cleanup so the larger component remains understandable. Update Firestore rules to allow only the v1 caption object shape.

**Tech Stack:** React 19, Vite, Framer Motion, lucide-react, Firebase Firestore/Storage, Firebase security rules.

---

## File Structure

- Modify `src/components/MainScreen.jsx`: add review state, caption input, local capture, reviewed-photo send, success animation, metadata layout, and caption rendering.
- Modify `src/index.css`: style review mode, caption pill/input, upward send animation state, and metadata below photos.
- Modify `firestore.rules`: validate optional `caption: { type: "text", text }` on photo create.
- Modify `package.json` and `package-lock.json`: bump app version from `0.1.4` to `0.1.5`.
- Keep `src/components/HistoryScreen.jsx` unchanged because captions must not render in History thumbnails.

## Task 1: Add Caption Helpers And Review State

**Files:**
- Modify: `src/components/MainScreen.jsx`

- [ ] **Step 1: Add constants and icons near the existing icon helpers**

Add `MessageCircle` and `SendHorizontal` imports from `lucide-react`, add `MAX_CAPTION_LENGTH = 27`, and add helper icon components:

```jsx
import {
  Heart as LucideHeartIcon,
  Check as LucideCheckIcon,
  Image as LucidePhotoIcon,
  LayoutGrid as LucideGridIcon,
  Link2Off as LucideUnlinkIcon,
  LogOut as LucideLogoutIcon,
  MessageCircle as LucideCaptionIcon,
  Pencil as LucidePencilIcon,
  RefreshCw as LucideSwitchCameraIcon,
  Send as LucideSendIcon,
  SendHorizontal as LucideSendHorizontalIcon,
  X as LucideXIcon,
  UserRound as LucideUserIcon,
  Zap as LucideFlashIcon
} from 'lucide-react';

const MAX_CAPTION_LENGTH = 27;
```

- [ ] **Step 2: Add helper functions before `MainScreen`**

```jsx
function CaptionIcon() {
  return <LucideCaptionIcon {...lucideIconProps} />;
}

function SendHorizontalIcon() {
  return <LucideSendHorizontalIcon {...lucideIconProps} />;
}

function clampCaptionText(value) {
  return value.replace(/[\r\n]/g, '').slice(0, MAX_CAPTION_LENGTH);
}

function buildCaptionPayload(text) {
  if (text.length === 0) return null;
  return {
    type: 'text',
    text
  };
}

function getTextCaption(photo) {
  return photo?.caption?.type === 'text' && typeof photo.caption.text === 'string'
    ? photo.caption.text
    : '';
}
```

- [ ] **Step 3: Add review state and refs inside `MainScreen`**

```jsx
const [reviewPhoto, setReviewPhoto] = useState(null);
const [captionText, setCaptionText] = useState('');
const [sendingReviewPhoto, setSendingReviewPhoto] = useState(false);
const [sendAnimationState, setSendAnimationState] = useState('idle');
const captionInputRef = useRef(null);
```

- [ ] **Step 4: Add cleanup effect for local object URLs**

```jsx
useEffect(() => {
  return () => {
    if (reviewPhoto?.url) {
      URL.revokeObjectURL(reviewPhoto.url);
    }
  };
}, [reviewPhoto]);
```

## Task 2: Convert Capture Into Review Mode

**Files:**
- Modify: `src/components/MainScreen.jsx`

- [ ] **Step 1: Update derived state**

Replace `const captureDisabled = uploading;` with:

```jsx
const isReviewingPhoto = Boolean(reviewPhoto);
const captureDisabled = uploading || sendingReviewPhoto || sendAnimationState !== 'idle';
```

- [ ] **Step 2: Add review cleanup and caption focus handlers**

```jsx
const clearReviewPhoto = useCallback(() => {
  setReviewPhoto((current) => {
    if (current?.url) URL.revokeObjectURL(current.url);
    return null;
  });
  setCaptionText('');
  setSendingReviewPhoto(false);
  setSendAnimationState('idle');
}, []);

const focusCaptionInput = useCallback(() => {
  requestAnimationFrame(() => {
    captionInputRef.current?.focus({ preventScroll: true });
  });
}, []);

const handleCaptionChange = (event) => {
  setCaptionText(clampCaptionText(event.target.value));
};
```

- [ ] **Step 3: Change `handleCapture` to stop after local capture**

Replace the upload/send part of `handleCapture` with local review creation:

```jsx
const blob = await new Promise((resolve, reject) => {
  canvas.toBlob((result) => {
    if (result) resolve(result);
    else reject(new Error('Unable to capture image'));
  }, 'image/jpeg', 0.9);
});

setReviewPhoto((current) => {
  if (current?.url) URL.revokeObjectURL(current.url);
  return {
    blob,
    url: URL.createObjectURL(blob)
  };
});
setCaptionText('');
setSendAnimationState('idle');
trackEvent('photo_review_opened', { coupleId });
```

Keep the existing camera-not-ready checks and error toast. Remove the call to `uploadPhotoBlob(blob)` and `showToast('Photo sent')` from `handleCapture`.

- [ ] **Step 4: Add dismiss behavior**

```jsx
const handleDismissReviewPhoto = () => {
  if (sendingReviewPhoto) return;
  clearReviewPhoto();
  trackEvent('photo_review_dismissed', { coupleId });
};
```

## Task 3: Send Reviewed Photos With Optional Captions

**Files:**
- Modify: `src/components/MainScreen.jsx`

- [ ] **Step 1: Extend `uploadPhotoBlob` signature**

Change:

```jsx
const uploadPhotoBlob = async (blob) => {
```

to:

```jsx
const uploadPhotoBlob = async (blob, caption = null) => {
```

- [ ] **Step 2: Build a photo document with optional caption**

Replace the existing `addDoc` payload with:

```jsx
const photoPayload = {
  photoUrl: url,
  senderId: user.uid,
  timestamp: timestampStr,
  liked: false
};

if (caption) {
  photoPayload.caption = caption;
}

const photoRef = await addDoc(collection(db, 'couples', coupleId, 'photos'), photoPayload);
```

Do not add `caption` to the couple summary document.

- [ ] **Step 3: Remove auto-scroll after send**

Delete the `setActiveView('home')`, `setPendingScrollPhotoId(createdPhotoId)`, `scrollToCreatedPhoto`, and timeout block inside `uploadPhotoBlob`. Keep `trackEvent('photo_sent', ...)`.

- [ ] **Step 4: Add reviewed-photo send handler**

```jsx
const handleSendReviewPhoto = async () => {
  if (!reviewPhoto || sendingReviewPhoto) return;
  setSendingReviewPhoto(true);
  try {
    const caption = buildCaptionPayload(captionText);
    await uploadPhotoBlob(reviewPhoto.blob, caption);
    setSendAnimationState('sent');
    showToast('Photo sent');
    window.setTimeout(() => {
      clearReviewPhoto();
      scrollToCamera('auto');
    }, 420);
  } catch (err) {
    console.error(err);
    showToast("Couldn't send photo", 3000);
    setSendingReviewPhoto(false);
  }
};
```

## Task 4: Render Review Mode And Feed Captions

**Files:**
- Modify: `src/components/MainScreen.jsx`

- [ ] **Step 1: Render captured photo in the camera frame**

Inside the camera `motion.article`, render the captured image above the live video when `reviewPhoto` exists:

```jsx
<AnimatePresence>
  {reviewPhoto && (
    <motion.div
      className="review-photo-layer"
      initial={{ opacity: 0, scale: 0.98 }}
      animate={sendAnimationState === 'sent' ? { opacity: 0, y: '-112%' } : { opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: sendAnimationState === 'sent' ? 0.38 : 0.18, ease: 'easeInOut' }}
    >
      <img src={reviewPhoto.url} alt="Captured preview" draggable={false} />
      <button className="caption-pill caption-editor" type="button" onClick={focusCaptionInput} disabled={sendingReviewPhoto}>
        <span aria-hidden={captionText.length === 0}>{captionText.length > 0 ? captionText : 'add a caption'}</span>
        <input
          ref={captionInputRef}
          value={captionText}
          onChange={handleCaptionChange}
          maxLength={MAX_CAPTION_LENGTH}
          inputMode="text"
          enterKeyHint="done"
          aria-label="Photo caption"
        />
      </button>
    </motion.div>
  )}
</AnimatePresence>
```

- [ ] **Step 2: Change camera controls based on review mode**

Use `isReviewingPhoto` to switch the buttons:

```jsx
<button
  className={`camera-tool-btn ${!isReviewingPhoto && flashEnabled ? 'active' : ''}`}
  type="button"
  aria-label={isReviewingPhoto ? 'Discard photo' : 'Toggle flash'}
  aria-pressed={!isReviewingPhoto ? flashEnabled : undefined}
  onClick={isReviewingPhoto ? handleDismissReviewPhoto : handleToggleFlash}
  disabled={sendingReviewPhoto}
>
  {isReviewingPhoto ? <XIcon /> : <FlashIcon />}
</button>
<motion.button
  id="main-capture-btn"
  className="shutter-btn"
  type="button"
  aria-label={isReviewingPhoto ? 'Send photo' : 'Capture photo'}
  onClick={isReviewingPhoto ? handleSendReviewPhoto : handleCapture}
  disabled={captureDisabled}
  whileTap={{ scale: 0.9 }}
>
  {(uploading || sendingReviewPhoto) ? <div className="spinner" /> : isReviewingPhoto ? <SendHorizontalIcon /> : null}
</motion.button>
<button
  className="camera-tool-btn"
  type="button"
  aria-label={isReviewingPhoto ? 'Add caption' : 'Switch camera'}
  onClick={isReviewingPhoto ? focusCaptionInput : handleSwitchCamera}
  disabled={sendingReviewPhoto}
>
  {isReviewingPhoto ? <CaptionIcon /> : <SwitchCameraIcon />}
</button>
```

- [ ] **Step 3: Render feed photo caption and move metadata below frame**

For each photo, compute:

```jsx
const photoCaption = getTextCaption(photo);
```

Render:

```jsx
<motion.article className="photo-card" initial={{ opacity: 0, scale: 0.96 }} animate={{ opacity: 1, scale: 1 }}>
  <div className="camera-frame">
    <img src={photo.photoUrl} alt="Shared moment" loading="eager" draggable={false} />
    {photoCaption.length > 0 && (
      <div className="caption-pill photo-caption-pill">{photoCaption}</div>
    )}
  </div>
  <div className="photo-meta-row">
    <div className="photo-meta">
      <strong>{isPhotoMine ? 'You' : senderName}</strong>
      <span>{timeAgo(photoTimestamp)}</span>
    </div>
    {isPhotoMine ? (
      <div className="status-chip" aria-label={photo.liked ? 'Liked' : 'Sent'}>
        {photo.liked ? <HeartIcon filled /> : <SendIcon />}
        {photo.liked ? 'Liked' : 'Sent'}
      </div>
    ) : (
      <motion.button
        className="like-btn"
        type="button"
        aria-label={photo.liked ? 'Unlike photo' : 'Like photo'}
        onClick={() => handleLikePhoto(photo)}
        whileTap={{ scale: 0.86 }}
        style={{ color: photo.liked ? 'var(--accent)' : '#fff' }}
      >
        <HeartIcon filled={photo.liked} />
      </motion.button>
    )}
  </div>
</motion.article>
```

## Task 5: Update Styles

**Files:**
- Modify: `src/index.css`

- [ ] **Step 1: Replace the on-photo gradient metadata styles**

Remove `.photo-gradient` usage and add metadata-below-frame styles:

```css
.photo-card {
  width: 100%;
}

.photo-meta-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 14px;
  width: 100%;
  min-height: 58px;
  padding: 14px 6px 0;
}

.photo-meta {
  display: flex;
  align-items: baseline;
  gap: 10px;
  min-width: 0;
}
```

- [ ] **Step 2: Add caption and review styles**

```css
.review-photo-layer {
  position: absolute;
  inset: 0;
  z-index: 2;
}

.review-photo-layer img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.caption-pill {
  position: absolute;
  left: 50%;
  bottom: 26px;
  z-index: 3;
  max-width: calc(100% - 52px);
  min-height: 42px;
  width: max-content;
  padding: 8px 18px;
  border-radius: var(--radius-full);
  background: rgba(28, 24, 22, 0.46);
  color: #fff;
  font-size: 20px;
  font-weight: 850;
  line-height: 1;
  white-space: pre;
  overflow: hidden;
  text-overflow: clip;
  transform: translateX(-50%);
  backdrop-filter: blur(16px);
  -webkit-backdrop-filter: blur(16px);
}

.caption-editor {
  cursor: text;
}

.caption-editor input {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  opacity: 0;
  cursor: text;
}
```

- [ ] **Step 3: Add keyboard-friendly review positioning**

```css
.camera-reels-slide:has(.review-photo-layer:focus-within) {
  justify-content: flex-start;
  padding-top: max(12px, calc(var(--safe-top) + 12px));
}
```

If browser support becomes a problem during verification, add a React class toggle instead.

## Task 6: Update Firestore Rules

**Files:**
- Modify: `firestore.rules`

- [ ] **Step 1: Add v1 caption validation helper before the couples match**

```rules
function isValidCaption(caption) {
  return caption is map
    && caption.keys().hasOnly(['type', 'text'])
    && caption.type == 'text'
    && caption.text is string
    && caption.text.size() > 0
    && caption.text.size() <= 27
    && !caption.text.matches('.*(\\n|\\r).*');
}

function hasValidOptionalCaption() {
  return !('caption' in request.resource.data)
    || isValidCaption(request.resource.data.caption);
}
```

- [ ] **Step 2: Require valid optional caption on photo create**

Change photo create to:

```rules
allow create: if isCoupleMember(coupleId)
  && request.resource.data.senderId == request.auth.uid
  && hasValidOptionalCaption();
```

## Task 7: Bump Version

**Files:**
- Modify: `package.json`
- Modify: `package-lock.json`

- [ ] **Step 1: Bump version**

Change both package files from `0.1.4` to `0.1.5`.

## Task 8: Verify

**Files:**
- Test: local commands and browser pass

- [ ] **Step 1: Run lint**

Run: `npm run lint`

Expected: command exits 0.

- [ ] **Step 2: Run build**

Run: `npm run build`

Expected: command exits 0 and writes `dist/`.

- [ ] **Step 3: Start local dev server**

Run: `npm run dev -- --host 127.0.0.1`

Expected: Vite serves a local URL.

- [ ] **Step 4: Browser visual pass**

Open the local URL and verify the app renders without immediate runtime errors. If auth/camera state prevents a full manual pass, inspect the rendered UI and console, then report the limitation.

## Self-Review

- Spec coverage: review state, caption limits, exact-space persistence, feed metadata, History thumbnail exclusion, rules, version bump, and verification are all mapped to tasks.
- Placeholder scan: no TBD/TODO placeholders.
- Type consistency: caption payload uses `caption.type` and `caption.text` consistently across UI and rules.
