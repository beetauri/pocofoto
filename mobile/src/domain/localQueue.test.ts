import { describe, expect, it } from 'vitest';
import { createLocalPhoto, findNextUploadableLocalPhoto, markLocalPhotoFailed, markLocalPhotoPending } from './localQueue';

describe('native local photo queue', () => {
  it('selects pending photos sequentially and skips failed photos', () => {
    const pending = createLocalPhoto({ id: 'pending', uri: 'file://pending', coupleId: 'c', senderId: 'u' });
    const failed = markLocalPhotoFailed(createLocalPhoto({ id: 'failed', uri: 'file://failed', coupleId: 'c', senderId: 'u' }), 'offline');

    expect(findNextUploadableLocalPhoto([failed, pending])?.id).toBe('pending');
    expect(markLocalPhotoPending(failed).localStatus).toBe('pending');
  });
});
