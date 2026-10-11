#!/usr/bin/env node
/** Tests for src/utils/questionValidation.js:   node scripts/test-question-validation.mjs */
import assert from 'node:assert/strict';
import { validateQuestions } from '../src/utils/questionValidation.js';

let passed = 0;
const test = (name, fn) => { try { fn(); passed++; console.log(`  ok   ${name}`); } catch (e) { console.log(`  FAIL ${name}\n       ${e.message}`); process.exitCode = 1; } };
const ok = (qs) => assert.deepEqual(validateQuestions(qs), []);
const bad = (qs, text) => { const m = validateQuestions(qs); assert.ok(m.length > 0, 'expected a problem'); if (text) assert.ok(m.join(" ").toLowerCase().includes(text.toLowerCase()), `"${m.join(" ")}" should mention "${text}"`); return m; };

const mcq = (o = {}) => ({ type: 'MCQ', questionText: 'Q', mcqData: { options: [{ id: 1, text: 'a' }, { id: 2, text: 'b' }], correctOptions: [1] }, ...o });

test('no questions at all', () => bad([], 'at least one question'));
test('a good multiple choice question passes', () => ok([mcq()]));
test('a question with no text', () => bad([mcq({ questionText: '   ' })], 'write the question'));
test('multiple choice with one option', () => bad([mcq({ mcqData: { options: [{ id: 1, text: 'a' }], correctOptions: [1] } })], 'two options'));
test('multiple choice with empty options does not count them', () => bad([mcq({ mcqData: { options: [{ id: 1, text: 'a' }, { id: 2, text: ' ' }], correctOptions: [1] } })], 'two options'));
test('a picture only option counts as filled', () => ok([mcq({ mcqData: { options: [{ id: 1, text: 'a' }, { id: 2, text: '', media: { url: 'x' } }], correctOptions: [2] } })]));
test('a picked but not yet uploaded file counts as filled', () => ok([mcq({ mcqData: { options: [{ id: 1, text: 'a' }, { id: 2, text: '', localMediaFile: {} }], correctOptions: [1] } })]));
test('multiple choice with no right answer ticked', () => bad([mcq({ mcqData: { options: [{ id: 1, text: 'a' }, { id: 2, text: 'b' }], correctOptions: [] } })], 'tick the right answer'));
test('a ticked option that was left empty is not a right answer', () => bad([mcq({ mcqData: { options: [{ id: 1, text: 'a' }, { id: 2, text: 'b' }, { id: 3, text: '' }], correctOptions: [3] } })], 'tick the right answer'));
test('true or false needs nothing more than text', () => ok([{ type: 'TRUE_FALSE', questionText: 'Q', trueFalseData: { correctAnswer: false } }]));
test('fill in the blank needs one accepted answer', () => {
  bad([{ type: 'FILL_IN_THE_BLANK', questionText: 'Q', fillBlankData: { answers: [{ text: ' ' }] } }], 'accepted answer');
  ok([{ type: 'FILL_IN_THE_BLANK', questionText: 'Q', fillBlankData: { answers: [{ text: '' }, { text: 'yes' }] } }]);
});
test('a number question needs a number, and zero is a number', () => {
  const num = (answer, tolerance) => ({ type: 'NUMERIC', questionText: 'Q', numericData: { answer, tolerance } });
  bad([num('', 0)], 'right number'); bad([num('abc', 0)], 'right number'); bad([{ type: 'NUMERIC', questionText: 'Q' }], 'right number');
  ok([num('0', 0)]); ok([num(0, '')]); ok([num(9.8, 0.1)]);
});
test('a negative tolerance is refused', () => bad([{ type: 'NUMERIC', questionText: 'Q', numericData: { answer: 1, tolerance: -1 } }], 'tolerance'));
test('click on the image needs a picture and an area', () => {
  const hs = (extra) => ({ type: 'HOTSPOT', questionText: 'Q', hotspotData: { regions: [] }, ...extra });
  bad([hs({})], 'add the picture');
  bad([hs({ media: { url: 'x' } })], 'mark the right area');
  ok([hs({ media: { url: 'x' }, hotspotData: { regions: [{ id: 'r', x: 1, y: 1, w: 5, h: 5 }] } })]);
  ok([hs({ localMediaFile: {}, hotspotData: { regions: [{ id: 'r', x: 1, y: 1, w: 5, h: 5 }] } })]);
});
test('match needs two complete pairs', () => {
  const m = (pairs) => ({ type: 'MATCH_THE_FOLLOWING', questionText: 'Q', matchData: { pairs } });
  bad([m([{ prompt: 'a', answer: 'b' }])], 'two pairs');
  bad([m([{ prompt: 'a', answer: 'b' }, { prompt: 'c', answer: '' }])], 'both sides');
  ok([m([{ prompt: 'a', answer: 'b' }, { prompt: 'c', answer: 'd' }])]);
});
test('categorize needs two categories, two items, and every item placed', () => {
  const c = (categories, items) => ({ type: 'CATEGORIZE', questionText: 'Q', categorizeData: { categories, items } });
  const cats = [{ id: 1, name: 'A' }, { id: 2, name: 'B' }];
  bad([c([{ id: 1, name: 'A' }], [{ categoryId: 1 }, { categoryId: 1 }])], 'two categories');
  bad([c(cats, [{ categoryId: 1 }])], 'two items');
  bad([c(cats, [{ categoryId: 1 }, { categoryId: null }])], 'category for every item');
  ok([c(cats, [{ categoryId: 1 }, { categoryId: 2 }])]);
});
test('reorder needs two items', () => {
  bad([{ type: 'REORDER', questionText: 'Q', reorderData: { items: [{ text: 'a' }] } }], 'two items');
  ok([{ type: 'REORDER', questionText: 'Q', reorderData: { items: [{ text: 'a' }, { text: 'b' }] } }]);
});
test('comprehension needs its media and a good follow up', () => {
  const sub = mcq();
  const v = (extra) => ({ type: 'VISUAL_COMPREHENSION', questionText: 'Q', visualData: { subQuestions: [sub], ...extra } });
  bad([v({})], 'add the picture');
  ok([v({ mainMedia: { url: 'x' } })]);
  bad([v({ mainMedia: { url: 'x' }, subQuestions: [] })], 'follow up');
  bad([v({ mainMedia: { url: 'x' }, subQuestions: [mcq({ questionText: '' })] })], 'fix follow up question 1');
  bad([{ type: 'LISTENING_COMPREHENSION', questionText: 'Q', listeningData: { subQuestions: [sub] } }], 'audio or video');
});
test('every bad question is reported with its own number', () => {
  const m = validateQuestions([mcq(), mcq({ questionText: '' }), mcq(), mcq({ mcqData: { options: [], correctOptions: [] } })]);
  assert.equal(m.length, 2);
  assert.ok(m[0].startsWith('Question 2:')); assert.ok(m[1].startsWith('Question 4:'));
});
test('the first letter of each message is a capital', () => assert.ok(/^Question \d+: [A-Z]/.test(bad([mcq({ questionText: '' })])[0])));

console.log(`\n${passed} passed${process.exitCode ? ', some FAILED' : ''}`);
