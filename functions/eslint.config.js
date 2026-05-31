import js from '@eslint/js';
import globals from 'globals';

export default [
  { ignores: ['lib/**'] },
  js.configs.recommended,
  {
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: 'module',
      globals: {
        ...globals.node,
        fetch: 'readonly'
      }
    },
    rules: {
      'no-console': 'off'
    }
  }
];
