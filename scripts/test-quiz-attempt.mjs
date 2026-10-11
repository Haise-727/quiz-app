#!/usr/bin/env node
/**
 * Tests for src/utils/quizAttempt.js. No dependencies:
 *   node scripts/test-quiz-attempt.mjs
 *
 * This is the grading that decides every score, so it is worth testing on its own. When
 * grading moves to a server on AWS, running this same file against the ported version is
 * how you prove it still gives the same marks.
 */
import assert from 'node:assert/strict';
import {
  initialAnswer, initAnswers, changeAnswer, dragAnswer, isAnswered, isMultiSelect,
  gradeQuestion, gradeAttempt, shuffle, parseNumeric, gradeNumeric, hotspotHit,
} from '../src/utils/quizAttempt.js';

let passed = 0;
const test = (name, fn) => { try { fn(); passed++; console.log(`  ok   ${name}`); } catch (e) { console.log(`  FAIL ${name}\n       ${e.message}`); process.exitCode = 1; } };

// ── fixtures, shaped like what the editor saves ─────────────────────────────────────
const opt = (id, text = `opt${id}`) => ({ id, text, media: null });
const mcq = (correct, ids = [1, 2, 3], points = 10) => ({ id: 'q', type: 'MCQ', points, mcqData: { options: ids.map((i) => opt(i)), correctOptions: correct } });
const tf = (answer) => ({ type: 'TRUE_FALSE', points: 10, trueFalseData: { correctAnswer: answer } });
const fill = (answers) => ({ type: 'FILL_IN_THE_BLANK', points: 10, fillBlankData: { answers: answers.map((text) => ({ text })) } });
const match = () => ({ type: 'MATCH_THE_FOLLOWING', points: 30, matchData: { pairs: [
  { id: 'p1', prompt: 'A', answer: 'one' }, { id: 'p2', prompt: 'B', answer: 'two' }, { id: 'p3', prompt: 'C', answer: 'three' }] } });
const reorder = () => ({ type: 'REORDER', points: 10, reorderData: { items: [{ id: 'a', text: 'a' }, { id: 'b', text: 'b' }, { id: 'c', text: 'c' }] } });
const categorize = () => ({ type: 'CATEGORIZE', points: 20, categorizeData: {
  categories: [{ id: 'c1', name: 'One' }, { id: 'c2', name: 'Two' }],
  items: [{ id: 'i1', text: 'x', categoryId: 'c1' }, { id: 'i2', text: 'y', categoryId: 'c1' }, { id: 'i3', text: 'z', categoryId: 'c2' }, { id: 'i4', text: 'w', categoryId: 'c2' }] } });
const sub = (correct, points = 10) => ({ type: 'MCQ', points, mcqData: { options: [opt(1), opt(2)], correctOptions: correct } });
const comp = (subs, points = 20, type = 'LISTENING_COMPREHENSION') =>
  ({ type, points, [type === 'VISUAL_COMPREHENSION' ? 'visualData' : 'listeningData']: { subQuestions: subs } });

console.log('multiple choice');
test('single answer: picking replaces, so two boxes can never be ticked', () => {
  const q = mcq([2]);
  let a = initialAnswer(q);
  a = changeAnswer(q, a, 1); assert.deepEqual(a, [1]);
  a = changeAnswer(q, a, 3); assert.deepEqual(a, [3]);
  a = changeAnswer(q, a, 3); assert.deepEqual(a, []);          // tapping again clears it
});
test('several correct answers: picking toggles', () => {
  const q = mcq([1, 2]);
  assert.equal(isMultiSelect(q), true);
  let a = changeAnswer(q, [], 1); a = changeAnswer(q, a, 2); assert.deepEqual(a, [1, 2]);
  a = changeAnswer(q, a, 1); assert.deepEqual(a, [2]);
});
test('grades single and multi correctly, order does not matter', () => {
  assert.equal(gradeQuestion(mcq([2]), [2]).pts, 10);
  assert.equal(gradeQuestion(mcq([2]), [1]).pts, 0);
  assert.equal(gradeQuestion(mcq([2]), []).pts, 0);
  assert.equal(gradeQuestion(mcq([1, 2]), [2, 1]).correct, true);
  assert.equal(gradeQuestion(mcq([1, 2]), [1]).correct, false);          // missing one
  assert.equal(gradeQuestion(mcq([1, 2]), [1, 2, 3]).correct, false);    // one too many
});
test('ids compare as text, so 1 and "1" are the same option', () => {
  assert.equal(gradeQuestion(mcq(['1']), [1]).correct, true);
});
test('a question with no marked answer can never be earned', () => {
  assert.equal(gradeQuestion(mcq([]), []).correct, false);
});

