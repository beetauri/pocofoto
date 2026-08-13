import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { Pressable, StyleSheet, Text } from 'react-native';
import * as Sentry from '@sentry/react-native';
import { AppProvider } from '../src/state/AppProvider';
import NotificationPrompt from '../src/components/NotificationPrompt';
import { NotificationsProvider, useNotifications } from '../src/hooks/useNotifications';
import '../src/i18n';
import '../src/styles/global';

function GlobalNotificationSurface() {
  const notifications = useNotifications();
  return <>
    {notifications.foregroundMessage ? <Pressable style={styles.foregroundBanner} onPress={notifications.clearForegroundMessage}><Text style={styles.foregroundText}>{notifications.foregroundMessage}</Text></Pressable> : null}
    <NotificationPrompt open={notifications.showPrompt} busy={notifications.busy} onEnable={notifications.enable} onDismiss={notifications.dismissPrompt} />
  </>;
}

function RootLayout() {
  return (
    <AppProvider>
      <NotificationsProvider>
        <StatusBar style="light" />
        <Stack screenOptions={{ headerShown: false, animation: 'fade' }} />
        <GlobalNotificationSurface />
      </NotificationsProvider>
    </AppProvider>
  );
}

const styles = StyleSheet.create({
  foregroundBanner: { position: 'absolute', left: 16, right: 16, bottom: 94, backgroundColor: '#242424', borderRadius: 14, padding: 14, borderWidth: 1, borderColor: 'rgba(255,255,255,0.15)', zIndex: 50 },
  foregroundText: { color: '#fff', fontWeight: '700', textAlign: 'center' }
});

export default Sentry.wrap(RootLayout);
