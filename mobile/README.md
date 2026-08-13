# Pocofoto native app

This directory is the Expo / React Native client for iOS and Android. The existing Vite client remains in `../src` while native parity is completed.

## Local development

1. Copy `.env.example` to `.env.local`.
2. Set `EXPO_PUBLIC_FIREBASE_EMULATOR_HOST` to `10.0.2.2` for an Android emulator, `127.0.0.1` for an iOS simulator, or the Mac's LAN IP for a physical device.
3. Supply the Firebase native service files and Google OAuth values before native sign-in testing.
4. Run `npm install --legacy-peer-deps`, then `npm start`.

Native Firebase and Google sign-in require a development build; Expo Go cannot provide the full native module set used here.

## EAS profiles

- `development`: internal development client
- `preview`: internal QA build
- `production`: store/release build

Use `eas build --platform ios --profile development` or the Android equivalent after the Firebase files and OAuth configuration are available.
