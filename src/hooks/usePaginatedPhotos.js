import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  collection,
  db,
  getDocs,
  limit,
  onSnapshot,
  orderBy,
  query,
  startAfter
} from '../firebase.js';
import {
  INITIAL_PHOTO_LIMIT,
  PHOTO_PAGE_SIZE,
  mergePhotoPages
} from './photoPagination.js';

function photosFromSnapshot(snapshot) {
  return snapshot.docs.map((photoDoc) => ({ id: photoDoc.id, ...photoDoc.data() }));
}

export function usePaginatedPhotos(coupleId) {
  const [firstPage, setFirstPage] = useState([]);
  const [olderPages, setOlderPages] = useState([]);
  const [loadingPhotos, setLoadingPhotos] = useState(true);
  const [loadingMorePhotos, setLoadingMorePhotos] = useState(false);
  const [photoLoadError, setPhotoLoadError] = useState('');
  const [hasMorePhotos, setHasMorePhotos] = useState(true);
  const cursorRef = useRef(null);
  const loadingMoreRef = useRef(false);
  const firstPageRef = useRef([]);
  const hasLoadedOlderRef = useRef(false);

  useEffect(() => {
    setFirstPage([]);
    setOlderPages([]);
    setLoadingPhotos(Boolean(coupleId));
    setLoadingMorePhotos(false);
    setPhotoLoadError('');
    setHasMorePhotos(Boolean(coupleId));
    cursorRef.current = null;
    loadingMoreRef.current = false;
    firstPageRef.current = [];
    hasLoadedOlderRef.current = false;

    if (!coupleId) return undefined;

    const firstPageQuery = query(
      collection(db, 'couples', coupleId, 'photos'),
      orderBy('timestamp', 'desc'),
      limit(INITIAL_PHOTO_LIMIT)
    );

    return onSnapshot(firstPageQuery, (snapshot) => {
      const nextFirstPage = photosFromSnapshot(snapshot);
      if (hasLoadedOlderRef.current) {
        const nextIds = new Set(nextFirstPage.map((photo) => photo.id));
        const displacedPhotos = firstPageRef.current.filter((photo) => !nextIds.has(photo.id));
        if (displacedPhotos.length > 0) {
          setOlderPages((pages) => [displacedPhotos, ...pages]);
        }
      } else {
        cursorRef.current = snapshot.docs.at(-1) || null;
        setHasMorePhotos(snapshot.docs.length === INITIAL_PHOTO_LIMIT);
      }
      firstPageRef.current = nextFirstPage;
      setFirstPage(nextFirstPage);
      setLoadingPhotos(false);
    }, () => {
      setLoadingPhotos(false);
      setPhotoLoadError('Unable to load photos.');
    });
  }, [coupleId]);

  const loadMorePhotos = useCallback(async () => {
    const cursor = cursorRef.current;
    if (!coupleId || !cursor || loadingMoreRef.current || !hasMorePhotos) return;

    loadingMoreRef.current = true;
    setLoadingMorePhotos(true);
    setPhotoLoadError('');

    try {
      const nextPageQuery = query(
        collection(db, 'couples', coupleId, 'photos'),
        orderBy('timestamp', 'desc'),
        startAfter(cursor),
        limit(PHOTO_PAGE_SIZE)
      );
      const snapshot = await getDocs(nextPageQuery);
      setOlderPages((pages) => [...pages, photosFromSnapshot(snapshot)]);
      hasLoadedOlderRef.current = true;
      cursorRef.current = snapshot.docs.at(-1) || cursor;
      setHasMorePhotos(snapshot.docs.length === PHOTO_PAGE_SIZE);
    } catch {
      setPhotoLoadError('Unable to load more photos.');
    } finally {
      loadingMoreRef.current = false;
      setLoadingMorePhotos(false);
    }
  }, [coupleId, hasMorePhotos]);

  const photos = useMemo(
    () => mergePhotoPages(firstPage, olderPages),
    [firstPage, olderPages]
  );

  return {
    photos,
    loadingPhotos,
    loadingMorePhotos,
    photoLoadError,
    hasMorePhotos,
    loadMorePhotos
  };
}