console.log('true or false, fill in, paragraph');
test('true or false', () => {
  assert.equal(gradeQuestion(tf(true), true).pts, 10);
  assert.equal(gradeQuestion(tf(false), false).pts, 10);       // false is a real answer
  assert.equal(gradeQuestion(tf(true), false).pts, 0);
  assert.equal(gradeQuestion(tf(false), null).pts, 0);          // unanswered is not "false"
});
test('fill in ignores case and outer spaces on BOTH sides', () => {
  assert.equal(gradeQuestion(fill(['Tone']), '  tone ').correct, true);
  assert.equal(gradeQuestion(fill(['tone ']), 'TONE').correct, true);     // a teacher's trailing space
  assert.equal(gradeQuestion(fill(['tone', 'sound']), 'Sound').correct, true);
  assert.equal(gradeQuestion(fill(['tone']), 'tones').correct, false);
});
test('fill in: an empty answer is never right, even if an accepted answer is empty', () => {
  assert.equal(gradeQuestion(fill(['']), '').correct, false);
  assert.equal(gradeQuestion(fill(['tone']), undefined).correct, false);
});
test('paragraph is pending and worth nothing until a teacher marks it', () => {
  const r = gradeQuestion({ type: 'PARAGRAPH', points: 10 }, 'my essay');
  assert.deepEqual(r, { pts: 0, correct: false, status: 'pending_review' });
});

console.log('match, categorize, reorder');
test('match gives partial credit in proportion', () => {
  const q = match();
  const pairs = (n) => ({ pairs: Object.fromEntries(['p1', 'p2', 'p3'].slice(0, n).map((id, i) => [id, { id, answerText: ['one', 'two', 'three'][i] }])), bank: [] });
  assert.equal(gradeQuestion(q, pairs(3)).pts, 30); assert.equal(gradeQuestion(q, pairs(3)).correct, true);
  assert.equal(gradeQuestion(q, pairs(2)).pts, 20); assert.equal(gradeQuestion(q, pairs(2)).correct, false);
  assert.equal(gradeQuestion(q, pairs(0)).pts, 0);
  assert.equal(gradeQuestion(q, undefined).pts, 0);
});
test('categorize gives partial credit and an unplaced item is wrong', () => {
  const q = categorize();
  const all = { c1: [{ id: 'i1' }, { id: 'i2' }], c2: [{ id: 'i3' }, { id: 'i4' }], bank: [] };
  assert.equal(gradeQuestion(q, all).pts, 20); assert.equal(gradeQuestion(q, all).correct, true);
  const half = { c1: [{ id: 'i1' }, { id: 'i2' }], c2: [], bank: [{ id: 'i3' }, { id: 'i4' }] };
  assert.equal(gradeQuestion(q, half).pts, 10);
  const swapped = { c1: [{ id: 'i3' }], c2: [{ id: 'i1' }], bank: [{ id: 'i2' }, { id: 'i4' }] };
  assert.equal(gradeQuestion(q, swapped).pts, 0);
});
test('categorize: an item with no category set is not counted right just for being in the bank', () => {
  const q = { type: 'CATEGORIZE', points: 10, categorizeData: { categories: [{ id: 'c1' }], items: [{ id: 'i1' }] } };   // categoryId undefined
  assert.equal(gradeQuestion(q, { c1: [], bank: [{ id: 'i1' }] }).correct, false);
});
test('reorder is all or nothing and needs the same number of items', () => {
  const q = reorder();
  assert.equal(gradeQuestion(q, [{ id: 'a' }, { id: 'b' }, { id: 'c' }]).correct, true);
  assert.equal(gradeQuestion(q, [{ id: 'b' }, { id: 'a' }, { id: 'c' }]).correct, false);
  assert.equal(gradeQuestion(q, [{ id: 'a' }, { id: 'b' }]).correct, false);
  assert.equal(gradeQuestion(q, null).pts, 0);
});

