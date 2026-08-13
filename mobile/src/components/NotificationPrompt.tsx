import { useTranslation } from 'react-i18next';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, spacing } from '../styles/global';

export default function NotificationPrompt({ open, busy, onEnable, onDismiss }: { open: boolean; busy: boolean; onEnable: () => Promise<unknown>; onDismiss: () => void }) {
  const { t } = useTranslation(['notifications', 'common']);
  const insets = useSafeAreaInsets();
  const handleEnable = async () => {
    try {
      await onEnable();
    } catch {
      Alert.alert(t('notifications:errors.enable'));
    }
  };
  if (!open) return null;

  return <View pointerEvents="box-none" style={[styles.host, { bottom: Math.max(insets.bottom, 18) + 88 }]}>
    <View pointerEvents="auto" style={styles.card}>
      <Text style={styles.title}>{t('prompt.title')}</Text>
      <Text style={styles.body}>{t('prompt.body')}</Text>
      <Pressable disabled={busy} onPress={() => void handleEnable()} style={[styles.primary, busy && styles.disabled]}><Text style={styles.primaryText}>{busy ? t('prompt.enabling') : t('prompt.enable')}</Text></Pressable>
      <Pressable disabled={busy} onPress={onDismiss} style={styles.secondary}><Text style={styles.secondaryText}>{t('common:actions.notNow')}</Text></Pressable>
    </View>
  </View>;
}

const styles = StyleSheet.create({
  host: { position: 'absolute', left: 0, right: 0, alignItems: 'center', paddingHorizontal: spacing.md, zIndex: 50 },
  card: { width: '100%', maxWidth: 420, backgroundColor: colors.surface, borderRadius: 22, padding: spacing.lg, gap: spacing.md, borderWidth: 1, borderColor: colors.border, shadowColor: '#000', shadowOpacity: 0.32, shadowRadius: 18, shadowOffset: { width: 0, height: 8 }, elevation: 12 },
  title: { color: colors.text, fontSize: 22, fontWeight: '800' },
  body: { color: colors.muted, fontSize: 15, lineHeight: 22 },
  primary: { minHeight: 48, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.accent },
  primaryText: { color: colors.text, fontWeight: '800' },
  secondary: { alignItems: 'center', paddingVertical: spacing.sm },
  secondaryText: { color: colors.muted, fontWeight: '700' },
  disabled: { opacity: 0.5 }
});
