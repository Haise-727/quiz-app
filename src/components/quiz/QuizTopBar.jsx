import { motion } from 'framer-motion';
import { PiSpeakerHighBold, PiSpeakerSlashBold } from 'react-icons/pi';
import { spring } from '@/lib/motion';
import TimerRing from './TimerRing';

const SEGMENT_STYLE = {
  answered: 'bg-[hsl(var(--ink))]',
  skipped: 'bg-[hsl(var(--tint-yellow-fg))]/45',
  upcoming: 'bg-[hsl(var(--border))]',
  current: 'bg-[hsl(var(--brand))]',
};

/**
 * The strip across the top of a quiz: title, position, one segment per question, the
 * timer ring and the sound switch. Segments show where you are (green), what you have
 * answered (ink), what you passed without answering (amber) and what is left (grey).
 * The current one grows a little, with a spring.
 */
export default function QuizTopBar({ title, index, states, timeLeft, timeTotal, soundOn, onToggleSound }) {
  const count = states.length;
  return (
    <header className="mx-auto flex w-full max-w-3xl items-center gap-4 px-5 pt-5 sm:px-6">
      <div className="min-w-0 flex-1">
        <div className="mb-2.5 flex items-baseline justify-between gap-3">
          <p className="truncate text-sm font-medium text-[hsl(var(--foreground))]">{title}</p>
          <p className="eyebrow tabular shrink-0">{index + 1} / {count}</p>
        </div>
        <div className="flex gap-1" role="progressbar" aria-valuemin={1} aria-valuemax={count} aria-valuenow={index + 1} aria-label="Quiz progress">
          {states.map((state, i) => (
            <motion.div
              key={i}
              animate={{ scaleY: i === index ? 1.9 : 1 }}
              transition={spring}
              className={`h-1.5 min-w-[3px] flex-1 origin-center rounded-full transition-colors duration-200 ${SEGMENT_STYLE[i === index ? 'current' : state]}`}
            />
          ))}
        </div>
      </div>
      <TimerRing timeLeft={timeLeft} total={timeTotal} />
      <button
        type="button"
        onClick={onToggleSound}
        aria-label={soundOn ? 'Mute sounds' : 'Unmute sounds'}
        className="grid h-9 w-9 shrink-0 place-items-center rounded-lg text-[hsl(var(--muted-foreground))] hover:bg-[hsl(var(--muted))] hover:text-[hsl(var(--foreground))]"
      >
        {soundOn ? <PiSpeakerHighBold className="h-4 w-4" /> : <PiSpeakerSlashBold className="h-4 w-4" />}
      </button>
    </header>
  );
}
