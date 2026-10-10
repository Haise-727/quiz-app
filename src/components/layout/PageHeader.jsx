import { motion } from 'framer-motion';
import { rise, stagger } from '@/lib/motion';

/**
 * The top of a dashboard page: a small label, a large title, an optional line of
 * explanation, and an optional slot for actions on the right. Every dashboard page uses
 * it so they start the same way. There is deliberately no box around it.
 *
 * @param serif  set the title in the display serif, for the pages that deserve a moment
 */
export default function PageHeader({ eyebrow, title, description, actions, serif = false }) {
  return (
    <motion.header variants={stagger(0.06)} initial="hidden" animate="show" className="flex flex-wrap items-end justify-between gap-x-8 gap-y-4">
      <div className="min-w-0">
        {eyebrow && <motion.p variants={rise} className="eyebrow">{eyebrow}</motion.p>}
        <motion.h1
          variants={rise}
          className={`mt-2 text-[hsl(var(--foreground))] ${serif ? 'text-hero text-5xl sm:text-6xl' : 'text-3xl font-semibold tracking-tight sm:text-4xl'}`}
        >
          {title}
        </motion.h1>
        {description && <motion.p variants={rise} className="mt-3 max-w-prose text-base text-[hsl(var(--muted-foreground))]">{description}</motion.p>}
      </div>
      {actions && <motion.div variants={rise} className="flex shrink-0 items-center gap-2">{actions}</motion.div>}
    </motion.header>
  );
}
