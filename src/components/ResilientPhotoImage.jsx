import { useEffect, useRef, useState } from 'react';
import { ImageOff } from 'lucide-react';

import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import { PHOTO_IMAGE_STATUS } from './photoImageStatus';

export default function ResilientPhotoImage({
  src,
  alt,
  className,
  retryKey = 0,
  onStatusChange,
  ...imageProps
}) {
  const [status, setStatus] = useState(PHOTO_IMAGE_STATUS.LOADING);
  const [attempt, setAttempt] = useState(0);
  const activeImageRef = useRef(null);
  const onStatusChangeRef = useRef(onStatusChange);

  useEffect(() => {
    onStatusChangeRef.current = onStatusChange;
  }, [onStatusChange]);

  useEffect(() => {
    setStatus(PHOTO_IMAGE_STATUS.LOADING);
    setAttempt(0);
    onStatusChangeRef.current?.(PHOTO_IMAGE_STATUS.LOADING);
  }, [src, retryKey]);

  function handleLoad(event) {
    if (event.currentTarget !== activeImageRef.current) return;
    setStatus(PHOTO_IMAGE_STATUS.LOADED);
    onStatusChangeRef.current?.(PHOTO_IMAGE_STATUS.LOADED);
  }

  function handleError(event) {
    if (event.currentTarget !== activeImageRef.current) return;
    if (attempt === 0) {
      setAttempt(1);
      return;
    }
    setStatus(PHOTO_IMAGE_STATUS.FAILED);
    onStatusChangeRef.current?.(PHOTO_IMAGE_STATUS.FAILED);
  }

  return (
    <div className={cn('resilient-photo-image', className)} data-status={status}>
      {status === PHOTO_IMAGE_STATUS.LOADING && (
        <Skeleton className="resilient-photo-skeleton" data-testid="photo-skeleton" />
      )}
      {status !== PHOTO_IMAGE_STATUS.FAILED && (
        <img
          ref={activeImageRef}
          key={`${src}:${retryKey}:${attempt}`}
          src={src}
          alt={alt}
          onLoad={handleLoad}
          onError={handleError}
          {...imageProps}
        />
      )}
      {status === PHOTO_IMAGE_STATUS.FAILED && (
        <div className="resilient-photo-fallback" data-testid="photo-fallback">
          <ImageOff aria-hidden="true" />
        </div>
      )}
    </div>
  );
}
