import { manipulateAsync, SaveFormat } from 'expo-image-manipulator';
import {
  collection,
  doc,
  writeBatch
} from '@react-native-firebase/firestore';
import { getDownloadURL, putFile, ref } from '@react-native-firebase/storage';
import { firestoreClient, storageClient } from './firebase';
import { buildCaptionPayload } from '../domain/caption';

export async function preparePhoto(uri: string, width: number, height: number) {
  const side = Math.min(width, height);
  const crop = {
    originX: Math.max(0, Math.round((width - side) / 2)),
    originY: Math.max(0, Math.round((height - side) / 2)),
    width: side,
    height: side
  };
  const fullActions = [{ crop }, { resize: { width: Math.min(1920, side), height: Math.min(1920, side) } }];
  const thumbnailActions = [{ crop }, { resize: { width: 256, height: 256 } }];
  const [full, square] = await Promise.all([
    manipulateAsync(uri, fullActions, { compress: 0.9, format: SaveFormat.JPEG }),
    manipulateAsync(uri, thumbnailActions, { compress: 0.78, format: SaveFormat.WEBP })
  ]);
  return { fullUri: full.uri, thumbnailUri: square.uri };
}

export async function uploadPhoto({
  coupleId,
  senderId,
  fullUri,
  thumbnailUri,
  caption,
  paletteV2 = null
}: {
  coupleId: string;
  senderId: string;
  fullUri: string;
  thumbnailUri?: string | null;
  caption?: string | null;
  paletteV2?: { version: 2; topColor: string; bottomColor: string; colors: string[] } | null;
}) {
  const timestamp = new Date().toISOString();
  const uniqueSuffix = `${senderId.slice(0, 8)}_${Math.random().toString(36).slice(2, 8)}`;
  const fileKey = `${Date.now()}_${uniqueSuffix}`;
  const photoRef = ref(storageClient, `couples/${coupleId}/${fileKey}.jpg`);
  const thumbnailRef = thumbnailUri ? ref(storageClient, `couples/${coupleId}/thumbnails/${fileKey}_thumb.webp`) : null;
  const photoUrl = (await putFile(photoRef, fullUri, { contentType: 'image/jpeg' }).then(() => getDownloadURL(photoRef))) as string;

  let thumbnailUrl: string | null = null;
  let thumbnailFailed = false;
  if (thumbnailRef && thumbnailUri) {
    const uploadThumbnailOnce = (): Promise<string> =>
      putFile(thumbnailRef, thumbnailUri, { contentType: 'image/webp' }).then(() => getDownloadURL(thumbnailRef)) as unknown as Promise<string>;
    try {
      thumbnailUrl = await uploadThumbnailOnce();
    } catch {
      try {
        thumbnailUrl = await uploadThumbnailOnce();
      } catch (error) {
        thumbnailFailed = true;
        console.warn('Thumbnail upload failed after retry, proceeding without thumbnail.', error);
      }
    }
  }

  const photoPayload: Record<string, unknown> = {
    photoUrl,
    senderId,
    timestamp,
    liked: false
  };
  if (thumbnailUrl) {
    photoPayload.thumbnailUrl = thumbnailUrl;
    photoPayload.thumbnailSize = 256;
    photoPayload.thumbnailFormat = 'webp';
  }
  if (paletteV2) photoPayload.paletteV2 = paletteV2;
  const captionPayload = buildCaptionPayload(caption);
  if (captionPayload) photoPayload.caption = captionPayload;

  const photosCollection = collection(firestoreClient, 'couples', coupleId, 'photos');
  const newPhotoRef = doc(photosCollection);
  const batch = writeBatch(firestoreClient);
  batch.set(newPhotoRef, photoPayload);
  batch.update(doc(firestoreClient, 'couples', coupleId), {
    currentPhotoUrl: photoUrl,
    senderId,
    timestamp,
    liked: false,
    lastLike: null
  });
  await batch.commit();
  return { id: newPhotoRef.id, ...photoPayload, thumbnailFailed };
}