console.log('comprehension');
test('REGRESSION: both comprehension types are graded (the guest page never graded them)', () => {
  for (const type of ['VISUAL_COMPREHENSION', 'LISTENING_COMPREHENSION']) {
    const q = comp([sub([1]), sub([2])], 20, type);
    const quiz = { questions: [q] };
    const r = gradeAttempt(quiz, [{ 0: [1], 1: [2] }]);
    assert.equal(r.total, 20, `${type} should score 20`);
    assert.equal(r.detailed[0].isCorrect, true);
  }
});
test('partial credit when some follow up questions are right', () => {
  const q = comp([sub([1]), sub([2])], 20);
  assert.equal(gradeQuestion(q, { 0: [1], 1: [1] }).pts, 10);
  assert.equal(gradeQuestion(q, { 0: [1], 1: [1] }).correct, false);
  assert.equal(gradeQuestion(q, {}).pts, 0);
});
test('follow up points that do not add up to the question points still cannot exceed it', () => {
  // The editor gives every follow up 10 points but the question 20: three follow ups used to
  // score 30 out of 20 and never count as correct.
  const q = comp([sub([1]), sub([1]), sub([1])], 20);
  const full = gradeQuestion(q, { 0: [1], 1: [1], 2: [1] });
  assert.equal(full.pts, 20); assert.equal(full.correct, true);
  assert.equal(gradeQuestion(q, { 0: [1], 1: [1], 2: [2] }).pts, Math.round((2 / 3) * 20));
});
test('follow up questions that are not multiple choice are left out of the maths', () => {
  const q = comp([sub([1]), { type: 'PARAGRAPH', points: 10 }], 20);
  assert.equal(gradeQuestion(q, { 0: [1] }).pts, 20);
});
test('a comprehension question with several correct options per follow up', () => {
  const q = comp([sub([1, 2])], 10);
  assert.equal(gradeQuestion(q, { 0: [1, 2] }).correct, true);
  assert.equal(gradeQuestion(q, { 0: [1] }).correct, false);
});
test('comprehension answers: pick one, or toggle when several are right', () => {
  const q = comp([sub([1]), sub([1, 2])], 20);
  let a = initialAnswer(q); assert.deepEqual(a, { 0: [], 1: [] });
  a = changeAnswer(q, a, 2, 0); a = changeAnswer(q, a, 1, 0); assert.deepEqual(a[0], [1]);     // single: replaces
  a = changeAnswer(q, a, 1, 1); a = changeAnswer(q, a, 2, 1); assert.deepEqual(a[1], [1, 2]);  // multi: toggles
});

console.log('whole attempts');
test('totals, status and one saved entry per question', () => {
  const quiz = { questions: [mcq([1]), tf(true), { type: 'PARAGRAPH', points: 10 }] };
  const r = gradeAttempt(quiz, [[1], true, 'essay']);
  assert.equal(r.total, 20); assert.equal(r.needsManual, true);
  assert.equal(r.detailed.length, 3);
  assert.equal(r.detailed[2].status, 'pending_review');
  assert.deepEqual(r.detailed[0].userAnswer, [1]);
});
test('a missing answer is saved as null and does not throw', () => {
  const r = gradeAttempt({ questions: [mcq([1]), tf(true)] }, [undefined]);
  assert.equal(r.total, 0); assert.equal(r.detailed[0].userAnswer, null); assert.equal(r.detailed[1].userAnswer, null);
});
test('a saved answer is a copy, so later edits cannot change the saved result', () => {
  const answer = [1]; const r = gradeAttempt({ questions: [mcq([1])] }, [answer]);
  answer.push(2); assert.deepEqual(r.detailed[0].userAnswer, [1]);
});
test('the saved shapes stay the ones the review pages read', () => {
  const q = categorize(); const a = initialAnswer(q);
  assert.deepEqual(Object.keys(a).sort(), ['bank', 'c1', 'c2']);
  assert.equal(gradeAttempt({ questions: [q] }, [a]).detailed[0].userAnswer.bank.length, 4);
});

