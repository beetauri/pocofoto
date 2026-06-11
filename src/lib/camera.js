export const DEFAULT_FACING_MODE = 'environment';
export const CAMERA_FACING_MODE_KEY = 'pocofoto:camera-facing-mode';
export const MAX_CAPTURE_DIMENSION = 1920;
export const CAPTURE_JPEG_QUALITY = 0.9;

export function normalizeFacingMode(value) {
  return value === 'user' || value === 'environment' ? value : DEFAULT_FACING_MODE;
}

export function getStoredFacingMode(storage = globalThis.localStorage) {
  try {
    return normalizeFacingMode(storage?.getItem(CAMERA_FACING_MODE_KEY));
  } catch {
    return DEFAULT_FACING_MODE;
  }
}

export function setStoredFacingMode(mode, storage = globalThis.localStorage) {
  const normalizedMode = normalizeFacingMode(mode);
  try {
    storage?.setItem(CAMERA_FACING_MODE_KEY, normalizedMode);
  } catch {
    // Storage may be unavailable in private browsing modes.
  }
  return normalizedMode;
}

export function buildCameraConstraints(mode) {
  return {
    audio: false,
    video: {
      facingMode: { ideal: normalizeFacingMode(mode) },
      width: { ideal: 1920, min: 640 },
      height: { ideal: 1080, min: 480 }
    }
  };
}

export function fitCaptureDimensions(width, height, maxDimension = MAX_CAPTURE_DIMENSION) {
  const sourceWidth = Math.max(1, Math.round(Number(width) || 1));
  const sourceHeight = Math.max(1, Math.round(Number(height) || 1));
  const longestSide = Math.max(sourceWidth, sourceHeight);
  if (longestSide <= maxDimension) {
    return { width: sourceWidth, height: sourceHeight };
  }
  const scale = maxDimension / longestSide;
  return {
    width: Math.round(sourceWidth * scale),
    height: Math.round(sourceHeight * scale)
  };
}

export function getCoverCrop(width, height, targetAspectRatio = 1) {
  const sourceWidth = Math.max(1, Number(width) || 1);
  const sourceHeight = Math.max(1, Number(height) || 1);
  const sourceAspectRatio = sourceWidth / sourceHeight;

  if (sourceAspectRatio > targetAspectRatio) {
    const cropWidth = sourceHeight * targetAspectRatio;
    return {
      x: Math.round((sourceWidth - cropWidth) / 2),
      y: 0,
      width: Math.round(cropWidth),
      height: Math.round(sourceHeight)
    };
  }

  const cropHeight = sourceWidth / targetAspectRatio;
  return {
    x: 0,
    y: Math.round((sourceHeight - cropHeight) / 2),
    width: Math.round(sourceWidth),
    height: Math.round(cropHeight)
  };
}

export function isUsableVideoTrack(track) {
  return Boolean(
    track
    && track.readyState === 'live'
    && track.enabled !== false
    && track.muted !== true
  );
}

export function stopMediaStream(stream) {
  stream?.getTracks?.().forEach((track) => track.stop());
}

export async function waitForVideoFrame(video, stream, timeoutMs = 8000) {
  if (!video || !stream) throw new Error('Camera preview is unavailable.');

  video.srcObject = stream;
  await video.play();
  if (video.readyState >= 2 && video.videoWidth > 0 && video.videoHeight > 0) return;

  await new Promise((resolve, reject) => {
    let timeoutId;
    const cleanup = () => {
      window.clearTimeout(timeoutId);
      video.removeEventListener('playing', handleReady);
      video.removeEventListener('loadeddata', handleReady);
      video.removeEventListener('error', handleError);
    };
    const handleReady = () => {
      if (video.videoWidth <= 0 || video.videoHeight <= 0) return;
      cleanup();
      resolve();
    };
    const handleError = () => {
      cleanup();
      reject(new Error('Camera preview could not start.'));
    };

    video.addEventListener('playing', handleReady);
    video.addEventListener('loadeddata', handleReady);
    video.addEventListener('error', handleError);
    timeoutId = window.setTimeout(() => {
      cleanup();
      reject(new Error('Camera preview timed out.'));
    }, timeoutMs);
  });
}

export function captureVideoFrame(video, facingMode) {
  if (!video?.videoWidth || !video?.videoHeight) return '';
  const canvas = document.createElement('canvas');
  const crop = getCoverCrop(video.videoWidth, video.videoHeight);
  const previewSize = fitCaptureDimensions(crop.width, crop.height, 1280);
  canvas.width = previewSize.width;
  canvas.height = previewSize.height;
  const context = canvas.getContext('2d');
  if (!context) return '';
  if (facingMode === 'user') {
    context.translate(canvas.width, 0);
    context.scale(-1, 1);
  }
  context.drawImage(
    video,
    crop.x,
    crop.y,
    crop.width,
    crop.height,
    0,
    0,
    canvas.width,
    canvas.height
  );
  return canvas.toDataURL('image/jpeg', 0.82);
}
