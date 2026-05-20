import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { db, storage, auth, doc, onSnapshot, updateDoc, ref, uploadBytes, getDownloadURL, signOut, collection, addDoc, query, orderBy } from '../firebase';

export default function MainScreen({ user, coupleId }) {
  const [coupleData, setCoupleData] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [showMenu, setShowMenu] = useState(false);
  const [toast, setToast] = useState('');
  const fileRef = useRef(null);
  const [profiles, setProfiles] = useState({});
  const lastPhotoTimestampRef = useRef(null);
  const lastLikeTimestampRef = useRef(null);
  const [photos, setPhotos] = useState([]);
  const [loadingPhotos, setLoadingPhotos] = useState(true);

  // Derived state variables (hoisted to avoid TDZ ReferenceError)
  const photoUrl = coupleData?.currentPhotoUrl;
  const isMine = coupleData?.senderId === user.uid;
  const timestamp = coupleData?.timestamp ? new Date(coupleData.timestamp) : null;
  const partnerUid = coupleData?.users?.find(uid => uid !== user.uid);
  const myProfile = profiles[user.uid];
  const partnerProfile = partnerUid ? profiles[partnerUid] : null;


  // Real-time listener for couple document
  useEffect(() => {
    if (!coupleId) return;
    const unsub = onSnapshot(doc(db, 'couples', coupleId), (snap) => {
      if (snap.exists()) {
        const data = snap.data();
        setCoupleData(data);
        
        // Show toast if partner sent a new photo
        if (data.senderId && data.senderId !== user.uid && data.timestamp) {
          if (lastPhotoTimestampRef.current && data.timestamp !== lastPhotoTimestampRef.current) {
            setToast('💛 New photo from your love!');
            setTimeout(() => setToast(''), 3000);
          }
          lastPhotoTimestampRef.current = data.timestamp;
        } else if (data.timestamp) {
          lastPhotoTimestampRef.current = data.timestamp;
        }

        // Show toast if partner liked your photo
        if (data.lastLike && data.lastLike.userId !== user.uid && data.lastLike.timestamp) {
          if (lastLikeTimestampRef.current && data.lastLike.timestamp !== lastLikeTimestampRef.current) {
            setToast('❤️ Your love liked your photo!');
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

  // Real-time listener for user profiles in the couple
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

  // Real-time listener for all photos in the couple subcollection sorted chronologically (newest first)
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

  // Auto-migrate legacy/first photo to photos subcollection if empty
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
        console.error("Error seeding photo: ", err);
      }
    };
    seedPhoto();
  }, [coupleId, photoUrl, loadingPhotos, photos.length, coupleData, user.uid]);

  const handleCapture = () => {
    fileRef.current?.click();
  };

  const handleFileChange = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);

    try {
      // Compress image if needed
      const compressed = await compressImage(file);
      const filename = `couples/${coupleId}/${Date.now()}.jpg`;
      const storageRef = ref(storage, filename);
      await uploadBytes(storageRef, compressed);
      const url = await getDownloadURL(storageRef);

      const timestampStr = new Date().toISOString();

      // 1. Add new photo to the subcollection for chronological scroll
      await addDoc(collection(db, 'couples', coupleId, 'photos'), {
        photoUrl: url,
        senderId: user.uid,
        timestamp: timestampStr,
        liked: false
      });

      // 2. Update parent couple doc to preserve legacy state & trigger sync events
      await updateDoc(doc(db, 'couples', coupleId), {
        currentPhotoUrl: url,
        senderId: user.uid,
        timestamp: timestampStr,
        liked: false,
        lastLike: null
      });

      setToast('📸 Photo sent!');
      setTimeout(() => setToast(''), 2500);
    } catch (err) {
      setToast('Failed to upload photo');
      setTimeout(() => setToast(''), 3000);
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
      
      // 1. Update liked state on individual subcollection doc
      await updateDoc(photoRef, {
        liked: !isLiked
      });

      // 2. Also update parent couples doc to fire real-time snapshot toast notifications
      await updateDoc(doc(db, 'couples', coupleId), {
        liked: !isLiked,
        lastLike: !isLiked ? {
          userId: user.uid,
          timestamp: new Date().toISOString(),
          photoId: photo.id
        } : null
      });

      if (!isLiked) {
        setToast('❤️ Photo liked!');
        setTimeout(() => setToast(''), 1500);
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
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', position: 'relative', overflow: 'hidden' }}>
      {/* Header */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: `calc(var(--safe-top) + 12px) 20px 12px`,
        position: 'relative',
        zIndex: 10,
      }}>
        <span className="logo-text" style={{ fontSize: 22 }}>Locket</span>
        <button
          id="main-menu-btn"
          onClick={() => setShowMenu(!showMenu)}
          style={{
            background: 'var(--glass-bg)',
            border: '1px solid var(--border)',
            borderRadius: 'var(--radius-full)',
            width: 40, height: 40,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            cursor: 'pointer', color: 'var(--text-secondary)', fontSize: 18
          }}
        >
          ⚙️
        </button>
      </div>

      {/* Menu dropdown */}
      <AnimatePresence>
        {showMenu && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="glass-card"
            style={{
              position: 'absolute',
              top: 'calc(var(--safe-top) + 60px)',
              right: 20,
              padding: 8,
              zIndex: 20,
              minWidth: 180,
            }}
          >
            <div style={{ 
              display: 'flex', 
              alignItems: 'center', 
              gap: 12, 
              padding: '12px 14px', 
              borderBottom: '1px solid var(--border)' 
            }}>
              <img 
                src={myProfile?.profilePic || `https://api.dicebear.com/7.x/adventurer/svg?seed=${user.uid}`}
                alt="Avatar" 
                style={{ 
                  width: 40, 
                  height: 40, 
                  borderRadius: '50%', 
                  objectFit: 'cover',
                  border: '2px solid var(--accent)'
                }} 
              />
              <div style={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 }}>
                <span style={{ fontWeight: 600, fontSize: 14, color: 'var(--text-primary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {myProfile?.displayName || user.email.split('@')[0]}
                </span>
                <span style={{ fontSize: 11, color: 'var(--text-muted)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {user.email}
                </span>
              </div>
            </div>
            <button
              id="main-logout-btn"
              onClick={handleLogout}
              style={{
                width: '100%', 
                padding: '12px 14px', 
                background: 'none', 
                border: 'none',
                color: '#ff4d4d', 
                fontSize: 14, 
                fontWeight: 600, 
                textAlign: 'left',
                cursor: 'pointer', 
                borderRadius: 8,
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                transition: 'background 0.2s ease',
              }}
              onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(255, 77, 77, 0.08)'}
              onMouseLeave={(e) => e.currentTarget.style.background = 'none'}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
                <polyline points="16 17 21 12 16 7" />
                <line x1="21" y1="12" x2="9" y2="12" />
              </svg>
              Sign Out
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Photo display */}
      <div style={{
        flex: 1,
        width: '100%',
        height: '100%',
        maxHeight: 'calc(100vh - 200px)',
        position: 'relative',
        overflow: 'hidden',
        display: 'flex',
        justifyContent: 'center'
      }}>
        {loadingPhotos ? (
          <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', flex: 1 }}>
            <div className="spinner" />
          </div>
        ) : photos.length > 0 ? (
          <div className="reels-feed" style={{ maxWidth: 420 }}>
            {photos.map((photo) => {
              const isPhotoMine = photo.senderId === user.uid;
              const photoTimestamp = photo.timestamp ? new Date(photo.timestamp) : null;
              const senderProfile = photo.senderId === user.uid ? myProfile : profiles[photo.senderId];

              return (
                <div key={photo.id} className="reels-slide">
                  <motion.div
                    initial={{ opacity: 0, scale: 0.96 }}
                    animate={{ opacity: 1, scale: 1 }}
                    style={{
                      width: '100%',
                      height: '100%',
                      borderRadius: 'var(--radius-lg)',
                      overflow: 'hidden',
                      position: 'relative',
                      boxShadow: '0px 20px 60px 0px rgba(0, 0, 0, 0.20)',
                    }}
                  >
                    <img
                      src={photo.photoUrl}
                      alt="Shared moment"
                      loading="eager"
                      style={{
                        width: '100%',
                        height: '100%',
                        objectFit: 'cover',
                        display: 'block'
                      }}
                    />
                    {/* Photo overlay info */}
                    <div style={{
                      position: 'absolute',
                      bottom: 0,
                      left: 0,
                      right: 0,
                      padding: '40px 20px 20px',
                      background: 'linear-gradient(180deg, rgba(0, 0, 0, 0.00) 0%, rgba(0, 0, 0, 0.20) 50%, rgba(0, 0, 0, 0.33) 100%)',
                      display: 'flex',
                      alignItems: 'flex-end',
                      justifyContent: 'space-between'
                    }}>
                      <div>
                        <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.7)' }}>
                          {isPhotoMine 
                            ? `Sent by you (${myProfile?.displayName || user.email.split('@')[0]})` 
                            : `From ${senderProfile?.displayName || 'your love'}`
                          }
                        </p>
                        <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.5)', marginTop: 2 }}>
                          {timeAgo(photoTimestamp)}
                        </p>
                      </div>
                      {isPhotoMine ? (
                        <motion.div
                          animate={photo.liked ? {
                            scale: [1, 1.25, 1],
                            transition: { repeat: Infinity, duration: 1.5, ease: 'easeInOut' }
                          } : {
                            y: [0, -6, 0],
                            transition: { repeat: Infinity, duration: 3, ease: 'easeInOut' }
                          }}
                          style={{ fontSize: 24, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                        >
                          {photo.liked ? '❤️' : '📤'}
                        </motion.div>
                      ) : (
                        <motion.button
                          onClick={() => handleLikePhoto(photo)}
                          whileTap={{ scale: 0.8 }}
                          whileHover={{ scale: 1.15 }}
                          animate={photo.liked ? {
                            scale: [1, 1.3, 1],
                            transition: { duration: 0.4 }
                          } : {}}
                          style={{
                            background: 'none',
                            border: 'none',
                            fontSize: 26,
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            padding: 8,
                            marginRight: -8,
                            filter: 'drop-shadow(0 2px 8px rgba(0,0,0,0.15))',
                            outline: 'none'
                          }}
                        >
                          {photo.liked ? '❤️' : '🤍'}
                        </motion.button>
                      )}
                    </div>
                  </motion.div>
                </div>
              );
            })}
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', flex: 1, textAlign: 'center' }}>
            <motion.div
              animate={{ scale: [1, 1.1, 1], rotate: [0, 5, -5, 0] }}
              transition={{ duration: 4, repeat: Infinity }}
              style={{ fontSize: 72, marginBottom: 20 }}
            >
              📷
            </motion.div>
            <p style={{ color: 'var(--text-secondary)', fontSize: 16, fontWeight: 500 }}>
              Send your first photo!
            </p>
            <p style={{ color: 'var(--text-muted)', fontSize: 13, marginTop: 6 }}>
              Tap the button below to share a moment
            </p>
          </div>
        )}
      </div>

      {/* Camera button */}
      <div style={{
        padding: `16px 20px calc(var(--safe-bottom) + 16px)`,
        display: 'flex',
        justifyContent: 'center'
      }}>
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          capture="environment"
          onChange={handleFileChange}
          style={{ display: 'none' }}
        />
        <motion.button
          id="main-capture-btn"
          onClick={handleCapture}
          disabled={uploading}
          whileTap={{ scale: 0.9 }}
          style={{
            width: 72,
            height: 72,
            borderRadius: '50%',
            background: uploading
              ? 'var(--glass-bg)'
              : 'linear-gradient(135deg, var(--accent), var(--accent-hover))',
            border: '4px solid rgba(255,255,255,0.2)',
            cursor: uploading ? 'wait' : 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: 28,
            boxShadow: uploading ? 'none' : '0 8px 30px var(--accent-glow)',
            animation: uploading ? 'none' : 'pulse-glow 2s infinite',
            transition: 'all 0.3s ease',
          }}
        >
          {uploading ? <div className="spinner" /> : '📸'}
        </motion.button>
      </div>

      {/* Toast */}
      <AnimatePresence>
        {toast && (
          <motion.div
            className="toast"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 20 }}
          >
            {toast}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Click outside menu to close */}
      {showMenu && (
        <div
          onClick={() => setShowMenu(false)}
          style={{ position: 'fixed', inset: 0, zIndex: 15 }}
        />
      )}
    </div>
  );
}
