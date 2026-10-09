/**
 * Helpers for quiz media, shared by the quiz editor and every page that shows
 * a quiz (graded quiz, practice, flashcards, live games, results, grading).
 *
 * Why this file exists: media used to be understood differently in each page.
 * Some pages rendered the main question media, some skipped it, and the
 * comprehension types (which keep their media somewhere else) were handled in
 * only two places. One definition here keeps them all in agreement.
 */

const IMAGE_EXT = /\.(jpe?g|png|gif|webp|avif|svg|bmp)$/;
const VIDEO_EXT = /\.(mp4|m4v|webm|mov|ogv)$/;
// .ogg is audio far more often than video (Vorbis/Opus). Real Ogg video uses .ogv.
const AUDIO_EXT = /\.(mp3|wav|aac|flac|m4a|oga|ogg|opus|weba)$/;

/**
 * What kind of media is this stored object: 'image', 'video', 'audio' or 'unknown'.
 *
 * ImageKit reports every audio and video upload as fileType "non-image", so
 * that value tells us nothing. We trust fileType only when it is one of the
 * three real kinds (the editor now stores those, see fileKind below) and
 * otherwise fall back to the file extension. Query strings are stripped first
 * so "clip.mp4?tr=..." still matches.
 */
export function mediaKind(media) {
  if (!media?.url) return 'unknown';
  if (['image', 'video', 'audio'].includes(media.fileType)) return media.fileType;
  const path = String(media.url).split(/[?#]/)[0].toLowerCase();
  if (IMAGE_EXT.test(path)) return 'image';
  if (VIDEO_EXT.test(path)) return 'video';
  if (AUDIO_EXT.test(path)) return 'audio';
  return 'unknown';
}

/**
 * The kind to store for a file the teacher just picked. The browser knows the
 * MIME type exactly ("audio/ogg"), which is more reliable than ImageKit's
 * "non-image" or a guess from the name, so prefer it.
 */
export function fileKind(file, fallback) {
  const major = String(file?.type || '').split('/')[0];
  return ['image', 'video', 'audio'].includes(major) ? major : fallback;
}

export const COMPREHENSION_TYPES = ['VISUAL_COMPREHENSION', 'LISTENING_COMPREHENSION'];

export const isComprehension = (type) => COMPREHENSION_TYPES.includes(type);

/**
 * The media shown above the question itself. Comprehension questions keep it
 * inside visualData / listeningData instead of on the question.
 */
export const getMainMedia = (question) =>
  question?.visualData?.mainMedia || question?.listeningData?.mainMedia || question?.media || null;

/** The sub-questions of a comprehension question; empty for every other type. */
export const getSubQuestions = (question) =>
  question?.visualData?.subQuestions || question?.listeningData?.subQuestions || [];
