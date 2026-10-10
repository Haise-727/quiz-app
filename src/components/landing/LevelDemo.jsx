import { useRef } from 'react';
import { useInView } from 'framer-motion';
import XPBar from '@/components/game/XPBar';
import LevelBadge from '@/components/game/LevelBadge';
import AnimatedNumber from '@/components/game/AnimatedNumber';
import { levelInfo } from '@/utils/gamification';

const BEFORE = levelInfo(70);
const AFTER = levelInfo(170);

/**
 * The XP bar from the results screen, played once when it scrolls into view: a finished
 * quiz fills it, it overflows and the level goes up. Same component the app uses.
 */
export default function LevelDemo() {
  const ref = useRef(null);
  const seen = useInView(ref, { once: true, margin: '-30% 0px' });
  return (
    <div ref={ref} aria-hidden="true" className="select-none">
      <div className="flex items-center gap-4">
        <LevelBadge level={seen ? AFTER.level : BEFORE.level} size="lg" />
        <div>
          <p className="eyebrow">Quiz finished</p>
          <p className="mt-1 text-3xl font-medium text-[hsl(var(--foreground))]">
            +<AnimatedNumber key={seen ? 'go' : 'wait'} value={seen ? 100 : 0} duration={1} delay={0.2} /> XP
          </p>
        </div>
      </div>
      <XPBar key={seen ? 'play' : 'rest'} before={BEFORE} after={seen ? AFTER : undefined} delay={0.5} className="mt-6" />
    </div>
  );
}
