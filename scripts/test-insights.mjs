#!/usr/bin/env node
/**
 * Tests for src/utils/insights.js. No dependencies, run with:
 *   node scripts/test-insights.mjs
 *
 * Pure functions again, so no browser and no Firebase. Each rule in insights.js has at least
 * one check here, and each was mutation checked: break the rule on purpose and the
 * matching check fails.
 */
import assert from 'node:assert/strict';
import {
  toDate, resultPercent, isScored, weekStart, weeklyActivity, summarize,
  isFullyRight, questionForAnswer, mostMissed, trendOf, nameOf, studentRows,
  NEEDS_HELP_BELOW, TREND_TOLERANCE,
} from '../src/utils/insights.js';

let passed = 0;
const test = (name, fn) => { try { fn(); passed++; console.log(`  ok   ${name}`); } catch (e) { console.log(`  FAIL ${name}\n       ${e.message}`); process.exitCode = 1; } };

// Local noon on a day, so day math is never near midnight.
const day = (iso) => new Date(`${iso}T12:00:00`);
// A finished result for a person on a day.
const res = (userId, pct, when, extra = {}) => ({
  quizId: 'q1', userId, username: userId, status: 'completed', score: pct, finalScore: pct, maxScore: 100, completedAt: day(when), answers: [], ...extra,
});
// A saved answer.
const ans = (text, right, extra = {}) => ({ questionText: text, isCorrect: right, pointsAwarded: right ? 10 : 0, status: 'auto_graded', ...extra });
const quiz = (id, title, texts) => ({ id, title, questions: texts.map((t, i) => ({ id: `${id}-${i}`, questionText: t, points: 10 })) });

console.log('dates and scores');
test('toDate reads a Date, a Timestamp like object, seconds and milliseconds', () => {
  const d = day('2026-10-01');
  assert.equal(toDate(d).getTime(), d.getTime());
  assert.equal(toDate({ toDate: () => d }).getTime(), d.getTime());
  assert.equal(toDate({ seconds: d.getTime() / 1000 }).getTime(), d.getTime());
  assert.equal(toDate(d.getTime()).getTime(), d.getTime());
});
test('toDate gives null for nothing or rubbish', () => {
  assert.equal(toDate(null), null);
  assert.equal(toDate(undefined), null);
  assert.equal(toDate(new Date('nope')), null);
  assert.equal(toDate('yesterday'), null);
});
test('resultPercent uses finalScore when completed and score when pending', () => {
  assert.equal(resultPercent({ status: 'completed', finalScore: 80, score: 10, maxScore: 100 }), 80);
  assert.equal(resultPercent({ status: 'pending', finalScore: 80, score: 10, maxScore: 100 }), 10);
});
test('resultPercent is null without a maximum, and never above 100', () => {
  assert.equal(resultPercent({ status: 'completed', finalScore: 5, maxScore: 0 }), null);
  assert.equal(resultPercent({ status: 'completed', finalScore: 500, maxScore: 100 }), 100);
  assert.equal(resultPercent({}), null);
});
test('a pending result is not scored', () => {
  assert.equal(isScored({ status: 'pending', score: 50, maxScore: 100 }), false);
  assert.equal(isScored(res('a', 50, '2026-10-01')), true);
});

console.log('weekly activity');
test('a Wednesday belongs to the week that starts on the Monday before', () => {
  const start = weekStart(day('2026-10-14'));          // Wednesday
  assert.equal(start.getDay(), 1);
  assert.equal(start.getDate(), 12);
  assert.equal(start.getHours(), 0);
});
test('a Sunday belongs to the week that started six days earlier', () => {
  assert.equal(weekStart(day('2026-10-18')).getDate(), 12);
});
test('there are always 8 weeks, oldest first, ending with this week', () => {
  const weeks = weeklyActivity([], day('2026-10-14'));
  assert.equal(weeks.length, 8);
  assert.equal(weeks[7].start.getTime(), weekStart(day('2026-10-14')).getTime());
  assert.ok(weeks[0].start < weeks[1].start);
  assert.ok(weeks.every((w) => w.count === 0));
});
test('submissions land in the right week', () => {
  const rs = [res('a', 50, '2026-10-12'), res('b', 50, '2026-10-18'), res('c', 50, '2026-10-05'), res('d', 50, '2026-09-28')];
  const weeks = weeklyActivity(rs, day('2026-10-14'));
  assert.equal(weeks[7].count, 2);                      // 12 and 18 Oct
  assert.equal(weeks[6].count, 1);                      // 5 Oct
  assert.equal(weeks[5].count, 1);                      // 28 Sep
});
test('results older than the window are ignored, not squeezed into the first bar', () => {
  const weeks = weeklyActivity([res('a', 50, '2026-01-05')], day('2026-10-14'));
  assert.equal(weeks.reduce((n, w) => n + w.count, 0), 0);
});
test('results from the future or with no time are ignored', () => {
  const weeks = weeklyActivity([res('a', 50, '2027-01-05'), { userId: 'b', completedAt: null }], day('2026-10-14'));
  assert.equal(weeks.reduce((n, w) => n + w.count, 0), 0);
});

