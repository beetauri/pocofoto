import { describe, expect, it } from 'vitest';
import auth from './auth.js';

describe('English auth copy', () => {
  it('has human-readable copy for the Google sign-in progress state', () => {
    expect(auth.signingIn).toBe('Signing in…');
  });
});
