import { describe, expect, it } from 'vitest';
import { canApplyReviewResult } from './reviewSession';

describe('review session guards', () => {
  it('rejects a draft result from a discarded capture', () => {
    expect(canApplyReviewResult(1, 2)).toBe(false);
  });

  it('accepts only the active capture session', () => {
    expect(canApplyReviewResult(3, 3)).toBe(true);
  });
});
