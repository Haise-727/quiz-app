#!/usr/bin/env node
/** Tests for src/utils/questionImport.js:   node scripts/test-question-import.mjs */
import assert from 'node:assert/strict';
import { parseTable, detectDelimiter, importQuestions, IMPORT_TEMPLATE, MAX_QUESTIONS } from '../src/utils/questionImport.js';

let passed = 0;
const test = (name, fn) => { try { fn(); passed++; console.log(`  ok   ${name}`); } catch (e) { console.log(`  FAIL ${name}\n       ${e.message}`); process.exitCode = 1; } };
const counter = () => { let n = 0; return () => ++n; };
const run = (text) => importQuestions(text, counter());
const H = 'type,question,correct,option1,option2,option3,option4,points,seconds,tolerance,unit';

console.log('reading the table');
test('plain rows and cells', () => assert.deepEqual(parseTable('a,b\n1,2'), [['a', 'b'], ['1', '2']]));
test('a quoted cell may hold the separator', () => assert.deepEqual(parseTable('a,"b,c"\n1,2'), [['a', 'b,c'], ['1', '2']]));
test('doubled quotes inside quotes are one quote', () => assert.deepEqual(parseTable('a\n"She said ""hi"""'), [['a'], ['She said "hi"']]));
test('a quoted cell may hold a line break', () => assert.deepEqual(parseTable('a,b\n"line 1\nline 2",x'), [['a', 'b'], ['line 1\nline 2', 'x']]));
test('Windows line endings work, and so do old Mac ones', () => {
  assert.deepEqual(parseTable('a,b\r\n1,2\r\n'), [['a', 'b'], ['1', '2']]);
  assert.deepEqual(parseTable('a,b\r1,2'), [['a', 'b'], ['1', '2']]);
});
test('blank rows are skipped, and a missing final newline is fine', () => assert.deepEqual(parseTable('a,b\n\n,\n1,2'), [['a', 'b'], ['1', '2']]));
test('a leading byte order mark is ignored', () => assert.deepEqual(parseTable('﻿a,b\n1,2'), [['a', 'b'], ['1', '2']]));
test('empty cells are kept so columns stay in place', () => assert.deepEqual(parseTable('a,b,c\n1,,3'), [['a', 'b', 'c'], ['1', '', '3']]));
test('the separator is guessed from the header: comma, semicolon or tab', () => {
  assert.equal(detectDelimiter('a,b,c\n1,2,3'), ','); assert.equal(detectDelimiter('a;b;c\n1;2;3'), ';'); assert.equal(detectDelimiter('a\tb\tc\n1\t2\t3'), '\t');
  assert.equal(detectDelimiter('question'), ','); assert.equal(detectDelimiter(''), ',');
});
test('tab separated text pasted from a spreadsheet is read', () => {
  const r = run('type\tquestion\tcorrect\toption1\toption2\nmcq\tWhich?\tB\tx\ty');
  assert.equal(r.errors.length, 0); assert.equal(r.questions[0].mcqData.options.length, 2);
});
test('a semicolon file with commas inside the text is read', () => {
  const r = run('type;question;correct\nfill;Name a colour, any colour;red|blue');
  assert.equal(r.questions[0].questionText, 'Name a colour, any colour');
});

console.log('multiple choice');
const mcq = (correct, extra = '') => `${H}\nmcq,Q?,${correct},Red,Green,Blue,Yellow,${extra}`;
test('a letter picks the option', () => {
  const q = run(mcq('B')).questions[0];
  assert.deepEqual(q.mcqData.correctOptions, [q.mcqData.options[1].id]);
});
test('letters are not case sensitive and several can be given', () => {
  const q = run(mcq('a;c')).questions[0];
  assert.deepEqual(q.mcqData.correctOptions, [q.mcqData.options[0].id, q.mcqData.options[2].id]);
});
test('1 based numbers pick the option', () => {
  const q = run(mcq('2|4')).questions[0];
  assert.deepEqual(q.mcqData.correctOptions, [q.mcqData.options[1].id, q.mcqData.options[3].id]);
});
test('the option text itself works, without caring about case', () => {
  const q = run(mcq('blue')).questions[0];
  assert.deepEqual(q.mcqData.correctOptions, [q.mcqData.options[2].id]);
});
test('empty options are dropped, so letters still match what is shown', () => {
  const r = run(`${H}\nmcq,Q?,B,Red,,Blue,,,`);
  assert.deepEqual(r.questions[0].mcqData.options.map((o) => o.text), ['Red', 'Blue']);
  assert.deepEqual(r.questions[0].mcqData.correctOptions, [r.questions[0].mcqData.options[1].id]);
});
test('every option gets its own id, and the editor fields are present', () => {
  const q = run(mcq('A')).questions[0];
  assert.equal(new Set(q.mcqData.options.map((o) => o.id)).size, 4);
  assert.ok('localMediaFile' in q.mcqData.options[0] && q.media === null && q.localMediaFile === null);
});
test('a right answer that matches nothing is an error that names it', () => {
  const r = run(mcq('Purple')); assert.equal(r.questions.length, 0); assert.match(r.errors[0].message, /Purple/);
});
test('zero is not an option number, since numbers start at 1', () => { const r = run(mcq('0')); assert.equal(r.questions.length, 0); assert.match(r.errors[0].message, /does not match/); });
test('a letter past the last option is an error', () => assert.equal(run(mcq('F')).questions.length, 0));
test('no right answer given is an error', () => assert.match(run(mcq('')).errors[0].message, /which option is right/i));
test('one option is not enough', () => assert.match(run(`${H}\nmcq,Q?,A,Only,,,,,`).errors[0].message, /at least two/i));

