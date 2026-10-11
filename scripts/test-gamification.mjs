#!/usr/bin/env node
/**
 * Tests for src/utils/gamification.js. No dependencies, run with:
 *   node scripts/test-gamification.mjs
 *
 * These are pure functions, so the tests need no browser and no Firebase. They matter
 * because when progress moves to a server on AWS, this same file is what proves the
 * ported version behaves identically.
 */
import assert from 'node:assert/strict';
import {
  xpForAttempt, totalXp, levelInfo, xpToReach, streakInfo, statsFromResults,
  badgeProgress, progressSummary, normalizeResult, XP_RULES,
} from '../src/utils/gamification.js';

let passed = 0;
const test = (name, fn) => { try { fn(); passed++; console.log(`  ok   ${name}`); } catch (e) { console.log(`  FAIL ${name}\n       ${e.message}`); process.exitCode = 1; } };

// A local time at noon on a given day, so day math is not near a midnight edge.
const day = (iso) => new Date(`${iso}T12:00:00`);
const attempt = (quizId, finalScore, maxScore, questionCount, when = '2026-10-01') =>
  ({ quizId, finalScore, maxScore, questionCount, completedAt: day(when), status: 'completed' });

console.log('xp');
test('a perfect 10 question quiz', () => {
  assert.equal(xpForAttempt({ finalScore: 100, maxScore: 100, questionCount: 10 }), 100 + 20 + XP_RULES.perfectBonus);
});
test('half right earns half of the question XP and no bonus', () => {
  assert.equal(xpForAttempt({ finalScore: 50, maxScore: 100, questionCount: 10 }), 50 + 20);
});
test('zero right still earns the participation XP', () => {
  assert.equal(xpForAttempt({ finalScore: 0, maxScore: 100, questionCount: 10 }), 20);
});
test('a score above the maximum cannot earn extra', () => {
  assert.equal(xpForAttempt({ finalScore: 999, maxScore: 100, questionCount: 10 }), xpForAttempt({ finalScore: 100, maxScore: 100, questionCount: 10 }));
});
test('a pending paragraph answer means no perfect bonus yet', () => {
  assert.equal(xpForAttempt({ finalScore: 90, maxScore: 100, questionCount: 10 }) < xpForAttempt({ finalScore: 100, maxScore: 100, questionCount: 10 }), true);
});
test('a huge quiz is capped', () => {
  assert.equal(xpForAttempt({ finalScore: 5000, maxScore: 5000, questionCount: 500 }), XP_RULES.maxPerAttempt);
});
test('empty or broken input gives 0, never NaN', () => {
  assert.equal(xpForAttempt({}), 0);
  assert.equal(xpForAttempt({ finalScore: 5, maxScore: 0, questionCount: 0 }), 0);
});
test('only the best attempt per quiz counts', () => {
  const rs = [attempt('a', 20, 100, 10), attempt('a', 100, 100, 10), attempt('a', 60, 100, 10), attempt('b', 100, 100, 10)];
  assert.equal(totalXp(rs), 2 * (100 + 20 + XP_RULES.perfectBonus));
});
test('retaking one quiz many times cannot farm XP', () => {
  const once = totalXp([attempt('a', 100, 100, 10)]);
  const many = totalXp(Array.from({ length: 50 }, () => attempt('a', 100, 100, 10)));
  assert.equal(many, once);
});

