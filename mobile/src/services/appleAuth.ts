export type AppleCredentialInput = {
  identityToken: string | null | undefined;
  nonce: string;
};

export function buildAppleCredentialInput({ identityToken, nonce }: AppleCredentialInput) {
  if (!identityToken) throw new Error('Apple sign-in did not return an identity token.');
  if (!nonce) throw new Error('Apple sign-in nonce is missing.');
  return { idToken: identityToken, rawNonce: nonce };
}

function displayNameFromApple(fullName: { givenName?: string | null; familyName?: string | null } | null | undefined) {
  return [fullName?.givenName, fullName?.familyName].filter((part): part is string => Boolean(part?.trim())).join(' ').trim();
}

export async function signInWithApple() {
  const [{ Platform }, AppleAuthentication, Crypto, auth] = await Promise.all([
    import('react-native'),
    import('expo-apple-authentication'),
    import('expo-crypto'),
    import('@react-native-firebase/auth')
  ]);

  if (Platform.OS !== 'ios') throw new Error('Sign in with Apple is available on iPhone and iPad only.');
  if (!(await AppleAuthentication.isAvailableAsync())) throw new Error('Sign in with Apple is not available on this device.');

  const rawNonce = Crypto.randomUUID();
  const hashedNonce = await Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, rawNonce);
  const response = await AppleAuthentication.signInAsync({
    requestedScopes: [
      AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
      AppleAuthentication.AppleAuthenticationScope.EMAIL
    ],
    nonce: hashedNonce
  });
  const input = buildAppleCredentialInput({ identityToken: response.identityToken, nonce: rawNonce });
  const provider = new auth.OAuthProvider('apple.com');
  const credential = provider.credential({
    ...input,
    fullName: response.fullName || undefined
  });
  const result = await auth.signInWithCredential(auth.getAuth(), credential);
  const displayName = displayNameFromApple(response.fullName);
  if (displayName && !result.user.displayName) {
    await auth.updateProfile(result.user, { displayName });
  }
  return result;
}