console.log('the other types');
test('true or false understands the usual words', () => {
  for (const [w, v] of [['true', true], ['TRUE', true], ['t', true], ['yes', true], ['1', true], ['false', false], ['F', false], ['no', false], ['0', false]]) {
    assert.equal(run(`${H}\ntf,Q?,${w}`).questions[0].trueFalseData.correctAnswer, v, w);
  }
});
test('true or false with anything else is an error', () => assert.match(run(`${H}\ntf,Q?,maybe`).errors[0].message, /true or false/i));
test('fill in the blank takes several accepted answers', () => {
  const q = run(`${H}\nfill,Capital of Japan?,Tokyo | Tōkyō ; TOKYO`).questions[0];
  assert.deepEqual(q.fillBlankData.answers.map((a) => a.text), ['Tokyo', 'Tōkyō', 'TOKYO']);
  assert.equal(q.fillBlankData.caseSensitive, false);
});
test('fill in the blank with no answer is an error', () => assert.equal(run(`${H}\nfill,Q?,`).questions.length, 0));
test('a number question keeps the number, tolerance and unit as text, like the editor does', () => {
  const q = run(`${H}\nnumber,g?,"9,8",,,,,10,30,0.1,m/s`).questions[0];
  assert.deepEqual(q.numericData, { answer: '9.8', tolerance: '0.1', unit: 'm/s' });
});
test('a number question needs a number and a sane tolerance', () => {
  assert.match(run(`${H}\nnumber,g?,lots`).errors[0].message, /not a number/);
  assert.match(run(`${H}\nnumber,g?,5,,,,,,,-1`).errors[0].message, /tolerance/);
  assert.equal(run(`${H}\nnumber,g?,0`).questions.length, 1);              // zero is a number
});
test('a paragraph needs no answer, and keywords are optional', () => {
  assert.deepEqual(run(`${H}\nparagraph,Describe it.,`).questions[0].paragraphData.keywords, [{ text: '' }]);
  assert.deepEqual(run(`${H}\nessay,Describe it.,cell|nucleus`).questions[0].paragraphData.keywords, [{ text: 'cell' }, { text: 'nucleus' }]);
});
test('type names have many spellings', () => {
  for (const t of ['MCQ', 'Multiple Choice', 'multiple_choice', 'multi-choice']) assert.equal(run(`${H}\n${t},Q?,A,x,y`).questions[0]?.type, 'MCQ', t);
  for (const t of ['TF', 'True/False', 'true or false', 'boolean']) assert.equal(run(`${H}\n${t},Q?,true`).questions[0]?.type, 'TRUE_FALSE', t);
});
test('an unknown type is an error that says what to use', () => assert.match(run(`${H}\nmatching,Q?,x`).errors[0].message, /not a question type/));

console.log('guessing the type');
test('with options it is multiple choice', () => assert.equal(run(`${H}\n,Q?,A,x,y`).questions[0].type, 'MCQ'));
test('true or false words mean true or false', () => assert.equal(run(`${H}\n,Q?,true`).questions[0].type, 'TRUE_FALSE'));
test('a single option is not enough to guess multiple choice', () => assert.equal(run(`${H}\n,Q?,A,x`).questions[0].type, 'FILL_IN_THE_BLANK'));
test('an answer and no options is fill in the blank', () => assert.equal(run(`${H}\n,Q?,Paris`).questions[0].type, 'FILL_IN_THE_BLANK'));
test('nothing at all is a paragraph', () => assert.equal(run(`${H}\n,Describe.`).questions[0].type, 'PARAGRAPH'));

