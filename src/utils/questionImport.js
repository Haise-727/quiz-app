/**
 * Turns a table of questions (pasted from a spreadsheet, or a CSV file) into questions in the
 * shape the quiz editor uses, and says in plain words which rows it could not read. Pure, with
 * tests in scripts/test-question-import.mjs.
 *
 * The table needs a header row. Column names are not picky about case, spaces or underscores.
 *
 *   type      mcq, true or false, fill in the blank, number, paragraph (empty: guessed)
 *   question  the question text (also accepts: text, prompt)
 *   correct   what is right, written the way people write it (see below)
 *   option1 ... option6   the choices of a multiple choice question
 *   points    default 10                seconds   default 60
 *   tolerance, unit   for number questions
 *
 * The `correct` column:
 *   multiple choice   letters "A", "A;C", numbers "2", "1;3", or the option's own text
 *   true or false     true, false, t, f, yes, no, 1, 0
 *   fill in the blank accepted answers separated by | or ;
 *   number            the number
 *   paragraph         grading keywords separated by | or ;, optional
 *
 * Pasting from a spreadsheet gives tab separated text and saving as CSV from some regions gives
 * semicolons, so the separator is worked out from the header row.
 */

export const MAX_QUESTIONS = 200;
export const MAX_CHARS = 400_000;

/** A starter file the teacher can download and fill in. */
export const IMPORT_TEMPLATE = [
  'type,question,correct,option1,option2,option3,option4,points,seconds,tolerance,unit',
  'mcq,Which planet is closest to the Sun?,A,Mercury,Venus,Earth,Mars,10,30,,',
  'mcq,Which are prime numbers? (pick all),A;C,2,4,7,9,10,30,,',
  'truefalse,The Pacific is the largest ocean.,true,,,,,10,20,,',
  'fill,The capital city of Japan is ___.,Tokyo|Tōkyō,,,,,10,30,,',
  'number,What is the acceleration of gravity on Earth?,9.8,,,,,10,40,0.1,m/s',
].join('\n');

// ── Reading the table ───────────────────────────────────────────────────────────────

/** Picks the separator that appears most often in the header line. Commas win ties. */
export function detectDelimiter(text) {
  const header = String(text ?? '').replace(/^\uFEFF/, '').split(/\r?\n/).find((l) => l.trim()) || '';
  const count = (ch) => header.split(ch).length - 1;
  const best = [['\t', count('\t')], [';', count(';')], [',', count(',')]].sort((a, b) => b[1] - a[1])[0];
  return best[1] > 0 ? best[0] : ',';
}

/**
 * A small, careful table reader: quoted cells may hold the separator, line breaks and doubled
 * quotes ("She said ""hi"""), and both Windows and Unix line endings work.
 * @param withNumbers  return { cells, row } instead, where `row` is the record's number counting
 *                     blank ones, the way a spreadsheet numbers rows
 * @returns {string[][]} rows of cells, with blank rows left out
 */
export function parseTable(text, delimiter = detectDelimiter(text), withNumbers = false) {
  const src = String(text ?? '').replace(/^\uFEFF/, '');
  const rows = [];
  let row = []; let cell = ''; let quoted = false; let record = 0;
  const endCell = () => { row.push(cell); cell = ''; };
  const endRow = () => {
    endCell(); record += 1;
    if (row.some((c) => c.trim() !== '')) rows.push(withNumbers ? { cells: row, row: record } : row);
    row = [];
  };
  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (quoted) {
      if (ch === '"' && src[i + 1] === '"') { cell += '"'; i++; }
      else if (ch === '"') quoted = false;
      else cell += ch;
    } else if (ch === '"' && cell === '') quoted = true;
    else if (ch === delimiter) endCell();
    else if (ch === '\r') { if (src[i + 1] === '\n') i++; endRow(); }
    else if (ch === '\n') endRow();
    else cell += ch;
  }
  if (cell !== '' || row.length) endRow();
  return rows;
}

// ── Understanding the columns ───────────────────────────────────────────────────────

const norm = (s) => String(s ?? '').trim().toLowerCase().replace(/[\s_\-/]+/g, '');

