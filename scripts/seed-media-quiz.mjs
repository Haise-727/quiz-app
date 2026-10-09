#!/usr/bin/env node
/**
 * Seeds a throwaway quiz that has media in every slot the app supports, using
 * exactly the same steps the browser takes:
 *
 *   1. GET /api/auth            -> a short lived signed token from our Vercel function
 *   2. POST to ImageKit upload  -> the file is stored, ImageKit returns url / fileId / fileType
 *   3. save { url, fileId, fileType } into the question, then write the quiz to Firestore
 *
 * Why it exists: media bugs only show up with real files. Pointing this at a
 * folder of stock images, audio and video proves the whole pipeline (signer,
 * upload, stored shape, every page that renders media) without clicking
 * through the quiz editor by hand.
 *
 * Usage (Node 18 or newer, no dependencies):
 *
 *   node scripts/seed-media-quiz.mjs --dir ./some-media-folder
 *   node scripts/seed-media-quiz.mjs --cleanup
 *
 * What it touches, and how it cleans up:
 *   - creates one throwaway teacher account (random email and password)
 *   - creates one quiz owned by that account, marked "temporary"
 *   - uploads the files to the ImageKit folder /quiz-app-media-test
 *   --cleanup deletes everything that account ended up owning, not just the
 *   seeded quiz: every quiz it created (for example through the editor), its
 *   question bank items, the quiz results written against its quizzes, any live
 *   games it hosted, and then the account itself.
 *   It CANNOT delete the ImageKit files (that needs the private key, which only
 *   lives in Vercel), so it prints how many there are. Delete the
 *   /quiz-app-media-test folder in the ImageKit dashboard. The users/<uid>
 *   profile document also stays, because the Firestore rules forbid deleting
 *   profiles. Remove it in the Firebase console.
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

// ---------------------------------------------------------------- arguments
const args = process.argv.slice(2);
const flag = (name, fallback) => {
  const i = args.indexOf(`--${name}`);
  return i === -1 ? fallback : (args[i + 1] && !args[i + 1].startsWith('--') ? args[i + 1] : true);
};
const MEDIA_DIR = path.resolve(flag('dir', path.join(ROOT, 'scripts', 'sample-media')));
const STATE_FILE = flag('state', path.join(os.tmpdir(), 'quizlike-seed-state.json'));
const UPLOAD_FOLDER = '/quiz-app-media-test';
const LEGACY = args.includes('--legacy');

// ------------------------------------------------------------------- config
/** Read VITE_* values from .env.local so this script never holds its own copy. */
async function loadEnv() {
  const text = await fs.readFile(path.join(ROOT, '.env.local'), 'utf8').catch(() => '');
  const env = {};
  for (const line of text.split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m) env[m[1]] = m[2];
  }
  return env;
}
const env = await loadEnv();
const need = (k) => { if (!env[k]) throw new Error(`Missing ${k} in .env.local`); return env[k]; };

const API_KEY = need('VITE_FIREBASE_API_KEY');
const PROJECT = need('VITE_FIREBASE_PROJECT_ID');
const IK_PUBLIC_KEY = need('VITE_PUBLIC_KEY');
// The signer is the deployed Vercel function. Override to test a preview deploy.
const SIGNER_URL = process.env.SIGNER_URL || 'https://quizlike.vercel.app/api/auth';

const FS = `https://firestore.googleapis.com/v1/projects/${PROJECT}/databases/(default)/documents`;
const AUTH = 'https://identitytoolkit.googleapis.com/v1';

// ------------------------------------------------------------- small helpers
const MIME = {
  '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp',
  '.gif': 'image/gif', '.mp3': 'audio/mpeg', '.wav': 'audio/wav', '.m4a': 'audio/mp4',
  '.ogg': 'audio/ogg', '.mp4': 'video/mp4', '.webm': 'video/webm',
};

async function http(url, opts = {}) {
  const res = await fetch(url, opts);
  const text = await res.text();
  let body; try { body = JSON.parse(text); } catch { body = text; }
  if (!res.ok) throw new Error(`${opts.method || 'GET'} ${url.split('?')[0]} -> ${res.status} ${typeof body === 'string' ? body.slice(0, 200) : JSON.stringify(body).slice(0, 300)}`);
  return body;
}

