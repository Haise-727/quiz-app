import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { Link } from 'react-router-dom';
import { PiArrowRightBold, PiCheckCircleFill, PiClockBold, PiSparkleFill } from 'react-icons/pi';
import { Button } from '@/components/ui/button';
import AnimatedNumber from '../game/AnimatedNumber';
import XPBar from '../game/XPBar';
import LevelBadge from '../game/LevelBadge';
import StreakChip from '../game/StreakChip';
import BadgeTile from '../game/BadgeTile';
import Confetti from '../Confetti';
import { rise, stagger, springPop } from '@/lib/motion';
import { playBadge, playLevelUp } from '@/utils/sounds';

const verdict = (pct) => {
  if (pct >= 100) return 'A perfect score';
  if (pct >= 90) return 'Outstanding';
  if (pct >= 75) return 'A strong result';
  if (pct >= 50) return 'A solid effort';
  if (pct > 0) return 'Room to grow';
  return 'Not this time';
};

/**
 * The screen after the last question. It plays like a short reward sequence:
 * the score counts up, then the XP you earned, the bar fills (and rolls over into the
 * next level if you got there), then your streak and any badge you just unlocked.
 *
 * @param result   the saved result: { finalScore, maxScore, status }
 * @param summary  progressSummary() from utils/gamification, or null if it could not be worked out
 * @param mode     'student' or 'guest'
 */
export default function QuizResult({ result, summary, mode, onReview, onExit, exitLabel, onAgain }) {
  const pct = result.maxScore > 0 ? Math.round((result.finalScore / result.maxScore) * 100) : 0;
  const pending = result.status === 'pending';
  const [leveled, setLeveled] = useState(false);
  const celebrate = pct === 100 || leveled;

  // The reward lands in a fixed order. These are seconds after the screen opens.
  const T = { xp: 1.0, bar: 1.35, after: 2.6 };
  const badges = summary?.newBadges || [];

  useEffect(() => {
    if (!badges.length) return undefined;
    const id = setTimeout(playBadge, (T.after + 0.4) * 1000);
    return () => clearTimeout(id);
  }, [badges.length]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-xl flex-col justify-center px-6 py-14">
      {celebrate && <Confetti count={leveled ? 130 : 90} />}
      <motion.div variants={stagger(0.08)} initial="hidden" animate="show">
        <motion.h1 variants={rise} className="eyebrow">{pending ? 'Submitted' : 'Quiz complete'}</motion.h1>

        <motion.div variants={rise} className="mt-3 flex items-end gap-3">
          <span className="text-hero text-[7rem] leading-none text-[hsl(var(--foreground))] tabular">
            <AnimatedNumber value={result.finalScore} duration={1.1} />
          </span>
          <span className="tabular mb-3 text-2xl text-[hsl(var(--muted-foreground))]">/ {result.maxScore}</span>
        </motion.div>

        <motion.p variants={rise} className="mt-3 text-xl font-medium text-[hsl(var(--foreground))]">
          {verdict(pct)}
          <span className="tabular ml-2 font-normal text-[hsl(var(--muted-foreground))]">{pct}%</span>
        </motion.p>

        {pending && (
          <motion.p variants={rise} className="mt-4 flex items-start gap-2 rounded-lg bg-[hsl(var(--tint-yellow))] px-3.5 py-2.5 text-sm text-[hsl(var(--tint-yellow-fg))]">
            <PiClockBold className="mt-0.5 h-4 w-4 shrink-0" />
            Some answers need your teacher to mark them. Your score and XP will update when they do.
          </motion.p>
        )}

        {summary && (
          <section className="mt-10 border-t border-[hsl(var(--border))] pt-7" aria-label="Rewards">
            <div className="flex items-center justify-between gap-4">
              <motion.p
                initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: T.xp, ...springPop }}
                className="flex items-center gap-2 text-lg font-medium"
              >
                <PiSparkleFill className="h-4 w-4 text-[hsl(var(--brand))]" />
                {summary.xpGained > 0 ? (
                  <span className="text-[hsl(var(--primary))]">+<AnimatedNumber value={summary.xpGained} delay={T.xp} duration={0.8} /> XP</span>
                ) : (
                  <span className="text-[hsl(var(--muted-foreground))]">No new XP</span>
                )}
              </motion.p>
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: T.after }}>
                <StreakChip days={summary.streakAfter.current} doneToday={summary.streakAfter.doneToday} />
              </motion.div>
            </div>

            <div className="mt-4 flex items-center gap-4">
              {/* Shows the old level until the bar overflows, then pops to the new one. */}
              <LevelBadge level={leveled ? summary.levelAfter.level : summary.levelBefore.level} />
              <XPBar
                className="min-w-0 flex-1"
                before={summary.levelBefore}
                after={summary.levelAfter}
                delay={T.bar}
                onLevelUp={() => { setLeveled(true); playLevelUp(); }}
              />
            </div>

            {summary.xpGained === 0 && (
              <p className="mt-3 text-sm text-[hsl(var(--muted-foreground))]">XP counts your best attempt on each quiz, so beating your score earns the difference.</p>
            )}
            {summary.leveledUp && (
              <motion.p
                initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: T.bar + 0.7, ...springPop }}
                className="mt-4 flex items-center gap-2 text-base font-medium"
              >
                <PiCheckCircleFill className="h-5 w-5 text-[hsl(var(--brand))]" />
                You reached level {summary.levelAfter.level}: {summary.levelAfter.title}
              </motion.p>
            )}

            {badges.length > 0 && (
              <div className="mt-7">
                <p className="eyebrow mb-3">{badges.length === 1 ? 'New badge' : 'New badges'}</p>
                <motion.div
                  variants={stagger(0.12, T.after + 0.3)} initial="hidden" animate="show"
                  className="grid grid-cols-2 gap-3 sm:grid-cols-3"
                >
                  {badges.map((b) => <BadgeTile key={b.id} badge={b} isNew />)}
                </motion.div>
              </div>
            )}
          </section>
        )}

        <motion.div variants={rise} className="mt-10 flex flex-wrap items-center gap-3">
          <Button onClick={onExit} size="lg">{exitLabel} <PiArrowRightBold /></Button>
          {onReview && <Button variant="outline" size="lg" onClick={onReview}>Review answers</Button>}
          {onAgain && <Button variant="ghost" size="lg" onClick={onAgain}>Try again</Button>}
        </motion.div>

        {mode === 'guest' && (
          <motion.p variants={rise} className="mt-8 border-t border-[hsl(var(--border))] pt-5 text-sm text-[hsl(var(--muted-foreground))]">
            This XP is saved on this device. <Link to="/login" className="font-medium text-[hsl(var(--foreground))] underline underline-offset-4">Create a free account</Link> to keep your progress, streak and badges everywhere.
          </motion.p>
        )}
      </motion.div>
    </main>
  );
}