console.log('setting up');
test('every question type gets a sensible starting answer', () => {
  const quiz = { questions: [mcq([1]), tf(true), fill(['x']), { type: 'PARAGRAPH', points: 1 }, match(), reorder(), categorize(), comp([sub([1])])] };
  const a = initAnswers(quiz);
  assert.deepEqual(a[0], []); assert.equal(a[1], null); assert.equal(a[2], ''); assert.equal(a[3], '');
  assert.equal(a[4].bank.length, 3); assert.deepEqual(a[4].pairs, {});
  assert.equal(a[5].length, 3); assert.equal(a[6].bank.length, 4); assert.deepEqual(a[7], { 0: [] });
});
test('reorder never starts already in the right order', () => {
  const q = reorder();
  for (let i = 0; i < 300; i++) assert.notDeepEqual(initialAnswer(q).map((x) => x.id), ['a', 'b', 'c']);
});
test('a one item reorder does not hang looking for a different order', () => {
  assert.equal(initialAnswer({ type: 'REORDER', reorderData: { items: [{ id: 'a' }] } }).length, 1);
});
test('shuffle keeps every item, and is not the identity every time', () => {
  const list = [1, 2, 3, 4, 5, 6, 7, 8];
  assert.deepEqual([...shuffle(list)].sort(), list);
  assert.equal(Array.from({ length: 30 }, () => shuffle(list).join()).some((s) => s !== list.join()), true);
  assert.deepEqual(shuffle(null), []);
});
test('an unknown question type is not graded and does not throw', () => {
  assert.deepEqual(gradeQuestion({ type: 'SOMETHING_NEW', points: 5 }, 'x'), { pts: 0, correct: false, status: 'auto_graded' });
});

console.log('drag and drop');
test('reorder moves an item', () => {
  const a = dragAnswer(reorder(), [{ id: 'a' }, { id: 'b' }, { id: 'c' }], { index: 0 }, { index: 2 });
  assert.deepEqual(a.map((x) => x.id), ['b', 'c', 'a']);
});
test('categorize moves between categories and inside one', () => {
  const q = categorize();
  const start = { c1: [], c2: [], bank: [{ id: 'i1' }, { id: 'i2' }] };
  let a = dragAnswer(q, start, { droppableId: 'bank', index: 0 }, { droppableId: 'c1', index: 0 });
  assert.deepEqual(a.c1.map((x) => x.id), ['i1']); assert.deepEqual(a.bank.map((x) => x.id), ['i2']);
  a = dragAnswer(q, a, { droppableId: 'c1', index: 0 }, { droppableId: 'c2', index: 0 });
  assert.deepEqual(a.c2.map((x) => x.id), ['i1']); assert.equal(a.c1.length, 0);
  a = dragAnswer(q, { c1: [{ id: 'x' }, { id: 'y' }], c2: [], bank: [] }, { droppableId: 'c1', index: 0 }, { droppableId: 'c1', index: 1 });
  assert.deepEqual(a.c1.map((x) => x.id), ['y', 'x']);
});
test('match places, displaces back to the bank, and returns to the bank', () => {
  const q = match();
  const start = { pairs: {}, bank: [{ id: 'p1', answerText: 'one' }, { id: 'p2', answerText: 'two' }] };
  let a = dragAnswer(q, start, { droppableId: 'bank', index: 0 }, { droppableId: 'p3', index: 0 });
  assert.equal(a.pairs.p3.answerText, 'one'); assert.equal(a.bank.length, 1);
  a = dragAnswer(q, a, { droppableId: 'bank', index: 0 }, { droppableId: 'p3', index: 0 });        // drop onto a filled slot
  assert.equal(a.pairs.p3.answerText, 'two'); assert.deepEqual(a.bank.map((x) => x.answerText), ['one']);
  a = dragAnswer(q, a, { droppableId: 'p3', index: 0 }, { droppableId: 'bank', index: 0 });        // send it home
  assert.equal(a.pairs.p3, undefined); assert.equal(a.bank.length, 2);
});
test('dropping outside any list changes nothing', () => {
  const a = [{ id: 'a' }, { id: 'b' }];
  assert.equal(dragAnswer(reorder(), a, { index: 0 }, null), a);
});
test('drag never changes the answer it was given', () => {
  const start = { pairs: {}, bank: [{ id: 'p1', answerText: 'one' }] };
  const snapshot = JSON.stringify(start);
  dragAnswer(match(), start, { droppableId: 'bank', index: 0 }, { droppableId: 'p1', index: 0 });
  assert.equal(JSON.stringify(start), snapshot);
});

