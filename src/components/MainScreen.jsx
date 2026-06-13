import { useState, useEffect, useRef, useCallback, useLayoutEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Heart as LucideHeartIcon,
  Image as LucidePhotoIcon,
  LayoutGrid as LucideGridIcon,
  RefreshCw as LucideSwitchCameraIcon,
  Send as LucideSendIcon,
  SendHorizontal as LucideSendHorizontalIcon,
  X as LucideXIcon,
  UserRound as LucideUserIcon,
  Zap as LucideFlashIcon
} from 'lucide-react';
import HistoryScreen from './HistoryScreen';
import ProfileView from './ProfileView';
import { db, storage, auth, functions, doc, onSnapshot, updateDoc, updateProfile, ref, uploadBytes, uploadBytesResumable, getDownloadURL, signOut, collection, addDoc, httpsCallable } from '../firebase';
import { trackEvent } from '../analytics';
import { requestAndRegisterPushToken, sendTestPushNotification } from '../pushNotifications';
import {
  clearOfflineReviewDraft,
  createReviewDraftKey,
  loadOfflineReviewDraft,
  saveOfflineReviewDraft
} from '../lib/offlineReviewDraft';
import { triggerHaptic } from '../lib/haptics';
import { usePaginatedPhotos } from '../hooks/usePaginatedPhotos';
import { useCamera } from '../hooks/useCamera';
import { CAPTURE_JPEG_QUALITY, fitCaptureDimensions, getCoverCrop } from '../lib/camera';

const views = ['history', 'home', 'profile'];
const lucideIconProps = { strokeWidth: 2.4, 'aria-hidden': true };
const pushDebugEnabled = import.meta.env.VITE_ENABLE_PUSH_DEBUG === 'true';
const MAX_CAPTION_LENGTH = 36;
const SEND_REVIEW_TIMEOUT_MS = 25000;

function UserIcon() {
  return <LucideUserIcon {...lucideIconProps} />;
}

function XIcon() {
  return <LucideXIcon {...lucideIconProps} />;
}

function HomeIcon() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.4"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="lucide lucide-house"
      aria-hidden="true"
    >
      <path d="M3 10a2 2 0 0 1 .709-1.528l7-5.999a2 2 0 0 1 2.582 0l7 5.999A2 2 0 0 1 21 10v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
    </svg>
  );
}

function GridIcon() {
  return <LucideGridIcon {...lucideIconProps} strokeWidth={2.2} />;
}

function MiniShutterIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="12" cy="12" r="9" fill="var(--accent)" />
      <circle cx="12" cy="12" r="6.4" fill="#111" />
      <circle cx="12" cy="12" r="4.7" fill="#f4f4f4" className="h-px w-px" />
    </svg>
  );
}

function HeartIcon({ filled = false }) {
  return <LucideHeartIcon fill={filled ? 'currentColor' : 'none'} strokeWidth={2.4} aria-hidden="true" />;
}

function SendIcon() {
  return <LucideSendIcon {...lucideIconProps} />;
}

function SendHorizontalIcon() {
  return <LucideSendHorizontalIcon {...lucideIconProps} />;
}

function PhotoIcon() {
  return <LucidePhotoIcon {...lucideIconProps} />;
}

function FlashIcon() {
  return <LucideFlashIcon {...lucideIconProps} />;
}

function SwitchCameraIcon() {
  return <LucideSwitchCameraIcon {...lucideIconProps} />;
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

function uploadBlobWithTimeout(storageRef, blob) {
  const task = uploadBytesResumable(storageRef, blob);
  let timeoutId;

  return new Promise((resolve, reject) => {
    let settled = false;

    const finish = (callback, value) => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timeoutId);
      callback(value);
    };

    timeoutId = window.setTimeout(() => {
      if (settled) return;
      settled = true;
      task.cancel();
      reject(new Error('Send timed out. Reconnect and try again.'));
    }, SEND_REVIEW_TIMEOUT_MS);

    task.on(
      'state_changed',
      undefined,
      (error) => finish(reject, error),
      () => finish(resolve, task.snapshot)
    );
  });
}

function PhotoLoadMoreSentinel({ rootRef, hasMore, loading, error, onLoadMore }) {
  const sentinelRef = useRef(null);

  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel || !hasMore || loading || error) return undefined;
    const observer = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) onLoadMore();
    }, {
      root: rootRef.current,
      rootMargin: '100% 0px'
    });
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [rootRef, hasMore, loading, error, onLoadMore]);

  return (
    <div className="photo-load-more home-photo-load-more" ref={sentinelRef}>
      {loading && <div className="spinner" />}
      {error && <button type="button" onClick={onLoadMore}>Try again</button>}
    </div>
  );
}

