import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { useCamera } from './useCamera';

function createStream() {
  const track = {
    enabled: true,
    muted: false,
    readyState: 'live',
    stop: vi.fn()
  };
  return {
    track,
    getTracks: () => [track],
    getVideoTracks: () => [track]
  };
}

function createReadyVideo() {
  const video = document.createElement('video');
  Object.defineProperties(video, {
    readyState: { configurable: true, value: 2 },
    videoWidth: { configurable: true, value: 1920 },
    videoHeight: { configurable: true, value: 1080 }
  });
  video.play = vi.fn().mockResolvedValue(undefined);
  return video;
}

function mockCanvas() {
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({
    drawImage: vi.fn(),
    scale: vi.fn(),
    translate: vi.fn()
  });
  vi.spyOn(HTMLCanvasElement.prototype, 'toDataURL').mockReturnValue('data:image/jpeg;base64,preview');
}

afterEach(() => {
  localStorage.clear();
  vi.restoreAllMocks();
});

describe('useCamera', () => {
  it('starts once and switches with one additional camera request', async () => {
    mockCanvas();
    const firstStream = createStream();
    const secondStream = createStream();
    const getUserMedia = vi.fn()
      .mockResolvedValueOnce(firstStream)
      .mockResolvedValueOnce(secondStream);
    Object.defineProperty(navigator, 'mediaDevices', {
      configurable: true,
      value: { getUserMedia }
    });
    const videoRef = { current: createReadyVideo() };

    const { result, unmount } = renderHook(() => useCamera({ videoRef }));
    await waitFor(() => expect(result.current.status).toBe('ready'));
    expect(getUserMedia).toHaveBeenCalledTimes(1);

    await act(async () => {
      expect(await result.current.switchCamera()).toBe(true);
    });

    expect(getUserMedia).toHaveBeenCalledTimes(2);
    expect(result.current.facingMode).toBe('user');
    expect(firstStream.track.stop).toHaveBeenCalledOnce();
    unmount();
    expect(secondStream.track.stop).toHaveBeenCalledOnce();
  });

  it('restores the previous camera when a switch request fails', async () => {
    mockCanvas();
    const firstStream = createStream();
    const onError = vi.fn();
    const getUserMedia = vi.fn()
      .mockResolvedValueOnce(firstStream)
      .mockRejectedValueOnce(Object.assign(new Error('No alternate camera'), { name: 'OverconstrainedError' }));
    Object.defineProperty(navigator, 'mediaDevices', {
      configurable: true,
      value: { getUserMedia }
    });
    const videoRef = { current: createReadyVideo() };

    const { result, unmount } = renderHook(() => useCamera({ videoRef, onError }));
    await waitFor(() => expect(result.current.status).toBe('ready'));

    await act(async () => {
      expect(await result.current.switchCamera()).toBe(false);
    });

    expect(result.current.status).toBe('ready');
    expect(result.current.facingMode).toBe('environment');
    expect(videoRef.current.srcObject).toBe(firstStream);
    expect(firstStream.track.stop).not.toHaveBeenCalled();
    expect(onError).toHaveBeenCalledWith('Could not switch cameras.');
    unmount();
  });

  it('reacquires the remembered camera after an interrupted background stream', async () => {
    mockCanvas();
    const firstStream = createStream();
    const resumedStream = createStream();
    const getUserMedia = vi.fn()
      .mockResolvedValueOnce(firstStream)
      .mockResolvedValueOnce(resumedStream);
    Object.defineProperty(navigator, 'mediaDevices', {
      configurable: true,
      value: { getUserMedia }
    });
    Object.defineProperty(document, 'visibilityState', {
      configurable: true,
      value: 'visible'
    });
    const videoRef = { current: createReadyVideo() };

    const { result, unmount } = renderHook(() => useCamera({ videoRef }));
    await waitFor(() => expect(result.current.status).toBe('ready'));
    firstStream.track.readyState = 'ended';
    act(() => document.dispatchEvent(new Event('visibilitychange')));

    await waitFor(() => expect(getUserMedia).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(videoRef.current.srcObject).toBe(resumedStream));
    expect(firstStream.track.stop).toHaveBeenCalledOnce();
    unmount();
  });
});