console.log('is it answered');
test('each type', () => {
  assert.equal(isAnswered(mcq([1]), []), false); assert.equal(isAnswered(mcq([1]), [1]), true);
  assert.equal(isAnswered(tf(true), null), false); assert.equal(isAnswered(tf(true), false), true);
  assert.equal(isAnswered(fill(['x']), '   '), false); assert.equal(isAnswered(fill(['x']), 'a'), true);
  assert.equal(isAnswered(match(), { pairs: {}, bank: [1] }), false); assert.equal(isAnswered(match(), { pairs: { p1: {} }, bank: [] }), true);
  assert.equal(isAnswered(categorize(), { c1: [], c2: [], bank: [1] }), false); assert.equal(isAnswered(categorize(), { c1: [{}], c2: [], bank: [] }), true);
  assert.equal(isAnswered(reorder(), [{ id: 'a' }]), true);
  assert.equal(isAnswered(comp([sub([1])]), { 0: [] }), false); assert.equal(isAnswered(comp([sub([1])]), { 0: [1] }), true);
});

console.log('number questions');
const numeric = (answer, tolerance = 0, unit = '') => ({ type: 'NUMERIC', points: 10, numericData: { answer, tolerance, unit } });
test('reads numbers the way people write them', () => {
  assert.equal(parseNumeric('9.8'), 9.8);
  assert.equal(parseNumeric('9,8'), 9.8);                 // decimal comma
  assert.equal(parseNumeric('  42  '), 42);
  assert.equal(parseNumeric('1,000'), 1000);              // thousands comma
  assert.equal(parseNumeric('1.000,5'), 1000.5);          // both marks: the last one is the decimal
  assert.equal(parseNumeric('1,000.5'), 1000.5);
  assert.equal(parseNumeric('1234,567'), 1234.567);      // too many digits before the comma to be a thousands group
  assert.equal(parseNumeric('12,345,678'), 12345678);    // several groups of three
  assert.equal(parseNumeric('-2'), -2);
  assert.equal(parseNumeric('.5'), 0.5);
  assert.equal(parseNumeric('1e3'), 1000);
});
test('anything that is not a number is NaN, never zero', () => {
  for (const bad of ['', '   ', 'abc', '1,2,3', '12abc', '--1', '1..2', null, undefined]) assert.ok(Number.isNaN(parseNumeric(bad)), String(bad));
});
test('the unit after the number is ignored, in any case', () => {
  assert.equal(parseNumeric('9.8 m/s', 'm/s'), 9.8);
  assert.equal(parseNumeric('9.8M/S', 'm/s'), 9.8);
  assert.ok(Number.isNaN(parseNumeric('9.8 kg', 'm/s')));  // a different unit is not stripped
});
test('an exact answer is right and a near miss is wrong when tolerance is zero', () => {
  assert.equal(gradeQuestion(numeric(9.8), '9.8').correct, true);
  assert.equal(gradeQuestion(numeric(9.8), '9.81').correct, false);
});
test('tolerance is a plain plus or minus, and includes its own edge', () => {
  const q = numeric(100, 0.5);
  for (const ok of ['100', '99.5', '100.5', '99.7']) assert.equal(gradeQuestion(q, ok).correct, true, ok);
  for (const no of ['99.4', '100.6', '0', '200']) assert.equal(gradeQuestion(q, no).correct, false, no);
});
test('rounding noise never marks a right answer wrong', () => {
  assert.equal(gradeNumeric({ answer: 0.3, tolerance: 0 }, String(0.1 + 0.2)), true);
});
test('a negative tolerance is treated as zero', () => {
  assert.equal(gradeNumeric({ answer: 5, tolerance: -3 }, '5'), true);
  assert.equal(gradeNumeric({ answer: 5, tolerance: -3 }, '6'), false);
});
test('a question with no valid answer set can never be right', () => {
  assert.equal(gradeNumeric({ answer: 'x' }, '1'), false);
  assert.equal(gradeNumeric(undefined, '1'), false);
});
test('full marks or nothing, and the points never exceed the question', () => {
  const q = { ...numeric(3, 0), points: 7 };
  assert.deepEqual(gradeQuestion(q, '3'), { pts: 7, correct: true, status: 'auto_graded' });
  assert.deepEqual(gradeQuestion(q, '4'), { pts: 0, correct: false, status: 'auto_graded' });
});
test('starts empty, counts as answered once something is typed', () => {
  assert.equal(initialAnswer(numeric(1)), '');
  assert.equal(isAnswered(numeric(1), ''), false); assert.equal(isAnswered(numeric(1), '  '), false); assert.equal(isAnswered(numeric(1), '0'), true);
  assert.equal(changeAnswer(numeric(1), '', '12'), '12');
});

