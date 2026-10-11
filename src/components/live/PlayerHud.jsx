import { motion } from 'framer-motion';
import { PiFlameFill } from 'react-icons/pi';
import AnimatedNumber from '../game/AnimatedNumber';
import { ordinal, TEAM_NAMES } from '@/utils/liveScoring';
import { tileFor } from './tiles';
import { springPop } from '@/lib/motion';

/**
 * The strip a player keeps in view all game: where they stand, their score and their run of
 * correct answers. The score counts up when it changes, and the flame gives a beat each time
 * the streak grows. `bonusPct` is null when the host has the streak bonus switched off.
 * In a team game `team` is the player's team number, and in sudden death `out` replaces the
 * streak with a note that the player has been knocked out.
 */
export default function PlayerHud({ rank, score, streak, bonusPct, team = null, out = false }) {
  const t = Number.isInteger(team) ? tileFor(team) : null;
  const lit = streak >= 2;
  return (
    <div className="flex items-center justify-between gap-3 rounded-2xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] px-4 py-2.5">
      <div className="min-w-0">
        <p className="eyebrow">Rank</p>
        <p className="tabular text-lg font-semibold leading-tight">{rank ? ordinal(rank) : 'n/a'}</p>
        {t && <p className={`mt-0.5 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium ${t.bg} ${t.fg}`}><t.Icon className="h-3 w-3" />{TEAM_NAMES[team]} team</p>}
      </div>
      <div className="min-w-0 text-center">
        <p className="eyebrow">Score</p>
        <p className="text-lg font-semibold leading-tight"><AnimatedNumber value={score} from={score} duration={0.7} /></p>
      </div>
      {out ? (
        <span className="inline-flex items-center rounded-full bg-[hsl(var(--tint-red))] px-3 py-1.5 text-sm font-medium text-[hsl(var(--tint-red-fg))]">Out</span>
      ) : (
      <motion.div
        key={streak}
        initial={streak > 0 ? { scale: 1.25 } : false}
        animate={{ scale: 1 }}
        transition={springPop}
        title={bonusPct ? `Each answer in a row adds ${bonusPct}% more, up to 50%` : 'Answers in a row'}
        className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-medium tabular ${lit ? 'bg-[hsl(var(--tint-yellow))] text-[hsl(var(--tint-yellow-fg))]' : 'bg-[hsl(var(--tint-neutral))] text-[hsl(var(--tint-neutral-fg))]'}`}
      >
        <PiFlameFill className={`h-4 w-4 ${lit ? 'text-[hsl(var(--flame))]' : 'opacity-50'}`} />
        {streak}
        {bonusPct > 0 && <span className="text-xs">+{bonusPct}%</span>}
      </motion.div>
      )}
    </div>
  );
}
