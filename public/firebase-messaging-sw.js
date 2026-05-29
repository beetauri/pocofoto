/* global importScripts, firebase, clients */

importScripts('https://www.gstatic.com/firebasejs/12.13.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/12.13.0/firebase-messaging-compat.js');

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
  const title = payload.notification?.title || 'Pocofoto';
  const options = {
    body: payload.notification?.body || 'You have a new update.',
    icon: '/pocofoto-192.png',
    badge: '/pocofoto-192.png',
    data: payload.data || {}
  };

  self.registration.showNotification(title, options);
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = new URL('/?pairing=requests', self.location.origin).href;
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
