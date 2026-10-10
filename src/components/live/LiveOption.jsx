import { AnimatePresence, motion } from 'framer-motion';
import { PiCheckBold, PiXBold } from 'react-icons/pi';
import MediaRenderer from '../MediaRenderer';
import { MiniMedia } from '../AnswerReveal';
import { mediaKind } from '@/utils/media';
import { spring, springPop } from '@/lib/motion';
import { tileFor } from './tiles';

/**
 * One answer in a live game. The tile is big and the whole of it is the tap target.
 *
 * state:
 *   display  shown on the projector: looks like a tile, with no choice marked and not clickable
 *   idle     waiting to be chosen
 *   picked   chosen but not yet locked (several answers allowed)
 *   locked   your answer is in and this is the one you chose
 *   unpicked your answer is in and you chose something else, so this one fades
 *   correct  at the reveal, a right answer
 *   wrong    at the reveal, a wrong answer you had chosen
 *   dim      at the reveal, not chosen and not right
 *
 * `hidden` collapses the tile away, for a 50/50 power-up.
 * It is a div with a role, not a button, so an option can hold a playable audio or video.
 */
export default function LiveOption({ index, children, media, state = 'idle', multi = false, hidden = false, onSelect, size = 'md' }) {
  const t = tileFor(index);
  const interactive = state === 'idle' || state === 'picked';
  const chosen = state === 'picked' || state === 'locked';
  const faded = state === 'dim' || state === 'unpicked';

  return (
    <AnimatePresence initial={false}>
      {!hidden && (
        <motion.div
          layout
          exit={{ opacity: 0, scale: 0.9, height: 0, marginTop: 0 }}
          transition={spring}
          role={multi ? 'checkbox' : 'radio'}
          aria-checked={chosen || state === 'correct'}
          aria-disabled={!interactive}
          tabIndex={interactive ? 0 : -1}
          onClick={() => interactive && onSelect?.()}
          onKeyDown={(e) => { if (interactive && (e.key === ' ' || e.key === 'Enter')) { e.preventDefault(); e.stopPropagation(); onSelect?.(); } }}
          whileTap={interactive ? { scale: 0.97 } : undefined}
          animate={{ opacity: faded ? 0.42 : 1 }}
          className={`relative flex w-full select-none items-center gap-4 overflow-hidden rounded-2xl border-2 text-left outline-none
            focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring))] focus-visible:ring-offset-2 focus-visible:ring-offset-[hsl(var(--background))]
            ${size === 'xl' ? 'min-h-24 px-6 py-5 text-2xl' : 'min-h-[4.25rem] px-4 py-3 text-lg'} font-semibold
            ${interactive ? 'cursor-pointer' : 'cursor-default'}
            ${t.bg} ${state === 'correct' ? 'border-[hsl(var(--primary))]' : state === 'wrong' ? 'border-[hsl(var(--destructive))]' : chosen ? t.solid : t.edge}
            `}
        >
          <span className={`grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-[hsl(var(--card))]/70 ${t.fg}`}>
            <t.Icon className="h-5 w-5" />
          </span>
          <span className="min-w-0 flex-1 break-words leading-snug text-[hsl(var(--foreground))]">{children}</span>

          {media && (mediaKind(media) === 'image' ? (
            <span className="pointer-events-none shrink-0"><MediaRenderer media={media} transform="thumbnail" className="h-14 w-20 rounded-lg object-cover" /></span>
          ) : <MiniMedia media={media} />)}

          <AnimatePresence>
            {(state === 'picked' || state === 'locked') && (
              <motion.span key="in" initial={{ scale: 0 }} animate={{ scale: 1 }} exit={{ scale: 0 }} transition={springPop} className={`grid h-7 w-7 shrink-0 place-items-center rounded-full bg-[hsl(var(--card))] ${t.fg}`}>
                <PiCheckBold className="h-4 w-4" />
              </motion.span>
            )}
            {state === 'correct' && (
              <motion.span key="ok" initial={{ scale: 0, rotate: -30 }} animate={{ scale: 1, rotate: 0 }} transition={springPop} className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))]">
                <PiCheckBold className="h-4 w-4" />
              </motion.span>
            )}
            {state === 'wrong' && (
              <motion.span key="no" initial={{ scale: 0 }} animate={{ scale: 1 }} transition={springPop} className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-[hsl(var(--destructive))] text-[hsl(var(--destructive-foreground))]">
                <PiXBold className="h-4 w-4" />
              </motion.span>
            )}
          </AnimatePresence>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
