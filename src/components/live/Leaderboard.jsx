import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { PiArrowDownBold, PiArrowUpBold, PiFlameFill } from 'react-icons/pi';
import AnimatedNumber from '../game/AnimatedNumber';
import { isOut, previousRanks, rankPlayers, rankSuddenDeath } from '@/utils/liveScoring';
import { spring } from '@/lib/motion';

/**
 * The standings. It opens showing the order BEFORE the question just played and, a moment
 * later, switches to the order now: the rows slide to their new places, the scores count up
 * and an arrow shows who moved. That little delay is the whole moment of the screen.
 *
 * @param players   session.players
 * @param answers   answers for the question just played, used to work out the order before it
 * @param meId      highlights the viewer's own row, and keeps it on screen if they are below the cut
 * @param limit     how many rows to show
 * @param big       larger type, for the projector
 * @param suddenDeath  rank by who is still standing, show who is out, and skip the move animation
 */
export default function Leaderboard({ players, answers, meId, limit = 5, big = false, suddenDeath = false }) {
  const [settled, setSettled] = useState(false);
  useEffect(() => { const id = setTimeout(() => setSettled(true), 900); return () => clearTimeout(id); }, []);

  const now = suddenDeath ? rankSuddenDeath(players) : rankPlayers(players);
  const earned = (id) => Number(answers?.[id]?.points) || 0;
  const before = rankPlayers(Object.fromEntries(Object.entries(players || {}).map(([id, p]) => [id, { ...p, score: (Number(p.score) || 0) - earned(id) }])));
  const prevRank = previousRanks(players, answers);

  const shown = settled || suddenDeath ? now : before.map((b) => ({ ...now.find((n) => n.id === b.id), rank: b.rank }));
  let rows = shown.slice(0, limit);
  const me = shown.find((p) => p.id === meId);
  if (me && !rows.some((r) => r.id === meId)) rows = [...rows, me];

  return (
    <ol className="flex w-full flex-col gap-2">
      {rows.map((p) => {
        const delta = settled && !suddenDeath ? (prevRank[p.id] || p.rank) - p.rank : 0;
        const out = suddenDeath && isOut(p);
        const mine = p.id === meId;
        return (
          <motion.li
            key={p.id}
            layout
            transition={spring}
            className={`flex items-center gap-4 rounded-2xl border px-4 ${big ? 'py-4 text-2xl' : 'py-3 text-base'} ${out ? 'opacity-55' : ''} ${mine ? 'border-[hsl(var(--primary))] bg-[hsl(var(--tint-green))]' : 'border-[hsl(var(--border))] bg-[hsl(var(--card))]'}`}
          >
            <span className="tabular w-8 shrink-0 text-center font-mono text-sm text-[hsl(var(--muted-foreground))]">{p.rank}</span>
            <span className="min-w-0 flex-1 truncate font-medium">{p.name}{mine && <span className="ml-2 text-xs font-normal text-[hsl(var(--muted-foreground))]">you</span>}</span>
            {out && <span className="rounded-full bg-[hsl(var(--tint-red))] px-2 py-0.5 text-xs font-medium text-[hsl(var(--tint-red-fg))]">Out</span>}
            {p.streak >= 2 && !out && <span className="inline-flex items-center gap-0.5 text-sm text-[hsl(var(--tint-yellow-fg))]"><PiFlameFill className="h-4 w-4 text-[hsl(var(--flame))]" />{p.streak}</span>}
            <span className="w-8 shrink-0 text-right text-xs font-medium">
              {delta > 0 && <span className="inline-flex items-center text-[hsl(var(--primary))]"><PiArrowUpBold className="h-3 w-3" />{delta}</span>}
              {delta < 0 && <span className="inline-flex items-center text-[hsl(var(--destructive))]"><PiArrowDownBold className="h-3 w-3" />{-delta}</span>}
            </span>
            <span className="tabular w-20 shrink-0 text-right font-semibold">
              <AnimatedNumber value={Number(p.score) || 0} from={(Number(p.score) || 0) - (settled ? earned(p.id) : 0)} duration={0.9} />
            </span>
          </motion.li>
        );
      })}
    </ol>
  );
}
