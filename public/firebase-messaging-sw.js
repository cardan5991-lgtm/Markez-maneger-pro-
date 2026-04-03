importScripts('https://www.gstatic.com/firebasejs/10.8.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.8.0/firebase-messaging-compat.js');

const firebaseConfig = {
  projectId: "gen-lang-client-0273028698",
  appId: "1:653980593713:web:24287930b9990208376f10",
  apiKey: "AIzaSyCfHV5sYYzfatZ9LzhKFhP66P1HeyIc-dE",
  authDomain: "gen-lang-client-0273028698.firebaseapp.com",
  storageBucket: "gen-lang-client-0273028698.firebasestorage.app",
  messagingSenderId: "653980593713",
  measurementId: ""
};

firebase.initializeApp(firebaseConfig);
const messaging = firebase.messaging();

messaging.onBackgroundMessage((payload) => {
  console.log('[firebase-messaging-sw.js] Received background message ', payload);
  
  const notificationTitle = payload.notification?.title || 'Nueva notificación';
  const notificationOptions = {
    body: payload.notification?.body || 'Tienes un nuevo mensaje.',
    icon: '/icon-192-v3.png',
    badge: '/icon-192-v3.png',
    data: payload.data
  };

  self.registration.showNotification(notificationTitle, notificationOptions);
});