const TYPE_ALIASES = {
  mcq: 'MCQ', multiplechoice: 'MCQ', choice: 'MCQ', multichoice: 'MCQ',
  tf: 'TRUE_FALSE', truefalse: 'TRUE_FALSE', trueorfalse: 'TRUE_FALSE', boolean: 'TRUE_FALSE',
  fill: 'FILL_IN_THE_BLANK', fillintheblank: 'FILL_IN_THE_BLANK', blank: 'FILL_IN_THE_BLANK', shortanswer: 'FILL_IN_THE_BLANK', short: 'FILL_IN_THE_BLANK',
  number: 'NUMERIC', numeric: 'NUMERIC', numerical: 'NUMERIC',
  paragraph: 'PARAGRAPH', essay: 'PARAGRAPH', longanswer: 'PARAGRAPH', long: 'PARAGRAPH',
};
const COLUMN_ALIASES = {
  type: 'type', questiontype: 'type',
  question: 'question', text: 'question', prompt: 'question', questiontext: 'question',
  correct: 'correct', answer: 'correct', answers: 'correct', correctanswer: 'correct', right: 'correct',
  points: 'points', point: 'points', marks: 'points', score: 'points',
  seconds: 'seconds', time: 'seconds', timelimit: 'seconds', timer: 'seconds',
  tolerance: 'tolerance', unit: 'unit', units: 'unit',
};
const optionColumn = (name) => { const m = /^(?:option|choice|opt)(\d{1,2})$/.exec(norm(name)); return m ? Number(m[1]) : null; };

const TRUE_WORDS = new Set(['true', 't', 'yes', 'y', '1']);
const FALSE_WORDS = new Set(['false', 'f', 'no', 'n', '0']);
const splitList = (s) => String(s ?? '').split(/[;|]/).map((x) => x.trim()).filter(Boolean);
const numeric = (s) => { const t = String(s ?? '').trim().replace(',', '.'); return t !== '' && Number.isFinite(Number(t)) ? Number(t) : NaN; };

/** Which option indexes does a `correct` cell point at? Letters, 1 based numbers, or the option's text. */
function pickOptions(cell, options) {
  const hits = new Set(); const bad = [];
  for (const part of splitList(cell)) {
    const p = part.trim();
    const byText = options.findIndex((o) => o.toLowerCase() === p.toLowerCase());
    if (/^[A-Za-z]$/.test(p) && p.toUpperCase().charCodeAt(0) - 65 < options.length) hits.add(p.toUpperCase().charCodeAt(0) - 65);
    else if (/^\d{1,2}$/.test(p) && Number(p) >= 1 && Number(p) <= options.length) hits.add(Number(p) - 1);
    else if (byText !== -1) hits.add(byText);
    else bad.push(p);
  }
  return { indexes: [...hits].sort((a, b) => a - b), bad };
}

/**
 * Read the table and build the questions.
 * @param idFn  makes a unique id each call. The editor gives numeric ids to options and string ids to questions.
 * @returns {{ questions: object[], errors: { row: number, message: string }[] }} `row` counts as a spreadsheet does, header being row 1
 */
