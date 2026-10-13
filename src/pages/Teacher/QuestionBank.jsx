import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { getBankQuestions, deleteBankQuestion } from '../../api/questionBank';
import { motion, AnimatePresence } from 'framer-motion';
import { toast } from 'sonner';
import { PiArrowRightBold, PiCheckBold, PiClockBold, PiMagnifyingGlassBold, PiStarBold, PiTrashBold } from 'react-icons/pi';
import PageHeader from '@/components/layout/PageHeader';
import MediaRenderer from '../../components/MediaRenderer';
import { MiniMedia } from '../../components/AnswerReveal';
import { mediaKind, getMainMedia } from '../../utils/media';
import { rise, spring, stagger } from '@/lib/motion';

const QUESTION_TYPES = [
  { value: 'ALL', label: 'All types' },
  { value: 'MCQ', label: 'Multiple choice' },
  { value: 'TRUE_FALSE', label: 'True or false' },
  { value: 'FILL_IN_THE_BLANK', label: 'Fill in the blank' },
  { value: 'NUMERIC', label: 'Number' },
  { value: 'HOTSPOT', label: 'Click on the image' },
  { value: 'PARAGRAPH', label: 'Paragraph' },
  { value: 'MATCH_THE_FOLLOWING', label: 'Match the following' },
  { value: 'CATEGORIZE', label: 'Categorize items' },
  { value: 'REORDER', label: 'Reorder' },
  { value: 'VISUAL_COMPREHENSION', label: 'Visual comprehension' },
  { value: 'LISTENING_COMPREHENSION', label: 'Listening comprehension' },
];

/** A tiny mono label above each block of a preview. */
const PreviewLabel = ({ children }) => <p className="eyebrow mb-1.5">{children}</p>;

