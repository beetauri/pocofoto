import { lazy, Suspense, useState, useEffect, useRef, useCallback, useLayoutEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { db, storage, auth, doc, onSnapshot, updateDoc, ref, uploadBytes, getDownloadURL, signOut, collection, addDoc, query, orderBy } from '../firebase';

const HistoryScreen = lazy(() => import('./HistoryScreen'));

function UserIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M20 21a8 8 0 0 0-16 0" />
      <circle cx="12" cy="8" r="4" />
    </svg>
  );
}

function MenuIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" aria-hidden="true">
      <path d="M5 7h14" />
      <path d="M5 12h14" />
      <path d="M5 17h14" />
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

function LogoutIcon() {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
      <path d="m16 17 5-5-5-5" />
      <path d="M21 12H9" />
    </svg>
  );
}

export default function MainScreen({ user, coupleId }) {
  const [coupleData, setCoupleData] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [cameraStatus, setCameraStatus] = useState('requesting');
  const [cameraError, setCameraError] = useState('');
  const [cameraStream, setCameraStream] = useState(null);
  const [menuAnchor, setMenuAnchor] = useState(null);
  const [showHistory, setShowHistory] = useState(false);
  const [toast, setToast] = useState('');
  const [profiles, setProfiles] = useState({});
  const [photos, setPhotos] = useState([]);
  const [loadingPhotos, setLoadingPhotos] = useState(true);
  const [isCameraInView, setIsCameraInView] = useState(true);
  const [pendingScrollPhotoId, setPendingScrollPhotoId] = useState(null);
  const fileRef = useRef(null);
  const videoRef = useRef(null);
  const feedRef = useRef(null);
  const cameraSlideRef = useRef(null);
  const cameraStreamRef = useRef(null);
  const lastPhotoTimestampRef = useRef(null);
  const lastLikeTimestampRef = useRef(null);

  const photoUrl = coupleData?.currentPhotoUrl;
  const partnerUid = coupleData?.users?.find(uid => uid !== user.uid);
  const myProfile = profiles[user.uid];
  const partnerProfile = partnerUid ? profiles[partnerUid] : null;
  const displayName = myProfile?.displayName || user.email.split('@')[0];
  const partnerName = partnerProfile?.displayName || 'your person';
  const showMenu = Boolean(menuAnchor);
  const captureDisabled = uploading;

  const showToast = (message, duration = 2500) => {
    setToast(message);
    setTimeout(() => setToast(''), duration);
  };

  const scrollToCamera = useCallback((behavior = 'smooth') => {
    feedRef.current?.scrollTo({ top: 0, behavior });
  }, []);

  const scrollToPhoto = useCallback((photoId, behavior = 'smooth') => {
    if (!photoId) return false;
    const feed = feedRef.current;
    const target = feedRef.current?.querySelector(`[data-photo-id="${photoId}"]`);
    if (!feed || !target) return false;
    const slideIndex = Array.from(feed.querySelectorAll('.reels-slide')).indexOf(target);
    const top = slideIndex >= 0
      ? slideIndex * feed.clientHeight
      : target.getBoundingClientRect().top - feed.getBoundingClientRect().top + feed.scrollTop;
    feed.scrollTo({ top, behavior });
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
    return visibleHeight / Math.max(cameraRect.height, 1) >= 0.6;
  }, [isCameraInView]);

  const stopCameraStream = useCallback((stream) => {
    stream?.getTracks().forEach((track) => track.stop());
  }, []);

  const requestCamera = useCallback(async () => {
    if (!navigator.mediaDevices?.getUserMedia) {
      setCameraStatus('unavailable');
      setCameraError('Camera is not available in this browser.');
      return;
    }

    setCameraStatus('requesting');
    setCameraError('');

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: 'environment' } },
        audio: false
      });
      setCameraStream((previous) => {
        stopCameraStream(previous);
        cameraStreamRef.current = stream;
        return stream;
      });
      setCameraStatus('ready');
    } catch (err) {
      const denied = err?.name === 'NotAllowedError' || err?.name === 'PermissionDeniedError';
      setCameraStatus(denied ? 'denied' : 'error');
      setCameraError(denied ? 'Camera access was blocked.' : 'Camera could not start.');
    }
  }, [stopCameraStream]);

  useEffect(() => {
    if (!coupleId) return;
    const unsub = onSnapshot(doc(db, 'couples', coupleId), (snap) => {
      if (snap.exists()) {
        const data = snap.data();
        setCoupleData(data);

        if (data.senderId && data.senderId !== user.uid && data.timestamp) {
          if (lastPhotoTimestampRef.current && data.timestamp !== lastPhotoTimestampRef.current) {
            setToast('New photo from your person');
            setTimeout(() => setToast(''), 3000);
          }
          lastPhotoTimestampRef.current = data.timestamp;
        } else if (data.timestamp) {
          lastPhotoTimestampRef.current = data.timestamp;
        }

        if (data.lastLike && data.lastLike.userId !== user.uid && data.lastLike.timestamp) {
          if (lastLikeTimestampRef.current && data.lastLike.timestamp !== lastLikeTimestampRef.current) {
            setToast('Your photo was liked');
            setTimeout(() => setToast(''), 3000);
          }
          lastLikeTimestampRef.current = data.lastLike.timestamp;
        } else if (data.lastLike?.timestamp) {
          lastLikeTimestampRef.current = data.lastLike.timestamp;
        }
      }
    });
    return () => unsub();
  }, [coupleId, user.uid]);

  useEffect(() => {
    requestCamera();

    return () => {
      stopCameraStream(cameraStreamRef.current);
      cameraStreamRef.current = null;
    };
  }, [requestCamera, stopCameraStream]);

  useEffect(() => {
    const feed = feedRef.current;
    const cameraSlide = cameraSlideRef.current;
    if (!feed || !cameraSlide) return;

    const observer = new IntersectionObserver(
      ([entry]) => setIsCameraInView(entry.isIntersecting && entry.intersectionRatio >= 0.6),
      { root: feed, threshold: [0, 0.6, 1] }
    );

    observer.observe(cameraSlide);
    return () => observer.disconnect();
  }, [showHistory]);

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
      const items = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setPhotos(items);
      setLoadingPhotos(false);
    }, () => {
      setLoadingPhotos(false);
    });
    return () => unsub();
  }, [coupleId]);

  useLayoutEffect(() => {
    if (!pendingScrollPhotoId || photos.length === 0 || showHistory) return;

    if (scrollToPhoto(pendingScrollPhotoId, 'auto')) {
      setPendingScrollPhotoId(null);
    }
  }, [pendingScrollPhotoId, photos, scrollToPhoto, showHistory]);

  useEffect(() => {
    if (!coupleId || !photoUrl || loadingPhotos || photos.length > 0) return;

    const seedPhoto = async () => {
      try {
        await addDoc(collection(db, 'couples', coupleId, 'photos'), {
          photoUrl: photoUrl,
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

  const handleUploadClick = () => {
    fileRef.current?.click();
  };

  const handleOpenHistory = () => {
    setMenuAnchor(null);
    setShowHistory(true);
  };

  const handleSelectHistoryPhoto = (photoId) => {
    setPendingScrollPhotoId(photoId);
    setShowHistory(false);
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
      setPendingScrollPhotoId(createdPhotoId);
      const scrollToCreatedPhoto = () => {
        if (scrollToPhoto(createdPhotoId, 'auto')) {
          setPendingScrollPhotoId(null);
        }
      };
      requestAnimationFrame(scrollToCreatedPhoto);
      setTimeout(scrollToCreatedPhoto, 250);
      setTimeout(scrollToCreatedPhoto, 800);
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

  const handleFileChange = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);

    try {
      const compressed = await compressImage(file);
      await uploadPhotoBlob(compressed);
      showToast('Photo sent');
    } catch (err) {
      console.error(err);
      showToast('Failed to upload photo', 3000);
    } finally {
      setUploading(false);
      e.target.value = '';
    }
  };

  const compressImage = (file) => {
    return new Promise((resolve) => {
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
          canvas.toBlob((blob) => resolve(blob), 'image/jpeg', 0.85);
        };
        img.src = e.target.result;
      };
      reader.readAsDataURL(file);
    });
  };

  const handleLogout = async () => {
    await signOut(auth);
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

  const timeAgo = (date) => {
    if (!date) return '';
    const diff = (Date.now() - date.getTime()) / 1000;
    if (diff < 60) return 'Just now';
    if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
    if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
    return date.toLocaleDateString();
  };

  return (
    <div className="app-shell">
      {showHistory ? (
        <Suspense fallback={null}>
          <HistoryScreen
            user={user}
            coupleId={coupleId}
            onClose={() => setShowHistory(false)}
            onSelectPhoto={handleSelectHistoryPhoto}
          />
        </Suspense>
      ) : (
        <>
          <header className="app-header">
            <button
              className="icon-btn"
              type="button"
              aria-label="Profile"
              aria-expanded={menuAnchor === 'profile'}
              onClick={() => setMenuAnchor(menuAnchor === 'profile' ? null : 'profile')}
            >
              <UserIcon />
            </button>
            <div className="header-title">
              <strong>Locket</strong>
              <span>{partnerUid ? `With ${partnerName}` : displayName}</span>
            </div>
            <button
              id="main-menu-btn"
              className="icon-btn"
              type="button"
              aria-label="Open menu"
              aria-expanded={menuAnchor === 'menu'}
              onClick={() => setMenuAnchor(menuAnchor === 'menu' ? null : 'menu')}
            >
              <MenuIcon />
            </button>
          </header>

          <AnimatePresence>
            {showMenu && (
              <>
                <motion.div
                  initial={{ opacity: 0, y: -8, scale: 0.98 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: -8, scale: 0.98 }}
                  className={`menu-popover ${menuAnchor === 'profile' ? 'from-profile' : 'from-menu'}`}
                >
                  <div className="profile-row">
                    <img
                      className="avatar"
                      src={myProfile?.profilePic || `https://api.dicebear.com/7.x/adventurer/svg?seed=${user.uid}`}
                      alt=""
                    />
                    <div>
                      <strong>{displayName}</strong>
                      <span>{user.email}</span>
                    </div>
                  </div>
                  <button id="main-logout-btn" className="menu-action" type="button" onClick={handleLogout}>
                    <LogoutIcon />
                    Sign out
                  </button>
                </motion.div>
                <div
                  aria-hidden="true"
                  onClick={() => setMenuAnchor(null)}
                  style={{ position: 'fixed', inset: 0, zIndex: 50 }}
                />
              </>
            )}
          </AnimatePresence>

          <main className="camera-stage">
            <div className="reels-feed" ref={feedRef}>
              <div className="reels-slide" ref={cameraSlideRef}>
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
                          <span>{cameraError || 'Use upload for now, or try camera again.'}</span>
                          <button className="camera-retry-btn" type="button" onClick={requestCamera}>
                            Try again
                          </button>
                        </>
                      )}
                    </div>
                  )}
                </motion.article>
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
                        <img src={photo.photoUrl} alt="Shared moment" loading="eager" />
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

          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            capture="environment"
            onChange={handleFileChange}
            style={{ display: 'none' }}
          />

          <div className="bottom-controls">
            <button
              className="icon-btn"
              type="button"
              aria-label="Open history"
              onClick={handleOpenHistory}
            >
              <GridIcon />
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
              className="icon-btn upload-btn"
              type="button"
              aria-label="Upload photo"
              onClick={handleUploadClick}
              disabled={uploading}
            >
              <PhotoIcon />
            </button>
          </div>
        </>
      )}

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
