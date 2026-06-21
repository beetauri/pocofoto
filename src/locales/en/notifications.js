export default {
  prompt: {
    title: 'Want a little heads-up?',
    body: 'Know when your person sends a photo, loves one, or responds to pairing.',
    enable: 'Turn on notifications',
    enabling: 'Turning on…'
  },
  setting: {
    title: 'Notifications',
    enabled: 'This device is ready for little updates from your person.',
    disabled: 'Turn on notifications for little updates from your person.',
    denied: 'Allow notifications in your browser or device settings.',
    unsupported: 'Notifications aren’t available in this browser.',
    permissionOnly: 'Permission is allowed, but this device still needs to register.',
    on: 'On',
    off: 'Off'
  },
  errors: {
    enable: 'We couldn’t turn on notifications. Try again.',
    unavailable: 'Notifications aren’t available on this device.'
  },
  foreground: {
    photo: 'A new photo from your person',
    loved: 'Your photo got some love',
    pairingRequest: 'A new pairing invite',
    pairingAccepted: 'You found your person ✨',
    pairingRemoved: 'Your pairing has ended',
    generic: 'A little update from Pocofoto'
  },
  diagnostics: {
    toggle: 'Notification diagnostics',
    permission: 'Permission',
    serviceWorker: 'Service worker',
    device: 'Device',
    token: 'Token',
    registration: 'Registration',
    partnerDevices: 'Partner devices',
    noTest: 'No test sent yet.',
    noDevices: 'No registered devices',
    register: 'Register this device',
    testThis: 'Test this device',
    testPartner: 'Test your person’s devices',
    cooldown: 'Test cooldown is active.',
    accepted: 'Accepted by FCM: {{successCount}}/{{tokenCount}}, failed: {{failureCount}}'
  }
};
