#!/usr/bin/env node
/** Tests for src/utils/csv.js:  node scripts/test-csv.mjs */
import assert from 'node:assert/strict';
import { csvCell, toCsv, safeFileName } from '../src/utils/csv.js';

let passed = 0;
const test = (name, fn) => { try { fn(); passed++; console.log(`  ok   ${name}`); } catch (e) { console.log(`  FAIL ${name}\n       ${e.message}`); process.exitCode = 1; } };

test('plain text is quoted', () => assert.equal(csvCell('Maya'), '"Maya"'));
test('quotes inside text are doubled', () => assert.equal(csvCell('say "hi"'), '"say ""hi"""'));
test('commas and new lines stay inside the quotes', () => assert.equal(csvCell('a,b\nc'), '"a,b\nc"'));
test('real numbers stay numbers, so a score is still a score', () => { assert.equal(csvCell(42), '42'); assert.equal(csvCell(0), '0'); assert.equal(csvCell(-5), '-5'); });
test('null and undefined are empty', () => { assert.equal(csvCell(null), '""'); assert.equal(csvCell(undefined), '""'); });
test('a leading = is neutralised, which is the attack', () => {
  assert.equal(csvCell('=HYPERLINK("http://evil","Open")'), `"'=HYPERLINK(""http://evil"",""Open"")"`);
  assert.equal(csvCell('=1+1'), `"'=1+1"`);
});
test('every formula starter is neutralised: + - @ tab and return', () => {
  for (const start of ['+1', '-1', '@SUM(A1)', '\t=1', '\r=1']) assert.equal(csvCell(start)[1], "'", `${JSON.stringify(start)} was not neutralised`);
});
test('the same characters in the MIDDLE of text are left alone', () => assert.equal(csvCell('a=b+c-d@e'), '"a=b+c-d@e"'));
test('a name that merely looks numeric is text, and is protected if it starts with a sign', () => assert.equal(csvCell('-5'), `"'-5"`));
test('rows join with commas and CRLF', () => assert.equal(toCsv([['Name', 'Score'], ['Maya', 90]]), '"Name","Score"\r\n"Maya",90'));
test('a hostile name in a whole row', () => {
  const out = toCsv([['=cmd|\' /C calc\'!A0', 10]]);
  assert.ok(out.startsWith(`"'=cmd`));
});
test('file names are safe', () => {
  assert.equal(safeFileName('Chapter 5: Photosynthesis!'), 'Chapter_5_Photosynthesis');
  assert.equal(safeFileName('../../etc/passwd'), 'etc_passwd');
  assert.equal(safeFileName(''), 'quiz');
  assert.equal(safeFileName('???'), 'quiz');
});

console.log(`\n${passed} passed${process.exitCode ? ', some FAILED' : ''}`);
