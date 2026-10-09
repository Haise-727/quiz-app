import { motion } from 'framer-motion';
import { springPop } from '@/lib/motion';

const SIZES = {
  sm: 'h-8 w-8 text-sm rounded-md',
  md: 'h-12 w-12 text-xl rounded-lg',
  lg: 'h-16 w-16 text-3xl rounded-xl',
};

/** The level as a small ink tile with the number in mono type. Pops when the level changes. */
export default function LevelBadge({ level, size = 'md', className = '' }) {
  return (
    <motion.div
      key={level}
      initial={{ scale: 0.6, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      transition={springPop}
      aria-label={`Level ${level}`}
      className={`grid shrink-0 place-items-center bg-[hsl(var(--ink))] font-mono font-medium text-[hsl(var(--ink-foreground))] tabular ${SIZES[size]} ${className}`}
    >
      {level}
    </motion.div>
  );
}
