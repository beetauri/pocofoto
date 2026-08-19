import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import Constants from 'expo-constants';
import { AppleAuthenticationButton, AppleAuthenticationButtonStyle, AppleAuthenticationButtonType } from 'expo-apple-authentication';
import { Image, Platform, Pressable, Text, View } from 'react-native';
import { useApp } from '../state/AppProvider';
import { colors, globalStyles, spacing } from '../styles/global';

function errorMessage(error: unknown, fallback: string) {
  const code = (error as { code?: string })?.code;
  if (code === 'auth/network-request-failed') return 'Reconnect and try again.';
  if (code === 'auth/popup-closed-by-user' || code === 'SIGN_IN_CANCELLED') return '';
  return fallback;
}

export default function AuthScreen() {
  const { t } = useTranslation('auth');
  const { signIn, signInApple } = useApp();
  const buildVersion = Constants.expoConfig?.version || '0.0.1';
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const handleSignIn = async () => {
    if (busy) return;
    setBusy(true);
    setError('');
    try {
      await signIn();
    } catch (nextError) {
      setError(errorMessage(nextError, t('errors.generic')));
    } finally {
      setBusy(false);
    }
  };

  const handleAppleSignIn = async () => {
    if (busy) return;
    setBusy(true);
    setError('');
    try {
      await signInApple();
    } catch (nextError) {
      setError(errorMessage(nextError, t('errors.generic')));
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={[globalStyles.screen, globalStyles.centered, { padding: spacing.lg }]}>
      <View style={{ width: '100%', maxWidth: 440, alignItems: 'center', gap: spacing.lg }}>
        <Image source={require('../../assets/pocoface-icon-1024.png')} style={{ width: 108, height: 108, borderRadius: 30 }} />
        <Text style={{ color: colors.text, fontSize: 32, fontWeight: '900', letterSpacing: -1 }}>Pocofoto</Text>
        <Text style={{ color: colors.muted, fontSize: 16, lineHeight: 24, textAlign: 'center', maxWidth: 280 }}>
          {t('tagline')}
        </Text>
        {error ? <Text accessibilityRole="alert" style={{ color: colors.danger, textAlign: 'center' }}>{error}</Text> : null}
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('continueWithGoogle')}
          disabled={busy}
          onPress={handleSignIn}
          style={({ pressed }) => [globalStyles.button, { width: '100%', backgroundColor: colors.text, opacity: pressed || busy ? 0.75 : 1 }]}
        >
          <Text style={{ color: '#1C1C1C', fontWeight: '800', fontSize: 16 }}>
            {busy ? t('signingIn') : t('continueWithGoogle')}
          </Text>
        </Pressable>
        {Platform.OS === 'ios' ? (
          <AppleAuthenticationButton
            buttonType={AppleAuthenticationButtonType.CONTINUE}
            buttonStyle={AppleAuthenticationButtonStyle.BLACK}
            cornerRadius={12}
            onPress={() => void handleAppleSignIn()}
            style={{ width: '100%', height: 52, opacity: busy ? 0.55 : 1 }}
          />
        ) : null}
        <Text style={{ color: colors.muted, fontSize: 12 }}>v{buildVersion}</Text>
      </View>
    </View>
  );
}
