import type { NativePhoto } from '../types';

export type LocalPhoto = NativePhoto & {
  localOnly: true;
  localStatus: 'pending' | 'uploading' | 'failed';
  photoUrl: string;
  localError: string;
};

export function createLocalPhoto({
  id,
  uri,
  coupleId,
  senderId,
  caption,
  createdAt = new Date().toISOString(),
  thumbnailUri = null
}: {
  id: string;
  uri: string;
  coupleId: string;
  senderId: string;
  caption?: { type: 'text'; text: string } | null;
  createdAt?: string;
  thumbnailUri?: string | null;
}): LocalPhoto {
  return {
    id,
    localOnly: true,
    localStatus: 'pending',
    localError: '',
    photoUrl: uri,
    thumbnailUrl: thumbnailUri,
    coupleId,
    senderId,
    caption: caption || null,
    timestamp: createdAt,
    liked: false
  };
}

export function markLocalPhotoUploading(photo: LocalPhoto): LocalPhoto {
  return { ...photo, localStatus: 'uploading', localError: '' };
}

export function markLocalPhotoPending(photo: LocalPhoto): LocalPhoto {
  return { ...photo, localStatus: 'pending', localError: '' };
}

export function markLocalPhotoFailed(photo: LocalPhoto, error: string): LocalPhoto {
  return { ...photo, localStatus: 'failed', localError: error || 'Upload failed' };
}

export function findNextUploadableLocalPhoto(photos: LocalPhoto[]): LocalPhoto | null {
  return photos.find((photo) => photo.localStatus === 'pending') || null;
}
