/**
 * Everything about ONE attempt at a graded quiz, as plain functions.
 *
 * Why this file exists: the signed in quiz page and the guest quiz page used to each
 * carry their own copy of this logic. The copies drifted. The guest copy had no grading
 * for the two comprehension types, so a guest scored 0 on every one of them. Both pages
 * now call this one module, and scripts/test-quiz-attempt.mjs checks it.
 *
 * It is also the piece that should move to a server. Grading in the browser means
 * anyone can send any score (docs/security.md, findings 1 and 2). These functions have no
 * React and no Firebase in them, so they can be copied onto a server unchanged.
 *
 * The stored shapes (what `userAnswer` looks like in a saved result) are read by the
 * results review and the teacher's grading page, so they must not change:
 *   MCQ                  [optionId, ...]
 *   TRUE_FALSE           true | false | null
 *   FILL_IN_THE_BLANK    string          PARAGRAPH   string
 *   MATCH_THE_FOLLOWING  { pairs: { [promptId]: { id, answerText, answerMedia } }, bank: [...] }
 *   REORDER              [item, ...] in the student's order
 *   CATEGORIZE           { [categoryId]: [item, ...], bank: [item, ...] }
 *   comprehension        { [subIndex]: [optionId, ...] }
 *   NUMERIC              string, exactly as typed ("9.8", "9,8 m/s")
 *   HOTSPOT              { x, y } where the student clicked, as percentages (0 to 100) of the image
 */
import { getSubQuestions, isComprehension } from './media.js';

// ── Setting up ──────────────────────────────────────────────────────────────────────

