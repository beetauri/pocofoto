import { useTranslation } from 'react-i18next';
import { Alert, Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { colors, spacing } from '../styles/global';

export default function NotificationPrompt({ open, busy, onEnable, onDismiss }: { open: boolean; busy: boolean; onEnable: () => Promise<unknown>; onDismiss: () => void }) {
  const { t } = useTranslation(['notifications', 'common']);
  const handleEnable = async () => {
    try {
      await onEnable();
    } catch {
      Alert.alert(t('notifications:errors.enable'));
    }
  };
  return <Modal visible={open} transparent animationType="fade" onRequestClose={onDismiss}>
    <View style={styles.backdrop}><View style={styles.card}>
      <Text style={styles.title}>{t('prompt.title')}</Text>
      <Text style={styles.body}>{t('prompt.body')}</Text>
      <Pressable disabled={busy} onPress={() => void handleEnable()} style={[styles.primary, busy && styles.disabled]}><Text style={styles.primaryText}>{busy ? t('prompt.enabling') : t('prompt.enable')}</Text></Pressable>
      <Pressable disabled={busy} onPress={onDismiss} style={styles.secondary}><Text style={styles.secondaryText}>{t('common:actions.notNow')}</Text></Pressable>
    </View></View>
  </Modal>;
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.72)', alignItems: 'center', justifyContent: 'center', padding: spacing.lg },
  card: { width: '100%', maxWidth: 420, backgroundColor: colors.surface, borderRadius: 22, padding: spacing.lg, gap: spacing.md, borderWidth: 1, borderColor: colors.border },
  title: { color: colors.text, fontSize: 22, fontWeight: '800' },
  body: { color: colors.muted, fontSize: 15, lineHeight: 22 },
  primary: { minHeight: 48, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.accent },
  primaryText: { color: colors.text, fontWeight: '800' },
  secondary: { alignItems: 'center', paddingVertical: spacing.sm },
  secondaryText: { color: colors.muted, fontWeight: '700' },
  disabled: { opacity: 0.5 }
});