console.log('levels');
test('thresholds', () => {
  assert.equal(xpToReach(1), 0); assert.equal(xpToReach(2), 100); assert.equal(xpToReach(3), 300); assert.equal(xpToReach(5), 1000);
});
test('level from XP at the boundaries', () => {
  assert.equal(levelInfo(0).level, 1);
  assert.equal(levelInfo(99).level, 1);
  assert.equal(levelInfo(100).level, 2);
  assert.equal(levelInfo(299).level, 2);
  assert.equal(levelInfo(300).level, 3);
  assert.equal(levelInfo(1000).level, 5);
});
test('progress inside a level', () => {
  const l = levelInfo(200);
  assert.equal(l.level, 2); assert.equal(l.intoLevel, 100); assert.equal(l.span, 200); assert.equal(l.progress, 0.5);
});
test('level, start and next stay consistent for a wide range', () => {
  for (let xp = 0; xp < 20000; xp += 37) {
    const l = levelInfo(xp);
    assert.ok(l.levelStartXp <= xp && xp < l.nextLevelXp, `xp ${xp} outside its level band`);
    assert.ok(l.progress >= 0 && l.progress < 1);
  }
});
test('titles', () => {
  assert.equal(levelInfo(0).title, 'Newcomer');
  assert.equal(levelInfo(xpToReach(5)).title, 'Sharp');
  assert.equal(levelInfo(xpToReach(40)).title, 'Legend');
});
test('negative or junk XP does not break', () => {
  assert.equal(levelInfo(-50).level, 1); assert.equal(levelInfo(NaN).level, 1);
});

console.log('streaks');
test('no results', () => assert.deepEqual(streakInfo([], day('2026-10-09')), { current: 0, best: 0, doneToday: false }));
test('three days ending today', () => {
  const rs = [attempt('a', 1, 1, 1, '2026-10-07'), attempt('a', 1, 1, 1, '2026-10-08'), attempt('a', 1, 1, 1, '2026-10-09')];
  assert.deepEqual(streakInfo(rs, day('2026-10-09')), { current: 3, best: 3, doneToday: true });
});
test('the streak survives until the end of the next day', () => {
  const rs = [attempt('a', 1, 1, 1, '2026-10-07'), attempt('a', 1, 1, 1, '2026-10-08')];
  assert.deepEqual(streakInfo(rs, day('2026-10-09')), { current: 2, best: 2, doneToday: false });
});
test('missing a whole day breaks it but keeps the best', () => {
  const rs = [attempt('a', 1, 1, 1, '2026-10-01'), attempt('a', 1, 1, 1, '2026-10-02'), attempt('a', 1, 1, 1, '2026-10-03')];
  assert.deepEqual(streakInfo(rs, day('2026-10-09')), { current: 0, best: 3, doneToday: false });
});
test('several attempts on one day count once', () => {
  const rs = Array.from({ length: 5 }, () => attempt('a', 1, 1, 1, '2026-10-09'));
  assert.deepEqual(streakInfo(rs, day('2026-10-09')), { current: 1, best: 1, doneToday: true });
});
test('works across a month boundary', () => {
  const rs = [attempt('a', 1, 1, 1, '2026-09-30'), attempt('a', 1, 1, 1, '2026-10-01')];
  assert.equal(streakInfo(rs, day('2026-10-01')).current, 2);
});
test('works across daylight saving changes (US, Europe, Southern Hemisphere)', () => {
  // The clocks change on different days in different places. Run this file under several
  // TZ values to cover them all, for example: TZ=America/New_York node scripts/test-gamification.mjs
  for (const [from, to] of [['2026-03-07', '2026-03-09'], ['2026-03-28', '2026-03-30'], ['2026-04-04', '2026-04-06'], ['2026-09-26', '2026-09-28'], ['2026-10-31', '2026-11-02'], ['2026-11-01', '2026-11-03']]) {
    // build the three consecutive calendar days explicitly, immune to the 23 or 25 hour day
    const [y, m, dd] = from.split('-').map(Number);
    const three = [0, 1, 2].map((i) => new Date(y, m - 1, dd + i, 12, 0, 0));
    const rs = three.map((when) => ({ quizId: 'a', finalScore: 1, maxScore: 1, questionCount: 1, completedAt: when, status: 'completed' }));
    assert.equal(streakInfo(rs, three[2]).current, 3, `three calendar days from ${from} should be a 3 day streak`);
  }
});

