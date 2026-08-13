import { manipulateAsync, SaveFormat } from 'expo-image-manipulator';
import {
  addDoc,
  collection,
  doc,
  updateDoc
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
  const full = await manipulateAsync(uri, [{ crop }, { resize: { width: Math.min(1920, side), height: Math.min(1920, side) } }], { compress: 0.9, format: SaveFormat.JPEG });
  const square = await manipulateAsync(uri, [{
    crop
  }, { resize: { width: 256, height: 256 } }], { compress: 0.78, format: SaveFormat.WEBP });
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
  const fileKey = `${Date.now()}`;
  const photoRef = ref(storageClient, `couples/${coupleId}/${fileKey}.jpg`);
  await putFile(photoRef, fullUri, { contentType: 'image/jpeg' });
  const photoUrl = await getDownloadURL(photoRef);

  let thumbnailUrl: string | null = null;
  if (thumbnailUri) {
    try {
      const thumbnailRef = ref(storageClient, `couples/${coupleId}/thumbnails/${timestamp}.webp`);
      await putFile(thumbnailRef, thumbnailUri, { contentType: 'image/webp' });
      thumbnailUrl = await getDownloadURL(thumbnailRef);
    } catch {
      thumbnailUrl = null;
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

  const created = await addDoc(collection(firestoreClient, 'couples', coupleId, 'photos'), photoPayload);
  await updateDoc(doc(firestoreClient, 'couples', coupleId), {
    currentPhotoUrl: photoUrl,
    senderId,
    timestamp,
    liked: false,
    lastLike: null
  });
  return { id: created.id, ...photoPayload };
}
