import { useState, useEffect, useRef, useCallback, useLayoutEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import {
  Heart as LucideHeartIcon,
  Image as LucidePhotoIcon,
  LayoutGrid as LucideGridIcon,
  RefreshCw as LucideSwitchCameraIcon,
  Send as LucideSendIcon,
  Trash2 as LucideTrashIcon,
  X as LucideXIcon,
  UserRound as LucideUserIcon,
  Zap as LucideFlashIcon
} from 'lucide-react';
import HistoryScreen from './HistoryScreen';
import ProfileView from './ProfileView';
import { db, storage, auth, functions, doc, onSnapshot, updateDoc, updateProfile, ref, uploadBytes, uploadBytesResumable, getDownloadURL, signOut, collection, addDoc, httpsCallable } from '../firebase';
import { trackEvent } from '../analytics';
import {
  clearOfflineReviewDraft,
  createReviewDraftKey,
  loadOfflineReviewDraft,
  saveOfflineReviewDraft
} from '../lib/offlineReviewDraft';
import {
  LOCAL_PHOTO_STATUS,
  appendLocalPhoto,
  createLocalPhoto,
  deleteLocalPhoto,
  findNextUploadableLocalPhoto,
  markLocalPhotoFailed,
  markLocalPhotoPending,
  markLocalPhotoUploading,
  replaceLocalPhotoWithServerPhoto
} from '../lib/localPhotoQueue';
import {
  clearLocalPhotoQueue,
  createLocalPhotoQueueKey,
  loadLocalPhotoQueue,
  saveLocalPhotoQueue
} from '../lib/localPhotoQueueStore';
import { triggerHaptic } from '../lib/haptics';
import { usePaginatedPhotos } from '../hooks/usePaginatedPhotos';
import { useCamera } from '../hooks/useCamera';
import { CAPTURE_JPEG_QUALITY, fitCaptureDimensions, getCoverCrop } from '../lib/camera';
import {
  createHistoryThumbnailBlob,
  HISTORY_THUMBNAIL_EXTENSION,
  HISTORY_THUMBNAIL_TYPE
} from '../lib/photoThumbnails';

const views = ['history', 'home', 'profile'];
const lucideIconProps = { strokeWidth: 2.4, 'aria-hidden': true };
const MAX_CAPTION_LENGTH = 36;
const SEND_REVIEW_TIMEOUT_MS = 25000;
const shutterInnerVariants = {
  rest: { scale: 1 },
  tap: { scale: 0.75 }
};

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

function ShutterIcon({ pressed = false }) {
  return (
    <svg className="shutter-icon" width="96" height="96" viewBox="0 0 96 96" fill="none" aria-hidden="true" xmlns="http://www.w3.org/2000/svg">
      <path d="M96 48C96 74.5097 74.5097 96 48 96C21.4903 96 0 74.5097 0 48C0 21.4903 21.4903 0 48 0C74.5097 0 96 21.4903 96 48ZM4.8 48C4.8 71.8587 24.1413 91.2 48 91.2C71.8587 91.2 91.2 71.8587 91.2 48C91.2 24.1413 71.8587 4.8 48 4.8C24.1413 4.8 4.8 24.1413 4.8 48Z" fill="#4F72FC" />
      <motion.circle
        className="shutter-icon-inner"
        cx="48"
        cy="48"
        r="39.7217"
        fill="#D9D9D9"
        variants={shutterInnerVariants}
        animate={pressed ? 'tap' : 'rest'}
        transition={{ duration: 0.15, ease: 'easeOut' }}
      />
    </svg>
  );
}

function HeartIcon({ filled = false }) {
  return <LucideHeartIcon fill={filled ? 'currentColor' : 'none'} strokeWidth={2.4} aria-hidden="true" />;
}

function SendIcon() {
  return <LucideSendIcon {...lucideIconProps} />;
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

function TrashIcon() {
  return <LucideTrashIcon {...lucideIconProps} />;
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
  const { t } = useTranslation('common');
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
      {error && <button type="button" onClick={onLoadMore}>{t('actions.tryAgain')}</button>}
    </div>
  );
}

export default function MainScreen({
  user,
  coupleId,
  isOnline = true,
  onPairingRemoved,
  notificationControls = null,
  notificationIntent = null,
  onNotificationIntentConsumed = null
}) {
  const { t } = useTranslation(['camera', 'common', 'pairing', 'profile']);
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
  const [localPhotos, setLocalPhotos] = useState([]);
  const [localPhotoQueueReady, setLocalPhotoQueueReady] = useState(false);
  const [queueUploadingPhotoId, setQueueUploadingPhotoId] = useState(null);
  const [sendingReviewPhoto, setSendingReviewPhoto] = useState(false);
  const [sendAnimationState, setSendAnimationState] = useState('idle');
  const [shutterPressed, setShutterPressed] = useState(false);
  const [removingPairing, setRemovingPairing] = useState(false);
  const profileFileRef = useRef(null);
  const videoRef = useRef(null);
  const captionInputRef = useRef(null);
  const reviewPhotoUrlRef = useRef(null);
  const reviewPhotoRef = useRef(null);
  const localPhotosRef = useRef([]);
  const queueUploadInFlightRef = useRef(false);
  const feedRef = useRef(null);
  const cameraSlideRef = useRef(null);
  const lastPhotoTimestampRef = useRef(null);
  const lastLikeTimestampRef = useRef(null);
  const shutterReleaseTimeoutRef = useRef(null);
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
  const localPhotoQueueKey = user?.uid && coupleId ? createLocalPhotoQueueKey(user.uid, coupleId) : null;
  const {
    photos,
    loadingPhotos,
    loadingMorePhotos,
    photoLoadError,
    hasMorePhotos,
    loadMorePhotos,
    updatePhotoLocal,
    insertServerPhotoLocal
  } = usePaginatedPhotos(coupleId, localPhotos);

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
  const captureDisabled = sendingReviewPhoto
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

  const clearReviewPhoto = useCallback(({ preserveObjectUrl = false } = {}) => {
    if (!preserveObjectUrl && reviewPhotoUrlRef.current) {
      URL.revokeObjectURL(reviewPhotoUrlRef.current);
    }
    reviewPhotoUrlRef.current = null;
    setReviewPhoto(null);
    setCaptionText('');
    setSendingReviewPhoto(false);
    setSendAnimationState('idle');
  }, []);

  const pressShutter = useCallback(() => {
    if (shutterReleaseTimeoutRef.current) {
      window.clearTimeout(shutterReleaseTimeoutRef.current);
      shutterReleaseTimeoutRef.current = null;
    }
    setShutterPressed(true);
  }, []);

  const releaseShutter = useCallback(() => {
    if (shutterReleaseTimeoutRef.current) {
      window.clearTimeout(shutterReleaseTimeoutRef.current);
    }
    shutterReleaseTimeoutRef.current = window.setTimeout(() => {
      setShutterPressed(false);
      shutterReleaseTimeoutRef.current = null;
    }, 75);
  }, []);

  useEffect(() => () => {
    if (shutterReleaseTimeoutRef.current) {
      window.clearTimeout(shutterReleaseTimeoutRef.current);
    }
  }, []);

  const clearCurrentReviewDraft = useCallback(async () => {
    if (!reviewDraftKey) return;
    try {
      await clearOfflineReviewDraft(reviewDraftKey);
    } catch (err) {
      console.warn('Unable to clear offline review draft.', err);
    }
  }, [reviewDraftKey]);

  useEffect(() => {
    localPhotosRef.current = localPhotos;
  }, [localPhotos]);

  useEffect(() => {
    let active = true;
    setLocalPhotoQueueReady(false);

    if (!localPhotoQueueKey) {
      setLocalPhotos([]);
      setLocalPhotoQueueReady(true);
      return undefined;
    }

    loadLocalPhotoQueue(localPhotoQueueKey)
      .then((savedPhotos) => {
        if (!active) return;
        if (!Array.isArray(savedPhotos)) {
          setLocalPhotos([]);
          return;
        }
        const restoredPhotos = savedPhotos.map((photo) => ({
          ...photo,
          photoUrl: URL.createObjectURL(photo.blob),
          status: photo.status === LOCAL_PHOTO_STATUS.FAILED
            ? LOCAL_PHOTO_STATUS.FAILED
            : LOCAL_PHOTO_STATUS.PENDING
        }));
        setLocalPhotos(restoredPhotos);
      })
      .catch((err) => {
        console.warn('Unable to restore local photo queue.', err);
      })
      .finally(() => {
        if (active) setLocalPhotoQueueReady(true);
      });

    return () => {
      active = false;
    };
  }, [localPhotoQueueKey]);

  useEffect(() => {
    if (!localPhotoQueueKey || !localPhotoQueueReady) return;
    const persistablePhotos = localPhotos.map(({ photoUrl: _photoUrl, ...photo }) => photo);
    if (persistablePhotos.length === 0) {
      clearLocalPhotoQueue(localPhotoQueueKey).catch((err) => {
        console.warn('Unable to clear local photo queue.', err);
      });
      return;
    }
    saveLocalPhotoQueue(localPhotoQueueKey, persistablePhotos).catch((err) => {
      console.warn('Unable to persist local photo queue.', err);
    });
  }, [localPhotoQueueKey, localPhotoQueueReady, localPhotos]);

  useEffect(() => () => {
    localPhotosRef.current.forEach((photo) => {
      if (photo.photoUrl?.startsWith('blob:')) URL.revokeObjectURL(photo.photoUrl);
    });
  }, []);

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
    if (!pendingScrollPhotoId || photos.length === 0) return;

    if (positionHistoryPhotoBeforeOpen(pendingScrollPhotoId)) {
      setPendingScrollPhotoId(null);
      if (activeView !== 'home') setActiveView('home');
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

  const uploadHistoryThumbnail = useCallback(async (blob, timestampStr) => {
    try {
      const thumbnailBlob = await createHistoryThumbnailBlob(blob);
      const thumbnailPath = `couples/${coupleId}/thumbnails/${timestampStr}.${HISTORY_THUMBNAIL_EXTENSION}`;
      const thumbnailRef = ref(storage, thumbnailPath);
      await uploadBytes(thumbnailRef, thumbnailBlob, {
        contentType: HISTORY_THUMBNAIL_TYPE
      });
      return await getDownloadURL(thumbnailRef);
    } catch (err) {
      console.warn('History thumbnail upload failed.', err);
      return null;
    }
  }, [coupleId]);

  const uploadPhotoBlob = useCallback(async (blob, caption = null) => {
    const timestampStr = new Date().toISOString();
    const filename = `couples/${coupleId}/${Date.now()}.jpg`;
    const storageRef = ref(storage, filename);
    await uploadBlobWithTimeout(storageRef, blob);
    const url = await getDownloadURL(storageRef);
    const thumbnailUrl = await uploadHistoryThumbnail(blob, timestampStr);

    const photoPayload = {
      photoUrl: url,
      senderId: user.uid,
      timestamp: timestampStr,
      liked: false
    };

    if (thumbnailUrl) {
      Object.assign(photoPayload, {
        thumbnailUrl,
        thumbnailSize: 256,
        thumbnailFormat: 'webp'
      });
    }

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

    return {
      id: createdPhotoId,
      ...photoPayload
    };
  }, [coupleId, uploadHistoryThumbnail, user.uid]);

  const processLocalPhotoQueue = useCallback(async () => {
    if (queueUploadInFlightRef.current || !isOnline) return;
    const nextPhoto = findNextUploadableLocalPhoto(localPhotosRef.current);
    if (!nextPhoto) return;

    queueUploadInFlightRef.current = true;
    setQueueUploadingPhotoId(nextPhoto.id);
    setLocalPhotos((current) => markLocalPhotoUploading(current, nextPhoto.id));

    try {
      const serverPhoto = await uploadPhotoBlob(nextPhoto.blob, nextPhoto.caption);
      const result = replaceLocalPhotoWithServerPhoto(localPhotosRef.current, nextPhoto.id, serverPhoto);
      if (nextPhoto.photoUrl?.startsWith('blob:')) URL.revokeObjectURL(nextPhoto.photoUrl);
      setLocalPhotos(result.localPhotos);
      insertServerPhotoLocal(result.serverPhoto);
      showToast('Photo sent');
    } catch (err) {
      console.error(err);
      setLocalPhotos((current) => markLocalPhotoFailed(current, nextPhoto.id, err?.message || "Couldn't send photo"));
    } finally {
      queueUploadInFlightRef.current = false;
      setQueueUploadingPhotoId(null);
    }
  }, [insertServerPhotoLocal, isOnline, showToast, uploadPhotoBlob]);

  useEffect(() => {
    if (!localPhotoQueueReady) return;
    processLocalPhotoQueue();
  }, [isOnline, localPhotoQueueReady, localPhotos, processLocalPhotoQueue]);

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

    triggerHaptic('tap');
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
      showToast(t('errors.capture'), 3000);
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

  const handleSendReviewPhoto = () => {
    if (!reviewPhoto || sendingReviewPhoto) return;
    if (!isOnline) {
      showToast(t('errors.offlineSend'), 3000);
      return;
    }
    triggerHaptic('tap');
    setSendingReviewPhoto(true);

    const caption = buildCaptionPayload(captionText);
    const localPhoto = createLocalPhoto({
      blob: reviewPhoto.blob,
      caption,
      coupleId,
      objectUrl: reviewPhoto.url,
      senderId: user.uid
    });

    setLocalPhotos((current) => appendLocalPhoto(current, localPhoto));
    clearCurrentReviewDraft();
    clearReviewPhoto({ preserveObjectUrl: true });
    scrollToCamera('auto');
    trackEvent('photo_send_queued', { coupleId, localPhotoId: localPhoto.id });
  };

  const handleRetryLocalPhoto = useCallback((photoId) => {
    setLocalPhotos((current) => markLocalPhotoPending(current, photoId));
  }, []);

  const handleDeleteLocalPhoto = useCallback((photoId) => {
    const photo = localPhotosRef.current.find((item) => item.id === photoId);
    if (photo?.photoUrl?.startsWith('blob:')) URL.revokeObjectURL(photo.photoUrl);
    setLocalPhotos((current) => deleteLocalPhoto(current, photoId));
  }, []);

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
        showToast(t('photo.likedToast'), 1500);
        trackEvent('photo_liked', { photoId: photo.id });
      }
    } catch (err) {
      updatePhotoLocal(photo.id, { liked: isLiked });
      console.error(err);
    }
  };

  const handleLogout = async () => {
    try {
      await notificationControls?.cleanupBeforeLogout?.();
    } catch (error) {
      console.warn('Notification cleanup before logout failed.', { code: error?.code || 'unknown' });
    } finally {
      await signOut(auth);
    }
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

  const timeAgo = (date) => {
    if (!date) return '';
    const diff = (Date.now() - date.getTime()) / 1000;
    if (diff < 60) return t('time.justNow');
    if (diff < 3600) return t('time.minutesAgo', { count: Math.floor(diff / 60) });
    if (diff < 86400) return t('time.hoursAgo', { count: Math.floor(diff / 3600) });
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

  useEffect(() => {
    if (notificationIntent?.type !== 'photo' || !notificationIntent.photoId) return;
    setMountedViews((current) => current.has('home') ? current : new Set([...current, 'home']));
    setPendingScrollPhotoId(notificationIntent.photoId);
    setActiveView('home');
    onNotificationIntentConsumed?.();
  }, [notificationIntent, onNotificationIntentConsumed]);

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

        <section className="shell-view home-screen" aria-label={t('screenLabel')}>
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
                    <div className="camera-switch-overlay" aria-label={t('startup.switching')}>
                      <img src={frozenFrame} alt="" draggable={false} />
                      <div className="spinner" />
                    </div>
                  )}
                  {cameraStatus !== 'ready' && !frozenFrame && (
                    <div className="empty-state camera-state">
                      <PhotoIcon />
                      {cameraStatus === 'requesting' || cameraStatus === 'resuming' || cameraStatus === 'switching' ? (
                        <>
                          <strong>{t('startup.title')}</strong>
                          <span>{t('startup.body')}</span>
                          <div className="spinner" />
                        </>
                      ) : (
                        <>
                          <strong>{cameraStatus === 'denied' ? t('startup.blocked') : t('startup.unavailable')}</strong>
                          <span>{cameraError || t('errors.start')}</span>
                          <button className="camera-retry-btn" type="button" onClick={retryCamera}>
                            {t('startup.retry')}
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
                            ? { opacity: 1, y: '-112%', scale: 1 }
                            : { opacity: 1, y: 0, scale: 1 }
                        }
                        exit={{ opacity: sendAnimationState === 'sent' ? 1 : 0 }}
                        transition={{
                          duration: sendAnimationState === 'sent' ? 0.38 : 0.18,
                          ease: 'easeInOut'
                        }}
                      >
                        <img src={reviewPhoto.url} alt={t('capturedPreview')} draggable={false} />
                        <label className="caption-pill caption-editor">
                          <span className="caption-editor-sizer" aria-hidden="true">
                            {captionText.length > 0 ? captionText : t('review.captionPlaceholder')}
                          </span>
                          <input
                            ref={captionInputRef}
                            value={captionText}
                            onChange={handleCaptionChange}
                            maxLength={MAX_CAPTION_LENGTH}
                            inputMode="text"
                            enterKeyHint="done"
                            placeholder={t('review.captionPlaceholder')}
                            aria-label={t('review.captionLabel')}
                            disabled={sendingReviewPhoto}
                          />
                        </label>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </motion.article>

                <div className="camera-item-controls" aria-label={t('controls.label')}>
                  <button
                    className={`camera-tool-btn ${!isReviewingPhoto && flashEnabled ? 'active' : ''}`}
                    type="button"
                    aria-label={isReviewingPhoto ? t('review.discard') : t('controls.flash')}
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
                    aria-label={isReviewingPhoto ? t('review.send') : t('controls.capture')}
                    onClick={isReviewingPhoto ? handleSendReviewPhoto : handleCapture}
                    disabled={isReviewingPhoto ? sendDisabled : captureDisabled}
                    onTapStart={pressShutter}
                    onTap={releaseShutter}
                    onTapCancel={releaseShutter}
                  >
                    <ShutterIcon pressed={shutterPressed} />
                    {isReviewingPhoto && !sendingReviewPhoto && (
                      <motion.span
                        className="shutter-send-icon"
                        aria-hidden="true"
                        initial={{ opacity: 0, scale: 0.72 }}
                        animate={{ opacity: 1, scale: 1 }}
                        transition={{ duration: 0.075, ease: 'easeOut' }}
                      >
                        <SendIcon />
                      </motion.span>
                    )}
                    {(uploading || sendingReviewPhoto) && (
                      <span className="shutter-spinner" aria-hidden="true">
                        <div className="spinner" />
                      </span>
                    )}
                  </motion.button>
                  <button
                    className="camera-tool-btn"
                    type="button"
                    aria-label={isReviewingPhoto ? t('review.addCaption') : t('controls.switchCamera')}
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
                  const isLocalPhoto = Boolean(photo.localOnly);
                  const isLocalFailed = isLocalPhoto && photo.status === LOCAL_PHOTO_STATUS.FAILED;
                  const isLocalSending = photo.localOnly && photo.status !== LOCAL_PHOTO_STATUS.FAILED;
                  const queuedPhotoIsUploading = photo.id === queueUploadingPhotoId;
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
                          <img src={photo.photoUrl} alt={t('sharedMoment')} loading="lazy" decoding="async" draggable={false} />
                          {photoCaption.length > 0 && (
                            <div className="caption-pill photo-caption-pill">{photoCaption}</div>
                          )}
                        </div>
                        {isLocalSending ? (
                          <div className="photo-meta-row photo-local-status">
                            <div
                              className="photo-local-sending"
                              role="status"
                              aria-label={queuedPhotoIsUploading ? t('queue.sendingLabel') : t('queue.queued')}
                            >
                              <div className="spinner" />
                              <span>{t('queue.sending')}</span>
                            </div>
                          </div>
                        ) : isLocalFailed ? (
                          <div className="photo-meta-row photo-local-actions failed">
                            <button
                              className="photo-retry-btn"
                              type="button"
                              onClick={() => handleRetryLocalPhoto(photo.id)}
                            >
                              {t('queue.retry')}
                            </button>
                            <button
                              className="photo-delete-btn"
                              type="button"
                              aria-label={t('queue.delete')}
                              onClick={() => handleDeleteLocalPhoto(photo.id)}
                            >
                              <TrashIcon />
                            </button>
                          </div>
                        ) : (
                          <div className="photo-meta-row">
                            <div className="photo-meta">
                              <strong>{isPhotoMine ? t('you') : senderName}</strong>
                              <span>{timeAgo(photoTimestamp)}</span>
                            </div>
                            {isPhotoMine ? (
                              <div
                                className="status-chip notranslate"
                                translate="no"
                                aria-label={photo.liked ? t('photo.liked') : t('photo.sent')}
                              >
                                {photo.liked ? <HeartIcon filled /> : <SendIcon />}
                                {photo.liked ? t('photo.liked') : t('photo.sent')}
                              </div>
                            ) : (
                              <motion.button
                                className="like-btn"
                                type="button"
                                aria-label={photo.liked ? t('photo.unlike') : t('photo.like')}
                                onClick={() => handleLikePhoto(photo)}
                                whileTap={{ scale: 0.86 }}
                                style={{ color: photo.liked ? 'var(--accent)' : '#fff' }}
                              >
                                <HeartIcon filled={photo.liked} />
                              </motion.button>
                            )}
                          </div>
                        )}
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
                      <strong>{t('empty.title')}</strong>
                      <span>{t('empty.body')}</span>
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
            notificationControls={notificationControls}
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

      <nav className="bottom-nav" aria-label={t('common:navigation.primary')}>
        <button
          className={`nav-item ${activeView === 'history' ? 'active' : ''}`}
          type="button"
          aria-label={t('common:navigation.history')}
          aria-current={activeView === 'history' ? 'page' : undefined}
          onClick={() => goToView('history')}
        >
          <GridIcon />
        </button>
        <button
          className={`nav-item home-nav-item ${activeView === 'home' ? 'active' : ''}`}
          type="button"
          aria-label={activeView === 'home' && !isCameraInView ? t('common:navigation.scrollToCamera') : t('common:navigation.home')}
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
                <ShutterIcon />
              </motion.span>
            )}
          </AnimatePresence>
        </button>
        <button
          className={`nav-item ${activeView === 'profile' ? 'active' : ''}`}
          type="button"
          aria-label={t('common:navigation.profile')}
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