/** Firestore's REST API wants every value wrapped with its type. */
function toValue(v) {
  if (v === null || v === undefined) return { nullValue: null };
  if (typeof v === 'string') return { stringValue: v };
  if (typeof v === 'boolean') return { booleanValue: v };
  if (typeof v === 'number') return Number.isInteger(v) ? { integerValue: String(v) } : { doubleValue: v };
  if (v instanceof Date) return { timestampValue: v.toISOString() };
  if (Array.isArray(v)) return { arrayValue: { values: v.map(toValue) } };
  return { mapValue: { fields: Object.fromEntries(Object.entries(v).map(([k, x]) => [k, toValue(x)])) } };
}
const toFields = (obj) => Object.fromEntries(Object.entries(obj).map(([k, v]) => [k, toValue(v)]));

// ------------------------------------------------------------- account steps
async function signUp(email, password) {
  return http(`${AUTH}/accounts:signUp?key=${API_KEY}`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email, password, returnSecureToken: true }),
  });
}
async function signIn(email, password) {
  return http(`${AUTH}/accounts:signInWithPassword?key=${API_KEY}`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email, password, returnSecureToken: true }),
  });
}

// ------------------------------------------------------------- upload step
/** Mirrors CreateQuiz.jsx: ask our function for a signed token, then upload to ImageKit. */
async function uploadToImageKit(filePath) {
  const signer = await http(SIGNER_URL);
  const name = path.basename(filePath);
  const bytes = await fs.readFile(filePath);
  const form = new FormData();
  form.append('file', new Blob([bytes], { type: MIME[path.extname(name).toLowerCase()] || 'application/octet-stream' }), name);
  form.append('fileName', `quiz-media_${Date.now()}_${name}`); // same naming as the editor
  form.append('folder', UPLOAD_FOLDER);
  form.append('publicKey', IK_PUBLIC_KEY);
  form.append('signature', signer.signature);
  form.append('expire', String(signer.expire));
  form.append('token', signer.token);
  const r = await http('https://upload.imagekit.io/api/v1/files/upload', { method: 'POST', body: form });
  // This is the exact object the editor stores on a question: no more, no less.
  // ImageKit calls every audio and video file "non-image". The editor now stores
  // the real kind taken from the file's MIME type, and so do we. Pass --legacy to
  // keep ImageKit's raw value instead, which is what quizzes saved before that
  // change contain, so the old data shape can be tested too.
  const major = (MIME[path.extname(name).toLowerCase()] || '').split('/')[0];
  const fileType = !LEGACY && ['image', 'video', 'audio'].includes(major) ? major : r.fileType;
  return { url: r.url, fileId: r.fileId, fileType };
}

// -------------------------------------------------------------- quiz builder
/**
 * One question for every type, with media in every slot the editor offers:
 * question media, option media, match prompt/answer media, categorize and
 * reorder item media, and the main media of both comprehension types.
 */
