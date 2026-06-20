import {
  collection,
  addDoc,
  getDocs,
  query,
  where,
  orderBy,
  onSnapshot,
  writeBatch,
  serverTimestamp,
  doc,
  updateDoc,
} from 'firebase/firestore';
import { db } from '../firebase';

/** Create a new notification for a specific user. */
export const createNotification = async (userId, message, type, data = null) => {
  if (!userId) return;
  await addDoc(collection(db, 'notifications'), {
    userId,
    message,
    type, // e.g., 'grading', 'grade_released'
    data, // e.g., { quizId, resultId }
    read: false,
    createdAt: serverTimestamp(),
  });
};

/** Listen to real-time notification updates for a specific user. */
export const listenToNotifications = (userId, callback) => {
  if (!userId) return () => {};
  const q = query(
    collection(db, 'notifications'),
    where('userId', '==', userId),
    orderBy('createdAt', 'desc')
  );
  return onSnapshot(
    q,
    (snap) => {
      const list = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      callback(list);
    },
    (err) => {
      console.error('Error listening to notifications:', err);
    }
  );
};

/** Mark all unread notifications for a user as read. */
export const markAllNotificationsAsRead = async (userId) => {
  if (!userId) return;
  const q = query(
    collection(db, 'notifications'),
    where('userId', '==', userId),
    where('read', '==', false)
  );
  const snap = await getDocs(q);
  if (snap.empty) return;

  const batch = writeBatch(db);
  snap.docs.forEach((d) => {
    batch.update(d.ref, { read: true });
  });
  await batch.commit();
};

/** Mark a single notification as read by its document ID. */
export const markNotificationAsRead = async (notificationId) => {
  await updateDoc(doc(db, 'notifications', notificationId), { read: true });
};