console.log('points, seconds and the header');
test('defaults are 10 points and 60 seconds', () => { const q = run(`${H}\ntf,Q?,true`).questions[0]; assert.equal(q.points, 10); assert.equal(q.timeLimit, 60); });
test('points and seconds are read', () => { const q = run(`${H}\ntf,Q?,true,,,,,25,45`).questions[0]; assert.equal(q.points, 25); assert.equal(q.timeLimit, 45); });
test('bad points or seconds are errors, and zero points is allowed', () => {
  assert.match(run(`${H}\ntf,Q?,true,,,,,lots`).errors[0].message, /points/);
  assert.match(run(`${H}\ntf,Q?,true,,,,,10,0`).errors[0].message, /seconds/);
  assert.equal(run(`${H}\ntf,Q?,true,,,,,0,30`).questions[0].points, 0);
});
test('column names ignore case, spaces and underscores, and accept friendly names', () => {
  const r = run('Question Text, Correct Answer, Choice 1, Choice 2, Time Limit\nPick,B,x,y,15');
  assert.equal(r.questions[0].type, 'MCQ'); assert.equal(r.questions[0].timeLimit, 15);
});
test('without a question column nothing is imported', () => assert.match(run('type,correct\nmcq,A').errors[0].message, /question/));
test('an empty file says so', () => { assert.match(run('').errors[0].message, /nothing to import/i); assert.match(run('   \n  ').errors[0].message, /nothing to import/i); });
test('a header only file imports nothing and complains about nothing', () => { const r = run(H); assert.equal(r.questions.length, 0); assert.equal(r.errors.length, 0); });

console.log('mixed files and limits');
test('good rows are kept when others fail', () => {
  const r = run(`${H}\ntf,Fine?,true\ntf,Broken?,maybe\nfill,Also fine,x`);
  assert.equal(r.questions.length, 2); assert.equal(r.errors.length, 1);
});
test('errors give the row number a spreadsheet would show, header being row 1, even past blank rows', () => {
  const r = run(`${H}\ntf,Fine?,true\ntf,Broken?,maybe\n,,\n\ntf,Also broken?,perhaps`);
  assert.deepEqual(r.errors.map((e) => e.row), [3, 6]);
});
test('a cell with a line break is one row, not two', () => {
  const r = run(`${H}\nfill,"two\nlines",x\ntf,Broken?,maybe`);
  assert.deepEqual(r.errors.map((e) => e.row), [3]);
});
test('a missing question column is reported on the header row', () => assert.equal(run('\n\ntype,correct\nmcq,A').errors[0].row, 3));
test('a row with an empty question is reported', () => assert.match(run(`${H}\ntf,,true`).errors[0].message, /question is empty/i));
test('the question ids are all different', () => {
  const ids = run(`${H}\ntf,A?,true\ntf,B?,true\ntf,C?,true`).questions.map((q) => q.id);
  assert.equal(new Set(ids).size, 3);
});
test('no more than the limit is imported, and the file says so', () => {
  const rows = Array.from({ length: MAX_QUESTIONS + 5 }, (_, i) => `tf,Q${i}?,true`).join('\n');
  const r = run(`${H}\n${rows}`);
  assert.equal(r.questions.length, MAX_QUESTIONS); assert.match(r.errors.at(-1).message, new RegExp(String(MAX_QUESTIONS)));
});
test('far too much text is refused outright, with a message that says why', () => {
  const r = run(`${H}\n` + 'tf,Q?,true\n'.repeat(60_000));
  assert.equal(r.questions.length, 0); assert.match(r.errors[0].message, /too much text/i);
});
test('the downloadable template imports with no errors', () => {
  const r = run(IMPORT_TEMPLATE); assert.equal(r.errors.length, 0); assert.equal(r.questions.length, 5);
  assert.deepEqual(r.questions.map((q) => q.type), ['MCQ', 'MCQ', 'TRUE_FALSE', 'FILL_IN_THE_BLANK', 'NUMERIC']);
});
test('text is kept exactly, including quotes, accents and line breaks', () => {
  const q = run(`${H}\nfill,"Say ""hello"" in café\nline two",x`).questions[0];
  assert.equal(q.questionText, 'Say "hello" in café\nline two');
});
test('formulas and dollar signs come through untouched', () => assert.equal(run(`${H}\nfill,"What is $x^2$ when x is 3?",9`).questions[0].questionText, 'What is $x^2$ when x is 3?'));

console.log(`\n${passed} passed${process.exitCode ? ', some FAILED' : ''}`);
