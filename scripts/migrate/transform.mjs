/**
 * Turns one Firestore document into one DynamoDB item. Pure: no network, no Firebase, no AWS, so it is tested on its own
 * (scripts/migrate/migrate.test.mjs). The shapes follow backend/api/config.mjs, which is what the API reads.
 *
 * Document ids are kept, so every reference between documents (a result's quizId, a class's quizIds) stays valid and
 * people keep their old Firebase user id (backend/api/identity.mjs matches them to their new sign in by email).
 */
import { COLLECTIONS, MAX_ITEM_BYTES } from '../../backend/api/config.mjs';

const EPOCH = '1970-01-01T00:00:00.000Z';

/** Firestore values that DynamoDB cannot store as they are, turned into plain ones. */
export function plain(value) {
  if (value === undefined || value === null) return value === null ? null : undefined;
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value !== 'object') return value;
  if (typeof value.toDate === 'function') {                       // Firestore Timestamp
    const d = value.toDate();
    return Number.isNaN(d.getTime()) ? null : d.toISOString();
  }
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value.toISOString();
  if (typeof Buffer !== 'undefined' && Buffer.isBuffer(value)) return value.toString('base64');
  if (typeof value.latitude === 'number' && typeof value.longitude === 'number') return { latitude: value.latitude, longitude: value.longitude };
  if (typeof value.path === 'string' && typeof value.id === 'string' && typeof value.firestore === 'object') return value.path;   // a reference
  if (Array.isArray(value)) return value.map((v) => { const p = plain(v); return p === undefined ? null : p; });
  const out = {};
  for (const [k, v] of Object.entries(value)) {
    const p = plain(v);
    if (p !== undefined) out[k] = p;
  }
  return out;
}

const iso = (v, fallback = EPOCH) => (typeof v === 'string' && !Number.isNaN(Date.parse(v)) ? v : fallback);

/** DynamoDB will not accept an empty string as an index key. An empty one just means "not in that index". */
function dropEmptyIndexKeys(def, item) {
  const attrs = new Set();
  Object.values(def.indexes).forEach((ix) => { attrs.add(ix.pk); if (ix.sk) attrs.add(ix.sk); });
  attrs.forEach((a) => { if (item[a] === '' || item[a] === null) delete item[a]; });
}

/**
 * @param collection  the Firestore collection name (a key of COLLECTIONS)
 * @param id          the document id
 * @param data        the document data as Firestore returned it
 * @returns { table, item } on success, or { skip: reason }
 */
export function transformDoc(collection, id, data) {
  const def = COLLECTIONS[collection];
  if (!def) return { skip: `unknown collection ${collection}` };
  if (!data || typeof data !== 'object') return { skip: 'empty document' };
  const doc = plain(data);
  const stamps = Object.fromEntries(def.stamps.map((f) => [f, iso(doc[f])]));
  let item;

  switch (collection) {
    case 'users': {
      const email = typeof doc.email === 'string' ? doc.email.trim() : '';
      item = { ...doc, uid: id, ...(email ? { legacy: true, legacyEmail: email.toLowerCase() } : {}) };
      break;
    }
    case 'quizzes':
      item = { ...doc, ...stamps, quizId: id };
      if (!item.createdBy) return { skip: 'quiz with no createdBy' };
      if (doc.active === true) item.activeKey = 'Y';
      break;
    case 'quiz_results':
      item = { ...doc, ...stamps, resultId: id };
      if (!item.userId) return { skip: 'result with no userId' };
      break;
    case 'classes':
      item = { ...doc, ...stamps, classId: id };
      if (!item.teacherId) return { skip: 'class with no teacherId' };
      break;
    case 'class_enrollments':
      item = { ...doc, ...stamps, enrollmentId: id };
      if (!item.classId || !item.studentId) return { skip: 'enrolment with no class or student' };
      break;
    case 'question_bank':
      item = { ...doc, ...stamps, itemId: id };      // the saved question has its own `id` field inside; it is kept as data
      if (!item.teacherId) return { skip: 'bank question with no teacherId' };
      break;
    case 'notifications':
      if (!doc.userId) return { skip: 'notification with no userId' };
      item = { ...doc, ...stamps, userId: doc.userId, createdAtId: `${stamps.createdAt}#${id}` };
      break;
    default:
      return { skip: 'unhandled' };
  }

  dropEmptyIndexKeys(def, item);
  const bytes = Buffer.byteLength(JSON.stringify(item));
  if (bytes > MAX_ITEM_BYTES) return { skip: `too big for DynamoDB (${Math.round(bytes / 1024)} KB)` };
  return { table: def.table, item, bytes };
}

/**
 * Write units one item uses, per table or index: its size in KB (rounded up) for the table, and again for every
 * index it appears in. Used to pace the import so the small free capacity is never exceeded.
 */
export function writeCost(collection, item, bytes) {
  const def = COLLECTIONS[collection];
  const kb = Math.max(1, Math.ceil(bytes / 1024));
  const cost = { [def.table]: kb };
  for (const [name, ix] of Object.entries(def.indexes)) {
    if (item[ix.pk] !== undefined && (!ix.sk || item[ix.sk] !== undefined)) cost[`${def.table}/${name}`] = kb;
  }
  return cost;
}
