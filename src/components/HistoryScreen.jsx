import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { db, collection, query, orderBy, onSnapshot } from '../firebase';

export default function HistoryScreen({ user, coupleId, onClose }) {
  const [photos, setPhotos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedPhoto, setSelectedPhoto] = useState(null);

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
    });

    return () => unsub();
  }, [coupleId]);

  return (
    <div className="screen" style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', background: 'var(--bg-primary)', zIndex: 50 }}>
      {/* Header */}
      <div style={{
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        paddingTop: 'var(--safe-top)', marginBottom: 20
      }}>
        <button
          onClick={onClose}
          style={{
            background: 'var(--glass-bg)', border: '1px solid var(--glass-border)',
            borderRadius: 'var(--radius-full)', width: 40, height: 40,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            cursor: 'pointer', color: 'var(--text-primary)', fontSize: 18
          }}
        >
          ←
        </button>
        <h2 style={{ fontSize: 18, fontWeight: 600 }}>History</h2>
        <div style={{ width: 40 }} /> {/* Spacer */}
      </div>

      {loading ? (
        <div style={{ display: 'flex', justifyContent: 'center', flex: 1, alignItems: 'center' }}>
          <div className="spinner" />
        </div>
      ) : photos.length === 0 ? (
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-secondary)' }}>
          No photos yet
        </div>
      ) : (
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(3, 1fr)',
          gap: 8,
          paddingBottom: 'calc(var(--safe-bottom) + 20px)'
        }}>
          {photos.map((photo, i) => (
            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: i * 0.05 }}
              key={photo.id}
              onClick={() => setSelectedPhoto(photo.photoUrl)}
              style={{
                aspectRatio: '1/1',
                borderRadius: 'var(--radius-sm)',
                overflow: 'hidden',
                background: 'var(--bg-card)',
                cursor: 'pointer',
                position: 'relative'
              }}
            >
              <img
                src={photo.photoUrl}
                alt="History"
                style={{ width: '100%', height: '100%', objectFit: 'cover' }}
              />
              {photo.senderId === user.uid && (
                <div style={{
                  position: 'absolute', top: 4, right: 4,
                  background: 'rgba(0,0,0,0.5)', padding: '2px 6px',
                  borderRadius: 10, fontSize: 10, color: '#fff'
                }}>
                  You
                </div>
              )}
            </motion.div>
          ))}
        </div>
      )}

      {/* Full screen modal */}
      {selectedPhoto && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          onClick={() => setSelectedPhoto(null)}
          style={{
            position: 'fixed', top: 0, left: 0, width: '100vw', height: '100vh',
            background: 'rgba(0,0,0,0.9)', zIndex: 100,
            display: 'flex', alignItems: 'center', justifyContent: 'center'
          }}
        >
          <img
            src={selectedPhoto}
            alt="Full screen"
            style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }}
            onClick={(e) => e.stopPropagation()}
          />
          <button
            onClick={() => setSelectedPhoto(null)}
            style={{
              position: 'absolute', top: 'calc(var(--safe-top) + 20px)', right: 20,
              background: 'rgba(255,255,255,0.2)', border: 'none',
              borderRadius: '50%', width: 40, height: 40, color: '#fff', fontSize: 20, cursor: 'pointer'
            }}
          >
            ×
          </button>
        </motion.div>
      )}
    </div>
  );
}
