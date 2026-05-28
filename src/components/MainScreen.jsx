import { useState, useEffect, useRef, useCallback, useLayoutEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import HistoryScreen from './HistoryScreen';
import { db, storage, auth, doc, onSnapshot, updateDoc, ref, uploadBytes, getDownloadURL, signOut, collection, addDoc, query, orderBy } from '../firebase';

const views = ['history', 'home', 'profile'];

function UserIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M20 21a8 8 0 0 0-16 0" />
      <circle cx="12" cy="8" r="4" />
    </svg>
  );
}

function HomeIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="m3 11 9-8 9 8" />
      <path d="M5 10v10h14V10" />
      <path d="M9 20v-6h6v6" />
    </svg>
  );
}

function GridIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="4" y="4" width="6" height="6" rx="1.5" />
      <rect x="14" y="4" width="6" height="6" rx="1.5" />
      <rect x="4" y="14" width="6" height="6" rx="1.5" />
      <rect x="14" y="14" width="6" height="6" rx="1.5" />
    </svg>
  );
}

function MiniShutterIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="12" cy="12" r="9" fill="var(--accent)" />
      <circle cx="12" cy="12" r="6.4" fill="#111" />
      <circle cx="12" cy="12" r="4.7" fill="#f4f4f4" />
    </svg>
  );
}

function HeartIcon({ filled = false }) {
  return (
    <svg viewBox="0 0 24 24" fill={filled ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M20.8 4.6a5.4 5.4 0 0 0-7.6 0L12 5.8l-1.2-1.2a5.4 5.4 0 0 0-7.6 7.6L12 21l8.8-8.8a5.4 5.4 0 0 0 0-7.6Z" />
    </svg>
  );
}

function SendIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M22 2 11 13" />
      <path d="m22 2-7 20-4-9-9-4 20-7Z" />
    </svg>
  );
}

function PhotoIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="3" y="5" width="18" height="14" rx="3" />
      <circle cx="9" cy="10" r="2" />
      <path d="m21 15-4.2-4.2a2 2 0 0 0-2.8 0L5 19" />
    </svg>
  );
}

function FlashIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="m13 2-8 12h6l-1 8 9-13h-6l1-7Z" />
    </svg>
  );
}

function SwitchCameraIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M4 12a8 8 0 0 1 13.7-5.6" />
      <path d="M17 2v5h5" />
      <path d="M20 12a8 8 0 0 1-13.7 5.6" />
      <path d="M7 22v-5H2" />
    </svg>
  );
}

function LogoutIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
      <path d="m16 17 5-5-5-5" />
      <path d="M21 12H9" />
    </svg>
  );
}