console.log('summary');
test('total counts every result and unique students counts different people', () => {
  const s = summarize([res('a', 50, '2026-10-01'), res('a', 70, '2026-10-02'), res('b', 90, '2026-10-02')]);
  assert.equal(s.total, 3);
  assert.equal(s.uniqueStudents, 2);
});
test('the average uses finished results only', () => {
  const s = summarize([res('a', 40, '2026-10-01'), res('b', 80, '2026-10-02'), res('c', 0, '2026-10-02', { status: 'pending', score: 0, finalScore: 0 })]);
  assert.equal(s.averageScore, 60);
});
test('no results gives zeros and a null average, never NaN', () => {
  assert.deepEqual(summarize([]), { total: 0, uniqueStudents: 0, averageScore: null });
  assert.deepEqual(summarize(undefined), { total: 0, uniqueStudents: 0, averageScore: null });
});

console.log('fully right');
test('the grader saying correct is enough', () => {
  assert.equal(isFullyRight({ isCorrect: true, pointsAwarded: 0 }, { points: 10 }), true);
});
test('full points count even when isCorrect is missing', () => {
  assert.equal(isFullyRight({ pointsAwarded: 10 }, { points: 10 }), true);
});
test('partial credit is not fully right', () => {
  assert.equal(isFullyRight({ isCorrect: false, pointsAwarded: 6 }, { points: 10 }), false);
});
test('a zero point question with no correct flag is not fully right', () => {
  assert.equal(isFullyRight({ pointsAwarded: 0 }, { points: 0 }), false);
});

console.log('matching answers to questions');
test('the position is trusted when the text still matches', () => {
  const q = quiz('q1', 'Quiz', ['A', 'B']);
  assert.equal(questionForAnswer(q, { questionText: 'B' }, 1).questionText, 'B');
});
test('after an edit moved the question, it is found by its text', () => {
  const q = quiz('q1', 'Quiz', ['New first', 'A', 'B']);
  assert.equal(questionForAnswer(q, { questionText: 'B' }, 1).questionText, 'B');
});
test('after the question was deleted, it is not blamed on another one', () => {
  const q = quiz('q1', 'Quiz', ['A']);
  assert.equal(questionForAnswer(q, { questionText: 'Gone' }, 0), null);
});