export default function MainScreen({ user, coupleId, isOnline = true, onPairingRemoved }) {
  const [coupleData, setCoupleData] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [toast, setToast] = useState('');
  const [profiles, setProfiles] = useState({});
  const [isCameraInView, setIsCameraInView] = useState(true);
  const [pendingScrollPhotoId, setPendingScrollPhotoId] = useState(null);
  const [activeView, setActiveView] = useState('home');
  const [mountedViews, setMountedViews] = useState(() => new Set(['home']));
  const [flashEnabled, setFlashEnabled] = useState(false);
  const [reviewPhoto, setReviewPhoto] = useState(null);
  const [captionText, setCaptionText] = useState('');
  const [sendingReviewPhoto, setSendingReviewPhoto] = useState(false);
  const [sendAnimationState, setSendAnimationState] = useState('idle');
  const [removingPairing, setRemovingPairing] = useState(false);
  const [registeringPushDebug, setRegisteringPushDebug] = useState(false);
  const [sendingPushDebug, setSendingPushDebug] = useState(false);
  const [pushDebugResult, setPushDebugResult] = useState('');
  const profileFileRef = useRef(null);
  const videoRef = useRef(null);
  const captionInputRef = useRef(null);
  const reviewPhotoUrlRef = useRef(null);
  const reviewPhotoRef = useRef(null);
  const feedRef = useRef(null);
  const cameraSlideRef = useRef(null);
  const lastPhotoTimestampRef = useRef(null);
  const lastLikeTimestampRef = useRef(null);
  const swipeRef = useRef({
    axis: null,
    currentX: 0,
    currentY: 0,
    input: null,
    pointerId: null,
    startIndex: 1,
    startTime: 0,
    startX: 0,
    startY: 0,
    tracking: false
  });

  const photoUrl = coupleData?.currentPhotoUrl;
  const partnerUid = coupleData?.users?.find(uid => uid !== user.uid);
  const myProfile = profiles[user.uid];
  const partnerProfile = partnerUid ? profiles[partnerUid] : null;
  const displayName = myProfile?.displayName || user.displayName || user.email.split('@')[0];
  const partnerName = partnerProfile?.displayName || 'your person';
  const partnerEmail = partnerProfile?.email || partnerProfile?.normalizedEmail || '';
  const partnerPhoto = partnerProfile?.profilePic || partnerProfile?.photoURL || '';
  const profilePic = myProfile?.profilePic || user.photoURL || '';
  const buildVersion = import.meta.env.VITE_APP_VERSION || '0.0.0';
  const buildCommit = import.meta.env.VITE_APP_COMMIT || 'dev';
  const isReviewingPhoto = Boolean(reviewPhoto);
  const activeIndex = views.indexOf(activeView);
  const reviewDraftKey = user?.uid && coupleId ? createReviewDraftKey(user.uid, coupleId) : null;
  const {
    photos,
    loadingPhotos,
    loadingMorePhotos,
    photoLoadError,
    hasMorePhotos,
    loadMorePhotos,
    updatePhotoLocal
  } = usePaginatedPhotos(coupleId);

  const showToast = useCallback((message, duration = 2500) => {
    setToast(message);
    window.setTimeout(() => setToast(''), duration);
  }, []);

  const handleCameraError = useCallback((message) => {
    showToast(message, 2500);
  }, [showToast]);

  const handleCameraTiming = useCallback((timing) => {
    trackEvent('camera_ready', timing);
  }, []);

  const {
    status: cameraStatus,
    error: cameraError,
    facingMode,
    frozenFrame,
    isBusy: cameraBusy,
    retryCamera,
    switchCamera
  } = useCamera({
    videoRef,
    onError: handleCameraError,
    onTiming: handleCameraTiming
  });
  const captureDisabled = uploading
    || sendingReviewPhoto
    || sendAnimationState !== 'idle'
    || cameraBusy;
  const sendDisabled = captureDisabled || !isOnline;

  const scrollToCamera = useCallback((behavior = 'smooth') => {
    feedRef.current?.scrollTo({ top: 0, behavior });
  }, []);

  const positionHistoryPhotoBeforeOpen = useCallback((photoId) => {
    if (!photoId) return false;
    const feed = feedRef.current;
    const target = feed?.querySelector(`[data-photo-id="${photoId}"]`);
    if (!feed || !target) return false;
    const previousScrollBehavior = feed.style.scrollBehavior;
    feed.style.scrollBehavior = 'auto';
    feed.scrollTop = target.offsetTop;
    feed.style.scrollBehavior = previousScrollBehavior;
    return true;
  }, []);

  const clearReviewPhoto = useCallback(() => {
    if (reviewPhotoUrlRef.current) {
      URL.revokeObjectURL(reviewPhotoUrlRef.current);
      reviewPhotoUrlRef.current = null;
    }
    setReviewPhoto(null);
    setCaptionText('');
    setSendingReviewPhoto(false);
    setSendAnimationState('idle');
  }, []);

  const clearCurrentReviewDraft = useCallback(async () => {
    if (!reviewDraftKey) return;
    try {
      await clearOfflineReviewDraft(reviewDraftKey);
    } catch (err) {
      console.warn('Unable to clear offline review draft.', err);
    }
  }, [reviewDraftKey]);

  const focusCaptionInput = useCallback(() => {
    requestAnimationFrame(() => {
      captionInputRef.current?.focus({ preventScroll: true });
    });
  }, []);

  const handleCaptionChange = (event) => {
    setCaptionText(clampCaptionText(event.target.value));
  };

  const cameraSlideIsMostlyVisible = useCallback(() => {
    const feed = feedRef.current;
    const cameraSlide = cameraSlideRef.current;
    if (!feed || !cameraSlide) return isCameraInView;

    const feedRect = feed.getBoundingClientRect();
    const cameraRect = cameraSlide.getBoundingClientRect();
    const visibleTop = Math.max(feedRect.top, cameraRect.top);
    const visibleBottom = Math.min(feedRect.bottom, cameraRect.bottom);
    const visibleHeight = Math.max(0, visibleBottom - visibleTop);
    return visibleHeight / Math.max(cameraRect.height, 1) >= 0.58;
  }, [isCameraInView]);

  useEffect(() => {
    if (!coupleId) return;
    const unsub = onSnapshot(doc(db, 'couples', coupleId), (snap) => {
      if (snap.exists()) {
        const data = snap.data();
        setCoupleData(data);

        if (data.senderId && data.senderId !== user.uid && data.timestamp) {
          if (lastPhotoTimestampRef.current && data.timestamp !== lastPhotoTimestampRef.current) {
            showToast('New photo from your person');
          }
          lastPhotoTimestampRef.current = data.timestamp;
        } else if (data.timestamp) {
          lastPhotoTimestampRef.current = data.timestamp;
        }

        if (data.lastLike && data.lastLike.userId !== user.uid && data.lastLike.timestamp) {
          if (lastLikeTimestampRef.current && data.lastLike.timestamp !== lastLikeTimestampRef.current) {
            showToast('Your photo was liked');
          }
          lastLikeTimestampRef.current = data.lastLike.timestamp;
        } else if (data.lastLike?.timestamp) {
          lastLikeTimestampRef.current = data.lastLike.timestamp;
        }
      }
    });
    return () => unsub();
  }, [coupleId, user.uid, showToast]);

  useEffect(() => {
    reviewPhotoRef.current = reviewPhoto;
  }, [reviewPhoto]);

  useEffect(() => {
    return () => {
      if (reviewPhotoUrlRef.current) {
        URL.revokeObjectURL(reviewPhotoUrlRef.current);
        reviewPhotoUrlRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    if (!reviewDraftKey) return undefined;

    let active = true;
    const restoreDraft = async () => {
      try {
        const draft = await loadOfflineReviewDraft(reviewDraftKey);
        if (!active || !draft?.blob || reviewPhotoRef.current) return;

        const url = URL.createObjectURL(draft.blob);
        reviewPhotoUrlRef.current = url;
        setReviewPhoto({
          blob: draft.blob,
          url
        });
        setCaptionText(clampCaptionText(draft.captionText || ''));
        setSendAnimationState('idle');
        trackEvent('photo_review_draft_restored', { coupleId });
      } catch (err) {
        console.warn('Unable to restore offline review draft.', err);
      }
    };

    restoreDraft();

    return () => {
      active = false;
    };
  }, [reviewDraftKey, coupleId]);

  useEffect(() => {
    if (!reviewDraftKey || !reviewPhoto) return;

    saveOfflineReviewDraft(reviewDraftKey, {
      blob: reviewPhoto.blob,
      captionText,
      updatedAt: new Date().toISOString()
    }).catch((err) => {
      console.warn('Unable to save offline review draft.', err);
    });
  }, [reviewDraftKey, reviewPhoto, captionText]);

  useEffect(() => {
    const feed = feedRef.current;
    const cameraSlide = cameraSlideRef.current;
    if (!feed || !cameraSlide) return;

    const observer = new IntersectionObserver(
      ([entry]) => setIsCameraInView(entry.isIntersecting && entry.intersectionRatio >= 0.58),
      { root: feed, threshold: [0, 0.58, 1] }
    );

    observer.observe(cameraSlide);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!coupleData?.users) return;

    const unsubs = coupleData.users.map((uid) => {
      return onSnapshot(doc(db, 'users', uid), (snap) => {
        if (snap.exists()) {
          setProfiles((prev) => ({
            ...prev,
            [uid]: snap.data()
          }));
        }
      });
    });

    return () => {
      unsubs.forEach((unsub) => unsub());
    };
  }, [coupleData?.users]);

  useLayoutEffect(() => {
    if (!pendingScrollPhotoId || photos.length === 0 || activeView === 'home') return;

    if (positionHistoryPhotoBeforeOpen(pendingScrollPhotoId)) {
      setPendingScrollPhotoId(null);
      setActiveView('home');
    }
  }, [pendingScrollPhotoId, photos, positionHistoryPhotoBeforeOpen, activeView]);

  useEffect(() => {
    if (activeView !== 'home') setToast('');
  }, [activeView]);

  useEffect(() => {
    trackEvent('main_view_changed', { view: activeView });
  }, [activeView]);

  useEffect(() => {
    if (!coupleId || !photoUrl || loadingPhotos || photos.length > 0) return;

    const seedPhoto = async () => {
      try {
        await addDoc(collection(db, 'couples', coupleId, 'photos'), {
          photoUrl,
          senderId: coupleData?.senderId || user.uid,
          timestamp: coupleData?.timestamp || new Date().toISOString(),
          liked: coupleData?.liked || false
        });
      } catch (err) {
        console.error('Error seeding photo: ', err);
      }
    };
    seedPhoto();
  }, [coupleId, photoUrl, loadingPhotos, photos.length, coupleData, user.uid]);

  const compressImage = (file) => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        const img = new Image();
        img.onload = () => {
          const canvas = document.createElement('canvas');
          const MAX = 1200;
          let w = img.width, h = img.height;
          if (w > MAX || h > MAX) {
            if (w > h) { h = (h / w) * MAX; w = MAX; }
            else { w = (w / h) * MAX; h = MAX; }
          }
          canvas.width = w;
          canvas.height = h;
          const ctx = canvas.getContext('2d');
          ctx.drawImage(img, 0, 0, w, h);
          canvas.toBlob((blob) => {
            if (blob) resolve(blob);
            else reject(new Error('Unable to compress image'));
          }, 'image/jpeg', 0.85);
        };
        img.onerror = () => reject(new Error('Unable to read image'));
        img.src = e.target.result;
      };
      reader.onerror = () => reject(new Error('Unable to read image'));
      reader.readAsDataURL(file);
    });
  };

  const uploadPhotoBlob = async (blob, caption = null) => {
    const filename = `couples/${coupleId}/${Date.now()}.jpg`;
    const storageRef = ref(storage, filename);
    await uploadBlobWithTimeout(storageRef, blob);
    const url = await getDownloadURL(storageRef);
    const timestampStr = new Date().toISOString();

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

    await updateDoc(doc(db, 'couples', coupleId), {
      currentPhotoUrl: url,
      senderId: user.uid,
      timestamp: timestampStr,
      liked: false,
      lastLike: null
    });

    const createdPhotoId = photoRef?.id || photoRef?._id;
    trackEvent('photo_sent', { coupleId, photoId: createdPhotoId || null });
  };

  const handleCapture = async () => {
    if (captureDisabled) return;

    if (!cameraSlideIsMostlyVisible()) {
      scrollToCamera();
      return;
    }

    if (cameraStatus !== 'ready') {
      showToast('Camera is not ready yet', 2200);
      return;
    }

    const video = videoRef.current;
    if (video && (!video.videoWidth || !video.videoHeight)) {
      try {
        await video.play();
      } catch (err) {
        console.warn('Camera playback retry failed.', err);
      }
    }

    if (!video?.videoWidth || !video?.videoHeight) {
      showToast('Camera is not ready yet', 2200);
      return;
    }

    triggerHaptic('tap');
    setUploading(true);
    try {
      const canvas = document.createElement('canvas');
      const crop = getCoverCrop(video.videoWidth, video.videoHeight);
      const captureSize = fitCaptureDimensions(crop.width, crop.height);
      canvas.width = captureSize.width;
      canvas.height = captureSize.height;
      const ctx = canvas.getContext('2d');
      if (facingMode === 'user') {
        ctx.translate(canvas.width, 0);
        ctx.scale(-1, 1);
      }
      ctx.drawImage(
        video,
        crop.x,
        crop.y,
        crop.width,
        crop.height,
        0,
        0,
        canvas.width,
        canvas.height
      );

      const blob = await new Promise((resolve, reject) => {
        canvas.toBlob((result) => {
          if (result) resolve(result);
          else reject(new Error('Unable to capture image'));
        }, 'image/jpeg', CAPTURE_JPEG_QUALITY);
      });

      setReviewPhoto(() => {
        if (reviewPhotoUrlRef.current) URL.revokeObjectURL(reviewPhotoUrlRef.current);
        const url = URL.createObjectURL(blob);
        reviewPhotoUrlRef.current = url;
        return {
          blob,
          url
        };
      });
      setCaptionText('');
      setSendAnimationState('idle');
      trackEvent('photo_review_opened', { coupleId });
    } catch (err) {
      console.error(err);
      showToast('Failed to capture photo', 3000);
    } finally {
      setUploading(false);
    }
  };

  const handleDismissReviewPhoto = () => {
    if (sendingReviewPhoto) return;
    clearReviewPhoto();
    clearCurrentReviewDraft();
    trackEvent('photo_review_dismissed', { coupleId });
  };

  const handleSendReviewPhoto = async () => {
    if (!reviewPhoto || sendingReviewPhoto) return;
    if (!isOnline) {
      showToast('Reconnect to send', 3000);
      return;
    }
    triggerHaptic('tap');
    setSendingReviewPhoto(true);
    try {
      const caption = buildCaptionPayload(captionText);
      await uploadPhotoBlob(reviewPhoto.blob, caption);
      await clearCurrentReviewDraft();
      setSendAnimationState('sent');
      showToast('Photo sent');
      window.setTimeout(() => {
        clearReviewPhoto();
        scrollToCamera('auto');
      }, 420);
    } catch (err) {
      console.error(err);
      showToast(err?.message || "Couldn't send photo", 3000);
      setSendingReviewPhoto(false);
    }
  };

  const handleProfilePhotoChange = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const compressed = await compressImage(file);
      const storageRef = ref(storage, `users/${user.uid}/profile-${Date.now()}.jpg`);
      await uploadBytes(storageRef, compressed);
      const url = await getDownloadURL(storageRef);
      await updateDoc(doc(db, 'users', user.uid), { profilePic: url });
      showToast('Profile photo updated');
      trackEvent('profile_photo_updated');
    } catch (err) {
      console.error(err);
      showToast('Failed to update profile photo', 3000);
    } finally {
      setUploading(false);
      e.target.value = '';
    }
  };

  const handleRemoveProfilePhoto = async () => {
    await updateDoc(doc(db, 'users', user.uid), { profilePic: '' });
    showToast('Profile photo removed');
    trackEvent('profile_photo_removed');
  };

  const handleSaveDisplayName = async (nextDisplayName) => {
    const displayNameValue = nextDisplayName.trim();
    await updateDoc(doc(db, 'users', user.uid), {
      displayName: displayNameValue,
      updatedAt: new Date().toISOString()
    });

    try {
      if (auth.currentUser) {
        await updateProfile(auth.currentUser, { displayName: displayNameValue });
      }
    } catch (err) {
      console.warn('Could not sync Firebase Auth display name.', err);
    }

    showToast('Display name updated');
    trackEvent('display_name_updated');
  };

  const handleSelectHistoryPhoto = (photoId) => {
    setToast('');
    if (positionHistoryPhotoBeforeOpen(photoId)) {
      setPendingScrollPhotoId(null);
      setActiveView('home');
    } else {
      setPendingScrollPhotoId(photoId);
    }
  };

  const handleSwitchCamera = async () => {
    const nextMode = facingMode === 'environment' ? 'user' : 'environment';
    if (await switchCamera()) {
      trackEvent('camera_switched', { facingMode: nextMode });
    }
  };

  const handleToggleFlash = () => {
    setFlashEnabled((current) => !current);
    showToast('Flash toggle is a device placeholder for now', 1800);
  };

  const handleLikePhoto = async (photo) => {
    if (uploading) return;
    const isLiked = photo.liked || false;
    const nextLiked = !isLiked;
    updatePhotoLocal(photo.id, { liked: nextLiked });
    try {
      const photoRef = doc(db, 'couples', coupleId, 'photos', photo.id);

      await updateDoc(photoRef, {
        liked: nextLiked
      });

      await updateDoc(doc(db, 'couples', coupleId), {
        liked: nextLiked,
        lastLike: nextLiked ? {
          userId: user.uid,
          timestamp: new Date().toISOString(),
          photoId: photo.id
        } : null
      });

      if (nextLiked) {
        showToast('Photo liked', 1500);
        trackEvent('photo_liked', { photoId: photo.id });
      }
    } catch (err) {
      updatePhotoLocal(photo.id, { liked: isLiked });
      console.error(err);
    }
  };

  const handleLogout = async () => {
    await signOut(auth);
  };

  const handleRemovePairing = async () => {
    if (removingPairing) return;
    setRemovingPairing(true);
    try {
      await httpsCallable(functions, 'removePairing')();
      onPairingRemoved?.('Pairing removed. You can pair again whenever you are ready.');
      trackEvent('pairing_remove_confirmed');
    } catch (err) {
      console.error('Failed to remove pairing:', err);
      const message = err?.message?.replace(/^Firebase: /, '') || 'Failed to remove pairing.';
      showToast(message, 3200);
    } finally {
      setRemovingPairing(false);
    }
  };

  const formatPushDebugResult = (result) => {
    const tokenCount = result?.tokenCount ?? 0;
    const successCount = result?.successCount ?? 0;
    const failureCount = result?.failureCount ?? 0;
    const staleDeletedCount = result?.staleDeletedCount ?? 0;
    const failureCodes = Array.isArray(result?.failureCodes) ? result.failureCodes.filter(Boolean) : [];
    const staleText = staleDeletedCount > 0 ? `, stale deleted: ${staleDeletedCount}` : '';
    const codeText = failureCodes.length ? `, codes: ${failureCodes.join(', ')}` : '';
    return `tokens: ${tokenCount}, success: ${successCount}, failed: ${failureCount}${staleText}${codeText}`;
  };

  const handleRegisterPushDebug = async () => {
    if (registeringPushDebug) return;
    setRegisteringPushDebug(true);
    setPushDebugResult('Registering this device...');
    try {
      const result = await requestAndRegisterPushToken();
      const message = result.ok
        ? 'registered: this browser has an FCM token'
        : `registration: ${result.reason || 'failed'}`;
      setPushDebugResult(message);
      showToast(message, 3200);
      console.debug('Push debug registration result.', result);
      trackEvent('push_debug_register_result', {
        status: result.ok ? 'registered' : result.reason || 'failed'
      });
    } catch (err) {
      const message = err?.message?.replace(/^Firebase: /, '') || 'registration: failed';
      setPushDebugResult(message);
      showToast(message, 3600);
      console.error('Push debug registration failed.', err);
      trackEvent('push_debug_register_result', { status: 'error' });
    } finally {
      setRegisteringPushDebug(false);
    }
  };

  const handleSendPushDebug = async () => {
    if (sendingPushDebug) return;
    setSendingPushDebug(true);
    setPushDebugResult('Sending test push...');
    try {
      const result = await sendTestPushNotification();
      const message = formatPushDebugResult(result);
      setPushDebugResult(message);
      showToast(message, 3600);
      console.debug('Push debug send result.', result);
      trackEvent('push_debug_test_result', {
        tokenCount: result?.tokenCount ?? 0,
        successCount: result?.successCount ?? 0,
        failureCount: result?.failureCount ?? 0
      });
    } catch (err) {
      const message = err?.message?.replace(/^Firebase: /, '') || 'test push: failed';
      setPushDebugResult(message);
      showToast(message, 3600);
      console.error('Push debug send failed.', err);
      trackEvent('push_debug_test_result', { status: 'error' });
    } finally {
      setSendingPushDebug(false);
    }
  };

  const timeAgo = (date) => {
    if (!date) return '';
    const diff = (Date.now() - date.getTime()) / 1000;
    if (diff < 60) return 'Just now';
    if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
    if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
    return date.toLocaleDateString();
  };

  const goToView = (view) => {
    if (view === 'home' && activeView === 'home' && !isCameraInView) {
      scrollToCamera();
      return;
    }
    setMountedViews((current) => current.has(view) ? current : new Set([...current, view]));
    setActiveView(view);
  };

  const resetSwipe = () => {
    swipeRef.current.tracking = false;
    swipeRef.current.axis = null;
    swipeRef.current.input = null;
    swipeRef.current.pointerId = null;
  };

  const beginSwipe = (input, x, y, pointerId = null) => {
    swipeRef.current = {
      axis: null,
      currentX: x,
      currentY: y,
      input,
      pointerId,
      startIndex: activeIndex,
      startTime: performance.now(),
      startX: x,
      startY: y,
      tracking: true
    };
  };

  const updateSwipe = (x, y) => {
    const swipe = swipeRef.current;
    if (!swipe.tracking) return null;

    swipe.currentX = x;
    swipe.currentY = y;

    const dx = x - swipe.startX;
    const dy = y - swipe.startY;
    const absX = Math.abs(dx);
    const absY = Math.abs(dy);

    if (!swipe.axis && Math.max(absX, absY) > 8) {
      swipe.axis = absX > absY * 1.25 ? 'horizontal' : 'vertical';
    }

    return swipe.axis;
  };

  const finishSwipe = (x = swipeRef.current.currentX) => {
    const swipe = swipeRef.current;
    if (!swipe.tracking) return null;

    const dx = x - swipe.startX;
    const elapsed = Math.max(performance.now() - swipe.startTime, 1);
    const velocity = dx / elapsed;

    if (swipe.axis !== 'horizontal') {
      resetSwipe();
      return null;
    }

    const shouldSwitch = Math.abs(dx) >= 70 || Math.abs(velocity) >= 0.55;
    if (!shouldSwitch) {
      resetSwipe();
      return null;
    }

    const direction = dx < 0 ? 1 : -1;
    const nextIndex = Math.min(Math.max(swipe.startIndex + direction, 0), views.length - 1);
    const nextView = views[nextIndex];
    setMountedViews((current) => current.has(nextView) ? current : new Set([...current, nextView]));
    setActiveView(nextView);
    resetSwipe();
    return nextIndex;
  };

  const handleSwipeTouchStart = (event) => {
    if (event.touches.length !== 1) return;
    const touch = event.touches[0];
    beginSwipe('touch', touch.clientX, touch.clientY);
  };

  const handleSwipeTouchMove = (event) => {
    if (event.touches.length !== 1 || swipeRef.current.input !== 'touch') return;
    const touch = event.touches[0];
    if (updateSwipe(touch.clientX, touch.clientY) === 'horizontal') {
      event.preventDefault();
    }
  };

  const handleSwipeTouchEnd = (event) => {
    if (swipeRef.current.input !== 'touch') return;
    const touch = event.changedTouches[0];
    const nextIndex = finishSwipe(touch?.clientX);
    if (nextIndex !== null) {
      event.preventDefault();
    }
  };

  const handleSwipePointerDown = (event) => {
    if (!event.isPrimary || event.pointerType === 'touch' || (event.pointerType === 'mouse' && event.button !== 0)) return;
    beginSwipe('pointer', event.clientX, event.clientY, event.pointerId);
  };

  const handleSwipePointerMove = (event) => {
    const swipe = swipeRef.current;
    if (swipe.input !== 'pointer' || !swipe.tracking || event.pointerId !== swipe.pointerId) return;
    if (updateSwipe(event.clientX, event.clientY) === 'horizontal') {
      event.currentTarget.setPointerCapture?.(event.pointerId);
      event.preventDefault();
    }
  };

  const handleSwipePointerUp = (event) => {
    const swipe = swipeRef.current;
    if (swipe.input !== 'pointer' || !swipe.tracking || event.pointerId !== swipe.pointerId) return;
    const nextIndex = finishSwipe(event.clientX);
    if (nextIndex !== null) {
      event.preventDefault();
    }
  };

  return (
    <div className="app-shell auth-shell">
      <motion.div
        className="view-track"
        animate={{ x: `-${activeIndex * 100}%` }}
        transition={{ type: 'spring', stiffness: 280, damping: 32 }}
        onPointerDown={handleSwipePointerDown}
        onPointerMove={handleSwipePointerMove}
        onPointerUp={handleSwipePointerUp}
        onPointerCancel={resetSwipe}
        onTouchStart={handleSwipeTouchStart}
        onTouchMove={handleSwipeTouchMove}
        onTouchEnd={handleSwipeTouchEnd}
        onTouchCancel={resetSwipe}
      >
        <section className="shell-view">
          {mountedViews.has('history') && (
            <HistoryScreen
              photos={photos}
              loading={loadingPhotos}
              hasMore={hasMorePhotos}
              loadingMore={loadingMorePhotos}
              loadError={photoLoadError}
              onLoadMore={loadMorePhotos}
              onSelectPhoto={handleSelectHistoryPhoto}
            />
          )}
        </section>

        <section className="shell-view home-screen" aria-label="Home">
          <main className="camera-stage">
            <div className="reels-feed" ref={feedRef}>
              <div className="reels-slide camera-reels-slide" ref={cameraSlideRef}>
                <motion.article
                  className={`camera-frame camera-live ${facingMode === 'user' ? 'front-camera' : ''}`}
                  initial={{ opacity: 0, scale: 0.96 }}
                  animate={{ opacity: 1, scale: 1 }}
                >
                  <video ref={videoRef} playsInline muted autoPlay />
                  {frozenFrame && (
                    <div className="camera-switch-overlay" aria-label="Switching camera">
                      <img src={frozenFrame} alt="" draggable={false} />
                      <div className="spinner" />
                    </div>
                  )}
                  {cameraStatus !== 'ready' && !frozenFrame && (
                    <div className="empty-state camera-state">
                      <PhotoIcon />
                      {cameraStatus === 'requesting' || cameraStatus === 'resuming' || cameraStatus === 'switching' ? (
                        <>
                          <strong>Starting camera</strong>
                          <span>Allow camera access to capture your next moment.</span>
                          <div className="spinner" />
                        </>
                      ) : (
                        <>
                          <strong>{cameraStatus === 'denied' ? 'Camera blocked' : 'Camera unavailable'}</strong>
                          <span>{cameraError || 'Check camera access, then try again.'}</span>
                          <button className="camera-retry-btn" type="button" onClick={retryCamera}>
                            Try again
                          </button>
                        </>
                      )}
                    </div>
                  )}
                  <AnimatePresence>
                    {reviewPhoto && (
                      <motion.div
                        className="review-photo-layer"
                        initial={{ opacity: 0, scale: 0.98 }}
                        animate={
                          sendAnimationState === 'sent'
                            ? { opacity: 0, y: '-112%', scale: 1 }
                            : { opacity: 1, y: 0, scale: 1 }
                        }
                        exit={{ opacity: 0 }}
                        transition={{
                          duration: sendAnimationState === 'sent' ? 0.38 : 0.18,
                          ease: 'easeInOut'
                        }}
                      >
                        <img src={reviewPhoto.url} alt="Captured preview" draggable={false} />
                        <label className="caption-pill caption-editor">
                          <span className="caption-editor-sizer" aria-hidden="true">
                            {captionText.length > 0 ? captionText : 'add a caption'}
                          </span>
                          <input
                            ref={captionInputRef}
                            value={captionText}
                            onChange={handleCaptionChange}
                            maxLength={MAX_CAPTION_LENGTH}
                            inputMode="text"
                            enterKeyHint="done"
                            placeholder="add a caption"
                            aria-label="Photo caption"
                            disabled={sendingReviewPhoto}
                          />
                        </label>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </motion.article>

                <div className="camera-item-controls" aria-label="Camera controls">
                  <button
                    className={`camera-tool-btn ${!isReviewingPhoto && flashEnabled ? 'active' : ''}`}
                    type="button"
                    aria-label={isReviewingPhoto ? 'Discard photo' : 'Toggle flash'}
                    aria-pressed={!isReviewingPhoto ? flashEnabled : undefined}
                    onClick={isReviewingPhoto ? handleDismissReviewPhoto : handleToggleFlash}
                    disabled={sendingReviewPhoto || cameraBusy}
                  >
                    {isReviewingPhoto ? <XIcon /> : <FlashIcon />}
                  </button>
                  <motion.button
                    id="main-capture-btn"
                    className="shutter-btn"
                    type="button"
                    aria-label={isReviewingPhoto ? 'Send photo' : 'Capture photo'}
                    onClick={isReviewingPhoto ? handleSendReviewPhoto : handleCapture}
                    disabled={isReviewingPhoto ? sendDisabled : captureDisabled}
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
                    {isReviewingPhoto ? <span className="caption-tool-label" aria-hidden="true">Aa</span> : <SwitchCameraIcon />}
                  </button>
                </div>
              </div>

              {loadingPhotos ? (
                <div className="reels-slide">
                  <div className="camera-frame empty">
                    <div className="spinner" />
                  </div>
                </div>
              ) : photos.length > 0 ? (
                photos.map((photo) => {
                  const isPhotoMine = photo.senderId === user.uid;
                  const photoTimestamp = photo.timestamp ? new Date(photo.timestamp) : null;
                  const senderProfile = photo.senderId === user.uid ? myProfile : profiles[photo.senderId];
                  const senderName = isPhotoMine ? displayName : senderProfile?.displayName || partnerName;
                  const photoCaption = getTextCaption(photo);
                  return (
                    <div
                      key={photo.id}
                      className="reels-slide"
                      data-photo-id={photo.id}
                    >
                      <motion.article
                        className="photo-card"
                        initial={{ opacity: 0, scale: 0.96 }}
                        animate={{ opacity: 1, scale: 1 }}
                      >
                        <div className="camera-frame">
                          <img src={photo.photoUrl} alt="Shared moment" loading="lazy" decoding="async" draggable={false} />
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
                    </div>
                  );
                }).concat(
                  <PhotoLoadMoreSentinel
                    key="photo-load-more"
                    rootRef={feedRef}
                    hasMore={hasMorePhotos}
                    loading={loadingMorePhotos}
                    error={photoLoadError}
                    onLoadMore={loadMorePhotos}
                  />
                )
              ) : (
                <div className="reels-slide">
                  <div className="camera-frame empty">
                    <div className="empty-state">
                      <PhotoIcon />
                      <strong>No photos yet</strong>
                      <span>Tap the shutter to send your first shared moment.</span>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </main>
        </section>

        <section className="shell-view">
          {mountedViews.has('profile') && <ProfileView
            displayName={displayName}
            email={user.email}
            profilePic={profilePic}
            partnerName={partnerName}
            partnerEmail={partnerEmail}
            partnerPic={partnerPhoto}
            buildVersion={buildVersion}
            buildCommit={buildCommit}
            uploading={uploading}
            removingPairing={removingPairing}
            onPickPhoto={() => profileFileRef.current?.click()}
            onRemovePhoto={handleRemoveProfilePhoto}
            onSaveDisplayName={handleSaveDisplayName}
            onLogout={handleLogout}
            onRemovePairing={handleRemovePairing}
            pushDebugEnabled={pushDebugEnabled}
            pushDebugResult={pushDebugResult}
            registeringPushDebug={registeringPushDebug}
            sendingPushDebug={sendingPushDebug}
            onRegisterPushDebug={handleRegisterPushDebug}
            onSendPushDebug={handleSendPushDebug}
          />}
        </section>
      </motion.div>

      <input
        ref={profileFileRef}
        type="file"
        accept="image/*"
        onChange={handleProfilePhotoChange}
        style={{ display: 'none' }}
      />

      <nav className="bottom-nav" aria-label="Primary">
        <button
          className={`nav-item ${activeView === 'history' ? 'active' : ''}`}
          type="button"
          aria-label="History"
          aria-current={activeView === 'history' ? 'page' : undefined}
          onClick={() => goToView('history')}
        >
          <GridIcon />
        </button>
        <button
          className={`nav-item home-nav-item ${activeView === 'home' ? 'active' : ''}`}
          type="button"
          aria-label={activeView === 'home' && !isCameraInView ? 'Scroll to camera' : 'Home'}
          aria-current={activeView === 'home' ? 'page' : undefined}
          onClick={() => goToView('home')}
        >
          <AnimatePresence mode="wait" initial={false}>
            {isCameraInView ? (
              <motion.span key="home" initial={{ opacity: 0, scale: 0.8 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.8 }}>
                <HomeIcon />
              </motion.span>
            ) : (
              <motion.span key="shutter" className="mini-shutter-nav-icon" initial={{ opacity: 0, scale: 0.8 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.8 }}>
                <MiniShutterIcon />
              </motion.span>
            )}
          </AnimatePresence>
        </button>
        <button
          className={`nav-item ${activeView === 'profile' ? 'active' : ''}`}
          type="button"
          aria-label="Profile"
          aria-current={activeView === 'profile' ? 'page' : undefined}
          onClick={() => goToView('profile')}
        >
          <UserIcon />
        </button>
      </nav>

      <AnimatePresence>
        {toast && (
          <motion.div
            className="toast"
            initial={{ opacity: 0, y: 18, x: '-50%' }}
            animate={{ opacity: 1, y: 0, x: '-50%' }}
            exit={{ opacity: 0, y: 18, x: '-50%' }}
          >
            {toast}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
