import { describe, expect, it } from 'vitest';
import { legalLinks } from './legalLinks';

describe('legal links', () => {
  it('returns the public legal URLs used by native settings', () => {
    expect(legalLinks).toEqual({
      privacy: 'https://pocofoto.com.tr/privacy',
      terms: 'https://pocofoto.com.tr/terms',
      support: 'https://pocofoto.com.tr/support'
    });
  });
});
