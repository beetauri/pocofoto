const projectId = process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID || 'sixth-bonbon-402909';
const iosBundleIdentifier = process.env.IOS_BUNDLE_IDENTIFIER || 'com.pocofoto.app';
const androidPackage = process.env.ANDROID_PACKAGE || 'com.pocofoto.app';
const iosGoogleUrlScheme = process.env.GOOGLE_IOS_URL_SCHEME || 'com.googleusercontent.apps.REPLACE_ME';

export default ({ config }) => ({
  ...config,
  name: 'Pocofoto',
  slug: 'pocofoto',
  version: '0.0.3',
  orientation: 'portrait',
  scheme: 'pocofoto',
  userInterfaceStyle: 'dark',
  icon: './assets/pocoface-icon-1024.png',
  ios: {
    ...config.ios,
    bundleIdentifier: iosBundleIdentifier,
    supportsTablet: false,
    googleServicesFile: process.env.IOS_GOOGLE_SERVICES_FILE,
    infoPlist: {
      ...config.ios?.infoPlist,
      NSCameraUsageDescription: 'Pocofoto uses your camera to share little moments with your person.',
      NSPhotoLibraryUsageDescription: 'Pocofoto uses your photo library for your profile picture.',
      UIBackgroundModes: ['remote-notification']
    }
  },
  android: {
    ...config.android,
    package: androidPackage,
    versionCode: 3,
    googleServicesFile: process.env.ANDROID_GOOGLE_SERVICES_FILE,
    adaptiveIcon: {
      backgroundColor: '#000000',
      foregroundImage: './assets/pocoface-icon-1024.png',
      monochromeImage: './assets/android-icon-monochrome.png'
    },
    permissions: ['POST_NOTIFICATIONS']
  },
  plugins: [
    'expo-router',
    'expo-camera',
    ['expo-image-picker', { photosPermission: 'Pocofoto uses your photo library for your profile picture.', cameraPermission: 'Pocofoto uses your camera to share little moments with your person.', microphonePermission: false }],
    ['expo-notifications', { icon: './assets/android-icon-monochrome.png', color: '#000000' }],
    'expo-sqlite', 'expo-image', 'expo-secure-store',
    ['expo-splash-screen', {
      backgroundColor: '#000000',
      image: './assets/pocoface-icon-1024.png',
      imageWidth: 180
    }],
    ['@react-native-firebase/app', { ios: { disableSPM: true } }],
    '@react-native-firebase/auth', '@react-native-firebase/messaging', '@react-native-firebase/analytics',
    ['@react-native-google-signin/google-signin', { iosUrlScheme: iosGoogleUrlScheme }],
    ['expo-build-properties', { ios: { useFrameworks: 'static', forceStaticLinking: ['RNFBApp', 'RNFBAuth', 'RNFBFirestore', 'RNFBFunctions', 'RNFBMessaging', 'RNFBStorage', 'RNFBAnalytics'] } }]
  ],
  extra: {
    eas: { projectId: '646950e4-04d6-4dff-a815-b02e48451f27' },
    firebaseProjectId: projectId,
    firebaseFunctionsRegion: process.env.EXPO_PUBLIC_FIREBASE_FUNCTIONS_REGION || 'us-central1',
    googleWebClientId: process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID || ''
  }
});
