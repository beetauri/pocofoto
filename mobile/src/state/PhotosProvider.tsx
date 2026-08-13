import { doc, updateDoc } from '@react-native-firebase/firestore';
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type PropsWithChildren } from 'react';
import { useApp } from './AppProvider';
import { usePhotos } from '../hooks/usePhotos';
import { firestoreClient } from '../services/firebase';
import { trackEvent } from '../services/analytics';
import { copyFileToDurableStorage, deleteLocalPhotoFile, loadPhotoQueue, savePhotoQueue } from '../services/localStore';
import { uploadPhoto } from '../services/photoService';
import {
  findNextUploadableLocalPhoto,
  markLocalPhotoFailed,
  markLocalPhotoPending,
  markLocalPhotoUploading,
  type LocalPhoto,
  createLocalPhoto
} from '../domain/localQueue';
import type { NativePhoto } from '../types';

type PhotosContextValue = ReturnType<typeof usePhotos> & {
  localPhotos: LocalPhoto[];
  enqueuePhoto: (input: { fullUri: string; thumbnailUri?: string | null; caption: string }) => Promise<void>;
  retryLocalPhoto: (photoId: string) => void;
  deleteLocalPhoto: (photoId: string) => Promise<void>;
  likePhoto: (photo: NativePhoto) => Promise<void>;
};

const PhotosContext = createContext<PhotosContextValue | null>(null);

