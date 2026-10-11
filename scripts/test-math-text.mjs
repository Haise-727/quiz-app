#!/usr/bin/env node
/**
 * Tests for src/utils/mathText.js:   node scripts/test-math-text.mjs
 * The main risk is money. "It costs $5 and $10" must stay plain text.
 */
import assert from 'node:assert/strict';
import { splitMath, hasMath } from '../src/utils/mathText.js';

let passed = 0;
const test = (name, fn) => { try { fn(); passed++; console.log(`  ok   ${name}`); } catch (e) { console.log(`  FAIL ${name}\n       ${e.message}`); process.exitCode = 1; } };
const types = (t) => splitMath(t).map((p) => `${p.type}:${p.value}`);

test('plain text is one text part', () => assert.deepEqual(types('What is 2 + 2?'), ['text:What is 2 + 2?']));
test('empty and missing text give no parts', () => { assert.deepEqual(splitMath(''), []); assert.deepEqual(splitMath(null), []); assert.deepEqual(splitMath(undefined), []); });
test('an inline formula is found between dollar signs', () => assert.deepEqual(types('Solve $x^2 = 9$ now'), ['text:Solve ', 'inline:x^2 = 9', 'text: now']));
test('a display formula uses two dollar signs', () => assert.deepEqual(types('Start $$\\frac{a}{b}$$ end'), ['text:Start ', 'display:\\frac{a}{b}', 'text: end']));
test('several formulas in one line', () => assert.deepEqual(types('$a$ and $b$'), ['inline:a', 'text: and ', 'inline:b']));
test('a formula can be the whole text', () => assert.deepEqual(types('$E = mc^2$'), ['inline:E = mc^2']));
test('money is not maths: a space before the second dollar sign', () => assert.deepEqual(types('It costs $5 and $10'), ['text:It costs $5 and $10']));
test('money is not maths: a digit right after the closing dollar sign', () => assert.deepEqual(types('Between $x$5 and later'), ['text:Between $x$5 and later']));
test('a space just inside the opening dollar sign is not maths', () => assert.deepEqual(types('a $ b$ c'), ['text:a $ b$ c']));
test('a space just inside the closing dollar sign is not maths', () => assert.deepEqual(types('Is $x $ maths'), ['text:Is $x $ maths']));
test('a display formula holding only a space is left alone', () => assert.deepEqual(types('a $$ $$ b'), ['text:a $$ $$ b']));
test('a lone dollar sign stays', () => assert.deepEqual(types('Pay $ now'), ['text:Pay $ now']));
test('an escaped dollar sign is a plain dollar sign', () => assert.deepEqual(types('Costs \\$5 and \\$10'), ['text:Costs $5 and $10']));
test('an escaped dollar sign inside a formula does not end it', () => assert.deepEqual(types('$a \\$ b$'), ['inline:a \\$ b']));
test('an empty formula is left alone', () => assert.deepEqual(types('x $$ y'), ['text:x $$ y']));
test('an unclosed formula is left alone', () => assert.deepEqual(types('Solve $x^2 = 9'), ['text:Solve $x^2 = 9']));
test('hasMath tells formulas from money', () => {
  assert.equal(hasMath('Solve $x$'), true); assert.equal(hasMath('$$x$$'), true);
  assert.equal(hasMath('It costs $5 and $10'), false); assert.equal(hasMath('plain'), false);
});
test('the text is rebuilt without losing a character', () => {
  const t = 'A $x$ B $$y$$ C \\$ D';
  const back = splitMath(t).map((p) => (p.type === 'text' ? p.value : p.value)).join('');
  assert.equal(back, 'A x B y C $ D');
});

console.log(`\n${passed} passed${process.exitCode ? ', some FAILED' : ''}`);
