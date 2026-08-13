import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert, KeyboardAvoidingView, Platform, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Clipboard from 'expo-clipboard';
import { collection, onSnapshot, query, where } from '@react-native-firebase/firestore';
import { callFunction, firestoreClient } from '../services/firebase';
import { trackEvent } from '../services/analytics';
import { useNotifications } from '../hooks/useNotifications';
import { useApp } from '../state/AppProvider';
import type { PairingRequest, UserProfile } from '../types';
import { colors, globalStyles, spacing } from '../styles/global';

function initialsFor(name?: string, email?: string) {
  return (name || email || '?')
    .split(/[\s@._-]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join('') || '?';
}

function Avatar({ profile }: { profile?: UserProfile }) {
  return (
    <View style={{ width: 48, height: 48, borderRadius: 16, backgroundColor: colors.surfaceRaised, alignItems: 'center', justifyContent: 'center' }}>
      <Text style={{ color: colors.text, fontWeight: '800' }}>{initialsFor(profile?.displayName, profile?.email)}</Text>
    </View>
  );
}

function ActionButton({ label, onPress, disabled, ghost = false }: { label: string; onPress: () => void; disabled?: boolean; ghost?: boolean }) {
  return (
    <Pressable
      accessibilityRole="button"
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [globalStyles.button, ghost ? globalStyles.buttonGhost : globalStyles.buttonPrimary, { flex: 1, opacity: pressed || disabled ? 0.55 : 1 }]}
    >
      <Text style={{ color: colors.text, fontWeight: '800' }}>{label}</Text>
    </Pressable>
  );
}

