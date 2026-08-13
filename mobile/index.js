import { configureNotificationBootstrap } from './src/services/notificationBootstrap';

configureNotificationBootstrap();

// This import must run after Firebase/notification background registration.
// eslint-disable-next-line import/first
import 'expo-router/entry';
