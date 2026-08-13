import { describe, expect, it } from 'vitest';
import { displayNameError, normalizeDisplayName } from './profile';

describe('profile domain rules', () => {
  it('trims a display name and accepts the web app length range', () => {
    expect(normalizeDisplayName('  Bilal  ')).toBe('Bilal');
    expect(displayNameError('Bilal')).toBeNull();
    expect(displayNameError('A')).toBe('length');
    expect(displayNameError('a'.repeat(31))).toBe('length');
  });
});
