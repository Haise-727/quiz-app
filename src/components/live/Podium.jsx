import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { PiCrownSimpleFill } from 'react-icons/pi';
import AnimatedNumber from '../game/AnimatedNumber';
import Confetti from '../Confetti';
import { playBadge, playComplete } from '@/utils/sounds';

/**
 * The top three at the end of a game. The columns rise one at a time, third then second then
 * first, so the winner is the last to appear, and confetti goes off for first place. Heights
 * are scaled with transform, so nothing reflows while it animates.
 *
 * @param ranked  rankPlayers() output, best first
 */
export default function Podium({ ranked, big = false }) {
  const top = ranked.slice(0, 3);
  const [shownFirst, setShownFirst] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => { setShownFirst(true); playComplete(); }, 2300);
    const s = setTimeout(playBadge, 800);
    return () => { clearTimeout(t); clearTimeout(s); };
  }, []);

  // Visual order is second, first, third. Each has its height, delay and tint.
  const slots = [
    { place: 2, player: top[1], height: 0.62, delay: 1.1, tint: 'bg-[hsl(var(--tint-neutral))]' },
    { place: 1, player: top[0], height: 1, delay: 2.0, tint: 'bg-[hsl(var(--tint-yellow))]' },
    { place: 3, player: top[2], height: 0.42, delay: 0.3, tint: 'bg-[hsl(var(--tint-neutral))]' },
  ];
  const H = big ? 300 : 210;

  return (
    <div className="relative mx-auto flex w-full max-w-xl items-end justify-center gap-3" style={{ minHeight: H + 90 }}>
      {shownFirst && <Confetti count={110} />}
      {slots.map(({ place, player, height, delay, tint }) => (
        <div key={place} className="flex w-1/3 flex-col items-center justify-end">
          {player ? (
            <>
              <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: delay + 0.35, duration: 0.4 }} className="mb-2 w-full text-center">
                {place === 1 && <PiCrownSimpleFill className="mx-auto mb-1 h-6 w-6 text-[hsl(var(--tint-yellow-fg))]" />}
                <p className={`truncate font-medium ${big ? 'text-xl' : 'text-sm'}`}>{player.name}</p>
                <p className="tabular text-xs text-[hsl(var(--muted-foreground))]"><AnimatedNumber value={player.score} delay={delay + 0.35} duration={0.9} /> pts</p>
              </motion.div>
              <motion.div
                initial={{ scaleY: 0 }}
                animate={{ scaleY: 1 }}
                transition={{ type: 'spring', stiffness: 160, damping: 17, delay }}
                style={{ height: H * height, originY: 1 }}
                className={`grid w-full place-items-start rounded-t-2xl border border-b-0 border-[hsl(var(--border))] pt-3 ${tint}`}
              >
                <span className="text-hero w-full text-center text-4xl text-[hsl(var(--foreground))]">{place}</span>
              </motion.div>
            </>
          ) : <div style={{ height: H * height }} />}
        </div>
      ))}
    </div>
  );
}
