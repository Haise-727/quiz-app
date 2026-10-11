import { motion } from 'framer-motion';
import { PiCheckBold, PiClockBold, PiMinusBold, PiXBold } from 'react-icons/pi';
import AnimatedNumber from '../game/AnimatedNumber';
import { CorrectAnswer } from '../AnswerReveal';
import { ordinal } from '@/utils/liveScoring';
import { springPop, stagger, rise } from '@/lib/motion';

const LOOK = {
  correct: { title: 'Correct', tile: 'bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))]', Icon: PiCheckBold },
  partial: { title: 'Partly right', tile: 'bg-[hsl(var(--tint-yellow))] text-[hsl(var(--tint-yellow-fg))]', Icon: PiMinusBold },
  wrong: { title: 'Not quite', tile: 'bg-[hsl(var(--tint-red))] text-[hsl(var(--tint-red-fg))]', Icon: PiXBold },
  none: { title: 'Out of time', tile: 'bg-[hsl(var(--tint-neutral))] text-[hsl(var(--tint-neutral-fg))]', Icon: PiClockBold },
};

/**
 * What a player sees when the host reveals the answer: right or wrong, the points they just
 * earned counting up, how those points were made up (speed, streak, power-ups), and whether
 * they moved on the board. A wrong answer also shows what the right one was.
 *
 * @param result  { correct, points, parts } from the answer record, or null if they did not answer
 * @param rank    { now, before } where they stand now and stood before this question
 */
export default function ResultCard({ question, result, rank }) {
  const kind = !result ? 'none' : result.correct ? 'correct' : result.points > 0 ? 'partial' : 'wrong';
  const look = LOOK[kind];
  const parts = result?.parts || {};
  const moved = rank?.before && rank?.now ? rank.before - rank.now : 0;

  return (
    <motion.div variants={stagger(0.08)} initial="hidden" animate="show" className="flex flex-col items-center text-center">
      <motion.span variants={{ hidden: { scale: 0 }, show: { scale: 1, transition: springPop } }} className={`grid h-20 w-20 place-items-center rounded-3xl ${look.tile}`}>
        <look.Icon className="h-9 w-9" />
      </motion.span>
      <motion.h1 variants={rise} className="mt-5 text-3xl font-semibold tracking-tight">{look.title}</motion.h1>

      {result && (
        <motion.p variants={rise} className="mt-2 text-hero text-6xl tabular text-[hsl(var(--foreground))]">
          +<AnimatedNumber value={result.points} duration={0.9} />
          <span className="ml-2 text-xl text-[hsl(var(--muted-foreground))]">pts</span>
        </motion.p>
      )}

      {result && result.points > 0 && (
        <motion.ul variants={rise} className="mt-4 flex flex-wrap justify-center gap-2 text-xs font-medium">
          <li className="rounded-full bg-[hsl(var(--tint-neutral))] px-2.5 py-1 text-[hsl(var(--tint-neutral-fg))]">Speed {parts.base ?? result.points}</li>
          {parts.streakPct > 0 && <li className="rounded-full bg-[hsl(var(--tint-yellow))] px-2.5 py-1 text-[hsl(var(--tint-yellow-fg))]">Streak +{parts.streakPct}%</li>}
          {parts.doubled && <li className="rounded-full bg-[hsl(var(--tint-green))] px-2.5 py-1 text-[hsl(var(--tint-green-fg))]">Double points x2</li>}
          {parts.usedFifty && <li className="rounded-full bg-[hsl(var(--tint-blue))] px-2.5 py-1 text-[hsl(var(--tint-blue-fg))]">50/50 halves it</li>}
        </motion.ul>
      )}

      {rank?.now && (
        <motion.p variants={rise} className="mt-6 text-[hsl(var(--muted-foreground))]">
          You are <span className="font-medium text-[hsl(var(--foreground))]">{ordinal(rank.now)}</span>
          {moved > 0 && <span className="ml-2 font-medium text-[hsl(var(--primary))]">up {moved}</span>}
          {moved < 0 && <span className="ml-2 font-medium text-[hsl(var(--destructive))]">down {-moved}</span>}
        </motion.p>
      )}

      {kind !== 'correct' && question && (
        <motion.div variants={rise} className="mt-7 w-full rounded-2xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-4 text-left">
          <p className="eyebrow mb-2">The answer</p>
          <div className="text-sm"><CorrectAnswer q={question} tone="plain" /></div>
        </motion.div>
      )}
    </motion.div>
  );
}
