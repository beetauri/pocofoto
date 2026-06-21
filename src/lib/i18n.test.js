import test from 'node:test';
import assert from 'node:assert/strict';

import { createPocofotoI18n, resolveSupportedLanguage } from '../i18n.js';

test('unsupported browser languages fall back to English', () => {
  assert.equal(resolveSupportedLanguage(['tr-TR', 'tr']), 'en');
});

test('English regional variants resolve to English', () => {
  assert.equal(resolveSupportedLanguage(['en-GB']), 'en');
});

test('translations interpolate dynamic names', () => {
  const i18n = createPocofotoI18n({ languages: ['en-US'] });
  assert.equal(
    i18n.t('pairing:removedByPerson', { name: 'Alex' }),
    'Alex ended the pairing. You can find your person again whenever you’re ready.'
  );
});

test('the configured instance supports plural forms', () => {
  const i18n = createPocofotoI18n({ languages: ['en'] });
  i18n.addResourceBundle('en', 'test', {
    moment_one: '{{count}} little moment',
    moment_other: '{{count}} little moments'
  });
  assert.equal(i18n.t('test:moment', { count: 1 }), '1 little moment');
  assert.equal(i18n.t('test:moment', { count: 2 }), '2 little moments');
});
