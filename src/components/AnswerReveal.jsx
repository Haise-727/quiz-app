import React from 'react';
import { PiCheckBold } from 'react-icons/pi';
import MediaRenderer from './MediaRenderer';
import { mediaKind, getSubQuestions } from '../utils/media';

/**
 * The "here is the correct answer" view, used by Practice and by the back of a
 * flashcard. Keeping it in one place means both study modes show the same
 * thing, including the pictures, audio and video attached to answers.
 */

/**
 * Small media for answer rows. Pictures become a thumbnail, audio and video a
 * compact player. Wrapped so that pressing play or zooming never counts as
 * picking the option or flipping the card it sits inside.
 */
export const MiniMedia = ({ media }) => {
  if (!media?.url) return null;
  const sizing = { image: 'w-10 h-10 rounded object-cover', video: 'w-32 rounded', audio: 'w-44 h-8' }[mediaKind(media)] || '';
  return (
    <span className="shrink-0 inline-flex" onClick={(e) => e.stopPropagation()}>
      <MediaRenderer media={media} transform="thumbnail" className={sizing} />
    </span>
  );
};

/**
 * @param q        the question
 * @param centered centre everything (flashcard back) instead of left aligning (practice)
 * @param tone     'primary' paints the answer in the brand colour, 'plain' in the text colour
 */
export const CorrectAnswer = ({ q, centered = false, tone = 'primary' }) => {
  const tint = tone === 'primary' ? 'text-[hsl(var(--primary))]' : 'text-[hsl(var(--foreground))]';
  const col = `flex flex-col gap-1 ${centered ? 'items-center text-center' : ''}`;
  const row = `flex items-center gap-2 flex-wrap ${centered ? 'justify-center' : ''}`;

  switch (q.type) {
    case 'MCQ':
      return (
        <div className={col}>
          {q.mcqData.correctOptions.map(id => {
            const opt = q.mcqData.options.find(o => o.id === id);
            return (
              <div key={id} className={row}>
                <MiniMedia media={opt?.media} />
                <p className={`font-semibold ${tint}`}><PiCheckBold className="mr-1.5 inline h-3.5 w-3.5 align-[-1px]" aria-hidden />{opt?.text}</p>
              </div>
            );
          })}
        </div>
      );
    case 'TRUE_FALSE':
      return <p className={`font-semibold ${tint}`}><PiCheckBold className="mr-1.5 inline h-3.5 w-3.5 align-[-1px]" aria-hidden />{q.trueFalseData.correctAnswer ? 'True' : 'False'}</p>;
    case 'FILL_IN_THE_BLANK':
      return <p className={`font-semibold ${tint}`}><PiCheckBold className="mr-1.5 inline h-3.5 w-3.5 align-[-1px]" aria-hidden />{q.fillBlankData.answers.map(a => a.text).join(' / ')}</p>;
    case 'MATCH_THE_FOLLOWING':
      return (
        <div className={col}>
          {q.matchData.pairs.map(p => (
            <div key={p.id} className={`${row} text-sm ${tint}`}>
              <MiniMedia media={p.promptMedia} />
              <span>{p.prompt}</span>
              <span>→</span>
              <MiniMedia media={p.answerMedia} />
              <strong>{p.answer}</strong>
            </div>
          ))}
        </div>
      );
    case 'REORDER':
      return (
        <ol className={col}>
          {q.reorderData.items.map((item, i) => (
            <li key={item.id} className={`${row} text-sm ${tint}`}>
              <span>{i + 1}.</span>
              <MiniMedia media={item.media} />
              <span>{item.text}</span>
            </li>
          ))}
        </ol>
      );
    case 'CATEGORIZE':
      return (
        <div className={`${col} gap-3`}>
          {q.categorizeData.categories.map(cat => (
            <div key={cat.id}>
              <p className={`text-xs font-bold uppercase mb-1 ${tint}`}>{cat.name}:</p>
              <div className={`flex flex-wrap gap-3 ${centered ? 'justify-center' : ''}`}>
                {q.categorizeData.items.filter(i => i.categoryId === cat.id).map(i => (
                  <span key={i.id} className={`inline-flex items-center gap-1.5 text-sm ${tint}`}>
                    <MiniMedia media={i.media} />{i.text}
                  </span>
                ))}
              </div>
            </div>
          ))}
        </div>
      );
    case 'VISUAL_COMPREHENSION':
    case 'LISTENING_COMPREHENSION':
      // One answer per follow up question.
      return (
        <div className={`${col} gap-3`}>
          {getSubQuestions(q).filter(s => s?.mcqData).map((s, n) => (
            <div key={s.id ?? n} className={col}>
              <p className="text-xs font-semibold text-[hsl(var(--muted-foreground))]">{n + 1}. {s.questionText}</p>
              {(s.mcqData.correctOptions || []).map(id => {
                const opt = s.mcqData.options.find(o => String(o.id) === String(id));
                return (
                  <div key={id} className={row}>
                    <MiniMedia media={opt?.media} />
                    <p className={`font-semibold text-sm ${tint}`}><PiCheckBold className="mr-1.5 inline h-3.5 w-3.5 align-[-1px]" aria-hidden />{opt?.text}</p>
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      );
    case 'PARAGRAPH':
      return <p className="text-sm italic text-[hsl(var(--muted-foreground))]">Open-ended, no auto-answer.</p>;
    default:
      return <p className="text-sm text-[hsl(var(--muted-foreground))]">No auto-answer for this type.</p>;
  }
};
