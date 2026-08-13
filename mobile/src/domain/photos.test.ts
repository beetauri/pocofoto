import { describe, expect, it } from 'vitest';
import { mergePhotoPages, mergeServerAndLocalPhotos } from './photos';

describe('native photo pagination', () => {
  it('merges realtime and older pages without duplicate ids', () => {
    expect(mergePhotoPages([{ id: 'a' }, { id: 'b' }], [[{ id: 'b' }, { id: 'c' }]])).toEqual([
      { id: 'a' }, { id: 'b' }, { id: 'c' }
    ]);
  });

  it('keeps local queued photos before server photos', () => {
    expect(mergeServerAndLocalPhotos([{ id: 'server' }], [{ id: 'local', localOnly: true }])).toEqual([
      { id: 'local', localOnly: true }, { id: 'server' }
    ]);
  });
});
