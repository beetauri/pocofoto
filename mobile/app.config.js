import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const { version: packageVersion } = require('./package.json');

const projectId = process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID || 'sixth-bonbon-402909';
const iosBundleIdentifier = process.env.IOS_BUNDLE_IDENTIFIER || 'com.pocofoto.app';
const androidPackage = process.env.ANDROID_PACKAGE || 'com.pocofoto.app';
const PLACEHOLDER_IOS_URL_SCHEME = 'com.googleusercontent.apps.REPLACE_ME';

function resolveIosGoogleUrlScheme() {
  const configured = process.env.GOOGLE_IOS_URL_SCHEME;
  if (configured) return configured;
  const message =
    '[app.config] Missing GOOGLE_IOS_URL_SCHEME env var — iOS Google Sign-In will be broken. ' +
    'Set it to the Reversed Client ID from GoogleService-Info.plist (e.g. com.googleusercontent.apps.xxx). ' +
    'To intentionally skip Google auth, set EAS_NO_GOOGLE=1.';
  if (process.env.EAS_NO_GOOGLE) {
    console.warn(`${message} Building with placeholder scheme because EAS_NO_GOOGLE is set.`);
    return PLACEHOLDER_IOS_URL_SCHEME;
  }
  const profile = process.env.EAS_BUILD_PROFILE;
  const isDevBuild = profile === 'development' || (!profile && process.env.NODE_ENV !== 'production');
  if (isDevBuild) {
    console.warn(`${message} Using placeholder scheme for development build only.`);
    return PLACEHOLDER_IOS_URL_SCHEME;
  }
  throw new Error(message);
}

export default ({ config }) => {
  const iosGoogleUrlScheme = resolveIosGoogleUrlScheme();
  if (!process.env.ANDROID_GOOGLE_SERVICES_FILE) {
    console.warn(
      '[app.config] ANDROID_GOOGLE_SERVICES_FILE is not set — Android builds need google-services.json. ' +
      'Set ANDROID_GOOGLE_SERVICES_FILE to its path (EAS secret file or local path).'
    );
  }
  return {
  ...config,
  name: 'Pocofoto',
  slug: 'pocofoto',
  version: packageVersion,
  orientation: 'portrait',
  scheme: 'pocofoto',
  userInterfaceStyle: 'dark',
  icon: './assets/pocoface-icon-1024.png',
  ios: {
    ...config.ios,
    bundleIdentifier: iosBundleIdentifier,
    supportsTablet: false,
    usesAppleSignIn: true,
    appleTeamId: process.env.APPLE_TEAM_ID || '6S3HV7A5HH',
    icon: './assets/pocoface-icon-1024.png',
    googleServicesFile: process.env.IOS_GOOGLE_SERVICES_FILE || './GoogleService-Info.plist',
    infoPlist: {
      ...config.ios?.infoPlist,
      NSCameraUsageDescription: 'Pocofoto uses your camera to share little moments with your person.',
      NSPhotoLibraryUsageDescription: 'Pocofoto uses your photo library for your profile picture.',
      UIBackgroundModes: ['remote-notification']
    },
    privacyManifests: {
      NSPrivacyTracking: false,
      NSPrivacyCollectedDataTypes: [
        { NSPrivacyCollectedDataType: 'NSPrivacyCollectedDataTypeEmailAddress', NSPrivacyCollectedDataTypeLinked: true, NSPrivacyCollectedDataTypeTracking: false, NSPrivacyCollectedDataTypePurposes: ['NSPrivacyCollectedDataTypePurposeAppFunctionality'] },
        { NSPrivacyCollectedDataType: 'NSPrivacyCollectedDataTypeName', NSPrivacyCollectedDataTypeLinked: true, NSPrivacyCollectedDataTypeTracking: false, NSPrivacyCollectedDataTypePurposes: ['NSPrivacyCollectedDataTypePurposeAppFunctionality'] },
        { NSPrivacyCollectedDataType: 'NSPrivacyCollectedDataTypeUserID', NSPrivacyCollectedDataTypeLinked: true, NSPrivacyCollectedDataTypeTracking: false, NSPrivacyCollectedDataTypePurposes: ['NSPrivacyCollectedDataTypePurposeAppFunctionality'] },
        { NSPrivacyCollectedDataType: 'NSPrivacyCollectedDataTypePhotosorVideos', NSPrivacyCollectedDataTypeLinked: true, NSPrivacyCollectedDataTypeTracking: false, NSPrivacyCollectedDataTypePurposes: ['NSPrivacyCollectedDataTypePurposeAppFunctionality'] },
        { NSPrivacyCollectedDataType: 'NSPrivacyCollectedDataTypeOtherUserContent', NSPrivacyCollectedDataTypeLinked: true, NSPrivacyCollectedDataTypeTracking: false, NSPrivacyCollectedDataTypePurposes: ['NSPrivacyCollectedDataTypePurposeAppFunctionality'] },
        { NSPrivacyCollectedDataType: 'NSPrivacyCollectedDataTypeProductInteraction', NSPrivacyCollectedDataTypeLinked: true, NSPrivacyCollectedDataTypeTracking: false, NSPrivacyCollectedDataTypePurposes: ['NSPrivacyCollectedDataTypePurposeAnalytics'] },
        { NSPrivacyCollectedDataType: 'NSPrivacyCollectedDataTypeCrashData', NSPrivacyCollectedDataTypeLinked: false, NSPrivacyCollectedDataTypeTracking: false, NSPrivacyCollectedDataTypePurposes: ['NSPrivacyCollectedDataTypePurposeAppFunctionality'] },
        { NSPrivacyCollectedDataType: 'NSPrivacyCollectedDataTypeOtherDiagnosticData', NSPrivacyCollectedDataTypeLinked: false, NSPrivacyCollectedDataTypeTracking: false, NSPrivacyCollectedDataTypePurposes: ['NSPrivacyCollectedDataTypePurposeAppFunctionality'] }
      ]
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
    permissions: ['android.permission.POST_NOTIFICATIONS', 'android.permission.CAMERA']
  },
  plugins: [
    'expo-router',
    'expo-apple-authentication',
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
  };
};