function buildQuestions(M) {
  const base = Date.now();
  let n = 0;
  const id = () => base + (n++);                 // numeric ids, like the editor
  const qid = () => `q_${base}_${crypto.randomBytes(4).toString('hex')}`;
  const need = (f) => { if (!M[f]) throw new Error(`The media folder has no "${f}"`); return M[f]; };
  const mcq = (text, correctIndex, options, extra = {}) => {
    const opts = options.map(([t, media]) => ({ id: id(), text: t, media: media || null }));
    return { id: qid(), type: 'MCQ', questionText: text, points: 10, timeLimit: 20, media: null,
             mcqData: { options: opts, correctOptions: [opts[correctIndex].id] }, ...extra };
  };
  const sub = (text, correctIndex, options) => {
    const opts = options.map((t) => ({ id: id(), text: t, media: null }));
    return { id: qid(), type: 'MCQ', questionText: text, points: 10, timeLimit: 60, media: null,
             mcqData: { options: opts, correctOptions: [opts[correctIndex].id] } };
  };
  const landscape = need('photo-landscape.jpg');
  const portrait = need('photo-portrait.jpg');
  const png = need('diagram-transparent.png');
  const webp = need('pic.webp');
  const oddName = need('name with spaces & café.jpg');

  const cat1 = id(); const cat2 = id();
  return [
    // 1. Question image plus an image on every option (jpg, png with alpha, webp, odd file name)
    mcq('Q1 image on the question and on each option. Pick option B.', 1,
      [['A (webp)', webp], ['B (png, transparent)', png], ['C (file name with spaces)', oddName]],
      { media: landscape }),
    // 2. Video on the question
    mcq('Q2 video on the question (mp4). Pick the first option.', 0, [['First'], ['Second']], { media: need('clip.mp4') }),
    // 3. Audio on a True/False question
    { id: qid(), type: 'TRUE_FALSE', questionText: 'Q3 audio on the question (mp3). The answer is True.', points: 10,
      timeLimit: 20, media: need('tone.mp3'), trueFalseData: { correctAnswer: true } },
    // 4. WebM video on a fill in the blank
    { id: qid(), type: 'FILL_IN_THE_BLANK', questionText: 'Q4 webm video. Type: tone', points: 10, timeLimit: 20,
      media: need('clip.webm'), fillBlankData: { answers: [{ text: 'tone' }], caseSensitive: false } },
    // 5. Match: media on both the prompt and the answer side
    { id: qid(), type: 'MATCH_THE_FOLLOWING', questionText: 'Q5 match each prompt with its answer', points: 20, timeLimit: 40, media: null,
      matchData: { pairs: [
        { id: id(), prompt: 'Portrait', promptMedia: portrait, answer: 'A person', answerMedia: png },
        { id: id(), prompt: 'Landscape', promptMedia: landscape, answer: 'A place', answerMedia: null },
        { id: id(), prompt: 'Circle', promptMedia: null, answer: 'A shape', answerMedia: webp },
      ] } },
    // 6. Categorize with item images
    { id: qid(), type: 'CATEGORIZE', questionText: 'Q6 sort the items into the right group', points: 20, timeLimit: 40, media: null,
      categorizeData: { categories: [{ id: cat1, name: 'Photos' }, { id: cat2, name: 'Drawings' }], items: [
        { id: id(), text: 'Coast', categoryId: cat1, media: landscape },
        { id: id(), text: 'Portrait', categoryId: cat1, media: portrait },
        { id: id(), text: 'Circle', categoryId: cat2, media: png },
      ] } },
    // 7. Reorder with item images
    { id: qid(), type: 'REORDER', questionText: 'Q7 put these in order: portrait, landscape, circle', points: 20, timeLimit: 40, media: null,
      reorderData: { items: [
        { id: id(), text: 'Portrait', media: portrait },
        { id: id(), text: 'Landscape', media: landscape },
        { id: id(), text: 'Circle', media: png },
      ] } },
    // 8. Visual comprehension: one image, two sub questions
    { id: qid(), type: 'VISUAL_COMPREHENSION', questionText: 'Q8 look at the picture, then answer both questions', points: 20, timeLimit: 45, media: null,
      visualData: { mainMedia: landscape, subQuestions: [
        sub('Q8a Is this picture a photograph?', 0, ['Yes', 'No']),
        sub('Q8b Which is the better caption?', 1, ['A portrait', 'A landscape']),
      ] } },
    // 9. Listening comprehension with AUDIO: two sub questions
    { id: qid(), type: 'LISTENING_COMPREHENSION', questionText: 'Q9 listen to the clip (m4a), then answer both questions', points: 20, timeLimit: 45, media: null,
      listeningData: { mainMedia: need('clip.m4a'), subQuestions: [
        sub('Q9a Was that a spoken voice?', 1, ['Yes', 'No, a tone']),
        sub('Q9b Was the clip short?', 0, ['Yes', 'No']),
      ] } },
    // 10. Listening comprehension with VIDEO and a short limit: three sub questions.
    //     The clip is longer than the time limit on purpose, to exercise the live timer rule.
    { id: qid(), type: 'LISTENING_COMPREHENSION', questionText: 'Q10 watch the clip (mp4), then answer all three', points: 30, timeLimit: 5, media: null,
      listeningData: { mainMedia: need('clip.mp4'), subQuestions: [
        sub('Q10a Did it contain a picture?', 0, ['Yes', 'No']),
        sub('Q10b Did it contain sound?', 0, ['Yes', 'No']),
        sub('Q10c Did it end?', 0, ['Yes', 'No']),
      ] } },
    // 11 and 12. Other audio containers, to check the renderer recognises them
    mcq('Q11 wav audio. Pick the first option.', 0, [['First'], ['Second']], { media: need('clip.wav') }),
    mcq('Q12 ogg audio. Pick the first option.', 0, [['First'], ['Second']], { media: need('clip.ogg') }),
    // 13. Paragraph with an image, for the manual grading page
    { id: qid(), type: 'PARAGRAPH', questionText: 'Q13 describe this image in a sentence', points: 10, timeLimit: 60,
      media: png, paragraphData: { keywords: [{ text: 'circle' }] } },
  ];
}

