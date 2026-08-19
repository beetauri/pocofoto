import { describe, expect, it } from 'vitest';
import { readAnalyticsConsent, writeAnalyticsConsent } from './analyticsConsent';

describe('analytics consent', () => {
  it('starts with analytics disabled and records explicit opt-in', () => {
    expect(readAnalyticsConsent({ getItem: () => null })).toBe(false);
    expect(writeAnalyticsConsent(true)).toBe('true');
  });

  it('supports withdrawal', () => {
    expect(writeAnalyticsConsent(false)).toBe('false');
  });
});
