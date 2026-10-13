/**
 * An in memory stand in for DynamoDB, for tests. It has the same four calls as repo.mjs and behaves the same
 * way for what the service relies on: a missing attribute keeps an item out of an index, results come back in
 * sort key order, and items are copied in and out so a caller cannot change stored data by accident.
 */
import { COLLECTIONS } from './config.mjs';

const clone = (x) => JSON.parse(JSON.stringify(x));
const byTable = Object.fromEntries(Object.values(COLLECTIONS).map((c) => [c.table, c]));

export function createMemoryRepo() {
  const tables = {};
  const rows = (t) => (tables[t] ||= new Map());
  const keyOf = (def, item) => (def.sk ? `${item[def.pk]}\u0000${item[def.sk]}` : String(item[def.pk]));

  return {
    async get(table, key) {
      const def = byTable[table];
      const found = rows(table).get(def.sk ? `${key[def.pk]}\u0000${key[def.sk]}` : String(key[def.pk]));
      return found ? clone(found) : null;
    },
    async put(table, item) {
      rows(table).set(keyOf(byTable[table], item), clone(item));
    },
    async remove(table, key) {
      const def = byTable[table];
      rows(table).delete(def.sk ? `${key[def.pk]}\u0000${key[def.sk]}` : String(key[def.pk]));
    },
    /** { index?, pkAttr, pkValue, skAttr?, order, limit } */
    async query(table, { pkAttr, pkValue, skAttr, order = 'asc', limit = 500 }) {
      let items = [...rows(table).values()].filter((i) => i[pkAttr] !== undefined && i[pkAttr] === pkValue);
      if (skAttr) items = items.filter((i) => i[skAttr] !== undefined);   // a missing sort key is not in the index
      if (skAttr) items.sort((a, b) => (a[skAttr] < b[skAttr] ? -1 : a[skAttr] > b[skAttr] ? 1 : 0));
      if (order === 'desc') items.reverse();
      return items.slice(0, limit).map(clone);
    },
    _dump: (table) => [...rows(table).values()].map(clone),
  };
}