export default function PairingScreen() {
  const { t } = useTranslation(['pairing', 'common']);
  const { user, isOnline, signOut, setCoupleId } = useApp();
  const notifications = useNotifications();
  const insets = useSafeAreaInsets();
  const [incoming, setIncoming] = useState<PairingRequest[]>([]);
  const [outgoing, setOutgoing] = useState<PairingRequest | null>(null);
  const [pairingCode, setPairingCode] = useState('');
  const [inputCode, setInputCode] = useState('');
  const [workingId, setWorkingId] = useState('');
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    if (!user) return undefined;
    const incomingQuery = query(
      collection(firestoreClient, 'pairingRequests'),
      where('recipientId', '==', user.uid),
      where('status', '==', 'pending')
    );
    return onSnapshot(incomingQuery, (snapshot) => {
      setIncoming(snapshot.docs.map((item) => ({ id: item.id, ...item.data() } as PairingRequest)));
    }, () => setError(t('errors.offline')));
  }, [t, user]);

  useEffect(() => {
    if (!user) return undefined;
    const outgoingQuery = query(
      collection(firestoreClient, 'pairingRequests'),
      where('senderId', '==', user.uid),
      where('status', '==', 'pending')
    );
    return onSnapshot(outgoingQuery, (snapshot) => {
      const next = snapshot.docs[0];
      setOutgoing(next ? ({ id: next.id, ...next.data() } as PairingRequest) : null);
    });
  }, [user]);

  const sortedIncoming = useMemo(() => [...incoming].sort((a, b) => {
    const aTime = (a as PairingRequest & { createdAt?: { toMillis?: () => number } }).createdAt?.toMillis?.() || 0;
    const bTime = (b as PairingRequest & { createdAt?: { toMillis?: () => number } }).createdAt?.toMillis?.() || 0;
    return bTime - aTime;
  }), [incoming]);

  const runAction = async (id: string, action: () => Promise<void>, errorKey: 'offline' | 'accept' | 'decline' | 'cancel' | 'createCode' | 'redeemCode' = 'offline') => {
    setWorkingId(id);
    setError('');
    try {
      await action();
    } catch {
      setError(t(`errors.${errorKey}`));
    } finally {
      setWorkingId('');
    }
  };

  const accept = (request: PairingRequest) => runAction(request.id, async () => {
    const result = await callFunction<{ coupleId?: string }>('acceptPairingRequest', { requestId: request.id });
    if (result.coupleId) setCoupleId(result.coupleId);
    trackEvent('pairing_request_accepted', { requestId: request.id, coupleId: result.coupleId || null });
  }, 'accept');

  const decline = (request: PairingRequest) => runAction(request.id, async () => {
    await callFunction('declinePairingRequest', { requestId: request.id });
    setNotice(t('invites.declined'));
    trackEvent('pairing_request_declined', { requestId: request.id });
  }, 'decline');

  const cancel = () => outgoing && runAction('cancel', async () => {
    await callFunction('cancelPairingRequest', { requestId: outgoing.id });
    setNotice(t('invites.canceled'));
    trackEvent('pairing_request_canceled', { requestId: outgoing.id });
  }, 'cancel');

  const createCode = () => runAction('create-code', async () => {
    const result = await callFunction<{ code?: string }>('createPairingCode');
    setPairingCode(result.code || '');
    trackEvent('pairing_code_created');
  }, 'createCode');

  const redeemCode = () => runAction('redeem-code', async () => {
    const result = await callFunction<{ coupleId?: string }>('redeemPairingCode', { code: inputCode.trim().toUpperCase() });
    if (result.coupleId) setCoupleId(result.coupleId);
    trackEvent('pairing_code_redeemed', { coupleId: result.coupleId || null });
  }, 'redeemCode');

  const enablePairingNotifications = async () => {
    setWorkingId('enable-notifications');
    setError('');
    try {
      const result = await notifications.enable();
      if (result.status === 'registered') setNotice(t('notifications.enabled'));
      else if (result.status === 'denied') setNotice(t('notifications.denied'));
      else setNotice(t('notifications.unavailable'));
    } catch {
      setError(t('errors.notifications'));
    } finally {
      setWorkingId('');
    }
  };

  const copyCode = async () => {
    await Clipboard.setStringAsync(pairingCode);
    setNotice(t('code.copied'));
  };

  const confirmLogout = () => Alert.alert(
    t('logout.title'),
    t('logout.body'),
    [{ text: t('common:actions.cancel'), style: 'cancel' }, { text: t('logout.confirm'), style: 'destructive', onPress: () => void signOut() }]
  );

  return (
    <KeyboardAvoidingView style={globalStyles.screen} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingTop: insets.top + spacing.lg, paddingBottom: insets.bottom + spacing.lg, gap: spacing.lg }} keyboardShouldPersistTaps="handled">
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
          <View>
            <Text style={{ color: colors.muted, fontSize: 12, fontWeight: '700' }}>{t('signedInAs')}</Text>
            <Text style={{ color: colors.text, fontWeight: '800', marginTop: 4 }}>{user?.displayName || user?.email}</Text>
          </View>
          <Pressable onPress={confirmLogout} accessibilityRole="button" style={globalStyles.buttonGhost}>
            <Text style={{ color: colors.text, fontWeight: '800' }}>{t('logout.label')}</Text>
          </Pressable>
        </View>

        <View style={{ alignItems: 'center', gap: spacing.sm, paddingVertical: spacing.lg }}>
          <Text style={{ color: colors.text, fontSize: 30, fontWeight: '900' }}>{t('title')}</Text>
          <Text style={{ color: colors.muted, textAlign: 'center', lineHeight: 22 }}>{t('intro')}</Text>
        </View>

        {!isOnline ? <Text style={{ color: colors.danger, textAlign: 'center' }}>{t('errors.offline')}</Text> : null}
        {error ? <Text accessibilityRole="alert" style={{ color: colors.danger, textAlign: 'center' }}>{error}</Text> : null}
        {notice ? <Text accessibilityLiveRegion="polite" style={{ color: colors.success, textAlign: 'center' }}>{notice}</Text> : null}

        <View accessibilityLabel={t('accessibility.notifications')} style={{ backgroundColor: colors.surface, borderRadius: 18, padding: spacing.md, gap: spacing.sm }}>
          <Text style={{ color: colors.text, fontWeight: '900' }}>{t('notifications.title')}</Text>
          <Text style={{ color: colors.muted, lineHeight: 21 }}>{notifications.status.permission === 'denied' ? t('notifications.denied') : t('notifications.body')}</Text>
          <ActionButton
            label={workingId === 'enable-notifications' ? t('notifications.enabling') : notifications.status.enabled ? t('notifications.enabled') : t('notifications.enable')}
            onPress={() => void enablePairingNotifications()}
            disabled={!isOnline || notifications.busy || notifications.status.enabled || Boolean(workingId)}
          />
        </View>

        {sortedIncoming.length > 0 ? (
          <View style={{ gap: spacing.sm }}>
            <Text style={{ color: colors.text, fontWeight: '900', fontSize: 18 }}>{t('invites.title')}</Text>
            {sortedIncoming.map((request) => (
              <View key={request.id} style={{ backgroundColor: colors.surface, borderRadius: 18, padding: spacing.md, gap: spacing.sm }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
                  <Avatar profile={request.sender} />
                  <Text style={{ color: colors.text, flex: 1 }}>{request.sender?.displayName || t('yourContact')} {t('invites.wantsToPair')}</Text>
                </View>
                <View style={{ flexDirection: 'row', gap: spacing.sm }}>
                  <ActionButton label={t('invites.decline')} ghost onPress={() => void decline(request)} disabled={!isOnline || Boolean(workingId)} />
                  <ActionButton label={t('invites.accept')} onPress={() => void accept(request)} disabled={!isOnline || Boolean(workingId)} />
                </View>
              </View>
            ))}
          </View>
        ) : null}

        {outgoing ? (
          <View style={{ backgroundColor: colors.surface, borderRadius: 18, padding: spacing.md, gap: spacing.sm }}>
            <Text style={{ color: colors.text, fontWeight: '900' }}>{t('invites.pending')}</Text>
            <Text style={{ color: colors.muted }}>{t('invites.pendingBody', { name: outgoing.recipient?.displayName || t('yourContact') })}</Text>
            <ActionButton label={t('invites.cancel')} ghost onPress={() => void cancel()} disabled={!isOnline || Boolean(workingId)} />
          </View>
        ) : null}

        <View style={{ backgroundColor: colors.surface, borderRadius: 18, padding: spacing.md, gap: spacing.md }}>
          <Text style={{ color: colors.text, fontWeight: '900', fontSize: 18 }}>{t('code.title')}</Text>
          <Text style={{ color: colors.muted, lineHeight: 22 }}>{t('code.intro')}</Text>
          <ActionButton label={workingId === 'create-code' ? t('code.create') : t('code.create')} onPress={() => void createCode()} disabled={!isOnline || Boolean(workingId)} />
          {pairingCode ? (
            <Pressable onPress={() => void copyCode()} style={{ backgroundColor: colors.surfaceRaised, borderRadius: 14, padding: spacing.md, alignItems: 'center' }}>
              <Text style={{ color: colors.muted, fontSize: 12 }}>{t('code.createdLabel')}</Text>
              <Text style={{ color: colors.text, fontSize: 30, letterSpacing: 6, fontWeight: '900', marginTop: 4 }}>{pairingCode}</Text>
              <Text style={{ color: colors.accent, fontWeight: '800', marginTop: 6 }}>{t('code.copy')}</Text>
            </Pressable>
          ) : null}
          <Text style={{ color: colors.muted, fontWeight: '700' }}>{t('code.enterLabel')}</Text>
          <TextInput
            autoCapitalize="characters"
            autoCorrect={false}
            maxLength={6}
            onChangeText={(value) => setInputCode(value.toUpperCase())}
            placeholder={t('code.enterHelp')}
            placeholderTextColor={colors.muted}
            style={globalStyles.input}
            value={inputCode}
          />
          <ActionButton label={t('code.submit')} onPress={() => void redeemCode()} disabled={!isOnline || inputCode.length < 6 || Boolean(workingId)} />
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