console.log('most missed questions');
// Four students all miss Q "Hard", two of four miss "Middle", nobody misses "Easy".
const quizzes = [quiz('q1', 'Maths', ['Hard', 'Middle', 'Easy'])];
const plays = ['a', 'b', 'c', 'd'].map((id, i) => res(id, 50, '2026-10-01', {
  answers: [ans('Hard', false), ans('Middle', i < 2), ans('Easy', true)],
}));
test('questions are ordered with the lowest accuracy first', () => {
  const list = mostMissed(plays, quizzes);
  assert.deepEqual(list.map((q) => q.questionText), ['Hard', 'Middle']);
  assert.deepEqual(list.map((q) => q.accuracy), [0, 50]);
});
test('a question nobody missed is not listed', () => {
  assert.ok(!mostMissed(plays, quizzes).some((q) => q.questionText === 'Easy'));
});
test('a row carries the quiz title and the attempt count', () => {
  const [top] = mostMissed(plays, quizzes);
  assert.equal(top.quizTitle, 'Maths');
  assert.equal(top.attempts, 4);
  assert.equal(top.students, 4);
});
test('a question needs at least 3 students', () => {
  assert.equal(mostMissed(plays.slice(0, 2), quizzes).length, 0);
  assert.equal(mostMissed(plays.slice(0, 3), quizzes).length, 2);
});
test('one student replaying does not make 3 students', () => {
  const same = [0, 1, 2].map((i) => res('a', 10, `2026-10-0${i + 1}`, { answers: [ans('Hard', false)] }));
  assert.equal(mostMissed(same, quizzes).length, 0);
});
test('a pending review answer is skipped, not counted wrong', () => {
  const pend = ['a', 'b', 'c'].map((id) => res(id, 0, '2026-10-01', { answers: [ans('Hard', false, { status: 'pending_review', pointsAwarded: 0 })] }));
  assert.equal(mostMissed(pend, quizzes).length, 0);
});
test('a pending answer lowers neither attempts nor accuracy of a question', () => {
  const mix = [
    ...plays,
    res('e', 0, '2026-10-01', { answers: [ans('Hard', false, { status: 'pending_review' })] }),
  ];
  const hard = mostMissed(mix, quizzes).find((q) => q.questionText === 'Hard');
  assert.equal(hard.attempts, 4);
});
test('partial credit counts as a miss', () => {
  const part = ['a', 'b', 'c'].map((id) => res(id, 60, '2026-10-01', { answers: [ans('Hard', false, { pointsAwarded: 6 })] }));
  assert.equal(mostMissed(part, quizzes)[0].accuracy, 0);
});
test('full points count as right even if isCorrect is missing', () => {
  const rs = ['a', 'b', 'c', 'd'].map((id, i) => res(id, 50, '2026-10-01', { answers: [{ questionText: 'Hard', pointsAwarded: i < 3 ? 10 : 0, status: 'auto_graded' }] }));
  assert.equal(mostMissed(rs, quizzes)[0].accuracy, 75);
});
test('results of a deleted quiz are ignored', () => {
  const orphan = ['a', 'b', 'c'].map((id) => res(id, 0, '2026-10-01', { quizId: 'gone', answers: [ans('Hard', false)] }));
  assert.equal(mostMissed(orphan, quizzes).length, 0);
});
test('questions from different quizzes with the same text stay separate', () => {
  // Duplicating a quiz copies its question ids, so the same id can live in two quizzes.
  const two = [quiz('q1', 'Maths', ['Same']), quiz('q2', 'Science', ['Same'])];
  two[1].questions[0].id = two[0].questions[0].id;
  const rs = [
    ...['a', 'b', 'c'].map((id) => res(id, 0, '2026-10-01', { quizId: 'q1', answers: [ans('Same', false)] })),
    ...['a', 'b', 'c'].map((id) => res(id, 100, '2026-10-01', { quizId: 'q2', answers: [ans('Same', true)] })),
  ];
  const list = mostMissed(rs, two);
  assert.equal(list.length, 1);
  assert.equal(list[0].quizTitle, 'Maths');
  assert.equal(list[0].attempts, 3);
  assert.equal(list[0].accuracy, 0);
});
test('only the hardest 8 are returned', () => {
  const texts = Array.from({ length: 12 }, (_, i) => `Q${i}`);
  const big = [quiz('q1', 'Big', texts)];
  const rs = ['a', 'b', 'c'].map((id) => res(id, 0, '2026-10-01', { answers: texts.map((t) => ans(t, false)) }));
  assert.equal(mostMissed(rs, big).length, 8);
});
test('ties go to the question with more attempts', () => {
  const two = [quiz('q1', 'T', ['Few', 'Many'])];
  const rs = [
    ...['a', 'b', 'c'].map((id) => res(id, 0, '2026-10-01', { answers: [ans('Few', false), ans('Many', false)] })),
    res('d', 0, '2026-10-01', { answers: [ans('Many', false)] }),
  ];
  assert.deepEqual(mostMissed(rs, two).map((q) => q.questionText), ['Many', 'Few']);
});
test('a result with no answers array does not break anything', () => {
  assert.equal(mostMissed([{ quizId: 'q1', userId: 'a' }], quizzes).length, 0);
  assert.equal(mostMissed(undefined, undefined).length, 0);
});

