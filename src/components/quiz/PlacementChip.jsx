import { useRef } from 'react';
import { motion } from 'framer-motion';
import { spring } from '@/lib/motion';
import { slotAtPoint } from './placement';

/** One answer that can be dragged or tapped. The rules for placing it are in ./placement.js. */
/**
 * One answer you can drag or tap. `chip` is { id, from } where `from` is
 * { droppableId, index }, the same shape the drag library uses, so one reducer serves both.
 * `fresh` makes it pop in, for a chip that was just placed.
 */
export function PlacementChip({ chip, placement, fresh = false, className = '', children }) {
  const isHeld = placement.held?.id === chip.id;
  const toggle = () => placement.setHeld(isHeld ? null : chip);
  // Letting go at the end of a drag is also reported as a tap. Without this guard every
  // successful drag left a chip "held", as if the player had tapped it afterwards.
  const justDragged = useRef(false);
  return (
    <motion.div
      data-chip
      role="button"
      tabIndex={0}
      aria-pressed={isHeld}
      drag
      dragSnapToOrigin
      dragMomentum={false}
      dragElastic={0.12}
      whileDrag={{ scale: 1.05, zIndex: 60 }}
      initial={fresh ? { scale: 0.82, opacity: 0.4 } : false}
      animate={{ scale: 1, opacity: 1 }}
      transition={spring}
      onDragStart={() => { justDragged.current = true; placement.setHeld(null); }}
      onDrag={(e) => placement.setHover(slotAtPoint(e.clientX, e.clientY))}
      onDragEnd={(e) => {
        const slotId = slotAtPoint(e.clientX, e.clientY);
        placement.setHover(null);
        if (slotId !== null) placement.place(chip.from, slotId);
        setTimeout(() => { justDragged.current = false; }, 120);   // after the stray tap from this release
      }}
      onTap={() => { if (!justDragged.current) toggle(); }}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          e.stopPropagation();           // so the quiz's Enter shortcut does not also move on
          toggle();
        }
      }}
      style={{ position: 'relative', touchAction: 'none' }}
      className={`flex cursor-grab select-none items-center gap-2.5 rounded-lg border bg-[hsl(var(--card))] px-3.5 py-2.5 text-sm font-medium outline-none active:cursor-grabbing
        focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring))]
        ${isHeld ? 'border-[hsl(var(--primary))] ring-2 ring-[hsl(var(--primary))]/30' : 'border-[hsl(var(--border))] hover:border-[hsl(var(--input))]'} ${className}`}
    >
      {children}
    </motion.div>
  );
}
