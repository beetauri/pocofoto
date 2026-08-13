import Constants from 'expo-constants';
import * as ImagePicker from 'expo-image-picker';
import { useEffect, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import {
  ActivityIndicator,
  Alert,
  Image,
  Linking,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Check, ChevronDown, Pencil, X } from 'lucide-react-native';
import { useApp } from '../state/AppProvider';
import { callFunction } from '../services/firebase';
import { captureHandledException, trackEvent } from '../services/analytics';
import { triggerHaptic } from '../services/haptics';
import { removeProfilePhoto, updateDisplayName, uploadProfilePhoto } from '../services/profileService';
import { displayNameError, normalizeDisplayName } from '../domain/profile';
import { useNotifications } from '../hooks/useNotifications';
import { colors, globalStyles, spacing } from '../styles/global';

function initialsFor(name: string, email?: string | null) {
  const source = name || email || '?';
  return source.split(/[\s@._-]+/).filter(Boolean).slice(0, 2).map((part) => part[0]?.toUpperCase()).join('') || '?';
}

function Avatar({ uri, name, email, large = false }: { uri?: string; name: string; email?: string | null; large?: boolean }) {
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [uri]);
  if (uri && !failed) return <Image source={{ uri }} onError={() => setFailed(true)} style={[styles.avatar, large && styles.avatarLarge]} />;
  return <View style={[styles.avatar, large && styles.avatarLarge, styles.avatarFallback]}><Text style={styles.avatarText}>{initialsFor(name, email)}</Text></View>;
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return <View style={styles.section}><Text style={styles.sectionTitle}>{title}</Text><View style={styles.card}>{children}</View></View>;
}

function ActionButton({ label, onPress, disabled = false, danger = false }: { label: string; onPress: () => void; disabled?: boolean; danger?: boolean }) {
  return <Pressable accessibilityRole="button" disabled={disabled} onPress={onPress} style={({ pressed }) => [styles.actionButton, danger && styles.dangerButton, disabled && styles.disabled, pressed && styles.pressed]}><Text style={[styles.actionButtonText, danger && styles.dangerText]}>{label}</Text></Pressable>;
}

function NotificationSettings() {
  const { t } = useTranslation('notifications');
  const notifications = useNotifications();
  const [expanded, setExpanded] = useState(false);

  const permissionLabel = notifications.status.permission === 'denied'
    ? t('setting.denied')
    : notifications.status.permission === 'unsupported'
      ? t('setting.unsupported')
      : notifications.status.enabled
        ? t('setting.enabled')
        : notifications.status.permission === 'granted'
          ? t('setting.permissionOnly')
          : t('setting.disabled');

  const runTest = async (test: () => Promise<unknown>) => {
    try {
      const result = await test() as { outcome?: string; successCount?: number; tokenCount?: number; failureCount?: number };
      if (result.outcome === 'no_registered_devices' || result.tokenCount === 0) {
        Alert.alert(t('diagnostics.toggle'), t('diagnostics.noDevices'));
      } else {
        Alert.alert(t('diagnostics.toggle'), t('diagnostics.accepted', {
          successCount: result.successCount ?? 0,
          tokenCount: result.tokenCount ?? 0,
          failureCount: result.failureCount ?? 0
        }));
      }
    } catch {
      Alert.alert(t('errors.enable'));
    }
  };

  const toggleNotifications = async () => {
    try {
      if (notifications.status.enabled) await notifications.disable();
      else await notifications.enable();
    } catch {
      Alert.alert(t('errors.enable'));
    }
  };

  return <Section title={t('setting.title')}>
    <View style={styles.settingRow}>
      <View style={styles.settingCopy}><Text style={styles.bodyText}>{permissionLabel}</Text>{notifications.status.permission === 'denied' && <Pressable onPress={() => void Linking.openSettings()}><Text style={styles.linkText}>Open device settings</Text></Pressable>}</View>
      <Switch value={notifications.status.enabled} disabled={notifications.busy || notifications.status.permission === 'unsupported'} onValueChange={() => void toggleNotifications()} trackColor={{ false: colors.surfaceRaised, true: colors.accent }} thumbColor={colors.text} />
    </View>
    <Pressable style={styles.diagnosticsToggle} onPress={() => { setExpanded((current) => !current); if (!expanded) void notifications.refreshDiagnostics(); }}><Text style={styles.linkText}>{t('diagnostics.toggle')}</Text><Text style={styles.chevron}>{expanded ? '⌃' : '⌄'}</Text></Pressable>
    {expanded && <View style={styles.diagnostics}>
      <Text style={styles.mutedText}>{t('diagnostics.permission')}: {notifications.status.permission}</Text>
      <Text style={styles.mutedText}>{t('diagnostics.device')}: {String(notifications.diagnostics.deviceId || 'unknown')}</Text>
      <Text style={styles.mutedText}>{t('diagnostics.partnerDevices')}: {String(notifications.diagnostics.partnerTokenCount ?? 'unknown')}</Text>
      <ActionButton label={t('diagnostics.register')} onPress={() => void notifications.registerDevice()} disabled={notifications.busy} />
      <ActionButton label={t('diagnostics.testThis')} onPress={() => void runTest(notifications.testThisDevice)} disabled={notifications.busy || !notifications.status.enabled} />
      <ActionButton label={t('diagnostics.testPartner')} onPress={() => void runTest(notifications.testPartnerDevices)} disabled={notifications.busy || !notifications.status.enabled} />
    </View>}
  </Section>;
}

