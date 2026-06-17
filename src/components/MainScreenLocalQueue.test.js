import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const source = readFileSync(new URL('./MainScreen.jsx', import.meta.url), 'utf8');

test('MainScreen wires local queued photos into the shared feed hook', () => {
  assert.match(source, /usePaginatedPhotos\(coupleId, localPhotos\)/);
  assert.match(source, /setLocalPhotos\(\(current\) => appendLocalPhoto\(current, localPhoto\)\)/);
});

test('review send enqueues immediately instead of awaiting upload', () => {
  assert.match(source, /const handleSendReviewPhoto = \(\) => \{/);
  assert.match(source, /const localPhoto = createLocalPhoto/);
  assert.match(source, /preserveObjectUrl: true/);
  assert.doesNotMatch(source, /await uploadPhotoBlob\(reviewPhoto\.blob, caption\);[\s\S]*setSendAnimationState\('sent'\)/);
});

test('queue uploads sequentially and failed items do not block later pending items', () => {
  assert.match(source, /queueUploadInFlightRef/);
  assert.match(source, /findNextUploadableLocalPhoto\(localPhotosRef\.current\)/);
  assert.match(source, /markLocalPhotoFailed/);
  assert.match(source, /processLocalPhotoQueue/);
});

test('retry and delete are photo-specific', () => {
  assert.match(source, /const handleRetryLocalPhoto = useCallback\(\(photoId\) =>/);
  assert.match(source, /markLocalPhotoPending\(current, photoId\)/);
  assert.match(source, /const handleDeleteLocalPhoto = useCallback\(\(photoId\) =>/);
  assert.match(source, /deleteLocalPhoto\(current, photoId\)/);
});

test('capture is not blocked by background queue uploads', () => {
  assert.match(source, /const \[queueUploadingPhotoId, setQueueUploadingPhotoId\] = useState\(null\)/);
  assert.doesNotMatch(source, /const captureDisabled = uploading\s*\|\|\s*sendingReviewPhoto/);
});

test('pending local photos replace metadata with centered sending state', () => {
  assert.match(source, /photo-local-status/);
  assert.match(source, /Sending…/);
  assert.match(source, /photo\.localOnly && photo\.status !== LOCAL_PHOTO_STATUS\.FAILED/);
});

test('failed local photos show retry and icon-only delete actions', () => {
  assert.match(source, /photo-local-actions failed/);
  assert.match(source, /Retry/);
  assert.match(source, /aria-label="Delete failed photo"/);
  assert.match(source, /handleRetryLocalPhoto\(photo\.id\)/);
  assert.match(source, /handleDeleteLocalPhoto\(photo\.id\)/);
});

test('queued send scrolls to the local pending photo instead of hiding it at the camera', () => {
  assert.match(source, /setPendingScrollPhotoId\(localPhoto\.id\)/);
  assert.doesNotMatch(source, /setLocalPhotos\(\(current\) => appendLocalPhoto\(current, localPhoto\)\)[\s\S]*scrollToCamera\('auto'\)/);
});