// -------------------------------------------------------------------- seed
async function seed() {
  const files = (await fs.readdir(MEDIA_DIR)).filter((f) => MIME[path.extname(f).toLowerCase()]);
  if (!files.length) throw new Error(`No media files found in ${MEDIA_DIR}`);
  console.log(`Found ${files.length} media files in ${MEDIA_DIR}`);

  // 1. throwaway teacher account
  const email = `qa.teacher.${crypto.randomBytes(4).toString('hex')}@example.com`;
  const password = crypto.randomBytes(12).toString('base64url');
  const account = await signUp(email, password);
  const uid = account.localId;
  const headers = { 'content-type': 'application/json', authorization: `Bearer ${account.idToken}` };
  console.log(`Created account ${email} (uid ${uid})`);

  // The app reads the role from users/<uid>, so write the profile the way signup does.
  const now = new Date().toISOString();
  await http(`${FS}/users/${uid}`, { method: 'PATCH', headers, body: JSON.stringify({ fields: toFields({
    email, role: 'teacher', displayName: 'QA Teacher (temporary)', createdAt: now, lastActive: now }) }) });

  // 2. upload every file, the way the editor does
  const media = {}; const fileIds = [];
  for (const f of files) {
    media[f] = await uploadToImageKit(path.join(MEDIA_DIR, f));
    fileIds.push(media[f].fileId);
    console.log(`  uploaded ${f.padEnd(34)} fileType=${media[f].fileType.padEnd(9)} ${media[f].url}`);
  }

  // 3. write the quiz
  const questions = buildQuestions(media);
  const code = crypto.randomBytes(4).toString('hex').slice(0, 6).toUpperCase();
  const quiz = {
    title: 'QA media test (temporary, safe to delete)',
    description: 'Created by scripts/seed-media-quiz.mjs. Has media in every slot.',
    subject: 'QA', tags: ['qa', 'media'], code, quizType: 'MIXED',
    createdBy: uid, username: 'QA Teacher (temporary)', createdAt: new Date(), active: true,
    questions, totalPoints: questions.reduce((s, q) => s + q.points, 0),
  };
  const created = await http(`${FS}/quizzes`, { method: 'POST', headers, body: JSON.stringify({ fields: toFields(quiz) }) });
  const quizId = created.name.split('/').pop();

  await fs.writeFile(STATE_FILE, JSON.stringify({ email, password, uid, quizId, code, fileIds }, null, 2));
  console.log(`\nQuiz id   : ${quizId}\nJoin code : ${code}\nTeacher   : ${email}\nPassword  : ${password}\nState file: ${STATE_FILE}`);
}

// ----------------------------------------------------------------- cleanup
/** Delete every document in `collection` where `field` equals the account's uid. */
async function deleteOwned(collection, field, uid, headers) {
  const rows = await http(`${FS}:runQuery`, { method: 'POST', headers: { ...headers, 'content-type': 'application/json' },
    body: JSON.stringify({ structuredQuery: { from: [{ collectionId: collection }],
      where: { fieldFilter: { field: { fieldPath: field }, op: 'EQUAL', value: { stringValue: uid } } } } }) });
  const docs = rows.filter((r) => r.document).map((r) => r.document.name);
  for (const name of docs) await http(`https://firestore.googleapis.com/v1/${name}`, { method: 'DELETE', headers });
  console.log(`Deleted ${docs.length} ${collection}`);
}

/** Live games live in the Realtime Database. Remove only the ones this account hosted. */
async function deleteHostedSessions(uid) {
  const db = (env.VITE_FIREBASE_DATABASE_URL || '').replace(/\/$/, '');
  if (!db) return;
  const keys = Object.keys((await http(`${db}/sessions.json?shallow=true`)) || {});
  let removed = 0;
  for (const key of keys) {
    const host = await http(`${db}/sessions/${key}/hostId.json`);
    if (host === uid) { await http(`${db}/sessions/${key}.json`, { method: 'DELETE' }); removed++; }
  }
  console.log(`Deleted ${removed} live sessions (of ${keys.length} in the database, the rest are not ours)`);
}

async function cleanup() {
  const s = JSON.parse(await fs.readFile(STATE_FILE, 'utf8'));
  const { idToken } = await signIn(s.email, s.password);
  const headers = { authorization: `Bearer ${idToken}` };
  await deleteOwned('quiz_results', 'teacherId', s.uid, headers);   // results first, they point at the quizzes
  await deleteOwned('quizzes', 'createdBy', s.uid, headers);
  await deleteOwned('question_bank', 'teacherId', s.uid, headers);
  await deleteHostedSessions(s.uid);
  await http(`${AUTH}/accounts:delete?key=${API_KEY}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ idToken }) });
  console.log(`Deleted account ${s.email}`);
  await fs.rm(STATE_FILE);
  console.log(`\nStill to remove by hand:\n  ImageKit folder ${UPLOAD_FOLDER} (${s.fileIds.length} files)\n  Firestore document users/${s.uid} (rules forbid deleting profiles)`);
}

(args.includes('--cleanup') ? cleanup() : seed()).catch((e) => { console.error('\nFAILED:', e.message); process.exit(1); });