/** Pastel pill used for answers and keywords. `tone` picks a theme tint. */
const chipTone = {
  green: 'bg-[hsl(var(--tint-green))] text-[hsl(var(--tint-green-fg))]',
  yellow: 'bg-[hsl(var(--tint-yellow))] text-[hsl(var(--tint-yellow-fg))]',
  blue: 'bg-[hsl(var(--tint-blue))] text-[hsl(var(--tint-blue-fg))]',
  neutral: 'bg-[hsl(var(--tint-neutral))] text-[hsl(var(--tint-neutral-fg))]',
};
const Chip = ({ tone = 'neutral', children }) => (
  <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium ${chipTone[tone]}`}>{children}</span>
);

const QuestionPreviewBody = ({ question }) => {
  const { type } = question;

  switch (type) {
    case 'MCQ':
      return (
        <div className="mt-4">
          <PreviewLabel>Options</PreviewLabel>
          <ul className="flex flex-col gap-1.5">
            {(question.mcqData?.options || []).map((opt) => {
              const isCorrect = question.mcqData?.correctOptions?.includes(opt.id);
              return (
                <li key={opt.id} className="flex items-center gap-2 text-sm text-[hsl(var(--foreground))]">
                  <span className={`flex h-4 w-4 shrink-0 items-center justify-center rounded-full border ${isCorrect ? 'border-[hsl(var(--primary))] bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))]' : 'border-[hsl(var(--input))]'}`}>
                    {isCorrect && <PiCheckBold className="h-2.5 w-2.5" aria-label="Correct answer" />}
                  </span>
                  <MiniMedia media={opt.media} />
                  <span>{opt.text || <span className="italic text-[hsl(var(--muted-foreground))]">Empty option</span>}</span>
                </li>
              );
            })}
          </ul>
        </div>
      );

    case 'TRUE_FALSE':
      return (
        <div className="mt-4">
          <PreviewLabel>Correct answer</PreviewLabel>
          <Chip tone="green">{question.trueFalseData?.correctAnswer ? 'True' : 'False'}</Chip>
        </div>
      );

    case 'FILL_IN_THE_BLANK':
      return (
        <div className="mt-4">
          <PreviewLabel>Accepted answers</PreviewLabel>
          <div className="flex flex-wrap gap-1.5">
            {(question.fillBlankData?.answers || []).map((ans, idx) => (
              <Chip key={idx} tone="green">{ans.text}</Chip>
            ))}
          </div>
        </div>
      );

    case 'NUMERIC': {
      const { answer, tolerance, unit } = question.numericData || {};
      return (
        <div className="mt-4">
          <PreviewLabel>Right number</PreviewLabel>
          <Chip tone="green">{answer}{unit ? ` ${unit}` : ''}{Number(tolerance) > 0 ? `, plus or minus ${tolerance}` : ''}</Chip>
        </div>
      );
    }

    case 'HOTSPOT': {
      const count = (question.hotspotData?.regions || []).length;
      return (
        <div className="mt-4">
          <PreviewLabel>Right area</PreviewLabel>
          <Chip tone="green">{count} {count === 1 ? 'area' : 'areas'} marked on the picture</Chip>
        </div>
      );
    }

    case 'PARAGRAPH':
      return (
        <div className="mt-4">
          <PreviewLabel>Grading keywords</PreviewLabel>
          {question.paragraphData?.keywords?.length > 0 ? (
            <div className="flex flex-wrap gap-1.5">
              {question.paragraphData.keywords.map((kw, idx) => (
                <Chip key={idx} tone="yellow">{kw.text}</Chip>
              ))}
            </div>
          ) : (
            <p className="text-xs italic text-[hsl(var(--muted-foreground))]">No grading keywords provided.</p>
          )}
        </div>
      );

    case 'MATCH_THE_FOLLOWING':
      return (
        <div className="mt-4">
          <PreviewLabel>Matching pairs</PreviewLabel>
          <ul className="flex flex-col gap-1.5">
            {(question.matchData?.pairs || []).map((pair) => (
              <li key={pair.id} className="flex flex-wrap items-center gap-2 text-sm text-[hsl(var(--foreground))]">
                <MiniMedia media={pair.promptMedia} />
                <Chip>{pair.prompt}</Chip>
                <PiArrowRightBold className="h-3 w-3 text-[hsl(var(--muted-foreground))]" aria-label="matches" />
                <MiniMedia media={pair.answerMedia} />
                <Chip>{pair.answer}</Chip>
              </li>
            ))}
          </ul>
        </div>
      );

    case 'CATEGORIZE':
      return (
        <div className="mt-4">
          <PreviewLabel>Categories and items</PreviewLabel>
          <div className="flex flex-col gap-2.5">
            {(question.categorizeData?.categories || []).map((cat) => {
              const items = (question.categorizeData?.items || []).filter(item => item.categoryId === cat.id);
              return (
                <div key={cat.id} className="text-sm">
                  <span className="text-xs font-semibold text-[hsl(var(--foreground))]">{cat.name}</span>
                  <div className="mt-1 flex flex-wrap gap-1">
                    {items.map(item => (
                      <Chip key={item.id}>
                        <MiniMedia media={item.media} />
                        {item.text}
                      </Chip>
                    ))}
                    {items.length === 0 && <span className="text-xs italic text-[hsl(var(--muted-foreground))]">No items assigned</span>}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      );

    case 'REORDER':
      return (
        <div className="mt-4">
          <PreviewLabel>Correct order</PreviewLabel>
          <ol className="flex flex-col gap-1">
            {(question.reorderData?.items || []).map((item, idx) => (
              <li key={item.id || idx} className="flex items-center gap-2 text-sm text-[hsl(var(--foreground))]">
                <span className="tabular w-4 text-xs font-medium text-[hsl(var(--muted-foreground))]">{idx + 1}</span>
                <MiniMedia media={item.media} />
                <span>{item.text}</span>
              </li>
            ))}
          </ol>
        </div>
      );

    case 'VISUAL_COMPREHENSION':
    case 'LISTENING_COMPREHENSION': {
      const sqs = question.visualData?.subQuestions || question.listeningData?.subQuestions || [];
      return (
        <div className="mt-4">
          <PreviewLabel>Sub-questions ({sqs.length})</PreviewLabel>
          <ul className="divide-y divide-[hsl(var(--border))] border-l-2 border-[hsl(var(--border))] pl-4">
            {sqs.map((subQ, idx) => (
              <li key={subQ.id || idx} className="py-3 first:pt-0 last:pb-0">
                <p className="text-sm font-medium text-[hsl(var(--foreground))]">{idx + 1}. {subQ.questionText}</p>
                <QuestionPreview question={subQ} />
              </li>
            ))}
          </ul>
        </div>
      );
    }

    default:
      return null;
  }
};

// The picture, clip or recording attached to the question itself (comprehension
// questions keep theirs in visualData / listeningData), then the type specific body.
const QuestionPreview = ({ question }) => {
  const media = getMainMedia(question);
  return (
    <>
      {media && (
        <div className="mt-3" onClick={(e) => e.stopPropagation()}>
          <MediaRenderer media={media} transform="thumbnail"
            className={mediaKind(media) === 'audio' ? 'w-64 h-10' : 'max-h-40 rounded-md'} />
        </div>
      )}
      <QuestionPreviewBody question={question} />
    </>
  );
};

const QuestionBank = () => {
  const { currentUser } = useAuth();

  const [questions, setQuestions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterType, setFilterType] = useState('ALL');

  const fetchQuestions = useCallback(async () => {
    if (!currentUser) return;
    setLoading(true);
    try {
      const list = await getBankQuestions(currentUser.uid);
      // Sort by savedAt or fallback to id
      setQuestions(list.sort((a, b) => (b.savedAt?.toMillis?.() || 0) - (a.savedAt?.toMillis?.() || 0)));
    } catch (err) {
      console.error(err);
      toast.error('Failed to load question bank.');
    } finally {
      setLoading(false);
    }
  }, [currentUser]);

  useEffect(() => {
    fetchQuestions();
  }, [fetchQuestions]);

  const handleDeleteQuestion = async (id, text) => {
    const displayTitle = text ? `"${text.substring(0, 30)}..."` : 'this question';
    if (!window.confirm(`Are you sure you want to delete ${displayTitle} from your question bank?`)) return;

    try {
      await deleteBankQuestion(id);
      toast.success('Question deleted from bank.');
      fetchQuestions();
    } catch (err) {
      console.error(err);
      toast.error('Failed to delete question.');
    }
  };

  const filteredQuestions = questions.filter(q => {
    const matchText = (q.questionText || '').toLowerCase().includes(search.toLowerCase());
    const matchType = filterType === 'ALL' || q.type === filterType;
    return matchText && matchType;
  });

  const typeLabel = (type) => (QUESTION_TYPES.find(t => t.value === type)?.label || type.replace(/_/g, ' ').toLowerCase());

  return (
    <div className="mx-auto w-full max-w-5xl pb-16">
      <PageHeader eyebrow="Library" title="Question bank" description="Keep good questions here and reuse them in any quiz." />

      {/* Filters: an underlined search and a plain select. */}
      <div className="mt-10 flex flex-col gap-5 sm:flex-row sm:items-end">
        <div className="relative min-w-0 flex-1">
          <label htmlFor="bank-search" className="eyebrow">Search</label>
          <PiMagnifyingGlassBold className="pointer-events-none absolute bottom-2.5 left-0 h-4 w-4 text-[hsl(var(--muted-foreground))]" aria-hidden="true" />
          <input
            id="bank-search"
            type="text"
            placeholder="Find a question by its text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            autoComplete="off"
            className="mt-1 w-full border-0 border-b-2 border-[hsl(var(--input))] bg-transparent pb-2 pl-6 text-base text-[hsl(var(--foreground))] outline-none transition-colors placeholder:text-[hsl(var(--muted-foreground))]/60 focus:border-[hsl(var(--ink))]"
          />
        </div>
        <div className="sm:w-56">
          <label htmlFor="bank-type" className="eyebrow">Type</label>
          <select
            id="bank-type"
            value={filterType}
            onChange={e => setFilterType(e.target.value)}
            className="mt-1 w-full cursor-pointer border-0 border-b-2 border-[hsl(var(--input))] bg-transparent pb-2 text-base text-[hsl(var(--foreground))] outline-none transition-colors focus:border-[hsl(var(--ink))]"
          >
            {QUESTION_TYPES.map(t => (
              <option key={t.value} value={t.value}>{t.label}</option>
            ))}
          </select>
        </div>
      </div>

      <div className="mb-2 mt-10 flex items-baseline justify-between">
        <h2 className="text-xl font-semibold tracking-tight">Questions</h2>
        {!loading && (
          <p className="eyebrow tabular" aria-live="polite">
            {filteredQuestions.length} of {questions.length}
          </p>
        )}
      </div>

      {loading ? (
        <div className="divide-y divide-[hsl(var(--border))] border-t border-[hsl(var(--border))]" role="status" aria-label="Loading questions">
          {[0, 1, 2].map(i => (
            <div key={i} className="py-5">
              <div className="h-3 w-24 animate-pulse rounded-lg bg-[hsl(var(--muted))]" />
              <div className="mt-3 h-4 w-3/4 animate-pulse rounded-lg bg-[hsl(var(--muted))]" />
            </div>
          ))}
        </div>
      ) : filteredQuestions.length === 0 ? (
        <motion.div variants={rise} initial="hidden" animate="show" className="border-t border-[hsl(var(--border))] pt-8">
          <p className="text-lg font-medium">No questions found.</p>
          <p className="mt-1 text-[hsl(var(--muted-foreground))]">
            {questions.length === 0
              ? 'Save questions while you build a quiz and they will appear here.'
              : 'Try a different search or type.'}
          </p>
        </motion.div>
      ) : (
        <motion.ul variants={stagger(0.04)} initial="hidden" animate="show" className="divide-y divide-[hsl(var(--border))] border-t border-[hsl(var(--border))]">
          <AnimatePresence initial={false}>
            {filteredQuestions.map((q) => (
              <motion.li
                key={q.id}
                variants={rise}
                layout="position"
                exit={{ opacity: 0, transition: { duration: 0.12 } }}
                transition={spring}
                className="py-5"
              >
                <div className="flex items-start gap-4">
                  <div className="min-w-0 flex-1">
                    <div className="mb-2 flex flex-wrap items-center gap-x-3 gap-y-1">
                      <span className="inline-flex rounded-full bg-[hsl(var(--tint-blue))] px-2.5 py-0.5 text-[11px] font-medium text-[hsl(var(--tint-blue-fg))]">
                        {typeLabel(q.type)}
                      </span>
                      <span className="tabular inline-flex items-center gap-1 text-xs text-[hsl(var(--muted-foreground))]"><PiStarBold className="h-3 w-3" aria-hidden="true" />{q.points || 10} points</span>
                      <span className="tabular inline-flex items-center gap-1 text-xs text-[hsl(var(--muted-foreground))]"><PiClockBold className="h-3 w-3" aria-hidden="true" />{q.timeLimit || 60}s</span>
                    </div>

                    <p className="text-base font-medium leading-snug text-[hsl(var(--foreground))]">
                      {q.questionText || <span className="italic text-[hsl(var(--muted-foreground))]">Untitled question</span>}
                    </p>

                    <QuestionPreview question={q} />
                  </div>

                  <motion.button
                    type="button"
                    whileTap={{ scale: 0.9 }}
                    transition={spring}
                    onClick={() => handleDeleteQuestion(q.id, q.questionText)}
                    aria-label="Delete this question from the bank"
                    title="Delete this question from the bank"
                    className="flex h-9 w-9 shrink-0 cursor-pointer items-center justify-center rounded-lg text-[hsl(var(--muted-foreground))] hover:bg-[hsl(var(--tint-red))] hover:text-[hsl(var(--destructive))] focus-visible:outline-2 focus-visible:outline-[hsl(var(--ring))]"
                  >
                    <PiTrashBold className="h-4 w-4" />
                  </motion.button>
                </div>
              </motion.li>
            ))}
          </AnimatePresence>
        </motion.ul>
      )}
    </div>
  );
};

export default QuestionBank;
