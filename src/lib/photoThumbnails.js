export const HISTORY_THUMBNAIL_SIZE = 256;
export const HISTORY_THUMBNAIL_TYPE = 'image/webp';
export const HISTORY_THUMBNAIL_EXTENSION = 'webp';
export const HISTORY_THUMBNAIL_QUALITY = 0.76;

function getCenterCrop(width, height) {
  const size = Math.min(width, height);
  return {
    x: Math.floor((width - size) / 2),
    y: Math.floor((height - size) / 2),
    size
  };
}

function loadImageFromBlob(blob) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    const objectUrl = URL.createObjectURL(blob);

    image.onload = () => {
      URL.revokeObjectURL(objectUrl);
      resolve(image);
    };
    image.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error('Unable to load photo for thumbnail'));
    };
    image.src = objectUrl;
  });
}

export async function createHistoryThumbnailBlob(photoBlob) {
  const image = await loadImageFromBlob(photoBlob);
  if (!image.naturalWidth || !image.naturalHeight) {
    throw new Error('Photo has invalid thumbnail dimensions');
  }

  const canvas = document.createElement('canvas');
  canvas.width = HISTORY_THUMBNAIL_SIZE;
  canvas.height = HISTORY_THUMBNAIL_SIZE;

  const context = canvas.getContext('2d');
  if (!context) throw new Error('Unable to create thumbnail canvas');

  const crop = getCenterCrop(image.naturalWidth, image.naturalHeight);
  context.drawImage(
    image,
    crop.x,
    crop.y,
    crop.size,
    crop.size,
    0,
    0,
    HISTORY_THUMBNAIL_SIZE,
    HISTORY_THUMBNAIL_SIZE
  );

  return new Promise((resolve, reject) => {
    canvas.toBlob((thumbnailBlob) => {
      if (!thumbnailBlob || thumbnailBlob.type !== HISTORY_THUMBNAIL_TYPE) {
        reject(new Error('Unable to encode WebP thumbnail'));
        return;
      }
      resolve(thumbnailBlob);
    }, HISTORY_THUMBNAIL_TYPE, HISTORY_THUMBNAIL_QUALITY);
  });
}
