import { DragDropContext, Droppable, Draggable } from '@hello-pangea/dnd';
import { motion } from 'framer-motion';
import { PiDotsSixVerticalBold } from 'react-icons/pi';
import MediaRenderer from '../MediaRenderer';
import { MiniMedia } from '../AnswerReveal';
import OptionCard from './OptionCard';
import { PlacementChip } from './PlacementChip';
import { slotProps, usePlacement } from './placement';
import { getMainMedia, getSubQuestions, mediaKind } from '@/utils/media';
import { isMultiSelect } from '@/utils/quizAttempt';
import { rise, stagger } from '@/lib/motion';

const LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';

/**
 * Draws ONE question and lets the student answer it. It does not know about timers,
 * grading or saving: it gets the question and the current answer, and reports changes.
 * Both the signed in quiz and the guest quiz use it, so they look and behave the same.
 *
 * @param question   the question document
 * @param answer     the current answer, in the shapes described in utils/quizAttempt.js
 * @param onChange   (value, subIndex) => void   for options and typed answers
 * @param onDragEnd  the drag and drop result handler (Match, Reorder, Categorize)
 * @param onEnter    called when Enter is pressed inside a text answer, to move on
 */
export default function QuestionView({ question, answer, onChange, onDragEnd, onEnter }) {
  const media = getMainMedia(question);
  const kind = media ? mediaKind(media) : null;
  const multi = question.type === 'MCQ' && isMultiSelect(question);

  return (
    <DragDropContext onDragEnd={onDragEnd}>
      <div>
        {media && (
          <div className="mb-7">
            {kind === 'audio' ? (
              <MediaRenderer media={media} transform="question_main" className="w-full" />
            ) : (
              // The frame hugs the picture or clip instead of stretching across the page, and its
              // height is capped by the screen, so the options stay visible on a short window.
              <div className={`${kind === 'video' ? 'block w-full bg-black' : 'inline-block max-w-full bg-[hsl(var(--muted))]/50'} overflow-hidden rounded-xl border border-[hsl(var(--border))] align-top leading-[0]`}>
                <MediaRenderer
                  media={media}
                  transform="question_main"
                  className={kind === 'video' ? 'mx-auto max-h-[min(18rem,30vh)] w-auto max-w-full' : 'max-h-[min(18rem,30vh)] w-auto max-w-full object-contain'}
                />
              </div>
            )}
          </div>
        )}

        <h2 className="text-2xl font-semibold leading-snug tracking-tight text-[hsl(var(--foreground))] sm:text-[1.75rem]">
          {question.questionText}
        </h2>
        {multi && <p className="eyebrow mt-3">Select all that apply</p>}

        <div className="mt-8">
          {question.type === 'MCQ' && (
            <OptionList mcq={question} picked={answer || []} onPick={(id) => onChange(id)} />
          )}

          {question.type === 'TRUE_FALSE' && (
            <div className="grid grid-cols-2 gap-3">
              {[true, false].map((value) => (
                <OptionCard key={String(value)} size="lg" letter={value ? 'T' : 'F'} selected={answer === value} onSelect={() => onChange(value)}>
                  {value ? 'True' : 'False'}
                </OptionCard>
              ))}
            </div>
          )}

          {question.type === 'FILL_IN_THE_BLANK' && (
            <input
              type="text"
              autoFocus
              autoComplete="off"
              spellCheck="false"
              value={answer || ''}
              onChange={(e) => onChange(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') onEnter?.(); }}
              placeholder="Type your answer"
              aria-label="Your answer"
              className="w-full border-0 border-b-2 border-[hsl(var(--input))] bg-transparent pb-3 text-2xl text-[hsl(var(--foreground))] outline-none transition-colors placeholder:text-[hsl(var(--muted-foreground))]/45 focus:border-[hsl(var(--ink))]"
            />
          )}

          {question.type === 'PARAGRAPH' && (
            <div>
              <textarea
                value={answer || ''}
                onChange={(e) => onChange(e.target.value)}
                rows={7}
                placeholder="Write your answer here"
                aria-label="Your answer"
                className="w-full resize-y rounded-xl border border-[hsl(var(--input))] bg-[hsl(var(--card))] p-4 text-base leading-relaxed text-[hsl(var(--foreground))] outline-none transition-colors placeholder:text-[hsl(var(--muted-foreground))]/60 focus:border-[hsl(var(--ink))]"
              />
              <p className="eyebrow tabular mt-2 text-right">{(answer || '').trim().split(/\s+/).filter(Boolean).length} words</p>
            </div>
          )}

          {question.type === 'MATCH_THE_FOLLOWING' && answer && <MatchBoard question={question} answer={answer} onDragEnd={onDragEnd} />}
          {question.type === 'REORDER' && Array.isArray(answer) && <ReorderBoard answer={answer} />}
          {question.type === 'CATEGORIZE' && answer && <CategorizeBoard question={question} answer={answer} onDragEnd={onDragEnd} />}

          {(question.type === 'VISUAL_COMPREHENSION' || question.type === 'LISTENING_COMPREHENSION') && (
            <div className="flex flex-col gap-9">
              {getSubQuestions(question).map((sub, si) => (
                <div key={sub.id ?? si} className={si > 0 ? 'border-t border-[hsl(var(--border))] pt-9' : ''}>
                  <p className="mb-4 flex gap-3 text-lg font-medium leading-snug">
                    <span className="font-mono text-sm text-[hsl(var(--muted-foreground))] tabular">{si + 1}.</span>
                    <span>{sub.questionText}</span>
                  </p>
                  {sub.type === 'MCQ' && (
                    <OptionList mcq={sub} picked={answer?.[si] || []} onPick={(id) => onChange(id, si)} />
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </DragDropContext>
  );
}

// ── Options ───────────────────────────────────────────────────────────────────────────

function OptionList({ mcq, picked, onPick }) {
  const multi = isMultiSelect(mcq);
  return (
    <motion.div
      variants={stagger(0.035)} initial="hidden" animate="show"
      className="grid gap-2.5" role={multi ? 'group' : 'radiogroup'}
    >
      {mcq.mcqData.options.map((opt, i) => (
        <motion.div key={opt.id} variants={rise}>
          <OptionCard letter={LETTERS[i]} multi={multi} selected={picked.includes(opt.id)} onSelect={() => onPick(opt.id)} media={opt.media}>
            {opt.text}
          </OptionCard>
        </motion.div>
      ))}
    </motion.div>
  );
}

// ── Drag and drop ─────────────────────────────────────────────────────────────────────

const HINT = {
  idle: 'Drag an answer onto its prompt, or tap an answer and then tap where it goes.',
  held: 'Now tap where it goes, or tap the answer again to put it down.',
};

/** What to call out to the quiz when a chip is placed: the same shape the drag library uses. */
const toMove = (onDragEnd, endIndexOf) => (from, slotId) => {
  if (from.droppableId === slotId) return;                    // dropped back where it came from
  onDragEnd({ source: from, destination: { droppableId: slotId, index: endIndexOf(slotId) } });
};

function MatchBoard({ question, answer, onDragEnd }) {
  const placement = usePlacement(toMove(onDragEnd, (slotId) => (slotId === 'bank' ? answer.bank.length : 0)));
  return (
    <div>
      <p className="mb-4 text-sm text-[hsl(var(--muted-foreground))]">{placement.held ? HINT.held : HINT.idle}</p>
      <div className="flex flex-col gap-5 md:grid md:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)] md:gap-7">
        <div className="flex flex-col gap-3">
          {question.matchData.pairs.map((pair) => {
            const placed = answer.pairs[pair.id];
            const over = placement.hover === String(pair.id);
            const waiting = placement.held && !over;
            return (
              <div key={pair.id} className="grid grid-cols-1 items-center gap-2.5 rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-2.5 sm:grid-cols-2 sm:gap-3">
                <div className="flex items-center gap-2.5 pl-1.5 text-sm font-medium">
                  <MiniMedia media={pair.promptMedia} />
                  <span className="break-words">{pair.prompt}</span>
                </div>
                <div
                  {...slotProps(String(pair.id), placement, `Place an answer for ${pair.prompt}`)}
                  className={`flex min-h-14 items-center justify-center rounded-lg border p-1 outline-none transition-colors focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring))]
                    ${over ? 'border-solid border-[hsl(var(--primary))] bg-[hsl(var(--tint-green))]'
                      : placed ? 'border-solid border-[hsl(var(--border))] bg-[hsl(var(--muted))]/50'
                      : waiting ? 'cursor-pointer border-dashed border-[hsl(var(--primary))]/60' : 'border-dashed border-[hsl(var(--input))]'}`}
                >
                  {placed ? (
                    <PlacementChip fresh chip={{ id: placed.id, from: { droppableId: String(pair.id), index: 0 } }} placement={placement} className="w-full">
                      <MiniMedia media={placed.answerMedia} /><span className="break-words">{placed.answerText}</span>
                    </PlacementChip>
                  ) : <span className="px-2 text-center text-xs text-[hsl(var(--muted-foreground))]">{waiting ? 'Tap to place here' : 'Drop answer here'}</span>}
                </div>
              </div>
            );
          })}
        </div>
        {/* On a phone this tray comes FIRST and stays pinned to the top while you scroll, so the
            answer you are holding and the slot you want are always on screen together. From
            tablet width it is a column on the right, pinned the same way. */}
        <div className="sticky top-3 z-20 order-first -mx-1 bg-[hsl(var(--background))] px-1 pb-1 md:order-last md:self-start">
          <p className="eyebrow mb-2.5">Answers</p>
          <div
            {...slotProps('bank', placement, 'Answer bank')}
            className={`flex min-h-16 flex-row flex-wrap gap-2.5 rounded-xl border border-dashed p-3 outline-none transition-colors md:min-h-32 md:flex-col ${placement.hover === 'bank' ? 'border-[hsl(var(--primary))] bg-[hsl(var(--tint-green))]' : 'border-[hsl(var(--input))] bg-[hsl(var(--muted))]'}`}
          >
            {answer.bank.map((item, i) => (
              <PlacementChip key={item.id} chip={{ id: item.id, from: { droppableId: 'bank', index: i } }} placement={placement}>
                <MiniMedia media={item.answerMedia} /><span className="break-words">{item.answerText}</span>
              </PlacementChip>
            ))}
            {answer.bank.length === 0 && <span className="m-auto text-xs text-[hsl(var(--muted-foreground))]">All answers placed</span>}
          </div>
        </div>
      </div>
    </div>
  );
}

function ReorderBoard({ answer }) {
  return (
    <div>
      <p className="eyebrow mb-3">Drag to put these in order</p>
      <Droppable droppableId="reorder-list">
        {(provided) => (
          <div ref={provided.innerRef} {...provided.droppableProps} className="flex flex-col gap-2.5">
            {answer.map((item, i) => (
              <Draggable key={item.id} draggableId={String(item.id)} index={i}>
                {(p, s) => (
                  <div
                    ref={p.innerRef} {...p.draggableProps} {...p.dragHandleProps}
                    className={`flex items-center gap-3.5 rounded-xl border bg-[hsl(var(--card))] px-4 py-3.5 text-base font-medium active:cursor-grabbing
                      ${s.isDragging ? 'border-[hsl(var(--primary))] shadow-[0_12px_32px_rgba(0,0,0,0.14)] ring-2 ring-[hsl(var(--primary))]/25' : 'border-[hsl(var(--border))] hover:border-[hsl(var(--input))]'}`}
                  >
                    <PiDotsSixVerticalBold className="h-5 w-5 shrink-0 text-[hsl(var(--muted-foreground))]" />
                    <span className="tabular grid h-6 w-6 shrink-0 place-items-center rounded-md bg-[hsl(var(--muted))] font-mono text-xs text-[hsl(var(--muted-foreground))]">{i + 1}</span>
                    <MiniMedia media={item.media} />
                    <span className="min-w-0 flex-1 break-words">{item.text}</span>
                  </div>
                )}
              </Draggable>
            ))}
            {provided.placeholder}
          </div>
        )}
      </Droppable>
    </div>
  );
}

function CategorizeBoard({ question, answer, onDragEnd }) {
  const placement = usePlacement(toMove(onDragEnd, (slotId) => (slotId === 'bank' ? answer.bank?.length || 0 : (answer[slotId] || []).length)));
  return (
    <div className="flex flex-col gap-7">
      <p className="-mb-3 text-sm text-[hsl(var(--muted-foreground))]">{placement.held ? 'Now tap the group it belongs to.' : 'Drag each item into its group, or tap an item and then tap the group.'}</p>
      {/* The tray sits above the groups and stays pinned while you scroll through them. */}
      <div className="sticky top-3 z-20 -mx-1 bg-[hsl(var(--background))] px-1 pb-1">
        <p className="eyebrow mb-2.5">Items to sort</p>
        <div
          {...slotProps('bank', placement, 'Items to sort')}
          className={`flex min-h-16 flex-wrap gap-2.5 rounded-xl border border-dashed p-3 outline-none transition-colors ${placement.hover === 'bank' ? 'border-[hsl(var(--primary))] bg-[hsl(var(--tint-green))]' : 'border-[hsl(var(--input))] bg-[hsl(var(--muted))]'}`}
        >
          {(answer.bank || []).map((item, i) => (
            <PlacementChip key={item.id} chip={{ id: item.id, from: { droppableId: 'bank', index: i } }} placement={placement}>
              <MiniMedia media={item.media} /><span className="break-words">{item.text}</span>
            </PlacementChip>
          ))}
          {(answer.bank || []).length === 0 && <span className="text-xs text-[hsl(var(--muted-foreground))]">All items sorted</span>}
        </div>
      </div>
      <div className="grid gap-4 [grid-template-columns:repeat(auto-fit,minmax(210px,1fr))]">
        {question.categorizeData.categories.map((cat) => {
          const over = placement.hover === String(cat.id);
          return (
            <div
              key={cat.id}
              {...slotProps(String(cat.id), placement, `Group ${cat.name}`)}
              className={`rounded-xl border p-3 outline-none transition-colors focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring))]
                ${over ? 'border-[hsl(var(--primary))] bg-[hsl(var(--tint-green))]'
                  : placement.held ? 'cursor-pointer border-dashed border-[hsl(var(--primary))]/60 bg-[hsl(var(--card))]' : 'border-[hsl(var(--border))] bg-[hsl(var(--card))]'}`}
            >
              <p className="mb-3 border-b border-[hsl(var(--border))] pb-2.5 text-sm font-semibold">{cat.name}</p>
              <div className="flex min-h-28 flex-col gap-2.5">
                {(answer[cat.id] || []).map((item, i) => (
                  <PlacementChip fresh key={item.id} chip={{ id: item.id, from: { droppableId: String(cat.id), index: i } }} placement={placement}>
                    <MiniMedia media={item.media} /><span className="break-words">{item.text}</span>
                  </PlacementChip>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
