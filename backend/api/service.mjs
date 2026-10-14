/**
 * What the API does. A handful of generic operations (get, create, update, remove, query and a few
 * helpers) that work on any collection in config.mjs, with the rules from that file checked on every call.
 * Storage is passed in, so the tests run this against memory-repo.mjs and the Lambda runs it on DynamoDB.
 *
 * Nothing here knows about HTTP. index.mjs turns a request into one of these calls and an HttpError into a status.
 */
import { randomUUID } from 'node:crypto';
import { COLLECTIONS, INTERNAL, MAX_ITEM_BYTES, MAX_QUERY_ITEMS } from './config.mjs';

export class HttpError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}
const bad = (m) => new HttpError(400, m);
const unauthorized = () => new HttpError(401, 'Sign in first.');
const forbidden = () => new HttpError(403, 'You are not allowed to do that.');

const isPlainObject = (v) => v && typeof v === 'object' && !Array.isArray(v);
const ROLES = new Set(['teacher', 'student']);
const idPattern = /^[A-Za-z0-9_#:.\-]{1,200}$/;

export function createService(repo, { now = () => new Date().toISOString(), newId = () => randomUUID().replace(/-/g, '').slice(0, 20) } = {}) {
  const defOf = (col) => {
    const d = COLLECTIONS[col];
    if (!d) throw bad('Unknown collection.');
    return d;
  };

  /** The storage key for a document id. A notification lives under the person it is for. */
  function keyFor(d, id, caller) {
    if (typeof id !== 'string' || !idPattern.test(id)) throw bad('Bad id.');
    if (d.sk) {
      if (!caller) throw unauthorized();
      return { [d.pk]: caller.uid, [d.sk]: id };
    }
    return { [d.pk]: id };
  }

  /** What the app receives: the document with an `id`, minus the fields that only exist for the database. */
  function toClient(d, item) {
    const out = { ...item };
    INTERNAL.forEach((f) => delete out[f]);
    const id = d.sk ? item[d.sk] : item[d.pk];
    if (!d.sk) delete out[d.pk];
    return { id, ...out };
  }

  /** Someone else's profile shows only the name. Your own shows everything. */
  function present(col, d, item, caller) {
    if (col === 'users' && !(caller && caller.uid === item.uid)) {
      return { id: item.uid, displayName: item.displayName || String(item.email || '').split('@')[0] || null };
    }
    return toClient(d, item);
  }

  /** A fresh context per request, so a parent document (a class) is read once however many children ask. */
  function makeCtx() {
    const cache = new Map();
    return {
      async get(col, id) {
        const k = `${col}/${id}`;
        if (!cache.has(k)) {
          const d = defOf(col);
          cache.set(k, d.sk ? null : await repo.get(d.table, { [d.pk]: id }));
        }
        return cache.get(k);
      },
    };
  }

  /** Attributes used as an index key may not be empty. An empty one means "not in that index", so drop it. */
  function cleanForIndexes(d, item) {
    const attrs = new Set();
    Object.values(d.indexes).forEach((ix) => { attrs.add(ix.pk); if (ix.sk) attrs.add(ix.sk); });
    attrs.forEach((a) => { if (item[a] === '' || item[a] === null) delete item[a]; });
  }

  function checkSize(item) {
    if (JSON.stringify(item).length > MAX_ITEM_BYTES) throw bad('That is too big to save. Remove some content and try again.');
  }

  /** Strip what a caller must never set: the database's own fields and the key. */
  function sanitizeInput(d, data) {
    if (!isPlainObject(data)) throw bad('Send an object.');
    const out = { ...data };
    INTERNAL.forEach((f) => delete out[f]);
    // The key is set by the server. For notifications the key's first half (userId) is a real field the caller supplies.
    if (d.sk) delete out[d.sk]; else delete out[d.pk];
    delete out.id;
    return out;
  }

  const setPath = (obj, path, value) => {
    const parts = String(path).split('.');
    if (parts.some((p) => !p || p === '__proto__' || p === 'constructor' || p === 'prototype')) throw bad('Bad field name.');
    let cur = obj;
    for (const p of parts.slice(0, -1)) { if (!isPlainObject(cur[p])) cur[p] = {}; cur = cur[p]; }
    cur[parts[parts.length - 1]] = value;
  };
  const unsetPath = (obj, path) => {
    const parts = String(path).split('.');
    let cur = obj;
    for (const p of parts.slice(0, -1)) { if (!isPlainObject(cur[p])) return; cur = cur[p]; }
    delete cur[parts[parts.length - 1]];
  };

  // ── Rules that need more than "who owns it" ────────────────────────────────────────

  /**
   * A result handed in by a student or a guest. The browser still does the marking (security.md, finding 2),
   * but the things that say WHOSE it is and WHAT it is for come from the server, so nobody can file a result
   * under another person or for another teacher's class, or claim more points than the quiz has.
   */
  async function checkNewResult(data, caller, ctx) {
    const userId = String(data.userId || '');
    if (!userId) throw bad('A result needs a userId.');
    if (caller) {
      if (userId !== caller.uid && !userId.startsWith('guest_')) throw forbidden();
    } else if (!userId.startsWith('guest_')) {
      throw unauthorized();
    }
    if (data.kind === 'daily') {
      if (!caller || userId !== caller.uid) throw forbidden();
      data.teacherId = '';
      return;
    }
    const quiz = await ctx.get('quizzes', String(data.quizId || ''));
    if (!quiz) throw bad('That quiz does not exist.');
    if (quiz.active !== true && !(caller && caller.uid === quiz.createdBy)) throw forbidden();
    data.teacherId = quiz.createdBy;
    data.quizTitle = quiz.title;
    const max = Number(quiz.totalPoints);
    if (Number.isFinite(max)) {
      data.maxScore = max;
      for (const f of ['score', 'finalScore']) {
        if (data[f] !== undefined) data[f] = Math.max(0, Math.min(Number(data[f]) || 0, max));
      }
    }
  }

  // ── Operations ─────────────────────────────────────────────────────────────────────

  const api = {
    async get({ col, id }, caller) {
      const d = defOf(col);
      const item = await repo.get(d.table, keyFor(d, id, caller));
      if (!item) return null;
      if (!(await d.rules.canRead(item, caller, makeCtx()))) throw forbidden();
      return present(col, d, item, caller);
    },

    async create({ col, data, id: wantedId }, caller) {
      const d = defOf(col);
      const ctx = makeCtx();
      const item = sanitizeInput(d, data);
      let id;
      if (col === 'users') {
        if (!caller) throw unauthorized();
        id = caller.uid;
        if (!ROLES.has(item.role)) throw bad('Role must be teacher or student.');
        if (!d.rules.canCreate(item, caller, id)) throw forbidden();
        // A profile that already exists (above all one copied from Firebase) is never overwritten by a sign up.
        if (await repo.get(d.table, { [d.pk]: id })) throw new HttpError(409, 'You already have a profile.');
      } else {
        if (!(await d.rules.canCreate(item, caller, null))) throw caller ? forbidden() : unauthorized();
        if (col === 'quiz_results') await checkNewResult(item, caller, ctx);
        if (col === 'notifications') {
          if (typeof item.userId !== 'string' || !item.userId) throw bad('A notification needs a userId.');
          id = `${now()}#${newId()}`;
          item.ttl = Math.floor(Date.parse(now()) / 1000) + 90 * 86400;   // DynamoDB deletes it by itself after 90 days (free)
        } else {
          id = newId();
        }
      }
      void wantedId;
      if (d.stamps[0]) item[d.stamps[0]] = now();
      if (col === 'quizzes' && item.active === true) item.activeKey = 'Y';
      item[d.pk] = col === 'notifications' ? item.userId : id;
      if (d.sk) item[d.sk] = id;
      cleanForIndexes(d, item);
      checkSize(item);
      await repo.put(d.table, item);
      return toClient(d, item);
    },

    /**
     * Change a document. `set` takes field names (a dotted name reaches into a map, "dueDates.q1"), `unset` removes
     * fields, `add` and `remove` put a value into or take it out of a list, and `stamp` fills the named
     * time fields with the server's clock.
     */
    async update({ col, id, set = {}, unset = [], add = {}, remove = {}, stamp = [] }, caller) {
      const d = defOf(col);
      const item = await repo.get(d.table, keyFor(d, id, caller));
      if (!item) throw new HttpError(404, 'Not found.');
      if (!(await d.rules.canUpdate(item, caller, makeCtx()))) throw caller ? forbidden() : unauthorized();
      if (!isPlainObject(set) || !isPlainObject(add) || !isPlainObject(remove) || !Array.isArray(unset) || !Array.isArray(stamp)) throw bad('Bad update.');

      const touched = [...Object.keys(set), ...unset, ...Object.keys(add), ...Object.keys(remove)].map((p) => String(p).split('.')[0]);
      for (const field of touched) {
        if (d.frozen.includes(field) || field === d.pk || field === d.sk || INTERNAL.includes(field)) throw forbidden();
      }
      if (col === 'users' && 'role' in set && !ROLES.has(set.role)) throw bad('Role must be teacher or student.');

      for (const [path, value] of Object.entries(set)) setPath(item, path, value);
      unset.forEach((path) => unsetPath(item, path));
      for (const [field, value] of Object.entries(add)) {
        const list = Array.isArray(item[field]) ? item[field] : [];
        if (!list.includes(value)) list.push(value);
        item[field] = list;
      }
      for (const [field, value] of Object.entries(remove)) {
        if (Array.isArray(item[field])) item[field] = item[field].filter((v) => v !== value);
      }
      for (const f of stamp) {
        if (!d.stamps.includes(f)) throw bad('That field is not a time stamp.');
        item[f] = now();
      }
      if (col === 'quizzes') { if (item.active === true) item.activeKey = 'Y'; else delete item.activeKey; }
      cleanForIndexes(d, item);
      checkSize(item);
      await repo.put(d.table, item);
      return present(col, d, item, caller);
    },

    async remove({ col, id }, caller) {
      const d = defOf(col);
      const key = keyFor(d, id, caller);
      const item = await repo.get(d.table, key);
      if (!item) return { removed: 0 };
      if (!(await d.rules.canDelete(item, caller, makeCtx()))) throw caller ? forbidden() : unauthorized();
      await repo.remove(d.table, key);
      return { removed: 1 };
    },

    async removeMany({ col, ids }, caller) {
      if (!Array.isArray(ids) || ids.length > 200) throw bad('Send up to 200 ids.');
      let removed = 0;
      for (const id of ids) removed += (await api.remove({ col, id }, caller)).removed;
      return { removed };
    },

    /**
     * Documents by one index. Every document is checked with the collection's read rule and the ones the caller
     * may not read are left out, so a query can never show more than a get would.
     * `filters` keeps only documents whose fields match (an array means "any of these").
     */
    async query({ col, index = null, value, order = 'asc', limit = MAX_QUERY_ITEMS, filters = {} }, caller) {
      const d = defOf(col);
      let spec;
      if (index) {
        spec = d.indexes[index];
        if (!spec) throw bad('Unknown index.');
      } else {
        spec = { pk: d.pk, sk: d.sk };
        if (d.sk && (!caller || value !== caller.uid)) throw caller ? forbidden() : unauthorized();
      }
      if (typeof value !== 'string' || !value) throw bad('Send the value to look up.');
      if (!isPlainObject(filters)) throw bad('Bad filters.');
      const ctx = makeCtx();
      const rows = await repo.query(d.table, {
        index: index || undefined, pkAttr: spec.pk, pkValue: value, skAttr: spec.sk,
        order: order === 'desc' ? 'desc' : 'asc', limit: Math.min(Number(limit) || MAX_QUERY_ITEMS, MAX_QUERY_ITEMS),
      });
      const out = [];
      for (const item of rows) {
        const match = Object.entries(filters).every(([k, v]) => (Array.isArray(v) ? v.includes(item[k]) : item[k] === v));
        if (!match) continue;
        if (!(await d.rules.canRead(item, caller, ctx))) continue;
        out.push(present(col, d, item, caller));
      }
      return out;
    },

    /** Quizzes by id, as { id: quiz }, leaving out the ones the caller cannot read. */
    async getMany({ col = 'quizzes', ids }, caller) {
      if (!Array.isArray(ids) || ids.length > 100) throw bad('Send up to 100 ids.');
      const d = defOf(col);
      if (d.sk) throw bad('Not supported for this collection.');
      const ctx = makeCtx();
      const found = {};
      for (const id of [...new Set(ids)].filter((x) => typeof x === 'string' && idPattern.test(x))) {
        const item = await repo.get(d.table, { [d.pk]: id });
        if (item && (await d.rules.canRead(item, caller, ctx))) found[id] = present(col, d, item, caller);
      }
      return found;
    },

    /** Who the data thinks you are. The app uses this id for everything, so a moved over account finds its old data. */
    async me(_args, caller) {
      if (!caller) throw unauthorized();
      // One plain line per sign in check, no personal data. CloudWatch metric filters count these (infra/lib/ops-stack.js).
      console.log(`EVT me legacy=${caller.legacy === true} verified=${!!caller.emailVerified}`);
      return { uid: caller.uid, legacy: caller.legacy === true };
    },

    /** Display names for a list of user ids. Guests have no profile, and a missing one is left out. */
    async names({ ids }, caller) {
      if (!caller) throw unauthorized();
      if (!Array.isArray(ids) || ids.length > 100) throw bad('Send up to 100 ids.');
      const out = {};
      for (const id of [...new Set(ids)].filter((x) => typeof x === 'string' && idPattern.test(x) && !x.startsWith('guest_'))) {
        const u = await repo.get('users', { uid: id });
        const name = u && (u.displayName || String(u.email || '').split('@')[0]);
        if (name) out[id] = name;
      }
      return out;
    },

    /** How many of these students have handed in at least one result for a quiz. Only that quiz's teacher may ask. */
    async completionCount({ quizId, studentIds }, caller) {
      if (!caller) throw unauthorized();
      if (!Array.isArray(studentIds) || studentIds.length > 500) throw bad('Send up to 500 student ids.');
      const rows = await repo.query('results', { index: 'byQuiz', pkAttr: 'quizId', pkValue: String(quizId), skAttr: 'completedAt', limit: MAX_QUERY_ITEMS });
      const wanted = new Set(studentIds);
      const done = new Set(rows.filter((r) => r.teacherId === caller.uid && wanted.has(r.userId)).map((r) => r.userId));
      return { count: done.size };
    },
  };
  return api;
}

export { ROLES };
