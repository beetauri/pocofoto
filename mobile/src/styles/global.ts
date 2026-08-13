import { StyleSheet } from 'react-native';

export const colors = {
  background: '#000000',
  surface: '#141414',
  surfaceRaised: '#202020',
  text: '#FFFFFF',
  muted: '#A3A3A3',
  accent: '#4F72FC',
  danger: '#FF5A5F',
  success: '#74D99B',
  border: 'rgba(255,255,255,0.13)'
};

export const spacing = {
  xs: 6,
  sm: 10,
  md: 16,
  lg: 22,
  xl: 32
};

export const globalStyles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  centered: { alignItems: 'center', justifyContent: 'center' },
  text: { color: colors.text },
  muted: { color: colors.muted },
  button: { minHeight: 48, borderRadius: 14, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 18 },
  buttonPrimary: { backgroundColor: colors.accent },
  buttonGhost: { backgroundColor: colors.surfaceRaised },
  input: { minHeight: 52, borderWidth: 1, borderColor: colors.border, borderRadius: 14, color: colors.text, paddingHorizontal: 16, backgroundColor: colors.surface }
});