export default function ProfileScreen() {
  const { t } = useTranslation(['profile', 'common', 'pairing']);
  const { user, profile, partnerProfile, setCoupleId, signOut } = useApp();
  const [editingName, setEditingName] = useState(false);
  const [draftName, setDraftName] = useState('');
  const [nameError, setNameError] = useState('');
  const [busy, setBusy] = useState(false);
  const [removingPairing, setRemovingPairing] = useState(false);
  const [aboutOpen, setAboutOpen] = useState(false);
  const insets = useSafeAreaInsets();

  const displayName = profile?.displayName || user?.displayName || user?.email?.split('@')[0] || 'Pocofoto';
  const profilePic = profile?.profilePic || user?.photoURL || '';
  const fallbackProfilePic = user?.photoURL || '';
  const partnerName = partnerProfile?.displayName || partnerProfile?.email?.split('@')[0] || t('pairedWith');
  const partnerPic = partnerProfile?.profilePic || partnerProfile?.photoURL || '';
  const buildVersion = Constants.expoConfig?.version || '0.0.0';
  const buildCommit = process.env.EXPO_PUBLIC_BUILD_COMMIT || 'dev';

  useEffect(() => {
    if (!editingName) setDraftName(displayName);
  }, [displayName, editingName]);

  const startNameEdit = () => {
    setDraftName(displayName);
    setNameError('');
    setEditingName(true);
  };

  const cancelNameEdit = () => {
    setDraftName(displayName);
    setNameError('');
    setEditingName(false);
  };

  const saveName = async () => {
    if (!user || busy) return;
    const nextName = normalizeDisplayName(draftName);
    if (displayNameError(nextName)) { setNameError(t('nameLengthError')); return; }
    setNameError('');
    setBusy(true);
    try {
      await updateDisplayName(user, nextName);
      setEditingName(false);
      void triggerHaptic('success');
      trackEvent('profile_name_updated');
    } catch (error) {
      captureHandledException(error, { operation: 'profile-name-update' });
      setNameError(t('nameSaveError'));
    } finally { setBusy(false); }
  };

  const pickPhoto = async () => {
    if (!user || busy) return;
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], allowsEditing: true, aspect: [1, 1], quality: 1 });
    if (result.canceled || !result.assets[0]) return;
    setBusy(true);
    try {
      await uploadProfilePhoto(user.uid, result.assets[0].uri);
      void triggerHaptic('success');
      trackEvent('profile_photo_updated');
    } catch (error) {
      captureHandledException(error, { operation: 'profile-photo-update' });
      Alert.alert(t('toasts.photoUpdateError'));
    } finally { setBusy(false); }
  };

  const removePhoto = async () => {
    if (!user || busy || !profilePic) return;
    setBusy(true);
    try { await removeProfilePhoto(user.uid, fallbackProfilePic); trackEvent('profile_photo_removed'); }
    catch (error) { captureHandledException(error, { operation: 'profile-photo-remove' }); Alert.alert(t('toasts.photoUpdateError')); }
    finally { setBusy(false); }
  };

  const confirmRemovePairing = () => {
    if (!user || removingPairing) return;
    Alert.alert(t('removePairing.title'), t('removePairing.body'), [
      { text: t('common:actions.cancel'), style: 'cancel' },
      { text: t('removePairing.confirm'), style: 'destructive', onPress: async () => {
        setRemovingPairing(true);
        try { await callFunction('removePairing'); setCoupleId(null); void triggerHaptic('success'); trackEvent('pairing_remove_confirmed'); }
        catch (error) { captureHandledException(error, { operation: 'pairing-remove' }); Alert.alert(t('toasts.pairingRemoveError')); }
        finally { setRemovingPairing(false); }
      } }
    ]);
  };

  const confirmLogout = () => Alert.alert(t('logout.title'), t('logout.body'), [
    { text: t('common:actions.cancel'), style: 'cancel' },
    { text: t('logout.confirm'), style: 'destructive', onPress: () => void signOut() }
  ]);

  return <ScrollView directionalLockEnabled style={globalStyles.screen} contentContainerStyle={[styles.content, { paddingTop: insets.top + spacing.md, paddingBottom: insets.bottom + 48 }]}>
    <View style={styles.identity}><Avatar uri={profilePic} name={displayName} email={user?.email} large /><View style={styles.identityCopy}><Text style={styles.title}>{displayName}</Text><Text style={styles.mutedText}>{user?.email}</Text></View></View>
    <View style={styles.inlineActions}><ActionButton label={t('changePhoto')} onPress={() => void pickPhoto()} disabled={busy} /><ActionButton label={t('removePhoto')} onPress={() => void removePhoto()} disabled={busy || !profilePic} /></View>

    <Section title={t('pairedWith')}><View style={styles.partnerRow}><Avatar uri={partnerPic} name={partnerName} email={partnerProfile?.email} /><View><Text style={styles.bodyStrong}>{partnerName}</Text><Text style={styles.mutedText}>{partnerProfile?.email || t('hiddenEmail')}</Text></View></View></Section>
    <Section title={t('account')}>
      <View style={[styles.fieldRow, editingName && styles.editingField]}><Text style={styles.mutedText}>{t('displayName')}</Text>{editingName ? <View style={styles.editStack}><View style={styles.editRow}><TextInput autoFocus value={draftName} onChangeText={(value) => { setDraftName(value); setNameError(''); }} maxLength={30} editable={!busy} style={[globalStyles.input, styles.nameInput]} /><View style={styles.editActions}><Pressable accessibilityLabel={t('cancelNameEdit')} onPress={cancelNameEdit} disabled={busy} style={styles.iconButton}><X color={colors.muted} size={20} /></Pressable><Pressable accessibilityLabel={t('saveName')} onPress={() => void saveName()} disabled={busy} style={[styles.iconButton, styles.saveIconButton]}>{busy ? <ActivityIndicator color={colors.text} size="small" /> : <Check color={colors.text} size={20} />}</Pressable></View></View>{nameError ? <Text style={styles.inlineError}>{nameError}</Text> : null}</View> : <View style={styles.valueRow}><Text style={styles.bodyStrong}>{displayName}</Text><Pressable accessibilityLabel={t('editName')} onPress={startNameEdit} style={styles.iconButton}><Pencil color={colors.muted} size={18} /></Pressable></View>}</View>
      <View style={styles.fieldRow}><Text style={styles.mutedText}>{t('email')}</Text><Text style={styles.bodyStrong}>{user?.email}</Text></View>
      <View style={styles.fieldRow}><Text style={styles.mutedText}>{t('signIn')}</Text><Text style={styles.bodyStrong}>{t('google')}</Text></View>
    </Section>
    <NotificationSettings />
    <View style={styles.section}><View style={styles.card}><Pressable accessibilityRole="button" accessibilityLabel={t('about')} onPress={() => setAboutOpen((current) => !current)} style={styles.aboutTrigger}><Text style={styles.sectionTitle}>{t('about')}</Text><ChevronDown color={colors.muted} size={20} style={aboutOpen ? styles.chevronOpen : undefined} /></Pressable>{aboutOpen ? <View style={styles.aboutContent}><View style={styles.legalLinks}><Text style={styles.linkText}>{t('privacy')}</Text><Text style={styles.linkText}>{t('terms')}</Text></View><View style={styles.buildBlock}><Text style={styles.mutedText}>{t('common:version')}</Text><Text style={styles.bodyStrong}>v{buildVersion} ({buildCommit})</Text></View></View> : null}</View></View>
    <View style={styles.dangerSection}><ActionButton label={removingPairing ? t('removePairing.removing') : t('removePairing.action')} onPress={confirmRemovePairing} disabled={removingPairing} danger /><ActionButton label={t('logout.action')} onPress={confirmLogout} danger /></View>
    {busy && <ActivityIndicator color={colors.accent} style={styles.activity} />}
  </ScrollView>;
}