function initialsFor(name, email) {
  const source = name || email || '?';
  return source
    .split(/[\s@._-]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join('') || '?';
}

function Avatar({ src, name, email, size = 'md' }) {
  const [failed, setFailed] = useState(false);
  if (src && !failed) {
    return <img className={`profile-avatar ${size}`} src={src} alt="" onError={() => setFailed(true)} />;
  }
  return <div className={`profile-avatar initials ${size}`}>{initialsFor(name, email)}</div>;
}

export default function MainScreen({ user, coupleId }) {
  const [coupleData, setCoupleData] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [cameraStatus, setCameraStatus] = useState('requesting');
  const [cameraError, setCameraError] = useState('');
  const [cameraStream, setCameraStream] = useState(null);
  const [toast, setToast] = useState('');
  const [profiles, setProfiles] = useState({});
  const [photos, setPhotos] = useState([]);
  const [loadingPhotos, setLoadingPhotos] = useState(true);
  const [isCameraInView, setIsCameraInView] = useState(true);
  const [pendingScrollPhotoId, setPendingScrollPhotoId] = useState(null);
  const [activeView, setActiveView] = useState('home');
  const [facingMode, setFacingMode] = useState('environment');
  const [flashEnabled, setFlashEnabled] = useState(false);
  const [confirmLogout, setConfirmLogout] = useState(false);
  const profileFileRef = useRef(null);
  const videoRef = useRef(null);
  const feedRef = useRef(null);
  const cameraSlideRef = useRef(null);
  const cameraStreamRef = useRef(null);
  const requestVersionRef = useRef(0);
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
  const profilePic = myProfile?.profilePic || user.photoURL || '';
  const captureDisabled = uploading;
  const activeIndex = views.indexOf(activeView);

  const showToast = useCallback((message, duration = 2500) => {
    setToast(message);
    window.setTimeout(() => setToast(''), duration);
  }, []);

  const scrollToCamera = useCallback((behavior = 'smooth') => {
    feedRef.current?.scrollTo({ top: 0, behavior });
  }, []);

  const scrollToPhoto = useCallback((photoId, behavior = 'smooth') => {
    if (!photoId) return false;
    const feed = feedRef.current;
    const target = feed?.querySelector(`[data-photo-id="${photoId}"]`);
    if (!feed || !target) return false;
    feed.scrollTo({ top: target.offsetTop, behavior });
    return true;
  }, []);

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

  const stopCameraStream = useCallback((stream) => {
    stream?.getTracks().forEach((track) => track.stop());
  }, []);

  const requestCamera = useCallback(async (mode = facingMode) => {
    const requestVersion = requestVersionRef.current + 1;
    requestVersionRef.current = requestVersion;

    if (!navigator.mediaDevices?.getUserMedia) {
      setCameraStatus('unavailable');
      setCameraError('Camera is not available in this browser.');
      return;
    }

    setCameraStatus('requesting');
    setCameraError('');

    const timeout = new Promise((_, reject) => {
      window.setTimeout(() => reject(new Error('Camera request timed out.')), 10000);
    });

    try {
      const stream = await Promise.race([
        navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: mode } },
          audio: false
        }),
        timeout
      ]);
      if (requestVersion !== requestVersionRef.current) {
        stopCameraStream(stream);
        return;
      }
      setCameraStream((previous) => {
        stopCameraStream(previous);
        cameraStreamRef.current = stream;
        return stream;
      });
      setCameraStatus('ready');
    } catch (err) {
      if (requestVersion !== requestVersionRef.current) return;
      const denied = err?.name === 'NotAllowedError' || err?.name === 'PermissionDeniedError';
      const timedOut = err?.message === 'Camera request timed out.';
      setCameraStatus(denied ? 'denied' : 'error');
      setCameraError(
        denied
          ? 'Camera access was blocked.'
          : timedOut
            ? 'Check the browser camera prompt, or try again.'
            : 'Camera could not start.'
      );
    }
  }, [facingMode, stopCameraStream]);

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
    requestCamera(facingMode);

    return () => {
      stopCameraStream(cameraStreamRef.current);
      cameraStreamRef.current = null;
    };
  }, [requestCamera, facingMode, stopCameraStream]);

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
    const video = videoRef.current;
    if (!video || !cameraStream) return;

    video.srcObject = cameraStream;
    const playVideo = async () => {
      try {
        await video.play();
      } catch (err) {
        console.warn('Camera preview playback is waiting for user interaction.', err);
      }
    };
    playVideo();

    return () => {
      if (video.srcObject === cameraStream) {
        video.srcObject = null;
      }
    };
  }, [cameraStream]);

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

  useEffect(() => {
    if (!coupleId) return;
    const q = query(
      collection(db, 'couples', coupleId, 'photos'),
      orderBy('timestamp', 'desc')
    );
    const unsub = onSnapshot(q, (snap) => {
      const items = snap.docs.map(photoDoc => ({ id: photoDoc.id, ...photoDoc.data() }));
      setPhotos(items);
      setLoadingPhotos(false);
    }, () => {
      setLoadingPhotos(false);
    });
    return () => unsub();
  }, [coupleId]);

  useLayoutEffect(() => {
    if (!pendingScrollPhotoId || photos.length === 0 || activeView !== 'home') return;

    if (scrollToPhoto(pendingScrollPhotoId, 'auto')) {
      setPendingScrollPhotoId(null);
    }
  }, [pendingScrollPhotoId, photos, scrollToPhoto, activeView]);

  useEffect(() => {
    if (activeView !== 'home') setToast('');
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

  const uploadPhotoBlob = async (blob) => {
    const filename = `couples/${coupleId}/${Date.now()}.jpg`;
    const storageRef = ref(storage, filename);
    await uploadBytes(storageRef, blob);
    const url = await getDownloadURL(storageRef);
    const timestampStr = new Date().toISOString();

    const photoRef = await addDoc(collection(db, 'couples', coupleId, 'photos'), {
      photoUrl: url,
      senderId: user.uid,
      timestamp: timestampStr,
      liked: false
    });

    await updateDoc(doc(db, 'couples', coupleId), {
      currentPhotoUrl: url,
      senderId: user.uid,
      timestamp: timestampStr,
      liked: false,
      lastLike: null
    });

    const createdPhotoId = photoRef?.id || photoRef?._id;
    if (createdPhotoId) {
      setActiveView('home');
      setPendingScrollPhotoId(createdPhotoId);
      const scrollToCreatedPhoto = () => {
        if (scrollToPhoto(createdPhotoId, 'auto')) {
          setPendingScrollPhotoId(null);
        }
      };
      requestAnimationFrame(scrollToCreatedPhoto);
      window.setTimeout(scrollToCreatedPhoto, 250);
      window.setTimeout(scrollToCreatedPhoto, 800);
    }
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

    setUploading(true);
    try {
      const canvas = document.createElement('canvas');
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

      const blob = await new Promise((resolve, reject) => {
        canvas.toBlob((result) => {
          if (result) resolve(result);
          else reject(new Error('Unable to capture image'));
        }, 'image/jpeg', 0.9);
      });

      await uploadPhotoBlob(blob);
      showToast('Photo sent');
    } catch (err) {
      console.error(err);
      showToast('Failed to capture photo', 3000);
    } finally {
      setUploading(false);
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
  };

  const handleSelectHistoryPhoto = (photoId) => {
    setToast('');
    setPendingScrollPhotoId(photoId);
    setActiveView('home');
  };

  const handleSwitchCamera = () => {
    const nextMode = facingMode === 'environment' ? 'user' : 'environment';
    setFacingMode(nextMode);
    requestCamera(nextMode);
  };

  const handleToggleFlash = () => {
    setFlashEnabled((current) => !current);
    showToast('Flash toggle is a device placeholder for now', 1800);
  };

  const handleLikePhoto = async (photo) => {
    if (uploading) return;
    try {
      const isLiked = photo.liked || false;
      const photoRef = doc(db, 'couples', coupleId, 'photos', photo.id);

      await updateDoc(photoRef, {
        liked: !isLiked
      });

      await updateDoc(doc(db, 'couples', coupleId), {
        liked: !isLiked,
        lastLike: !isLiked ? {
          userId: user.uid,
          timestamp: new Date().toISOString(),
          photoId: photo.id
        } : null
      });

      if (!isLiked) {
        showToast('Photo liked', 1500);
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleLogout = async () => {
    await signOut(auth);
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
    setActiveView(views[nextIndex]);
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
          <HistoryScreen
            user={user}
            coupleId={coupleId}
            onSelectPhoto={handleSelectHistoryPhoto}
          />
        </section>

        <section className="shell-view home-screen" aria-label="Home">
          <main className="camera-stage">
            <div className="reels-feed" ref={feedRef}>
              <div className="reels-slide camera-reels-slide" ref={cameraSlideRef}>
                <motion.article
                  className={`camera-frame camera-live ${cameraStatus !== 'ready' ? 'empty' : ''}`}
                  initial={{ opacity: 0, scale: 0.96 }}
                  animate={{ opacity: 1, scale: 1 }}
                >
                  {cameraStatus === 'ready' ? (
                    <>
                      <video ref={videoRef} playsInline muted autoPlay />
                      <div className="camera-live-overlay">
                        <span>Live camera</span>
                      </div>
                    </>
                  ) : (
                    <div className="empty-state camera-state">
                      <PhotoIcon />
                      {cameraStatus === 'requesting' ? (
                        <>
                          <strong>Starting camera</strong>
                          <span>Allow camera access to capture your next moment.</span>
                          <div className="spinner" />
                        </>
                      ) : (
                        <>
                          <strong>{cameraStatus === 'denied' ? 'Camera blocked' : 'Camera unavailable'}</strong>
                          <span>{cameraError || 'Check camera access, then try again.'}</span>
                          <button className="camera-retry-btn" type="button" onClick={() => requestCamera(facingMode)}>
                            Try again
                          </button>
                        </>
                      )}
                    </div>
                  )}
                </motion.article>

                <div className="camera-item-controls" aria-label="Camera controls">
                  <button
                    className={`camera-tool-btn ${flashEnabled ? 'active' : ''}`}
                    type="button"
                    aria-label="Toggle flash"
                    aria-pressed={flashEnabled}
                    onClick={handleToggleFlash}
                  >
                    <FlashIcon />
                  </button>
                  <motion.button
                    id="main-capture-btn"
                    className="shutter-btn"
                    type="button"
                    aria-label="Capture photo"
                    onClick={handleCapture}
                    disabled={captureDisabled}
                    whileTap={{ scale: 0.9 }}
                  >
                    {uploading && <div className="spinner" />}
                  </motion.button>
                  <button
                    className="camera-tool-btn"
                    type="button"
                    aria-label="Switch camera"
                    onClick={handleSwitchCamera}
                  >
                    <SwitchCameraIcon />
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

                  return (
                    <div key={photo.id} className="reels-slide" data-photo-id={photo.id}>
                      <motion.article
                        className="camera-frame"
                        initial={{ opacity: 0, scale: 0.96 }}
                        animate={{ opacity: 1, scale: 1 }}
                      >
                        <img src={photo.photoUrl} alt="Shared moment" loading="eager" draggable={false} />
                        <div className="photo-gradient">
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
                })
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
          <ProfileView
            displayName={displayName}
            email={user.email}
            profilePic={profilePic}
            uploading={uploading}
            onPickPhoto={() => profileFileRef.current?.click()}
            onRemovePhoto={handleRemoveProfilePhoto}
            onRequestLogout={() => {
              setToast('');
              setConfirmLogout(true);
            }}
            onDeletePlaceholder={() => showToast('Account deletion is not available yet')}
          />
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
        {confirmLogout && (
          <motion.div
            className="confirm-backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            role="presentation"
          >
            <motion.div
              className="confirm-sheet"
              initial={{ opacity: 0, y: 18, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 18, scale: 0.98 }}
              role="dialog"
              aria-modal="true"
              aria-labelledby="logout-title"
            >
              <h2 id="logout-title">Log out?</h2>
              <p>You will need to sign in with Google again to use Pocofoto.</p>
              <div className="confirm-actions">
                <button className="btn-ghost" type="button" onClick={() => setConfirmLogout(false)}>Cancel</button>
                <button className="btn-primary danger" type="button" onClick={handleLogout}>Log out</button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

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

function ProfileView({
  displayName,
  email,
  profilePic,
  uploading,
  onPickPhoto,
  onRemovePhoto,
  onRequestLogout,
  onDeletePlaceholder
}) {
  return (
    <section className="profile-screen" aria-label="Profile">
      <div className="profile-hero">
        <Avatar src={profilePic} name={displayName} email={email} size="lg" />
        <h1>{displayName}</h1>
        <p>{email}</p>
      </div>

      <div className="profile-actions-row">
        <button className="btn-ghost" type="button" onClick={onPickPhoto} disabled={uploading}>Change photo</button>
        <button className="btn-ghost" type="button" onClick={onRemovePhoto} disabled={uploading || !profilePic}>Remove</button>
      </div>

      <div className="profile-info-list">
        <div className="profile-info-row">
          <span>Username</span>
          <strong>{displayName}</strong>
        </div>
        <div className="profile-info-row">
          <span>Email</span>
          <strong>{email}</strong>
        </div>
        <div className="profile-info-row">
          <span>Sign-in</span>
          <strong>Google</strong>
        </div>
      </div>

      <div className="profile-link-row">
        <a href="#privacy" onClick={(e) => e.preventDefault()}>Privacy Notice</a>
        <a href="#terms" onClick={(e) => e.preventDefault()}>Terms of Use</a>
      </div>

      <div className="profile-danger-zone">
        <button className="menu-action profile-menu-action" type="button" onClick={onRequestLogout}>
          <LogoutIcon />
          Log out
        </button>
        <button className="menu-action profile-menu-action delete" type="button" onClick={onDeletePlaceholder}>
          Delete account
        </button>
      </div>
    </section>
  );
}
