import ImageKit from 'imagekit-javascript';
import { fileKind } from './media';

/**
 * Uploading the pictures, audio and video a teacher picked in the quiz editor.
 *
 * The editor keeps a picked file in memory (a File object on the question)
 * until the teacher publishes. Anything that saves a question has to turn
 * those files into stored media first, or the media is lost. Publish and
 * "Save to Bank" both go through uploadQuestionMedia below so they cannot
 * drift apart again.
 *
 * Steps for each file, the same as scripts/seed-media-quiz.mjs:
 *   1. GET /api/auth  -> a short lived signed token (the private key stays on the server)
 *   2. upload to ImageKit with that token
 *   3. store { url, fileId, fileType } on the question
 */

// publicKey and urlEndpoint are public values. If either is missing the SDK
// throws here at import time, which shows up as a blank page, see .env.local.example.
const imagekit = new ImageKit({
  publicKey: import.meta.env.VITE_PUBLIC_KEY,
  urlEndpoint: import.meta.env.VITE_URL_ENDPOINT,
});

async function fetchAuthParams() {
  // Always relative: /api/auth is a serverless function in this same Vercel
  // project, so it is served from whatever domain is currently loaded. In
  // development vite.config.js proxies /api to the deployed app.
  const response = await fetch('/api/auth');
  if (!response.ok) {
    const errorBody = await response.json().catch(() => ({}));
    throw new Error(`Authentication server failed: ${errorBody.message || response.statusText}`);
  }
  return response.json();
}

/** Upload one file and return the object stored on a question. */
export async function uploadMediaFile(file, cropData) {
  const authParams = await fetchAuthParams();
  const result = await imagekit.upload({
    file,
    fileName: `quiz-media_${Date.now()}_${file.name}`,
    folder: '/quiz-app-media',
    token: authParams.token,
    expire: authParams.expire,
    signature: authParams.signature,
  });
  const isImage = file.type && file.type.startsWith('image/');
  return {
    url: result.url,
    fileId: result.fileId,
    // ImageKit calls every audio and video file "non-image", which tells a
    // player nothing. The browser knows the real kind from the MIME type, so
    // store that. Older quizzes still work: mediaKind() falls back to the extension.
    fileType: fileKind(file, result.fileType),
    ...(isImage && cropData && { cropData }),
  };
}

// Fields the editor adds to hold a picked file. They must never reach the database.
const LOCAL_KEYS = new Set([
  'localMediaFile', 'localCropData',
  'promptLocalMediaFile', 'promptLocalCropData',
  'answerLocalMediaFile', 'answerLocalCropData',
  'localMainMediaFile',
]);

function stripLocalFields(node) {
  if (Array.isArray(node)) { node.forEach(stripLocalFields); return; }
  if (!node || typeof node !== 'object') return;
  for (const key of Object.keys(node)) {
    if (LOCAL_KEYS.has(key)) delete node[key];
    else stripLocalFields(node[key]);
  }
}

/**
 * Takes the editor's questions (which may hold picked files) and returns copies
 * where every picked file has been uploaded and replaced by its stored media
 * object, with the editor-only fields removed. The originals are not changed.
 */
export async function uploadQuestionMedia(questions) {
  // File objects turn into {} in this copy. That is fine: we read the real File
  // from `questions` and write the result into the copy.
  const saved = JSON.parse(JSON.stringify(questions));
  const jobs = [];

  questions.forEach((q, qIndex) => {
    const target = saved[qIndex];
    const add = (file, cropData, node, prop) => {
      jobs.push(
        uploadMediaFile(file, cropData)
          .then((media) => { node[prop] = media; })
          .catch((err) => {
            console.error(`Error uploading ${prop} for question ${qIndex + 1}:`, err);
            throw new Error(`Failed to upload media for question ${qIndex + 1}: ${err.message || 'Unknown upload error'}`);
          })
      );
    };

    // Every place the editor lets a teacher attach media:
    if (q.localMediaFile) add(q.localMediaFile, q.localCropData, target, 'media');
    q.mcqData?.options.forEach((opt, i) => {
      if (opt.localMediaFile) add(opt.localMediaFile, opt.localCropData, target.mcqData.options[i], 'media');
    });
    q.matchData?.pairs.forEach((pair, i) => {
      if (pair.promptLocalMediaFile) add(pair.promptLocalMediaFile, pair.promptLocalCropData, target.matchData.pairs[i], 'promptMedia');
      if (pair.answerLocalMediaFile) add(pair.answerLocalMediaFile, pair.answerLocalCropData, target.matchData.pairs[i], 'answerMedia');
    });
    q.categorizeData?.items.forEach((item, i) => {
      if (item.localMediaFile) add(item.localMediaFile, item.localCropData, target.categorizeData.items[i], 'media');
    });
    q.reorderData?.items.forEach((item, i) => {
      if (item.localMediaFile) add(item.localMediaFile, item.localCropData, target.reorderData.items[i], 'media');
    });
    if (q.visualData?.localMainMediaFile) add(q.visualData.localMainMediaFile, q.visualData.localCropData, target.visualData, 'mainMedia');
    if (q.listeningData?.localMainMediaFile) add(q.listeningData.localMainMediaFile, null, target.listeningData, 'mainMedia');
  });

  await Promise.all(jobs);
  stripLocalFields(saved);
  return saved;
}
