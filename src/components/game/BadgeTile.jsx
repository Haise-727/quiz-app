import { motion } from 'framer-motion';
import { PiLockSimpleBold } from 'react-icons/pi';
import { pop, springPop } from '@/lib/motion';
import { BADGE_ICONS, TINT } from './icons';

/**
 * One badge. Earned badges are tinted and show what they were for. Locked ones are
 * muted and show how far along you are. `isNew` makes it land with a pop.
 * Use inside a parent that uses the `stagger()` variants so a row arrives one by one.
 */
export default function BadgeTile({ badge, isNew = false, className = '' }) {
  const Icon = BADGE_ICONS[badge.icon] || BADGE_ICONS.star;
  const pct = Math.round((badge.value / badge.target) * 100);
  return (
    <motion.div
      variants={pop}
      className={`flex flex-col items-center gap-2 rounded-xl border bg-[hsl(var(--card))] p-3 text-center ${isNew ? 'border-[hsl(var(--primary))]/50' : 'border-[hsl(var(--border))]'} ${className}`}
    >
      <motion.div
        initial={isNew ? { scale: 0.4, rotate: -20 } : false}
        animate={{ scale: 1, rotate: 0 }}
        transition={springPop}
        className={`grid h-11 w-11 place-items-center rounded-lg ${badge.earned ? TINT[badge.tone] || TINT.neutral : TINT.neutral + ' opacity-70'}`}
      >
        {badge.earned ? <Icon className="h-5 w-5" /> : <PiLockSimpleBold className="h-4 w-4" />}
      </motion.div>
      <div className="min-w-0">
        <p className="text-xs font-medium text-[hsl(var(--foreground))]">{badge.name}</p>
        <p className="mt-0.5 text-[11px] leading-snug text-[hsl(var(--muted-foreground))]">
          {badge.earned ? badge.hint : `${badge.value} of ${badge.target}`}
        </p>
      </div>
      {!badge.earned && (
        <div className="h-1 w-full overflow-hidden rounded-full bg-[hsl(var(--muted))]">
          <div className="h-full rounded-full bg-[hsl(var(--brand))]" style={{ width: `${pct}%` }} />
        </div>
      )}
    </motion.div>
  );
}
