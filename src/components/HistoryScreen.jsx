import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { db, collection, query, orderBy, onSnapshot } from '../firebase';
import { trackEvent } from '../analytics';

export default function HistoryScreen({ coupleId, onSelectPhoto }) {
  const [photos, setPhotos] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!coupleId) return;

    const q = query(
      collection(db, 'couples', coupleId, 'photos'),
      orderBy('timestamp', 'desc')
    );

    const unsub = onSnapshot(q, (snap) => {
      const items = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setPhotos(items);
      setLoading(false);
    }, () => {
      setLoading(false);
    });

    return () => unsub();
  }, [coupleId]);

  return (
    <motion.section
      className="history-screen"
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 12 }}
      transition={{ duration: 0.22, ease: [0.4, 0, 0.2, 1] }}
    >
      <header className="history-header">
        <div />
        <h2>History</h2>
        <div />
      </header>

      {loading ? (
        <div className="camera-frame empty" style={{ flex: 1 }}>
          <div className="spinner" />
        </div>
      ) : photos.length === 0 ? (
        <div className="camera-frame empty" style={{ flex: 1 }}>
          <div className="empty-state">
            <strong>No photos yet</strong>
            <span>Shared photos will appear here.</span>
          </div>
        </div>
      ) : (
        <div className="history-grid">
          {photos.map((photo, i) => (
            <motion.button
              className="history-tile"
              type="button"
              initial={{ opacity: 0, scale: 0.92 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: i * 0.025 }}
              key={photo.id}
              onClick={() => {
                trackEvent('history_photo_opened', { photoId: photo.id });
                onSelectPhoto?.(photo.id);
              }}
              aria-label="Open photo"
            >
              <img
                src={photo.photoUrl}
                alt=""
                loading="lazy"
                decoding="async"
                draggable={false}
              />
            </motion.button>
          ))}
        </div>
      )}
    </motion.section>
  );
}
