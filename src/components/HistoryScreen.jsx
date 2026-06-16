import { useEffect, useRef } from 'react';
import { motion } from 'framer-motion';
import { trackEvent } from '../analytics';

export default function HistoryScreen({
  photos,
  loading,
  hasMore,
  loadingMore,
  loadError,
  onLoadMore,
  onSelectPhoto
}) {
  const sentinelRef = useRef(null);

  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel || !hasMore || loadingMore || loadError) return undefined;
    const observer = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) onLoadMore?.();
    }, {
      root: sentinel.closest('.history-screen'),
      rootMargin: '400px 0px'
    });
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [hasMore, loadingMore, loadError, onLoadMore]);

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
        <>
          <div className="history-grid">
            {photos.map((photo, i) => {
              const historyImageUrl = photo.thumbnailUrl || photo.photoUrl;
              return (
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
                    src={historyImageUrl}
                    alt=""
                    loading="lazy"
                    decoding="async"
                    draggable={false}
                  />
                </motion.button>
              );
            })}
          </div>
          <div className="photo-load-more" ref={sentinelRef}>
            {loadingMore && <div className="spinner" />}
            {loadError && (
              <button type="button" onClick={onLoadMore}>Try again</button>
            )}
          </div>
        </>
      )}
    </motion.section>
  );
}