console.log('badges');
test('first attempt unlocks First steps', () => {
  const b = badgeProgress(statsFromResults([attempt('a', 10, 100, 10)], day('2026-10-09')));
  assert.equal(b.find((x) => x.id === 'first-steps').earned, true);
  assert.equal(b.find((x) => x.id === 'perfect').earned, false);
});
test('locked badges report progress, capped at the target', () => {
  const rs = Array.from({ length: 3 }, (_, i) => attempt(`q${i}`, 10, 100, 10));
  const explorer = badgeProgress(statsFromResults(rs, day('2026-10-09'))).find((x) => x.id === 'explorer');
  assert.equal(explorer.value, 3); assert.equal(explorer.target, 5); assert.equal(explorer.earned, false);
  const many = Array.from({ length: 9 }, (_, i) => attempt(`q${i}`, 10, 100, 10));
  assert.equal(badgeProgress(statsFromResults(many, day('2026-10-09'))).find((x) => x.id === 'explorer').value, 5);
});
test('comeback needs a better retake on the SAME quiz', () => {
  const worse = badgeProgress(statsFromResults([attempt('a', 80, 100, 10, '2026-10-01'), attempt('a', 40, 100, 10, '2026-10-02')])).find((x) => x.id === 'comeback');
  const better = badgeProgress(statsFromResults([attempt('a', 40, 100, 10, '2026-10-01'), attempt('a', 80, 100, 10, '2026-10-02')])).find((x) => x.id === 'comeback');
  const different = badgeProgress(statsFromResults([attempt('a', 40, 100, 10, '2026-10-01'), attempt('b', 80, 100, 10, '2026-10-02')])).find((x) => x.id === 'comeback');
  assert.equal(worse.earned, false); assert.equal(better.earned, true); assert.equal(different.earned, false);
});
test('streak badges use the best streak, not only the current one', () => {
  const rs = ['2026-09-01', '2026-09-02', '2026-09-03'].map((d) => attempt('a', 1, 1, 1, d));
  assert.equal(badgeProgress(statsFromResults(rs, day('2026-10-09'))).find((x) => x.id === 'streak-3').earned, true);
});

console.log('progress summary');
test('reports XP gained, level up and new badges for a first perfect quiz', () => {
  const first = attempt('a', 100, 100, 10, '2026-10-09');
  const s = progressSummary([], [first], day('2026-10-09'));
  assert.equal(s.xpGained, 145);
  assert.equal(s.leveledUp, true);
  assert.equal(s.levelAfter.level, 2);
  assert.deepEqual(s.newBadges.map((b) => b.id).sort(), ['first-steps', 'perfect']);
  assert.equal(s.streakAfter.current, 1);
});
test('a worse retake gains nothing and unlocks nothing new', () => {
  const before = [attempt('a', 100, 100, 10, '2026-10-08')];
  const s = progressSummary(before, [...before, attempt('a', 10, 100, 10, '2026-10-09')], day('2026-10-09'));
  assert.equal(s.xpGained, 0); assert.equal(s.leveledUp, false); assert.deepEqual(s.newBadges, []);
});
test('a better retake pays the difference only', () => {
  const before = [attempt('a', 50, 100, 10, '2026-10-08')];
  const s = progressSummary(before, [...before, attempt('a', 100, 100, 10, '2026-10-09')], day('2026-10-09'));
  assert.equal(s.xpGained, 145 - 70);
  assert.ok(s.newBadges.some((b) => b.id === 'comeback'));
});

console.log('reading results');
test('a Firestore Timestamp, a seconds object, an ISO string and a missing time', () => {
  const when = new Date('2026-10-09T10:00:00Z');
  assert.equal(normalizeResult({ quizId: 'a', finalScore: 5, maxScore: 10, answers: [{}, {}], completedAt: { toDate: () => when } }).completedAt.getTime(), when.getTime());
  assert.equal(normalizeResult({ quizId: 'a', completedAt: { seconds: when.getTime() / 1000 } }).completedAt.getTime(), when.getTime());
  assert.equal(normalizeResult({ quizId: 'a', completedAt: when.toISOString() }).completedAt.getTime(), when.getTime());
  assert.ok(normalizeResult({ quizId: 'a', completedAt: null }).completedAt instanceof Date);
});
test('question count comes from answers, and score falls back to score', () => {
  const n = normalizeResult({ quizId: 'a', score: 7, maxScore: 10, answers: [{}, {}, {}] });
  assert.equal(n.questionCount, 3); assert.equal(n.finalScore, 7);
});
test('a Date object is used as it is', () => {
  const when = new Date('2026-10-09T10:00:00Z');
  assert.equal(normalizeResult({ quizId: 'a', completedAt: when }).completedAt.getTime(), when.getTime());
});
test('null input is null', () => assert.equal(normalizeResult(null), null));

