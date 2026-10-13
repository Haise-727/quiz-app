import {
  collection,
  addDoc,
  getDocs,
  query,
  where,
  onSnapshot,
  writeBatch,
  serverTimestamp,
  doc,
  updateDoc,
} from 'firebase/firestore';
import { db } from '@/firebase';

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
  // No orderBy here on purpose. Firestore needs a composite index for
  // where('userId') plus orderBy('createdAt'), and this project has never had that
  // index, so the listener failed with "The query requires an index" and the bell
  // never showed anything. Sorting in the browser avoids it, and one user's
  // notifications are a short list.
  const q = query(
    collection(db, 'notifications'),
    where('userId', '==', userId)
  );
  return onSnapshot(
    q,
    (snap) => {
      const list = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      // A notification just created on this device has no server time yet
      // (createdAt reads as null), so treat it as the newest.
      const when = (n) => n.createdAt?.toMillis?.() ?? Date.now();
      list.sort((a, b) => when(b) - when(a));
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
