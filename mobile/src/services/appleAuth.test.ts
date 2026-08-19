import { describe, expect, it } from 'vitest';
import { buildAppleCredentialInput } from './appleAuth';

describe('Apple authentication', () => {
  it('maps Apple identity credentials to the apple.com Firebase provider', () => {
    expect(buildAppleCredentialInput({ identityToken: 'token', nonce: 'nonce' })).toEqual({
      idToken: 'token',
      rawNonce: 'nonce'
    });
  });

  it('rejects Apple responses without an identity token', () => {
    expect(() => buildAppleCredentialInput({ identityToken: null, nonce: 'nonce' })).toThrow(/identity token/i);
  });
});
