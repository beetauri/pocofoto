import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  collection,
  addDoc,
  doc,
  getDoc,
  getDocs,
  limit,
  onSnapshot,
  orderBy,
  query,
  where,
  startAfter
} from '@react-native-firebase/firestore';
import { firestoreClient } from '../services/firebase';
import {
  INITIAL_PHOTO_LIMIT,
  PHOTO_PAGE_SIZE,
  mergePhotoPages,
  mergeServerAndLocalPhotos,
  photoTimestampMs
} from '../domain/photos';
import type { NativePhoto } from '../types';

function photosFromSnapshot(snapshot: { docs: { id: string; data: () => Record<string, unknown> }[] }): NativePhoto[] {
  return snapshot.docs.map((item) => ({ id: item.id, ...item.data() } as NativePhoto));
}

export function usePhotos(coupleId: string | null, localPhotos: NativePhoto[] = []) {
  const [firstPage, setFirstPage] = useState<NativePhoto[]>([]);
  const [olderPages, setOlderPages] = useState<NativePhoto[][]>([]);
  const [loading, setLoading] = useState(Boolean(coupleId));
  const [loadingMore, setLoadingMore] = useState(false);
  const [loadError, setLoadError] = useState('');
  const [hasMore, setHasMore] = useState(Boolean(coupleId));
  const cursorRef = useRef<unknown>(null);
  const firstPageRef = useRef<NativePhoto[]>([]);
  const hasLoadedOlderRef = useRef(false);
  const loadingMoreRef = useRef(false);
  const legacySeedAttemptRef = useRef<string | null>(null);

  useEffect(() => {
    setFirstPage([]);
    setOlderPages([]);
    setLoading(Boolean(coupleId));
    setLoadingMore(false);
    setLoadError('');
    setHasMore(Boolean(coupleId));
    cursorRef.current = null;
    firstPageRef.current = [];
    hasLoadedOlderRef.current = false;
    loadingMoreRef.current = false;
    legacySeedAttemptRef.current = null;

    if (!coupleId) return undefined;

    const firstPageQuery = query(
      collection(firestoreClient, 'couples', coupleId, 'photos'),
      orderBy('timestamp', 'desc'),
      limit(INITIAL_PHOTO_LIMIT)
    );

    return onSnapshot(firstPageQuery, (snapshot) => {
      const nextFirstPage = photosFromSnapshot(snapshot);
      if (hasLoadedOlderRef.current) {
        const nextIds = new Set(nextFirstPage.map((photo) => photo.id));
        const displaced = firstPageRef.current.filter((photo) => !nextIds.has(photo.id));
        if (displaced.length) setOlderPages((pages) => [displaced, ...pages]);
      } else {
        cursorRef.current = snapshot.docs[snapshot.docs.length - 1] || null;
        setHasMore(snapshot.docs.length === INITIAL_PHOTO_LIMIT);
      }
      firstPageRef.current = nextFirstPage;
      setFirstPage(nextFirstPage);
      setLoading(false);
    }, () => {
      setLoading(false);
      setLoadError('Unable to load photos.');
    });
  }, [coupleId]);

  useEffect(() => {
    if (!coupleId || loading || firstPage.length > 0 || legacySeedAttemptRef.current === coupleId) return;
    legacySeedAttemptRef.current = coupleId;
    void getDoc(doc(firestoreClient, 'couples', coupleId)).then(async (snapshot) => {
      const data = snapshot.data() as { currentPhotoUrl?: string; senderId?: string; timestamp?: string; liked?: boolean } | undefined;
      if (!snapshot.exists() || !data?.currentPhotoUrl) return;
      const existing = await getDocs(query(
        collection(firestoreClient, 'couples', coupleId, 'photos'),
        where('photoUrl', '==', data.currentPhotoUrl),
        limit(1)
      ));
      if (!existing.empty) return;
      return addDoc(collection(firestoreClient, 'couples', coupleId, 'photos'), {
        photoUrl: data.currentPhotoUrl,
        senderId: data.senderId || null,
        timestamp: data.timestamp || new Date().toISOString(),
        liked: Boolean(data.liked)
      });
    }).catch(() => {
      legacySeedAttemptRef.current = null;
    });
  }, [coupleId, firstPage.length, loading]);

  const loadMore = useCallback(async () => {
    const cursor = cursorRef.current;
    if (!coupleId || !cursor || loadingMoreRef.current || !hasMore) return;
    loadingMoreRef.current = true;
    setLoadingMore(true);
    setLoadError('');
    try {
      const nextPageQuery = query(
        collection(firestoreClient, 'couples', coupleId, 'photos'),
        orderBy('timestamp', 'desc'),
        startAfter(cursor as never),
        limit(PHOTO_PAGE_SIZE)
      );
      const snapshot = await getDocs(nextPageQuery);
      setOlderPages((pages) => [...pages, photosFromSnapshot(snapshot)]);
      hasLoadedOlderRef.current = true;
      cursorRef.current = snapshot.docs[snapshot.docs.length - 1] || cursor;
      setHasMore(snapshot.docs.length === PHOTO_PAGE_SIZE);
    } catch {
      setLoadError('Unable to load more photos.');
    } finally {
      loadingMoreRef.current = false;
      setLoadingMore(false);
    }
  }, [coupleId, hasMore]);

  const photos = useMemo(
    () => mergeServerAndLocalPhotos(mergePhotoPages(firstPage, olderPages), localPhotos),
    [firstPage, olderPages, localPhotos]
  );

  const updatePhotoLocal = useCallback((photoId: string, updater: Partial<NativePhoto> | ((photo: NativePhoto) => NativePhoto)) => {
    const apply = (photo: NativePhoto) => photo.id !== photoId
      ? photo
      : typeof updater === 'function' ? updater(photo) : { ...photo, ...updater };
    setFirstPage((page) => page.map(apply));
    setOlderPages((pages) => pages.map((page) => page.map(apply)));
    firstPageRef.current = firstPageRef.current.map(apply);
  }, []);

  const insertServerPhotoLocal = useCallback((serverPhoto: NativePhoto) => {
    if (!serverPhoto.id) return;
    const insert = (page: NativePhoto[]) => [
      ...page.filter((photo) => photo.id !== serverPhoto.id),
      serverPhoto
    ].sort((a, b) => photoTimestampMs(b) - photoTimestampMs(a));
    setFirstPage((page) => insert(page));
    firstPageRef.current = insert(firstPageRef.current);
  }, []);

  return useMemo(() => ({
    photos,
    loading,
    loadingMore,
    loadError,
    hasMore,
    loadMore,
    updatePhotoLocal,
    insertServerPhotoLocal
  }), [hasMore, insertServerPhotoLocal, loadError, loadMore, loading, loadingMore, photos, updatePhotoLocal]);
}
