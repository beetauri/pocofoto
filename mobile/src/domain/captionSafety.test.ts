import { describe, expect, it } from 'vitest';
import { isCaptionAllowed } from './captionSafety';

describe('caption safety', () => {
  it('allows ordinary captions and rejects configured threatening captions', () => {
    expect(isCaptionAllowed('good morning ☕')).toBe(true);
    expect(isCaptionAllowed('i will kill you')).toBe(false);
  });
});
