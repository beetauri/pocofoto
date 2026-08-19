export const legalLinks = Object.freeze({
  privacy: 'https://pocofoto.com.tr/privacy',
  terms: 'https://pocofoto.com.tr/terms',
  support: 'https://pocofoto.com.tr/support'
});

export async function openLegalLink(kind: keyof typeof legalLinks) {
  const url = legalLinks[kind];
  const { Linking } = await import('react-native');
  await Linking.openURL(url);
}
