const personName = (name) => name || 'Your person';

export const pushCopy = {
  photoReceived: (name) => ({
    title: 'A little photo from your person 📸',
    body: `${personName(name)} sent you a moment.`
  }),
  photoLiked: (name) => ({
    title: 'Your photo got some love',
    body: `${personName(name)} loved your photo.`
  }),
  pairingRequest: (name) => ({
    title: 'Someone wants to pair up',
    body: `${personName(name)} wants to be your person.`
  }),
  pairingAccepted: (name) => ({
    title: 'You found your person ✨',
    body: `${personName(name)} paired up with you.`
  }),
  pairingRemoved: (name) => ({
    title: 'Your pairing has ended',
    body: `${personName(name)} ended the pairing.`
  }),
  debugPartner: (name) => ({
    title: 'Pocofoto test notification',
    body: `${personName(name)} sent a test notification.`
  }),
  debugDevice: () => ({
    title: 'Pocofoto test notification',
    body: 'This device is ready for Pocofoto notifications.'
  })
};
