/**
 * Checks the questions in the editor before a quiz is published, and says in plain words
 * what is wrong with which question. Pure, so it has its own tests
 * (scripts/test-question-validation.mjs).
 *
 * It only blocks things that would make a question impossible or broken for a student:
 * no text, nothing to pick, no right answer, a number question with no number. It does not
 * judge quality.
 *
 * The editor keeps a picked file in `localMediaFile` until publish, and an uploaded file in
 * `media`, so "has a picture" means either one.
 *
 * @returns {string[]} one message per problem, such as "Question 3: tick the right answer."
 */
import { getSubQuestions, isComprehension } from './media.js';

const filled = (s) => String(s ?? '').trim().length > 0;
const hasPicture = (q) => !!(q.media?.url || q.localMediaFile);

function checkOne(q) {
  const problems = [];
  if (!filled(q.questionText)) problems.push('write the question');

  switch (q.type) {
    case 'MCQ': {
      const options = (q.mcqData?.options || []);
      // An option can be a picture or sound with no words, so it counts as filled too.
      const usable = options.filter((o) => filled(o.text) || o.media?.url || o.localMediaFile);
      if (usable.length < 2) problems.push('add at least two options');
      const correct = (q.mcqData?.correctOptions || []).filter((id) => usable.some((o) => o.id === id));
      if (correct.length === 0) problems.push('tick the right answer');
      break;
    }
    case 'FILL_IN_THE_BLANK':
      if (!(q.fillBlankData?.answers || []).some((a) => filled(a.text))) problems.push('add an accepted answer');
      break;
    case 'NUMERIC': {
      const { answer, tolerance } = q.numericData || {};
      if (!filled(answer) || !Number.isFinite(Number(answer))) problems.push('enter the right number');
      if (filled(tolerance) && !(Number(tolerance) >= 0)) problems.push('make the tolerance zero or more');
      break;
    }
    case 'HOTSPOT':
      if (!hasPicture(q)) problems.push('add the picture');
      if ((q.hotspotData?.regions || []).length === 0) problems.push('drag on the picture to mark the right area');
      break;
    case 'MATCH_THE_FOLLOWING': {
      const pairs = q.matchData?.pairs || [];
      if (pairs.length < 2) problems.push('add at least two pairs');
      else if (pairs.some((p) => !(filled(p.prompt) || p.promptMedia?.url || p.promptLocalMediaFile) || !(filled(p.answer) || p.answerMedia?.url || p.answerLocalMediaFile))) problems.push('fill in both sides of every pair');
      break;
    }
    case 'CATEGORIZE': {
      const items = q.categorizeData?.items || [];
      if ((q.categorizeData?.categories || []).length < 2) problems.push('add at least two categories');
      if (items.length < 2) problems.push('add at least two items');
      else if (items.some((i) => i.categoryId === null || i.categoryId === undefined || i.categoryId === '')) problems.push('choose a category for every item');
      break;
    }
    case 'REORDER':
      if ((q.reorderData?.items || []).filter((i) => filled(i.text) || i.media?.url || i.localMediaFile).length < 2) problems.push('add at least two items to put in order');
      break;
    default:
      if (isComprehension(q.type)) {
        const main = q.visualData?.mainMedia || q.visualData?.localMainMediaFile || q.listeningData?.mainMedia || q.listeningData?.localMainMediaFile;
        if (!main) problems.push(q.type === 'VISUAL_COMPREHENSION' ? 'add the picture' : 'add the audio or video');
        const subs = getSubQuestions(q);
        if (subs.length === 0) problems.push('add at least one follow up question');
        subs.forEach((s, i) => { if (checkOne(s).length) problems.push(`fix follow up question ${i + 1}`); });
      }
      break;
  }
  return problems;
}

export function validateQuestions(questions) {
  if (!Array.isArray(questions) || questions.length === 0) return ['Add at least one question.'];
  const messages = [];
  questions.forEach((q, i) => {
    const problems = checkOne(q);
    if (problems.length) messages.push(`Question ${i + 1}: ${problems.join(', ')}.`.replace(/^(Question \d+: )(.)/, (m, a, b) => a + b.toUpperCase()));
  });
  return messages;
}