const styles = StyleSheet.create({
  content: { padding: spacing.md, paddingBottom: 48, gap: spacing.md },
  identity: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingTop: spacing.sm },
  identityCopy: { flex: 1, gap: 4 },
  title: { color: colors.text, fontSize: 28, fontWeight: '800' },
  avatar: { width: 58, height: 58, borderRadius: 29, backgroundColor: colors.surfaceRaised },
  avatarLarge: { width: 86, height: 86, borderRadius: 43 },
  avatarFallback: { alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: colors.border },
  avatarText: { color: colors.text, fontSize: 20, fontWeight: '800' },
  section: { gap: spacing.sm },
  sectionTitle: { color: colors.muted, fontSize: 12, fontWeight: '700', letterSpacing: 1, textTransform: 'uppercase' },
  card: { backgroundColor: colors.surface, borderRadius: 18, padding: spacing.md, gap: spacing.md, borderWidth: 1, borderColor: colors.border },
  partnerRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  bodyText: { color: colors.text, fontSize: 15, lineHeight: 21 },
  bodyStrong: { color: colors.text, fontSize: 16, fontWeight: '700' },
  mutedText: { color: colors.muted, fontSize: 14 },
  inlineActions: { flexDirection: 'row', gap: spacing.sm },
  actionButton: { minHeight: 44, paddingHorizontal: 14, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surfaceRaised, flex: 1 },
  actionButtonText: { color: colors.text, fontSize: 14, fontWeight: '700' },
  dangerButton: { backgroundColor: 'rgba(255,90,95,0.13)' },
  dangerText: { color: colors.danger },
  disabled: { opacity: 0.45 },
  pressed: { opacity: 0.72 },
  fieldRow: { gap: 8, paddingVertical: 4 },
  editRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  editingField: { paddingBottom: spacing.sm },
  editStack: { gap: spacing.xs },
  nameInput: { flex: 1, minHeight: 44 },
  editActions: { flexDirection: 'row', gap: spacing.xs },
  iconButton: { width: 42, height: 42, alignItems: 'center', justifyContent: 'center', borderRadius: 12, backgroundColor: colors.surfaceRaised },
  saveIconButton: { backgroundColor: colors.accent },
  valueRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm },
  inlineError: { color: colors.danger, fontSize: 13, lineHeight: 18 },
  settingRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  settingCopy: { flex: 1, gap: 4 },
  linkText: { color: colors.accent, fontWeight: '700' },
  diagnosticsToggle: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingTop: spacing.sm },
  chevron: { color: colors.muted, fontSize: 20 },
  aboutTrigger: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  chevronOpen: { transform: [{ rotate: '180deg' }] },
  aboutContent: { gap: spacing.md, borderTopWidth: 1, borderTopColor: colors.border, paddingTop: spacing.md },
  legalLinks: { flexDirection: 'row', gap: spacing.md },
  buildBlock: { gap: 4 },
  diagnostics: { gap: spacing.sm, borderTopWidth: 1, borderTopColor: colors.border, paddingTop: spacing.md },
  dangerSection: { gap: spacing.sm, paddingTop: spacing.sm },
  activity: { marginTop: spacing.sm }
});
