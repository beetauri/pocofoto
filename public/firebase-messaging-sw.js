/* global importScripts, firebase, clients */

importScripts('https://www.gstatic.com/firebasejs/12.13.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/12.13.0/firebase-messaging-compat.js');
importScripts('/firebase-messaging-sw-core.js');

firebase.initializeApp({
  apiKey: 'AIzaSyCMAV8uQ8RelzrnIRxr9MyzrX5uFlDcDRw',
  authDomain: 'sixth-bonbon-402909.firebaseapp.com',
  projectId: 'sixth-bonbon-402909',
  storageBucket: 'sixth-bonbon-402909.firebasestorage.app',
  messagingSenderId: '386325909807',
  appId: '1:386325909807:web:f1d5f429e41f637bd751da'
});

const messaging = firebase.messaging();

messaging.onBackgroundMessage((payload) => {
  const pushEvent = self.PocofotoMessaging.parsePushData(payload.data || {});
  return self.PocofotoMessaging.rememberEvent(pushEvent.eventId).then((isNewEvent) => {
    if (!isNewEvent) return undefined;
    return self.registration.showNotification(
      pushEvent.title,
      self.PocofotoMessaging.notificationOptions(pushEvent)
    );
  });
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const targetPath = event.notification.data?.destination || '/';
  const url = new URL(targetPath, self.location.origin).href;
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if ('focus' in client) {
          client.navigate(url);
          return client.focus();
        }
      }
      return clients.openWindow(url);
    })
  );
});
