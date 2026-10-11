import { motion } from 'framer-motion';
import AnimatedNumber from '../game/AnimatedNumber';
import { rankTeams } from '@/utils/liveScoring';
import { tileFor } from './tiles';
import { spring } from '@/lib/motion';

/**
 * The team standings for a team game: one row per team with its shape and colour, how many
 * players it has, and its score. A team's score is the AVERAGE of its players, so a team with
 * one more person does not win by size. Rows slide to their new places, and the bar under each
 * is one transform, so nothing reflows.
 *
 * @param players  session.players
 * @param teams    how many teams this game has
 * @param myTeam   the viewer's team number, highlighted, or null on the host's screen
 */
export default function TeamBoard({ players, teams, myTeam = null, big = false }) {
  const rows = rankTeams(players, teams);
  const top = Math.max(1, ...rows.map((r) => r.average));
  return (
    <ol className="flex w-full flex-col gap-2" aria-label="Team standings">
      {rows.map((r) => {
        const t = tileFor(r.team);
        const mine = r.team === myTeam;
        return (
          <motion.li
            key={r.team}
            layout
            transition={spring}
            className={`rounded-2xl border px-4 ${big ? 'py-4' : 'py-3'} ${mine ? 'border-[hsl(var(--primary))]' : 'border-[hsl(var(--border))]'} ${t.bg}`}
          >
            <div className={`flex items-center gap-3 ${big ? 'text-2xl' : 'text-base'}`}>
              <span className="tabular w-6 shrink-0 text-center font-mono text-sm text-[hsl(var(--muted-foreground))]">{r.rank}</span>
              <span className={`grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-[hsl(var(--card))]/70 ${t.fg}`}><t.Icon className="h-4 w-4" /></span>
              <span className="min-w-0 flex-1 truncate font-medium">{r.name} team{mine && <span className="ml-2 text-xs font-normal text-[hsl(var(--muted-foreground))]">yours</span>}</span>
              <span className="tabular text-sm text-[hsl(var(--muted-foreground))]">{r.members} {r.members === 1 ? 'player' : 'players'}</span>
              <span className="tabular w-16 shrink-0 text-right font-semibold"><AnimatedNumber value={r.average} duration={0.9} /></span>
            </div>
            <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-[hsl(var(--card))]/60">
              <motion.div initial={{ scaleX: 0 }} animate={{ scaleX: r.average / top }} transition={spring} style={{ originX: 0 }} className={`h-full rounded-full bg-[hsl(var(--ink))]/50`} />
            </div>
          </motion.li>
        );
      })}
    </ol>
  );
}
