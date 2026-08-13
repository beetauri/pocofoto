import { getApp } from '@react-native-firebase/app';
import { getMessaging, setBackgroundMessageHandler } from '@react-native-firebase/messaging';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

let configured = false;

export function configureNotificationBootstrap() {
  if (configured) return;
  configured = true;

  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldPlaySound: false,
      shouldSetBadge: false,
      shouldShowBanner: true,
      shouldShowList: true
    })
  });

  if (Platform.OS === 'android') {
    void Notifications.setNotificationChannelAsync('default', {
      name: 'Pocofoto',
      importance: Notifications.AndroidImportance.DEFAULT
    });
  }

  setBackgroundMessageHandler(getMessaging(getApp()), async (message) => {
    const data = message.data || {};
    const title = typeof data.title === 'string' ? data.title : 'Pocofoto';
    const body = typeof data.body === 'string' ? data.body : 'A little update from your person.';
    await Notifications.scheduleNotificationAsync({
      content: { title, body, data },
      trigger: null
    });
  });
}
