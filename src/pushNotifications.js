import { notificationClient } from './notifications/notificationClient';

export async function requestAndRegisterPushToken() {
  const result = await notificationClient.enable();
  return {
    ok: result.status === 'registered',
    reason: result.status || result.reason || 'failed',
    ...result
  };
}

export async function sendTestPushNotification() {
  return notificationClient.testPartnerDevices();
}
