/**
 * Copying quizzes and keeping them in folders.
 *
 * Three features share this file:
 *   - Duplicate: a teacher copies one of their own quizzes.
 *   - Clone: a teacher copies somebody else's open quiz into their own account.
 *   - Folders: an optional text label on a quiz, used by Your quizzes to group the list.
 *
 * Duplicate and clone are the same operation with different options, so there is one
 * function, copyQuiz(). The helpers around it are plain functions with no React in them.
 * The database is passed in as `db` instead of imported, so this file does not pull in
 * firebase.js and the pure helpers can be tried in plain Node.
 *
 * Fields this file adds to a quiz document:
 *   folder          optional string, trimmed, at most 40 characters
 *   allowCloning    optional boolean, false means other teachers cannot clone it.
 *                   Missing means allowed.
 *   clonedFrom      id of the quiz this one was cloned from (clones only)
 *
 * The Firestore rules let any signed in user create a quiz and only the owner update it,
 * so none of this needs a rule change. Note that allowCloning is a courtesy switch kept
 * in the app, not a lock: a quiz that is open to play can be read by anyone.
 */
import { addDoc, collection, getDocs, limit, query, serverTimestamp, where } from 'firebase/firestore';

// ── Join codes ──────────────────────────────────────────────────────────────────────

/** The longest a folder name can be. */
export const FOLDER_MAX = 40;

/**
 * A fresh six character join code. This is the same generator CreateQuiz uses: shuffle the
 * letters and digits and take six, so a code never repeats a character.
 */
export function makeJoinCode() {
  return 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'.split('').sort(() => 0.5 - Math.random()).join('').slice(0, 6);
}

/**
 * A join code that no visible quiz already uses.
 *
 * We can only ask about quizzes we are allowed to read: every open (active) quiz, and the
 * teacher's own. A draft that belongs to another teacher is invisible to us, so in theory
 * a code could still repeat once that draft is opened. With 36 letters and digits over six
 * places that is about one in two billion, and joining only looks at open quizzes.
 */
export async function uniqueJoinCode(db, ownerId, tries = 8) {
  for (let i = 0; i < tries; i++) {
    const code = makeJoinCode();
    const [open, mine] = await Promise.all([
      getDocs(query(collection(db, 'quizzes'), where('code', '==', code), where('active', '==', true), limit(1))),
      getDocs(query(collection(db, 'quizzes'), where('code', '==', code), where('createdBy', '==', ownerId), limit(1))),
    ]);
    if (open.empty && mine.empty) return code;
  }
  throw new Error('We could not find a free join code. Please try again.');
}

// ── Folders ─────────────────────────────────────────────────────────────────────────

/** What gets saved as a folder: trimmed, cut to FOLDER_MAX. An empty result means "no folder". */
export function normalizeFolder(value) {
  return String(value ?? '').trim().slice(0, FOLDER_MAX).trim();
}

/** The teacher's folder names, each once, in alphabetical order. Quizzes with none are skipped. */
export function folderNames(quizzes) {
  const set = new Set();
  for (const q of quizzes || []) {
    const f = normalizeFolder(q?.folder);
    if (f) set.add(f);
  }
  return [...set].sort((a, b) => a.localeCompare(b));
}

/**
 * If the teacher types "maths" and a folder called "Maths" exists, use "Maths". Otherwise
 * the list would grow near duplicates that look the same but filter separately.
 */
export function matchExistingFolder(value, existing) {
  const clean = normalizeFolder(value);
  if (!clean) return '';
  return (existing || []).find((f) => f.toLowerCase() === clean.toLowerCase()) || clean;
}

/**
 * Group quizzes under folder headings. Named folders come first in alphabetical order and
 * "Unfiled" (folder: null) comes last. Empty groups are left out. Inside a group the
 * quizzes keep the order they came in (newest first on the page).
 * @param filter  'all', 'unfiled', or a folder name
 * @returns {{ folder: string | null, quizzes: object[] }[]}
 */
export function groupByFolder(quizzes, filter = 'all') {
  const groups = new Map();
  for (const q of quizzes || []) {
    const f = normalizeFolder(q?.folder) || null;
    if (filter === 'unfiled' && f !== null) continue;
    if (filter !== 'all' && filter !== 'unfiled' && f !== filter) continue;
    if (!groups.has(f)) groups.set(f, []);
    groups.get(f).push(q);
  }
  const named = [...groups.keys()].filter((f) => f !== null).sort((a, b) => a.localeCompare(b));
  const order = groups.has(null) ? [...named, null] : named;
  return order.map((folder) => ({ folder, quizzes: groups.get(folder) }));
}

// ── Copying ─────────────────────────────────────────────────────────────────────────

/** Is this quiz open to being cloned by other teachers? A missing field means yes. */
export const cloningAllowed = (quiz) => quiz?.allowCloning !== false;

/** A deep copy, so editing the copy can never touch the original's questions or media. */
const deepCopy = (v) => JSON.parse(JSON.stringify(v));

/**
 * The fields a copy keeps from its source. Results, join code, owner and dates are never
 * copied. Firestore rejects `undefined`, so the JSON round trip also drops missing fields.
 */
export function copyFields(source, { titleSuffix = '', keepFolder = false } = {}) {
  const fields = {
    title: `${source.title || 'Untitled quiz'}${titleSuffix}`,
    description: source.description || '',
    subject: source.subject || '',
    tags: source.tags || [],
    quizType: source.quizType || 'MIXED',
    questions: source.questions || [],
    totalPoints: source.totalPoints || 0,
  };
  if (keepFolder && normalizeFolder(source.folder)) fields.folder = normalizeFolder(source.folder);
  return deepCopy(fields);
}

/**
 * Copy a quiz into a teacher's account. One function for both features.
 *
 * Duplicate:  copyQuiz({ db, source, user, titleSuffix: ' (copy)', keepFolder: true })
 * Clone:      copyQuiz({ db, source, user, clone: true })
 *
 * The copy is always a draft (active: false), so nothing goes live by accident, and it
 * gets its own join code and an empty results history.
 *
 * @param db          the Firestore instance
 * @param source      the quiz document, with its id
 * @param user        { uid, name } the new owner
 * @param titleSuffix text added after the title, '' for none
 * @param keepFolder  carry the folder over (a duplicate does, a clone must not)
 * @param clone       true when the source belongs to someone else. Records clonedFrom, and
 *                    refuses a quiz that is the teacher's own or has cloning switched off.
 * @returns {Promise<{ id: string, code: string, title: string }>}
 */
export async function copyQuiz({ db, source, user, titleSuffix = '', keepFolder = false, clone = false }) {
  if (!source || !user?.uid) throw new Error('There is nothing to copy.');
  if (clone) {
    if (source.createdBy === user.uid) throw new Error('This is already your quiz. Use Duplicate instead.');
    if (!cloningAllowed(source)) throw new Error('The author does not allow this quiz to be cloned.');
  }

  const code = await uniqueJoinCode(db, user.uid);
  const data = {
    ...copyFields(source, { titleSuffix, keepFolder }),
    code,
    createdBy: user.uid,
    username: user.name || 'Teacher',
    createdAt: serverTimestamp(),
    active: false,
  };
  if (clone) {
    data.clonedFrom = source.id;
  } else if (source.allowCloning === false) {
    data.allowCloning = false;       // a duplicate of a quiz you locked stays locked
  }

  const ref = await addDoc(collection(db, 'quizzes'), data);
  return { id: ref.id, code, title: data.title };
}
