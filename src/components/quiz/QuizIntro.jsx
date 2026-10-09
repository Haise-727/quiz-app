import { motion } from 'framer-motion';
import { PiArrowRightBold } from 'react-icons/pi';
import { Button } from '@/components/ui/button';
import { Kbd } from '@/components/ui/kbd';
import LevelBadge from '../game/LevelBadge';
import XPBar from '../game/XPBar';
import StreakChip from '../game/StreakChip';
import { rise, stagger } from '@/lib/motion';
import { xpForAttempt } from '@/utils/gamification';

/**
 * The screen before a quiz starts. Left aligned and editorial: a small label, the title in
 * the display serif, the plain facts, then one clear way in. There is no card around it.
 *
 * Signed in players see their level and streak, which is what they are about to add to.
 * Guests type a name instead, and are told where their progress is kept.
 */
export default function QuizIntro({ quiz, mode, name, onNameChange, progress, onStart }) {
  const questions = quiz.questions || [];
  const seconds = questions.reduce((sum, q) => sum + (parseInt(q.timeLimit, 10) || 60), 0);
  const minutes = Math.max(1, Math.round(seconds / 60));
  const maxXp = xpForAttempt({ finalScore: quiz.totalPoints, maxScore: quiz.totalPoints, questionCount: questions.length });

  const facts = [
    ['Questions', questions.length],
    ['Points', quiz.totalPoints],
    ['Time limit', `${minutes} min`],
  ];

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-2xl flex-col justify-center px-6 py-16">
      <motion.div variants={stagger(0.07)} initial="hidden" animate="show">
        <motion.p variants={rise} className="eyebrow">{quiz.subject ? `${quiz.subject} quiz` : 'Quiz'}</motion.p>
        <motion.h1 variants={rise} className="text-hero mt-4 text-5xl text-[hsl(var(--foreground))] sm:text-6xl">{quiz.title}</motion.h1>
        {quiz.description && (
          <motion.p variants={rise} className="mt-5 max-w-prose text-lg leading-relaxed text-[hsl(var(--muted-foreground))]">{quiz.description}</motion.p>
        )}

        <motion.dl variants={rise} className="mt-10 grid grid-cols-3 divide-x divide-[hsl(var(--border))] border-y border-[hsl(var(--border))]">
          {facts.map(([label, value], i) => (
            <div key={label} className={`py-4 ${i === 0 ? 'pr-4' : 'px-4'}`}>
              <dt className="eyebrow">{label}</dt>
              <dd className="tabular mt-1.5 text-2xl font-medium text-[hsl(var(--foreground))]">{value}</dd>
            </div>
          ))}
        </motion.dl>

        <motion.div variants={rise} className="mt-8">
          {mode === 'student' && progress ? (
            <div className="flex items-center gap-4">
              <LevelBadge level={progress.level.level} />
              <div className="min-w-0 flex-1">
                <XPBar before={progress.level} />
              </div>
              <StreakChip days={progress.streak.current} doneToday={progress.streak.doneToday} />
            </div>
          ) : (
            <div>
              <label htmlFor="guest-name" className="eyebrow">Your name</label>
              <input
                id="guest-name"
                value={name}
                onChange={(e) => onNameChange(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') onStart(); }}
                placeholder="Optional, shown to your teacher"
                maxLength={30}
                autoComplete="off"
                className="mt-2 w-full border-0 border-b-2 border-[hsl(var(--input))] bg-transparent pb-2.5 text-xl text-[hsl(var(--foreground))] outline-none transition-colors placeholder:text-[hsl(var(--muted-foreground))]/50 focus:border-[hsl(var(--ink))]"
              />
              <p className="mt-3 text-sm text-[hsl(var(--muted-foreground))]">
                Playing as a guest. Your XP and streak are kept on this device.
              </p>
            </div>
          )}
        </motion.div>

        <motion.div variants={rise} className="mt-10 flex flex-wrap items-center gap-x-5 gap-y-3">
          <Button variant="brand" size="xl" onClick={onStart} className="min-w-44">
            Start quiz <PiArrowRightBold />
          </Button>
          <span className="tabular text-sm text-[hsl(var(--muted-foreground))]">Earn up to <span className="font-medium text-[hsl(var(--foreground))]">{maxXp} XP</span></span>
          <span className="hidden items-center gap-1.5 text-xs text-[hsl(var(--muted-foreground))] [@media(pointer:fine)]:inline-flex">
            or press <Kbd>Enter</Kbd>
          </span>
        </motion.div>
      </motion.div>
    </main>
  );
}
