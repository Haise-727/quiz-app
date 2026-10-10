import { motion } from 'framer-motion';
import { PiCheckBold } from 'react-icons/pi';
import { tileFor } from './tiles';
import { spring } from '@/lib/motion';

/**
 * How the room answered: one bar per option, longest wins the eye, the right answer marked.
 * Counts are of players who chose that option, so a multiple answer question can add up to
 * more than the number of players. Bars grow with scaleX, so nothing reflows.
 *
 * @param rows  [{ id, label, count, correct }]
 */
export default function AnswerBars({ rows, total }) {
  const max = Math.max(1, ...rows.map((r) => r.count));
  return (
    <ul className="flex flex-col gap-2.5">
      {rows.map((row, i) => {
        const t = tileFor(i);
        return (
          <li key={row.id} className="flex items-center gap-4">
            <span className={`grid h-10 w-10 shrink-0 place-items-center rounded-xl ${t.bg} ${t.fg}`}><t.Icon className="h-5 w-5" /></span>
            <div className="min-w-0 flex-1">
              <div className="mb-1 flex items-baseline justify-between gap-3">
                <p className={`truncate text-lg ${row.correct ? 'font-semibold' : ''}`}>{row.label}</p>
                <p className="tabular shrink-0 font-mono text-sm text-[hsl(var(--muted-foreground))]">{row.count}{total ? ` / ${total}` : ''}</p>
              </div>
              <div className="h-3 overflow-hidden rounded-full bg-[hsl(var(--muted))]">
                <motion.div
                  initial={{ scaleX: 0 }}
                  animate={{ scaleX: row.count / max }}
                  transition={{ ...spring, delay: 0.1 + i * 0.07 }}
                  style={{ originX: 0 }}
                  className={`h-full rounded-full ${row.correct ? 'bg-[hsl(var(--primary))]' : 'bg-[hsl(var(--input))]'}`}
                />
              </div>
            </div>
            <span className={`grid h-8 w-8 shrink-0 place-items-center rounded-full ${row.correct ? 'bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))]' : 'opacity-0'}`}><PiCheckBold className="h-4 w-4" /></span>
          </li>
        );
      })}
    </ul>
  );
}