export function importQuestions(text, idFn = (() => { let n = 0; const base = Date.now(); return () => base * 1000 + n++; })()) {
  const errors = [];
  if (String(text ?? '').length > MAX_CHARS) return { questions: [], errors: [{ row: 0, message: 'That is too much text for one import. Split it into smaller files.' }] };
  const table = parseTable(text, undefined, true);
  if (table.length === 0) return { questions: [], errors: [{ row: 0, message: 'There is nothing to import yet.' }] };

  // Work out what each column is from the header row.
  const header = table[0].cells;
  const cols = {}; const optionCols = [];
  header.forEach((name, i) => {
    const opt = optionColumn(name);
    if (opt) optionCols.push([opt, i]);
    else if (COLUMN_ALIASES[norm(name)] && cols[COLUMN_ALIASES[norm(name)]] === undefined) cols[COLUMN_ALIASES[norm(name)]] = i;
  });
  optionCols.sort((a, b) => a[0] - b[0]);
  if (cols.question === undefined) return { questions: [], errors: [{ row: table[0].row, message: 'The first row needs a column called "question".' }] };

  const cell = (r, key) => (cols[key] === undefined ? '' : String(r[cols[key]] ?? '').trim());
  const questions = [];

  table.slice(1).forEach(({ cells: r, row }) => {
    if (questions.length >= MAX_QUESTIONS) { if (!errors.some((e) => e.row === -1)) errors.push({ row: -1, message: `Only the first ${MAX_QUESTIONS} questions are imported.` }); return; }
    const text = cell(r, 'question');
    if (!text) { errors.push({ row, message: 'The question is empty.' }); return; }

    const options = optionCols.map(([, i]) => String(r[i] ?? '').trim()).filter(Boolean);
    const correct = cell(r, 'correct');
    const typeCell = cell(r, 'type');
    let type = TYPE_ALIASES[norm(typeCell)];
    if (typeCell && !type) { errors.push({ row, message: `"${typeCell}" is not a question type I know. Use mcq, truefalse, fill, number or paragraph.` }); return; }
    if (!type) {
      // No type given: guess from what the row holds.
      if (options.length >= 2) type = 'MCQ';
      else if (TRUE_WORDS.has(correct.toLowerCase()) || FALSE_WORDS.has(correct.toLowerCase())) type = 'TRUE_FALSE';
      else if (!correct) type = 'PARAGRAPH';
      else type = 'FILL_IN_THE_BLANK';
    }

    const points = cell(r, 'points') === '' ? 10 : Math.round(numeric(cell(r, 'points')));
    const seconds = cell(r, 'seconds') === '' ? 60 : Math.round(numeric(cell(r, 'seconds')));
    if (!Number.isFinite(points) || points < 0) { errors.push({ row, message: `"${cell(r, 'points')}" is not a number of points.` }); return; }
    if (!Number.isFinite(seconds) || seconds < 1) { errors.push({ row, message: `"${cell(r, 'seconds')}" is not a number of seconds.` }); return; }

    const q = { id: `q_${idFn()}`, type, questionText: text, points, timeLimit: seconds, media: null, localMediaFile: null, localCropData: null };

    switch (type) {
      case 'MCQ': {
        if (options.length < 2) { errors.push({ row, message: 'A multiple choice question needs at least two options.' }); return; }
        const { indexes, bad } = pickOptions(correct, options);
        if (bad.length) { errors.push({ row, message: `The right answer "${bad.join('", "')}" does not match any option.` }); return; }
        if (indexes.length === 0) { errors.push({ row, message: 'Say which option is right in the "correct" column, for example A.' }); return; }
        const made = options.map((t) => ({ id: idFn(), text: t, media: null, localMediaFile: null, localCropData: null }));
        q.mcqData = { options: made, correctOptions: indexes.map((i) => made[i].id) };
        break;
      }
      case 'TRUE_FALSE': {
        const v = correct.toLowerCase();
        if (!TRUE_WORDS.has(v) && !FALSE_WORDS.has(v)) { errors.push({ row, message: 'For true or false, put true or false in the "correct" column.' }); return; }
        q.trueFalseData = { correctAnswer: TRUE_WORDS.has(v) };
        break;
      }
      case 'FILL_IN_THE_BLANK': {
        const answers = splitList(correct);
        if (answers.length === 0) { errors.push({ row, message: 'Put the accepted answer in the "correct" column.' }); return; }
        q.fillBlankData = { answers: answers.map((a) => ({ text: a })), caseSensitive: false };
        break;
      }
      case 'NUMERIC': {
        const n = numeric(correct);
        if (!Number.isFinite(n)) { errors.push({ row, message: `"${correct}" is not a number.` }); return; }
        const tol = cell(r, 'tolerance') === '' ? 0 : numeric(cell(r, 'tolerance'));
        if (!Number.isFinite(tol) || tol < 0) { errors.push({ row, message: `"${cell(r, 'tolerance')}" is not a tolerance. Use zero or more.` }); return; }
        q.numericData = { answer: String(n), tolerance: String(tol), unit: cell(r, 'unit') };
        break;
      }
      default:
        q.paragraphData = { keywords: (splitList(correct).length ? splitList(correct) : ['']).map((k) => ({ text: k })) };
    }
    questions.push(q);
  });
  return { questions, errors: errors.filter((e) => e.row !== -1).concat(errors.filter((e) => e.row === -1)) };
}
