/**
 * One DynamoDB table for everything ("single table design"), behind the same four calls the service already uses
 * (get, put, remove, query with an index name). Nothing above this file changed when we moved to it.
 *
 * Why: in DynamoDB's free allowance every table and every index costs at least 1 of only 25 capacity units. Seven
 * tables with twelve indexes used all 25. One table with three shared indexes uses 9 and leaves 16 for other projects.
 *
 * How a document is stored (the logical table name is kept as a prefix, so nothing collides):
 *   pk  "<table>#<id>"                 for notifications "<table>#<userId>"
 *   sk  "#"                            for notifications its createdAtId
 *   gNpk / gNsk                        one of three shared indexes (g1, g2, g3), filled per logical index below
 *   _t  the logical table name         so a full read can be split back into collections
 * The document's own fields are stored unchanged next to these, and the extra fields are removed on the way out.
 */
import { COLLECTIONS } from './config.mjs';

export const MAIN_SLOTS = ['g1', 'g2', 'g3'];
const INTERNAL = ['pk', 'sk', '_t', ...MAIN_SLOTS.flatMap((g) => [`${g}pk`, `${g}sk`])];

/** Which shared index carries which logical index. Each logical table uses each slot at most once. */
export const SLOTS = {
  users: { byLegacyEmail: 'g3' },
  quizzes: { byOwner: 'g1', byActive: 'g2', byCode: 'g3' },
  results: { byUser: 'g1', byQuiz: 'g2', byTeacher: 'g3' },
  classes: { byTeacher: 'g1', byCode: 'g3' },
  enrollments: { byClass: 'g1', byStudent: 'g2' },
  questionBank: { byTeacher: 'g1' },
  notifications: {},
};

const DEFS = Object.fromEntries(Object.values(COLLECTIONS).map((d) => [d.table, d]));
const def = (table) => { const d = DEFS[table]; if (!d) throw new Error(`unknown table ${table}`); return d; };
const present = (v) => v !== undefined && v !== null && v !== '';

/** The stored key for a logical key. */
export function storedKey(table, key) {
  const d = def(table);
  return { pk: `${table}#${key[d.pk]}`, sk: d.sk ? String(key[d.sk]) : '#' };
}

/** The value a shared index is searched by, for one logical index and one lookup value. */
export const indexValue = (table, index, value) => `${table}#${index}#${value}`;

/** A logical item as it is stored: key, the shared index fields it belongs in, and the table name. */
export function toStored(table, item) {
  const d = def(table);
  const out = { ...item, ...storedKey(table, item), _t: table };
  for (const [index, slot] of Object.entries(SLOTS[table] || {})) {
    const ix = d.indexes[index];
    // Same rule as a real index: a document without the key (or, when the index sorts, without the sort value) is not in it.
    if (!ix || !present(item[ix.pk]) || (ix.sk && !present(item[ix.sk]))) continue;
    out[`${slot}pk`] = indexValue(table, index, item[ix.pk]);
    out[`${slot}sk`] = ix.sk ? String(item[ix.sk]) : '#';
  }
  return out;
}

/** The logical item back, without the storage fields. */
export function fromStored(stored) {
  if (!stored) return null;
  const out = { ...stored };
  INTERNAL.forEach((f) => delete out[f]);
  return out;
}

/**
 * The repo the service uses, over a low level store with these calls:
 *   get(pk, sk) -> stored | null      put(stored)      remove(pk, sk)
 *   query({ index: 'g1' | null, keyName, keyValue, forward, limit }) -> stored[] in sort order
 */
export function createSingleTableRepo(store) {
  return {
    async get(table, key) {
      const k = storedKey(table, key);
      return fromStored(await store.get(k.pk, k.sk));
    },
    async put(table, item) {
      await store.put(toStored(table, item));
    },
    async remove(table, key) {
      const k = storedKey(table, key);
      await store.remove(k.pk, k.sk);
    },
    async query(table, { index, pkValue, order = 'asc', limit = 500 }) {
      const forward = order !== 'desc';
      if (!index) {
        const rows = await store.query({ index: null, keyName: 'pk', keyValue: `${table}#${pkValue}`, forward, limit });
        return rows.map(fromStored);
      }
      const slot = SLOTS[table]?.[index];
      if (!slot) throw new Error(`no shared index for ${table}.${index}`);
      const rows = await store.query({ index: slot, keyName: `${slot}pk`, keyValue: indexValue(table, index, pkValue), forward, limit });
      return rows.map(fromStored);
    },
  };
}

/** An in memory store with the same rules as DynamoDB, for tests. */
export function createMemoryStore() {
  const rows = new Map();          // `${pk}\u0000${sk}` -> stored
  const clone = (x) => JSON.parse(JSON.stringify(x));
  return {
    rows,
    async get(pk, sk) { const r = rows.get(`${pk}\u0000${sk}`); return r ? clone(r) : null; },
    async put(stored) { rows.set(`${stored.pk}\u0000${stored.sk}`, clone(stored)); },
    async remove(pk, sk) { rows.delete(`${pk}\u0000${sk}`); },
    async query({ index, keyName, keyValue, forward, limit }) {
      const skName = index ? `${index}sk` : 'sk';
      const found = [...rows.values()].filter((r) => r[keyName] === keyValue && r[skName] !== undefined);
      found.sort((a, b) => (a[skName] < b[skName] ? -1 : a[skName] > b[skName] ? 1 : 0));
      if (!forward) found.reverse();
      return found.slice(0, limit).map(clone);
    },
  };
}
