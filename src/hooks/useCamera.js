import { useCallback, useEffect, useRef, useState } from 'react';
import {
  buildCameraConstraints,
  captureVideoFrame,
  getStoredFacingMode,
  isUsableVideoTrack,
  setStoredFacingMode,
  stopMediaStream,
  waitForVideoFrame
} from '../lib/camera.js';

const CAMERA_REQUEST_TIMEOUT_MS = 10000;

function cameraErrorState(error) {
  const denied = error?.name === 'NotAllowedError' || error?.name === 'PermissionDeniedError';
  return {
    status: denied ? 'denied' : 'error',
    message: denied
      ? 'Camera access was blocked.'
      : error?.message === 'Camera request timed out.'
        ? 'Check the browser camera prompt, or try again.'
        : 'Camera could not start.'
  };
}

async function getCameraStream(mode) {
  let timeoutId;
  const timeout = new Promise((_, reject) => {
    timeoutId = window.setTimeout(() => reject(new Error('Camera request timed out.')), CAMERA_REQUEST_TIMEOUT_MS);
  });
  try {
    return await Promise.race([
      navigator.mediaDevices.getUserMedia(buildCameraConstraints(mode)),
      timeout
    ]);
  } finally {
    window.clearTimeout(timeoutId);
  }
}

export function useCamera({ videoRef, onError, onTiming }) {
  const [status, setStatus] = useState('requesting');
  const [error, setError] = useState('');
  const [facingMode, setFacingMode] = useState(() => getStoredFacingMode());
  const [frozenFrame, setFrozenFrame] = useState('');
  const activeStreamRef = useRef(null);
  const candidateStreamRef = useRef(null);
  const requestIdRef = useRef(0);
  const busyRef = useRef(false);
  const lastFailureRef = useRef(null);
  const facingModeRef = useRef(facingMode);
  const onErrorRef = useRef(onError);
  const onTimingRef = useRef(onTiming);

  useEffect(() => {
    onErrorRef.current = onError;
  }, [onError]);

  useEffect(() => {
    onTimingRef.current = onTiming;
  }, [onTiming]);

  const acquire = useCallback(async (mode, nextStatus, { replaceCurrent = true } = {}) => {
    if (busyRef.current) return false;
    if (!navigator.mediaDevices?.getUserMedia) {
      setStatus('unavailable');
      setError('Camera is not available in this browser.');
      return false;
    }
    busyRef.current = true;
    lastFailureRef.current = null;
    const requestId = ++requestIdRef.current;
    const startedAt = performance.now();
    setStatus(nextStatus);
    setError('');

    try {
      const stream = await getCameraStream(mode);
      candidateStreamRef.current = stream;
      const acquiredAt = performance.now();
      if (requestId !== requestIdRef.current) {
        stopMediaStream(stream);
        return false;
      }
      await waitForVideoFrame(videoRef.current, stream);
      if (requestId !== requestIdRef.current) {
        stopMediaStream(stream);
        return false;
      }

      const previousStream = activeStreamRef.current;
      activeStreamRef.current = stream;
      candidateStreamRef.current = null;
      facingModeRef.current = setStoredFacingMode(mode);
      setFacingMode(facingModeRef.current);
      setStatus('ready');
      setFrozenFrame('');
      if (replaceCurrent && previousStream && previousStream !== stream) stopMediaStream(previousStream);
      onTimingRef.current?.({
        action: nextStatus,
        acquireMs: Math.round(acquiredAt - startedAt),
        firstFrameMs: Math.round(performance.now() - startedAt)
      });
      return true;
    } catch (cameraError) {
      lastFailureRef.current = cameraError;
      stopMediaStream(candidateStreamRef.current);
      candidateStreamRef.current = null;
      const nextError = cameraErrorState(cameraError);
      setStatus(nextError.status);
      setError(nextError.message);
      return false;
    } finally {
      busyRef.current = false;
    }
  }, [videoRef]);

  const startCamera = useCallback(() => acquire(facingModeRef.current, 'requesting'), [acquire]);

  const retryCamera = useCallback(() => acquire(facingModeRef.current, 'requesting'), [acquire]);

  const switchCamera = useCallback(async () => {
    if (busyRef.current || status !== 'ready') return false;
    const previousMode = facingModeRef.current;
    const nextMode = previousMode === 'environment' ? 'user' : 'environment';
    const previousStream = activeStreamRef.current;
    setFrozenFrame(captureVideoFrame(videoRef.current, previousMode));

    const switched = await acquire(nextMode, 'switching', { replaceCurrent: true });
    if (switched) return true;

    const failureName = lastFailureRef.current?.name;
    const cameraIsExclusive = failureName === 'NotReadableError' || failureName === 'AbortError';
    if (cameraIsExclusive) {
      stopMediaStream(previousStream);
      activeStreamRef.current = null;
      const switchedAfterRelease = await acquire(nextMode, 'switching', { replaceCurrent: true });
      if (switchedAfterRelease) return true;
    }

    if (!cameraIsExclusive && previousStream && isUsableVideoTrack(previousStream.getVideoTracks?.()[0])) {
      try {
        await waitForVideoFrame(videoRef.current, previousStream);
        activeStreamRef.current = previousStream;
        setStatus('ready');
        setError('');
        setFrozenFrame('');
        onErrorRef.current?.('Could not switch cameras.');
        return false;
      } catch {
        stopMediaStream(previousStream);
      }
    }

    const restored = await acquire(previousMode, 'resuming', { replaceCurrent: true });
    if (!restored) {
      onErrorRef.current?.('Camera could not be restored.');
    } else {
      onErrorRef.current?.('Could not switch cameras.');
    }
    return false;
  }, [acquire, status, videoRef]);

  useEffect(() => {
    startCamera();
    return () => {
      requestIdRef.current += 1;
      stopMediaStream(candidateStreamRef.current);
      stopMediaStream(activeStreamRef.current);
      candidateStreamRef.current = null;
      activeStreamRef.current = null;
    };
  }, [startCamera]);

  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState !== 'visible' || busyRef.current) return;
      const track = activeStreamRef.current?.getVideoTracks?.()[0];
      const video = videoRef.current;
      if (isUsableVideoTrack(track) && video?.videoWidth > 0 && video?.videoHeight > 0) return;
      setFrozenFrame(captureVideoFrame(video, facingModeRef.current));
      acquire(facingModeRef.current, 'resuming');
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, [acquire, videoRef]);

  return {
    status,
    error,
    facingMode,
    frozenFrame,
    isBusy: status === 'requesting' || status === 'switching' || status === 'resuming',
    retryCamera,
    switchCamera
  };
}
