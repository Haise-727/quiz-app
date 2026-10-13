// Shared by both backends (api/firebase/questionBank.js and api/aws/questionBank.js). Pure, no database.

/**
 * Clean a question object recursively to ensure it has no non-serializable objects (like File or Blob)
 * before saving.
 */
export const cleanQuestionForFirestore = (q) => {
  if (!q) return null;
  const clean = JSON.parse(JSON.stringify(q));

  const cleanMediaNode = (node) => {
    if (!node) return;
    delete node.localMediaFile;
    delete node.localCropData;
    delete node.promptLocalMediaFile;
    delete node.promptLocalCropData;
    delete node.answerLocalMediaFile;
    delete node.answerLocalCropData;
  };

  cleanMediaNode(clean);

  if (clean.mcqData?.options) {
    clean.mcqData.options.forEach(opt => cleanMediaNode(opt));
  }
  if (clean.matchData?.pairs) {
    clean.matchData.pairs.forEach(pair => cleanMediaNode(pair));
  }
  if (clean.categorizeData?.items) {
    clean.categorizeData.items.forEach(item => cleanMediaNode(item));
  }
  if (clean.reorderData?.items) {
    clean.reorderData.items.forEach(item => cleanMediaNode(item));
  }
  if (clean.visualData) {
    cleanMediaNode(clean.visualData);
    if (clean.visualData.subQuestions) {
      clean.visualData.subQuestions = clean.visualData.subQuestions.map(sq => cleanQuestionForFirestore(sq));
    }
  }
  if (clean.listeningData) {
    cleanMediaNode(clean.listeningData);
    if (clean.listeningData.subQuestions) {
      clean.listeningData.subQuestions = clean.listeningData.subQuestions.map(sq => cleanQuestionForFirestore(sq));
    }
  }

  return clean;
};
