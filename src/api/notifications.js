import { USE_AWS } from './backend';
import * as fb from './firebase/notifications';
import * as aws from './aws/notifications';

/**
 * Chooses the backend for this file's functions: AWS when the app was built with VITE_BACKEND=aws, Firebase otherwise.
 * See api/README.md. The two files behind it have the same functions, and the page code never knows which one it got.
 */
const impl = USE_AWS ? aws : fb;

export const createNotification = (...args) => impl.createNotification(...args);
export const listenToNotifications = (...args) => impl.listenToNotifications(...args);
export const markAllNotificationsAsRead = (...args) => impl.markAllNotificationsAsRead(...args);
export const markNotificationAsRead = (...args) => impl.markNotificationAsRead(...args);