console.log('click on the image');
const hotspot = (regions) => ({ type: 'HOTSPOT', points: 10, hotspotData: { regions } });
const area = { id: 'r1', x: 20, y: 30, w: 10, h: 10 };      // covers x 20 to 30, y 30 to 40
test('a click inside the area is right, outside is wrong', () => {
  const q = hotspot([area]);
  assert.equal(gradeQuestion(q, { x: 25, y: 35 }).correct, true);
  assert.equal(gradeQuestion(q, { x: 19.9, y: 35 }).correct, false);
  assert.equal(gradeQuestion(q, { x: 25, y: 40.1 }).correct, false);
  assert.equal(gradeQuestion(q, { x: 80, y: 80 }).correct, false);
});
test('the edges of the area count as inside', () => {
  for (const p of [{ x: 20, y: 30 }, { x: 30, y: 40 }, { x: 20, y: 40 }, { x: 30, y: 30 }]) assert.equal(hotspotHit([area], p), true);
});
test('any one of several areas will do', () => {
  const regions = [area, { id: 'r2', x: 60, y: 60, w: 20, h: 20 }];
  assert.equal(hotspotHit(regions, { x: 70, y: 70 }), true);
  assert.equal(hotspotHit(regions, { x: 45, y: 45 }), false);
});
test('no click, a broken click or no areas is never right', () => {
  assert.equal(hotspotHit([area], null), false);
  assert.equal(hotspotHit([area], { x: 'a', y: 1 }), false);
  assert.equal(hotspotHit([area], { x: NaN, y: 35 }), false);
  assert.equal(hotspotHit([], { x: 25, y: 35 }), false);
  assert.equal(hotspotHit(undefined, { x: 25, y: 35 }), false);
});
test('starts with no click, and a click counts as answered', () => {
  assert.equal(initialAnswer(hotspot([area])), null);
  assert.equal(isAnswered(hotspot([area]), null), false);
  assert.equal(isAnswered(hotspot([area]), { x: 0, y: 0 }), true);          // the top left corner is a real click
  assert.deepEqual(changeAnswer(hotspot([area]), null, { x: 1, y: 2 }), { x: 1, y: 2 });
});
test('a whole attempt with both new types is marked and saved in the stored shape', () => {
  const quiz = { questions: [numeric(4, 0.1), hotspot([area])] };
  const r = gradeAttempt(quiz, ['4.05', { x: 21, y: 31 }]);
  assert.equal(r.total, 20); assert.equal(r.needsManual, false);
  assert.deepEqual(r.detailed.map((d) => d.isCorrect), [true, true]);
  assert.deepEqual(r.detailed[1].userAnswer, { x: 21, y: 31 });
  assert.equal(r.detailed[0].userAnswer, '4.05');
});

console.log(`\n${passed} passed${process.exitCode ? ', some FAILED' : ''}`);
