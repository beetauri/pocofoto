import { createInstance } from 'i18next';
import { initReactI18next } from 'react-i18next';

import { englishResources, namespaces } from './locales/en/index.js';

const supportedLanguages = ['en'];

export function resolveSupportedLanguage(languages = []) {
  for (const language of languages) {
    const baseLanguage = String(language).toLowerCase().split('-')[0];
    if (supportedLanguages.includes(baseLanguage)) return baseLanguage;
  }
  return 'en';
}

export function createPocofotoI18n({ languages = globalThis.navigator?.languages || [] } = {}) {
  const instance = createInstance();
  instance.use(initReactI18next).init({
    resources: { en: englishResources },
    lng: resolveSupportedLanguage(languages),
    fallbackLng: 'en',
    supportedLngs: supportedLanguages,
    ns: namespaces,
    defaultNS: 'common',
    interpolation: { escapeValue: false },
    initImmediate: false,
    react: { useSuspense: false }
  });
  return instance;
}

const i18n = createPocofotoI18n();

export default i18n;