export function PhotosProvider({ children }: PropsWithChildren) {
  const { user, coupleId, isOnline } = useApp();
  const [localPhotos, setLocalPhotos] = useState<LocalPhoto[]>([]);
  const [queueLoaded, setQueueLoaded] = useState(false);
  const localPhotosRef = useRef<LocalPhoto[]>([]);
  const queueInFlightRef = useRef(false);
  const photosApi = usePhotos(coupleId, localPhotos);

  useEffect(() => {
    localPhotosRef.current = localPhotos;
  }, [localPhotos]);

  useEffect(() => {
    if (!user || !coupleId) {
      setLocalPhotos([]);
      setQueueLoaded(false);
      return;
    }
    let active = true;
    setLocalPhotos([]);
    setQueueLoaded(false);
    void loadPhotoQueue(user.uid, coupleId).then((photos) => {
      if (!active) return;
      setLocalPhotos(photos);
      setQueueLoaded(true);
    }).catch(() => {
      if (active) setQueueLoaded(true);
    });
    return () => { active = false; };
  }, [user, coupleId]);

  useEffect(() => {
    if (!user || !coupleId || !queueLoaded) return;
    void savePhotoQueue(user.uid, coupleId, localPhotos).catch(() => undefined);
  }, [user, coupleId, localPhotos, queueLoaded]);

  const enqueuePhoto = useCallback(async ({ fullUri, thumbnailUri, caption }: { fullUri: string; thumbnailUri?: string | null; caption: string }) => {
    if (!user || !coupleId) return;
    const id = `local-photo-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
    let durableFullUri: string | null = null;
    let durableThumbnailUri: string | null = null;
    try {
      const [fullResult, thumbnailResult] = await Promise.allSettled([
        copyFileToDurableStorage(fullUri, id, 'jpg'),
        thumbnailUri ? copyFileToDurableStorage(thumbnailUri, `${id}-thumb`, 'webp') : Promise.resolve(null)
      ]);
      durableFullUri = fullResult.status === 'fulfilled' ? fullResult.value : null;
      durableThumbnailUri = thumbnailResult.status === 'fulfilled' ? thumbnailResult.value : null;
      if (fullResult.status === 'rejected') throw fullResult.reason;
      if (thumbnailResult.status === 'rejected') throw thumbnailResult.reason;
    } catch (error) {
      await deleteLocalPhotoFile(durableFullUri).catch(() => undefined);
      await deleteLocalPhotoFile(durableThumbnailUri).catch(() => undefined);
      throw error;
    }
    if (!durableFullUri) throw new Error('Photo could not be copied to durable storage.');
    const localPhoto = createLocalPhoto({
      id,
      uri: durableFullUri,
      thumbnailUri: durableThumbnailUri,
      caption: caption.trim() ? { type: 'text', text: caption.trim() } : null,
      coupleId,
      senderId: user.uid
    });
    setLocalPhotos((current) => [...current, localPhoto]);
    trackEvent('photo_send_queued', { coupleId, localPhotoId: id });
  }, [user, coupleId]);

  const retryLocalPhoto = useCallback((photoId: string) => {
    setLocalPhotos((current) => current.map((photo) => photo.id === photoId ? markLocalPhotoPending(photo) : photo));
  }, []);

  const deleteLocalPhoto = useCallback(async (photoId: string) => {
    const photo = localPhotosRef.current.find((item) => item.id === photoId);
    if (!photo) return;
    await Promise.all([
      deleteLocalPhotoFile(photo.photoUrl).catch(() => undefined),
      deleteLocalPhotoFile(photo.thumbnailUrl).catch(() => undefined)
    ]);
    setLocalPhotos((current) => current.filter((item) => item.id !== photoId));
  }, []);

  useEffect(() => {
    if (!isOnline || !user || !coupleId || queueInFlightRef.current) return;
    const nextPhoto = findNextUploadableLocalPhoto(localPhotosRef.current);
    if (!nextPhoto) return;
    queueInFlightRef.current = true;
    setLocalPhotos((current) => current.map((photo) => photo.id === nextPhoto.id ? markLocalPhotoUploading(photo) : photo));

    void uploadPhoto({
      coupleId,
      senderId: user.uid,
      fullUri: nextPhoto.photoUrl,
      thumbnailUri: nextPhoto.thumbnailUrl,
      caption: nextPhoto.caption?.text || null
    }).then(async (serverPhoto) => {
      await Promise.all([
        deleteLocalPhotoFile(nextPhoto.photoUrl).catch(() => undefined),
        deleteLocalPhotoFile(nextPhoto.thumbnailUrl).catch(() => undefined)
      ]);
      setLocalPhotos((current) => current.filter((photo) => photo.id !== nextPhoto.id));
      photosApi.insertServerPhotoLocal(serverPhoto as NativePhoto);
      trackEvent('photo_sent', { coupleId, photoId: serverPhoto.id });
    }).catch((error) => {
      setLocalPhotos((current) => current.map((photo) => photo.id === nextPhoto.id ? markLocalPhotoFailed(photo, error?.message || 'Upload failed') : photo));
    }).finally(() => {
      queueInFlightRef.current = false;
    });
  }, [coupleId, isOnline, localPhotos, photosApi, user]);

  const likePhoto = useCallback(async (photo: NativePhoto) => {
    // The sender sees delivery status on their own photo; only the partner can react to it.
    if (!user || !coupleId || photo.localOnly || !photo.senderId || photo.senderId === user.uid) return;
    const nextLiked = !photo.liked;
    photosApi.updatePhotoLocal(photo.id, { liked: nextLiked });
    try {
      await updateDoc(doc(firestoreClient, 'couples', coupleId, 'photos', photo.id), { liked: nextLiked });
      await updateDoc(doc(firestoreClient, 'couples', coupleId), {
        liked: nextLiked,
        lastLike: nextLiked ? { userId: user.uid, timestamp: new Date().toISOString(), photoId: photo.id } : null
      });
      trackEvent('photo_liked', { coupleId, photoId: photo.id, liked: nextLiked });
    } catch (error) {
      photosApi.updatePhotoLocal(photo.id, { liked: photo.liked });
      throw error;
    }
  }, [coupleId, photosApi, user]);

  const value = useMemo(() => ({ ...photosApi, localPhotos, enqueuePhoto, retryLocalPhoto, deleteLocalPhoto, likePhoto }), [photosApi, localPhotos, enqueuePhoto, retryLocalPhoto, deleteLocalPhoto, likePhoto]);
  return <PhotosContext.Provider value={value}>{children}</PhotosContext.Provider>;
}

export function usePhotoContext() {
  const context = useContext(PhotosContext);
  if (!context) throw new Error('usePhotoContext must be used inside PhotosProvider');
  return context;
}