console.log('trend');
test('fewer than 3 results has no trend', () => {
  assert.equal(trendOf([]), null);
  assert.equal(trendOf([50, 90]), null);
});
test('rising scores point up', () => {
  assert.equal(trendOf([40, 50, 70, 80, 90]), 'up');
});
test('falling scores point down', () => {
  assert.equal(trendOf([90, 85, 60, 50, 40]), 'down');
});
test('a small move is steady', () => {
  assert.equal(trendOf([70, 72, 74, 71, 73]), 'steady');
});
test('exactly the tolerance is still steady', () => {
  assert.equal(trendOf([50, 50, 50, 50 + TREND_TOLERANCE, 50 + TREND_TOLERANCE, 50 + TREND_TOLERANCE]), 'steady');
  assert.equal(trendOf([50, 50, 50, 51 + TREND_TOLERANCE, 51 + TREND_TOLERANCE, 51 + TREND_TOLERANCE]), 'up');
});
test('only the latest 3 are compared with the earlier ones', () => {
  // Earlier 20, 20, 20 (avg 20) and latest 80, 80, 80: up. The old 100 at the very start must not matter much.
  assert.equal(trendOf([20, 20, 20, 80, 80, 80]), 'up');
  assert.equal(trendOf([90, 90, 90, 40, 40, 40]), 'down');
});
test('with exactly 3 results the latest 2 are compared with the first', () => {
  assert.equal(trendOf([30, 80, 90]), 'up');
  assert.equal(trendOf([90, 40, 30]), 'down');
});

console.log('students');
test('the average is over finished results and attempts counts all', () => {
  const rows = studentRows([res('a', 40, '2026-10-01'), res('a', 80, '2026-10-02'), res('a', 0, '2026-10-03', { status: 'pending', score: 0 })]);
  assert.equal(rows[0].attempts, 3);
  assert.equal(rows[0].average, 60);
});
test('below 60 needs help, 60 does not', () => {
  const rows = studentRows([res('low', 59, '2026-10-01'), res('edge', 60, '2026-10-01'), res('high', 90, '2026-10-01')]);
  const by = Object.fromEntries(rows.map((r) => [r.id, r.needsHelp]));
  assert.deepEqual(by, { low: true, edge: false, high: false });
  assert.equal(NEEDS_HELP_BELOW, 60);
});
test('59.6 shows as 60 and is not flagged', () => {
  const rows = studentRows([res('a', 59.6, '2026-10-01')]);
  assert.equal(rows[0].average, 60);
  assert.equal(rows[0].needsHelp, false);
});
test('a student with only pending results has no average and is not flagged', () => {
  const [row] = studentRows([res('a', 0, '2026-10-01', { status: 'pending', score: 0 })]);
  assert.equal(row.average, null);
  assert.equal(row.needsHelp, false);
});
test('the trend follows time, not the order the database returned', () => {
  // Handed over newest first, which is the opposite of the order that matters.
  const rs = [res('a', 90, '2026-10-05'), res('a', 85, '2026-10-04'), res('a', 80, '2026-10-03'), res('a', 30, '2026-10-02'), res('a', 20, '2026-10-01')];
  assert.equal(studentRows(rs)[0].trend, 'up');
});
test('a guest has a name and a dash for trend, even with many results', () => {
  const g = (pct, when) => res('guest_1', pct, when, { isGuest: true, username: 'Sam' });
  const [row] = studentRows([g(10, '2026-10-01'), g(50, '2026-10-02'), g(90, '2026-10-03'), g(95, '2026-10-04')]);
  assert.equal(row.isGuest, true);
  assert.equal(row.name, 'Sam');
  assert.equal(row.trend, null);
});
test('the lowest average comes first, and people with no average last', () => {
  const rows = studentRows([res('hi', 90, '2026-10-01'), res('lo', 20, '2026-10-01'), res('none', 0, '2026-10-01', { status: 'pending', score: 0 })]);
  assert.deepEqual(rows.map((r) => r.id), ['lo', 'hi', 'none']);
});
test('a signed in student with no name on the result still gets a label', () => {
  const [row] = studentRows([{ ...res('uid1234abcd', 50, '2026-10-01'), username: undefined }]);
  assert.equal(row.name, 'Student abcd');
});
test('nameOf prefers a typed name and trims it', () => {
  assert.equal(nameOf({ username: '  Maya  ', userId: 'x' }), 'Maya');
  assert.equal(nameOf({ isGuest: true, userId: 'guest_1' }), 'Guest');
});
test('the newest real name wins', () => {
  const rows = studentRows([res('a', 50, '2026-10-01', { username: 'Old' }), res('a', 50, '2026-10-02', { username: 'New' })]);
  assert.equal(rows[0].name, 'New');
});

console.log(`\n${passed} checks passed`);
if (process.exitCode) console.log('SOME CHECKS FAILED');
