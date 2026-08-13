import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';

import auth from './locales/en/auth.js';
import camera from './locales/en/camera.js';
import common from './locales/en/common.js';
import errors from './locales/en/errors.js';
import history from './locales/en/history.js';
import notifications from './locales/en/notifications.js';
import pairing from './locales/en/pairing.js';
import profile from './locales/en/profile.js';

export const resources = {
  en: { auth, camera, common, errors, history, notifications, pairing, profile }
};

// i18next's plugin API is exposed as a method on its configured singleton.
// eslint-disable-next-line import/no-named-as-default-member
void i18n.use(initReactI18next).init({
  compatibilityJSON: 'v4',
  lng: 'en',
  fallbackLng: 'en',
  resources,
  interpolation: { escapeValue: false }
});

export default i18n;
