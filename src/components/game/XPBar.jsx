import { useEffect, useRef, useState } from 'react';
import { animate, motion, useMotionValue, useTransform } from 'framer-motion';

/**
 * The XP bar for the current level.
 *
 * Give it one level (`before`) and it just shows it. Give it `before` and `after` and it
 * plays the gain: the bar fills, and if the level changed it fills to the end, the level
 * label swaps, and the bar fills again from zero. That sequence is the "level up" moment.
 *
 * @param before  levelInfo() from utils/gamification
 * @param after   levelInfo() after the gain, optional
 * @param delay   seconds before the animation starts
 * @param onLevelUp  called at the moment the bar overflows into the new level
 */
export default function XPBar({ before, after, delay = 0, onLevelUp, className = '' }) {
  const [info, setInfo] = useState(before);
  const progress = useMotionValue(before.progress);
  const levelUpRef = useRef(onLevelUp);
  levelUpRef.current = onLevelUp;

  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      if (!after) { setInfo(before); progress.set(before.progress); return; }
      setInfo(before);
      progress.set(before.progress);
      await new Promise((r) => setTimeout(r, delay * 1000));
      if (cancelled) return;

      if (after.level === before.level) {
        await animate(progress, after.progress, { duration: 0.9, ease: [0.16, 1, 0.3, 1] });
        return;
      }
      await animate(progress, 1, { duration: 0.6, ease: [0.4, 0, 0.2, 1] });   // fill the old level
      if (cancelled) return;
      levelUpRef.current?.();
      setInfo(after);
      progress.set(0);
      await animate(progress, after.progress, { duration: 0.8, ease: [0.16, 1, 0.3, 1] });
    };
    run();
    return () => { cancelled = true; };
  }, [before.xp, after?.xp, delay, progress]); // eslint-disable-line react-hooks/exhaustive-deps

  const into = useTransform(progress, (p) => `${Math.round(p * info.span)}`);

  return (
    <div className={className}>
      <div className="mb-1.5 flex items-baseline justify-between gap-3 text-xs">
        <span className="font-mono uppercase tracking-wider text-[hsl(var(--muted-foreground))]">
          Level {info.level} <span className="text-[hsl(var(--foreground))]">{info.title}</span>
        </span>
        <span className="tabular font-mono text-[hsl(var(--muted-foreground))]">
          <motion.span className="text-[hsl(var(--foreground))]">{into}</motion.span> / {info.span} XP
        </span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-[hsl(var(--muted))]">
        <motion.div className="h-full origin-left rounded-full bg-[hsl(var(--brand))]" style={{ scaleX: progress }} />
      </div>
    </div>
  );
}
