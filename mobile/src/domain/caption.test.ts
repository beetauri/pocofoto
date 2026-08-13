import { describe, expect, it } from 'vitest';
import { buildCaptionPayload, clampCaptionText, MAX_CAPTION_LENGTH } from './caption';

describe('caption domain contract', () => {
  it('normalizes newlines and caps captions at 36 characters', () => {
    const value = `${'a'.repeat(MAX_CAPTION_LENGTH)}\nmore`;

    expect(clampCaptionText(value)).toBe('a'.repeat(MAX_CAPTION_LENGTH));
  });

  it('returns the persisted text payload only for non-empty captions', () => {
    expect(buildCaptionPayload(' hello ')).toEqual({ type: 'text', text: 'hello' });
    expect(buildCaptionPayload('   ')).toBeNull();
  });
});
