export const LOCAL_PHOTO_STATUS = {
  PENDING: 'pending',
  UPLOADING: 'uploading',
  FAILED: 'failed'
};

export function createLocalPhotoId(now = Date.now, random = Math.random) {
  return `local-photo-${now()}-${Math.floor(random() * 1e9).toString(36)}`;
}

export function createLocalPhoto({
  id = createLocalPhotoId(),
  blob,
  caption = null,
  coupleId,
  objectUrl,
  senderId,
  sentAt = new Date().toISOString(),
  status = LOCAL_PHOTO_STATUS.PENDING,
  errorMessage = ''
}) {
  return {
    id,
    localOnly: true,
    blob,
    caption,
    coupleId,
    errorMessage,
    liked: false,
    photoUrl: objectUrl,
    senderId,
    sentAt,
    status,
    timestamp: sentAt
  };
}

export function appendLocalPhoto(localPhotos, photo) {
  return [...localPhotos, photo];
}

export function updateLocalPhoto(localPhotos, photoId, updater) {
  return localPhotos.map((photo) => {
    if (photo.id !== photoId) return photo;
    return typeof updater === 'function' ? updater(photo) : { ...photo, ...updater };
  });
}

export function markLocalPhotoUploading(localPhotosOrPhoto, photoId = null) {
  if (Array.isArray(localPhotosOrPhoto)) {
    return updateLocalPhoto(localPhotosOrPhoto, photoId, {
      status: LOCAL_PHOTO_STATUS.UPLOADING,
      errorMessage: ''
    });
  }
  return {
    ...localPhotosOrPhoto,
    status: LOCAL_PHOTO_STATUS.UPLOADING,
    errorMessage: ''
  };
}

export function markLocalPhotoFailed(localPhotosOrPhoto, photoIdOrMessage, maybeMessage = '') {
  if (Array.isArray(localPhotosOrPhoto)) {
    return updateLocalPhoto(localPhotosOrPhoto, photoIdOrMessage, {
      status: LOCAL_PHOTO_STATUS.FAILED,
      errorMessage: maybeMessage || 'Upload failed'
    });
  }
  return {
    ...localPhotosOrPhoto,
    status: LOCAL_PHOTO_STATUS.FAILED,
    errorMessage: photoIdOrMessage || 'Upload failed'
  };
}

export function markLocalPhotoPending(localPhotos, photoId) {
  return updateLocalPhoto(localPhotos, photoId, {
    status: LOCAL_PHOTO_STATUS.PENDING,
    errorMessage: ''
  });
}

export function deleteLocalPhoto(localPhotos, photoId) {
  return localPhotos.filter((photo) => photo.id !== photoId);
}

export function findNextUploadableLocalPhoto(localPhotos) {
  return localPhotos.find((photo) => photo.status === LOCAL_PHOTO_STATUS.PENDING) || null;
}

export function mergeServerAndLocalPhotos(serverPhotos, localPhotos) {
  const serverIds = new Set(serverPhotos.map((photo) => photo.id));
  const unresolvedLocalPhotos = localPhotos.filter((photo) => photo.localOnly && !serverIds.has(photo.id));
  return [...serverPhotos, ...unresolvedLocalPhotos];
}

export function replaceLocalPhotoWithServerPhoto(localPhotos, localPhotoId, serverPhoto) {
  return {
    localPhotos: deleteLocalPhoto(localPhotos, localPhotoId),
    serverPhoto
  };
}