// ── The daily question ──────────────────────────────────────────────────────────────
// A daily result is saved like any result, with kind 'daily' and its own quizId per day.
const daily = (date, right, quizId = `daily-${date}`) =>
  ({ quizId, finalScore: right ? 1 : 0, maxScore: 1, questionCount: 1, completedAt: day(date), status: 'completed', kind: 'daily' });

console.log('daily question: xp');
test('a right daily answer is a flat 15 XP, a wrong one 5', () => {
  assert.equal(xpForAttempt(daily('2026-10-09', true)), 15);
  assert.equal(xpForAttempt(daily('2026-10-09', false)), 5);
  assert.equal(XP_RULES.dailyRight, 15); assert.equal(XP_RULES.dailyWrong, 5);
});
test('a right daily answer gets no perfect bonus (the quiz formula would give 10 + 2 + 25)', () => {
  assert.notEqual(xpForAttempt(daily('2026-10-09', true)), xpForAttempt({ ...daily('2026-10-09', true), kind: 'quiz' }));
});
test('a daily result with no maximum score still earns the wrong answer amount, never NaN', () => {
  assert.equal(xpForAttempt({ kind: 'daily' }), 5);
});
test('daily XP adds to the total, one per day', () => {
  const rs = [daily('2026-10-07', true), daily('2026-10-08', false), attempt('a', 100, 100, 10)];
  assert.equal(totalXp(rs), 15 + 5 + 145);
});
test('answering the same day twice cannot farm XP (same quizId, best one counts)', () => {
  assert.equal(totalXp([daily('2026-10-09', false), daily('2026-10-09', true), daily('2026-10-09', true)]), 15);
});

console.log('daily question: streak');
test('a daily answer alone starts a streak', () => {
  assert.deepEqual(streakInfo([daily('2026-10-09', false)], day('2026-10-09')), { current: 1, best: 1, doneToday: true });
});
test('a daily answer joins a quiz streak', () => {
  const rs = [attempt('a', 1, 1, 1, '2026-10-07'), daily('2026-10-08', true), attempt('b', 1, 1, 1, '2026-10-09')];
  assert.equal(streakInfo(rs, day('2026-10-09')).current, 3);
});
test('a daily answer fills a gap day so the streak does not break', () => {
  const rs = [attempt('a', 1, 1, 1, '2026-10-07'), attempt('a', 1, 1, 1, '2026-10-09')];
  assert.equal(streakInfo(rs, day('2026-10-09')).current, 1);
  assert.equal(streakInfo([...rs, daily('2026-10-08', false)], day('2026-10-09')).current, 3);
});

console.log('daily question: not a quiz attempt');
test('dailies do not count in attempts, distinctQuizzes, perfect or comebacks', () => {
  const rs = [daily('2026-10-05', true), daily('2026-10-06', true), daily('2026-10-07', true), daily('2026-10-07', false)];
  const s = statsFromResults(rs, day('2026-10-09'));
  assert.equal(s.attempts, 0); assert.equal(s.distinctQuizzes, 0); assert.equal(s.perfect, 0); assert.equal(s.comebacks, 0);
});
test('a right daily answer is not a perfect score, and a worse then better daily is not a comeback', () => {
  const s = statsFromResults([daily('2026-10-09', false, 'daily-x'), { ...daily('2026-10-09', true, 'daily-x'), completedAt: new Date(day('2026-10-09').getTime() + 1000) }], day('2026-10-09'));
  assert.equal(s.comebacks, 0); assert.equal(s.perfect, 0);
});
test('quiz numbers are the same with or without dailies mixed in', () => {
  const quizzes = [attempt('a', 40, 100, 10, '2026-10-01'), attempt('a', 90, 100, 10, '2026-10-02'), attempt('b', 100, 100, 10, '2026-10-03')];
  const mixed = [...quizzes, daily('2026-10-04', true), daily('2026-10-05', true)];
  const a = statsFromResults(quizzes, day('2026-10-09')); const b = statsFromResults(mixed, day('2026-10-09'));
  for (const k of ['attempts', 'distinctQuizzes', 'perfect', 'comebacks']) assert.equal(b[k], a[k], k);
  assert.equal(b.xp, a.xp + 30);
});
test('daily answers do not unlock First steps, Warming up, Explorer or Flawless', () => {
  const rs = Array.from({ length: 6 }, (_, i) => daily(`2026-10-0${i + 1}`, true));
  const earned = badgeProgress(statsFromResults(rs, day('2026-10-09'))).filter((b) => b.earned).map((b) => b.id);
  for (const id of ['first-steps', 'warming-up', 'explorer', 'perfect', 'comeback', 'regular']) assert.ok(!earned.includes(id), `${id} should stay locked`);
});

