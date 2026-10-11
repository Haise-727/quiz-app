import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { PiArrowRightBold } from 'react-icons/pi';
import { TINT } from '@/components/game/icons';
import { ease, rise, stagger } from '@/lib/motion';

/**
 * "Weak spots" for the student dashboard: the subjects they score lowest in, and a few
 * questions worth another look. The numbers come from utils/weakSpots.js, this file only
 * draws them. Styled like the rest of the dashboard: hairlines and rows, no boxes.
 *
 * @param spots    { subjects, revisit } from weakSpots()
 * @param hasWork  has the student finished any graded quiz? Decides between the encouraging
 *                 note (they did, and nothing is weak) and hiding the section (they have not).
 */
export default function WeakSpots({ spots, hasWork }) {
  const { subjects, revisit } = spots;
  const empty = subjects.length === 0 && revisit.length === 0;
  if (empty && !hasWork) return null;                           // nothing to say yet, so no empty box

  return (
    <section aria-label="Weak spots" className="mt-14">
      <h2 className="text-xl font-semibold tracking-tight">Weak spots</h2>

      {empty ? (
        <p className="mt-4 text-sm text-[hsl(var(--muted-foreground))]">Nothing is holding you back right now. Keep taking quizzes and we will point out anything that slips.</p>
      ) : (
        <div className={`mt-5 grid gap-x-12 gap-y-10 ${subjects.length && revisit.length ? 'md:grid-cols-2' : ''}`}>
          {subjects.length > 0 && (
            <div>
              <p className="eyebrow">Lowest accuracy first</p>
              <motion.ul variants={stagger(0.05)} initial="hidden" animate="show" className="mt-4 space-y-4">
                {subjects.slice(0, 5).map((s) => (
                  <motion.li key={s.name} variants={rise}>
                    <div className="flex items-baseline justify-between gap-4 text-sm">
                      <span className="min-w-0 truncate font-medium">{s.name}</span>
                      <span className="tabular shrink-0 font-mono text-xs text-[hsl(var(--muted-foreground))]">{s.pct}% over {s.attempts} {s.attempts === 1 ? 'attempt' : 'attempts'}</span>
                    </div>
                    {/* A thin track with a green fill that grows from the left (transform only). */}
                    <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-[hsl(var(--border))]" role="img" aria-label={`${s.name}: ${s.pct} percent right`}>
                      <motion.div initial={{ scaleX: 0 }} animate={{ scaleX: s.pct / 100 }} transition={{ duration: 0.8, ease, delay: 0.2 }} className="h-full origin-left rounded-full bg-[hsl(var(--brand))]" />
                    </div>
                  </motion.li>
                ))}
              </motion.ul>
            </div>
          )}

          {revisit.length > 0 && (
            <div>
              <p className="eyebrow">Questions to revisit</p>
              <motion.ul variants={stagger(0.05)} initial="hidden" animate="show" className="mt-2 divide-y divide-[hsl(var(--border))]">
                {revisit.map((r) => (
                  <motion.li key={`${r.quizId}-${r.questionText}`} variants={rise} className="py-3">
                    <p className="text-sm font-medium leading-snug">{r.questionText}</p>
                    <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1">
                      <span className="min-w-0 truncate text-xs text-[hsl(var(--muted-foreground))]">{r.quizTitle}</span>
                      {r.partial && <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${TINT.yellow}`}>Partly right</span>}
                      <Link to={`/student/quiz/${r.quizId}`} className="ml-auto inline-flex items-center gap-1 rounded-sm text-xs font-medium underline underline-offset-4 outline-offset-2 focus-visible:outline-2 focus-visible:outline-[hsl(var(--ring))]">
                        Retake this quiz<PiArrowRightBold className="h-3 w-3" aria-hidden />
                      </Link>
                    </div>
                  </motion.li>
                ))}
              </motion.ul>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
