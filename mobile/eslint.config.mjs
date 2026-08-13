import expoConfig from 'eslint-config-expo/flat.js';

export default [
  ...expoConfig,
  {
    ignores: ['android/**', 'ios/**', 'assets/**', '.expo/**', 'dist/**'],
    rules: {
      // These effects reset local state when a Firebase scope changes; they are
      // intentional synchronization boundaries rather than derived state.
      'react-hooks/set-state-in-effect': 'off'
    }
  }
];