console.log('daily question: Daily habit badge');
test('seven different days earn Daily habit, six do not', () => {
  const days = ['01', '02', '03', '04', '05', '06', '07'].map((d) => daily(`2026-10-${d}`, d === '03'));
  const find = (rs) => badgeProgress(statsFromResults(rs, day('2026-10-09'))).find((b) => b.id === 'daily-habit');
  assert.equal(find(days.slice(0, 6)).earned, false); assert.equal(find(days.slice(0, 6)).value, 6);
  assert.equal(find(days).earned, true);
});
test('Daily habit counts days, not answers: the same day twice is one', () => {
  const rs = [...Array.from({ length: 6 }, (_, i) => daily(`2026-10-0${i + 1}`, true)), { ...daily('2026-10-06', false), completedAt: new Date(day('2026-10-06').getTime() + 3600000) }];
  assert.equal(statsFromResults(rs, day('2026-10-09')).dailyDays, 6);
});
test('Daily habit needs daily results: seven quizzes on seven days do not earn it', () => {
  const rs = Array.from({ length: 7 }, (_, i) => attempt(`q${i}`, 1, 1, 1, `2026-10-0${i + 1}`));
  assert.equal(badgeProgress(statsFromResults(rs, day('2026-10-09'))).find((b) => b.id === 'daily-habit').earned, false);
});
test('the badge list now has Daily habit with a known icon key', () => {
  const b = badgeProgress(statsFromResults([], day('2026-10-09')));
  assert.equal(b.length, 12);
  assert.equal(b.find((x) => x.id === 'daily-habit').icon, 'sun');
});
test('the seventh daily answer reports Daily habit as a new badge in the summary', () => {
  const before = ['01', '02', '03', '04', '05', '06'].map((d) => daily(`2026-10-${d}`, true));
  const s = progressSummary(before, [...before, daily('2026-10-07', true)], day('2026-10-07'));
  // seven days in a row also reaches the One week streak badge, which is right: dailies feed the streak
  assert.deepEqual(s.newBadges.map((b) => b.id).sort(), ['daily-habit', 'streak-7']);
  assert.equal(s.xpGained, 15);
});

console.log('daily question: reading it back');
test('normalizeResult keeps kind daily and defaults to quiz', () => {
  assert.equal(normalizeResult({ quizId: 'daily-2026-10-09', kind: 'daily', finalScore: 1, maxScore: 1 }).kind, 'daily');
  assert.equal(normalizeResult({ quizId: 'a' }).kind, 'quiz');
  assert.equal(normalizeResult({ quizId: 'a', kind: 'something else' }).kind, 'quiz');
});
test('a saved daily document round trips into the right XP', () => {
  const saved = { userId: 'u', quizId: 'daily-2026-10-09', quizTitle: 'Daily question', teacherId: '', kind: 'daily', score: 1, finalScore: 1, maxScore: 1, questionCount: 1, status: 'completed', completedAt: '2026-10-09T10:00:00Z' };
  assert.equal(xpForAttempt(normalizeResult(saved)), 15);
  assert.equal(xpForAttempt(normalizeResult({ ...saved, score: 0, finalScore: 0 })), 5);
});

console.log(`\n${passed} passed${process.exitCode ? ', some FAILED' : ''}`);
