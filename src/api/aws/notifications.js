import { reviveAll, rpc } from './http';

/**
 * Notifications on AWS. Same functions as api/firebase/notifications.js.
 * There is no live listener here: the bell asks again every 20 seconds (and right away), which is plenty for
 * "your quiz was graded" and costs a tiny read each time.
 */

const POLL_MS = 20_000;

export const createNotification = async (userId, message, type, data = null) => {
  if (!userId) return;
  await rpc('create', { col: 'notifications', data: { userId, message, type, data, read: false } });
};

/** Calls `callback(list)` now and every 20 seconds, newest first. Returns a function that stops it. */
export const listenToNotifications = (userId, callback) => {
  if (!userId) return () => {};
  let stopped = false;
  const load = async () => {
    try {
      const list = reviveAll(await rpc('query', { col: 'notifications', value: userId, order: 'desc', limit: 100 }));
      if (!stopped) callback(list);
    } catch (err) {
      console.error('Error loading notifications:', err);
    }
  };
  load();
  const timer = setInterval(load, POLL_MS);
  return () => { stopped = true; clearInterval(timer); };
};

export const markAllNotificationsAsRead = async (userId) => {
  if (!userId) return;
  const list = await rpc('query', { col: 'notifications', value: userId, order: 'desc', limit: 100, filters: { read: false } });
  await Promise.all(list.map((n) => rpc('update', { col: 'notifications', id: n.id, set: { read: true } })));
};

export const markNotificationAsRead = async (notificationId) => {
  await rpc('update', { col: 'notifications', id: notificationId, set: { read: true } });
};