/** A proper shuffle. (sort(() => Math.random() - 0.5) is biased and favours the start.) */
export function shuffle(list) {
  const a = Array.isArray(list) ? [...list] : [];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** Shuffle, but never hand back the original order, or Reorder starts out already solved. */
function shuffleDifferent(list) {
  if (!Array.isArray(list) || list.length < 2) return Array.isArray(list) ? [...list] : [];
  const sameOrder = (a) => a.every((x, i) => x === list[i]);
  for (let tries = 0; tries < 8; tries++) {
    const a = shuffle(list);
    if (!sameOrder(a)) return a;
  }
  return [...list.slice(1), list[0]];   // a rotation is always different
}

export function initialAnswer(q) {
  switch (q.type) {
    case 'MCQ': return [];
    case 'TRUE_FALSE': return null;
    case 'FILL_IN_THE_BLANK':
    case 'NUMERIC':
    case 'PARAGRAPH': return '';
    case 'HOTSPOT': return null;
    case 'MATCH_THE_FOLLOWING':
      return { pairs: {}, bank: shuffle((q.matchData?.pairs || []).map((p) => ({ id: p.id, answerText: p.answer, answerMedia: p.answerMedia }))) };
    case 'REORDER': return shuffleDifferent(q.reorderData?.items || []);
    case 'CATEGORIZE':
      return { ...Object.fromEntries((q.categorizeData?.categories || []).map((c) => [c.id, []])), bank: shuffle(q.categorizeData?.items || []) };
    case 'VISUAL_COMPREHENSION':
    case 'LISTENING_COMPREHENSION': {
      const answer = {};
      getSubQuestions(q).forEach((sq, i) => { answer[i] = sq.type === 'MCQ' ? [] : ''; });
      return answer;
    }
    default: return null;
  }
}

export const initAnswers = (quiz) => (quiz?.questions || []).map((q) => {
  try { return initialAnswer(q); } catch { return null; }
});

// ── Changing an answer ──────────────────────────────────────────────────────────────

/** More than one correct option means "select all that apply". One means pick one. */
export const isMultiSelect = (mcq) => (mcq?.mcqData?.correctOptions?.length || 0) > 1;

const toggle = (list, id) => (list.includes(id) ? list.filter((x) => x !== id) : [...list, id]);

/** The new answer for one question after the student picks or types something. */
export function changeAnswer(q, current, value, subIndex = null) {
  if (isComprehension(q.type)) {
    const sub = getSubQuestions(q)[subIndex];
    const next = { ...(current || {}) };
    if (sub?.type === 'MCQ') {
      const picked = next[subIndex] || [];
      next[subIndex] = isMultiSelect(sub) ? toggle(picked, value) : (picked.includes(value) ? [] : [value]);
    } else {
      next[subIndex] = value;
    }
    return next;
  }
  if (q.type === 'MCQ') {
    const picked = Array.isArray(current) ? current : [];
    // A question with one right answer behaves like radio buttons. It used to let you tick
    // several boxes, which could only ever grade as wrong.
    return isMultiSelect(q) ? toggle(picked, value) : (picked.includes(value) ? [] : [value]);
  }
  return value;
}

const clone = (v) => JSON.parse(JSON.stringify(v));

/** The new answer for one drag and drop question after an item is dropped. */
export function dragAnswer(q, current, src, dest) {
  if (!dest) return current;
  const a = clone(current);

  if (q.type === 'REORDER') {
    const items = Array.from(a);
    const [moved] = items.splice(src.index, 1);
    items.splice(dest.index, 0, moved);
    return items;
  }

  if (q.type === 'CATEGORIZE') {
    const from = Array.from(a[src.droppableId] || []);
    const [moved] = from.splice(src.index, 1);
    if (src.droppableId === dest.droppableId) {
      from.splice(dest.index, 0, moved);
      a[src.droppableId] = from;
    } else {
      const to = Array.from(a[dest.droppableId] || []);
      to.splice(dest.index, 0, moved);
      a[src.droppableId] = from;
      a[dest.droppableId] = to;
    }
    return a;
  }

  if (q.type === 'MATCH_THE_FOLLOWING') {
    let moved;
    if (src.droppableId === 'bank') { moved = a.bank[src.index]; a.bank.splice(src.index, 1); }
    else { moved = a.pairs[src.droppableId]; delete a.pairs[src.droppableId]; }
    if (dest.droppableId === 'bank') {
      a.bank.splice(dest.index, 0, moved);
    } else {
      const displaced = a.pairs[dest.droppableId];     // whatever was in that slot goes back to the bank
      if (displaced) a.bank.push(displaced);
      a.pairs[dest.droppableId] = moved;
    }
    return a;
  }
  return current;
}

/**
 * Has the student done anything on this question? Drives the progress segments and the
 * "2 unanswered" note. Reorder always has an order, so it counts as answered.
 */
export function isAnswered(q, a) {
  switch (q.type) {
    case 'MCQ': return Array.isArray(a) && a.length > 0;
    case 'TRUE_FALSE': return a === true || a === false;
    case 'FILL_IN_THE_BLANK':
    case 'NUMERIC':
    case 'PARAGRAPH': return typeof a === 'string' && a.trim().length > 0;
    case 'HOTSPOT': return !!a && Number.isFinite(a.x) && Number.isFinite(a.y);
    case 'MATCH_THE_FOLLOWING': return !!a && Object.keys(a.pairs || {}).length > 0;
    case 'REORDER': return Array.isArray(a) && a.length > 0;
    case 'CATEGORIZE': return !!a && Object.keys(a).some((k) => k !== 'bank' && (a[k] || []).length > 0);
    case 'VISUAL_COMPREHENSION':
    case 'LISTENING_COMPREHENSION':
      return !!a && Object.values(a).some((v) => (Array.isArray(v) ? v.length > 0 : String(v || '').trim().length > 0));
    default: return false;
  }
}

// ── Grading ─────────────────────────────────────────────────────────────────────────

/**
 * Reads what a student typed into a number question. Forgiving about how people write
 * numbers: spaces, a comma or a point for the decimal, a thousands comma, and the unit
 * after the number ("9,8 m/s"). Returns NaN when it is not a number at all.
 *
 * A single comma followed by exactly three digits ("1,000") is a thousands separator.
 * Any other single comma ("1,5", "0,25") is a decimal comma. With both a comma and a
 * point, whichever comes last is the decimal mark.
 */
export function parseNumeric(text, unit = '') {
  let t = String(text ?? '').trim();
  const u = String(unit ?? '').trim();
  if (u && t.toLowerCase().endsWith(u.toLowerCase())) t = t.slice(0, t.length - u.length).trim();
  t = t.replace(/[\s_]/g, '');
  if (!t) return NaN;
  const lastComma = t.lastIndexOf(','); const lastPoint = t.lastIndexOf('.');
  if (lastComma !== -1 && lastPoint !== -1) {
    const decimal = lastComma > lastPoint ? ',' : '.';
    const other = decimal === ',' ? '.' : ',';
    t = t.split(other).join('').replace(decimal, '.');
  } else if (lastComma !== -1) {
    const parts = t.split(',');
    const thousands = parts.length > 1 && parts.slice(1).every((g) => /^\d{3}$/.test(g)) && /^[-+]?\d{1,3}$/.test(parts[0]);
    t = thousands ? parts.join('') : (parts.length === 2 ? `${parts[0]}.${parts[1]}` : '');
  }
  return /^[-+]?(\d+\.?\d*|\.\d+)(e[-+]?\d+)?$/i.test(t) ? Number(t) : NaN;
}

/** Is a typed answer within the allowed tolerance of the right number? */
export function gradeNumeric(numericData, text) {
  const want = Number(numericData?.answer);
  if (!Number.isFinite(want)) return false;
  const got = parseNumeric(text, numericData?.unit);
  if (!Number.isFinite(got)) return false;
  const tolerance = Math.max(0, Number(numericData?.tolerance) || 0);
  // A hair of slack so 0.1 + 0.2 style rounding never marks a right answer wrong.
  return Math.abs(got - want) <= tolerance + 1e-9 * Math.max(1, Math.abs(want));
}

/** Did a click land inside any of the marked areas? All numbers are percentages of the image. */
export function hotspotHit(regions, point) {
  if (!point || !Number.isFinite(point.x) || !Number.isFinite(point.y)) return false;
  return (regions || []).some((r) => point.x >= r.x && point.x <= r.x + r.w && point.y >= r.y && point.y <= r.y + r.h);
}

const sameSet = (want, got) => {
  const w = (want || []).map(String); const g = (got || []).map(String);
  return w.length > 0 && w.length === g.length && w.every((id) => g.includes(id));
};

/**
 * Grade one question. Returns { pts, correct, status }.
 *  - Match, Categorize and comprehension give partial credit, in proportion.
 *  - Paragraph needs a teacher, so it is pending and worth nothing yet.
 * `pts` never exceeds the question's own points, so a result can never read "30 / 20".
 */
export function gradeQuestion(q, ua) {
  const max = Number(q.points) || 0;
  let pts = 0; let correct = false; let status = 'auto_graded';

  switch (q.type) {
    case 'MCQ':
      if (sameSet(q.mcqData?.correctOptions, ua)) { pts = max; correct = true; }
      break;
    case 'TRUE_FALSE':
      if (ua === q.trueFalseData?.correctAnswer) { pts = max; correct = true; }
      break;
    case 'FILL_IN_THE_BLANK': {
      const given = String(ua ?? '').trim().toLowerCase();
      const accepted = (q.fillBlankData?.answers || []).map((a) => String(a.text ?? '').trim().toLowerCase());
      if (given && accepted.includes(given)) { pts = max; correct = true; }
      break;
    }
    case 'NUMERIC':
      if (gradeNumeric(q.numericData, ua)) { pts = max; correct = true; }
      break;
    case 'HOTSPOT':
      if (hotspotHit(q.hotspotData?.regions, ua)) { pts = max; correct = true; }
      break;
    case 'PARAGRAPH':
      status = 'pending_review';
      break;
    case 'MATCH_THE_FOLLOWING': {
      const pairs = q.matchData?.pairs || [];
      const matched = pairs.filter((p) => ua?.pairs?.[p.id]?.answerText === p.answer).length;
      if (pairs.length) { pts = Math.round((matched / pairs.length) * max); correct = matched === pairs.length; }
      break;
    }
    case 'CATEGORIZE': {
      const items = q.categorizeData?.items || [];
      const matched = items.filter((item) => {
        const placedIn = Object.keys(ua || {}).find((cid) => cid !== 'bank' && (ua[cid] || []).some((x) => x.id === item.id));
        // An item still sitting in the bank has not been placed, so it cannot be right.
        return placedIn !== undefined && String(placedIn) === String(item.categoryId);
      }).length;
      if (items.length) { pts = Math.round((matched / items.length) * max); correct = matched === items.length; }
      break;
    }
    case 'REORDER': {
      const items = q.reorderData?.items || [];
      if (Array.isArray(ua) && items.length && ua.length === items.length && ua.every((it, i) => it.id === items[i].id)) { pts = max; correct = true; }
      break;
    }
    case 'VISUAL_COMPREHENSION':
    case 'LISTENING_COMPREHENSION': {
      // Each follow up question is worth its own points, and the question as a whole is
      // worth `max`. Score the share earned. When the follow up points add up to `max`
      // (the usual case) this is exactly the sum of the points, as before. When they do
      // not (the editor gives each follow up 10 points whatever the parent is worth) it
      // used to give totals above the question's maximum.
      const subs = getSubQuestions(q).filter((s) => s?.type === 'MCQ');
      let earned = 0; let possible = 0;
      subs.forEach((s) => {
        const index = getSubQuestions(q).indexOf(s);
        const worth = Number(s.points) || 5;
        possible += worth;
        if (sameSet(s.mcqData?.correctOptions, ua?.[index])) earned += worth;
      });
      if (possible) { pts = Math.round((earned / possible) * max); correct = earned === possible; }
      break;
    }
    default: break;
  }
  return { pts, correct, status };
}

/**
 * Grade a whole attempt. `detailed` is what is saved on the result, one entry per question.
 * @returns {{ detailed: object[], total: number, needsManual: boolean }}
 */
export function gradeAttempt(quiz, answers) {
  let total = 0; let needsManual = false;
  const detailed = (quiz.questions || []).map((q, i) => {
    const ua = answers[i];
    const { pts, correct, status } = gradeQuestion(q, ua);
    if (status === 'pending_review') needsManual = true;
    total += pts;
    return {
      type: q.type,
      questionText: q.questionText,
      // Undefined would make the database reject the whole result, and JSON.parse(undefined) throws.
      userAnswer: ua === undefined ? null : clone(ua),
      pointsAwarded: pts,
      status,
      isCorrect: correct,
    };
  });
  return { detailed, total, needsManual };
}
