import { AnimatePresence, motion } from 'framer-motion';
import { PiCheckBold, PiXBold } from 'react-icons/pi';
import { spring, springPop } from '@/lib/motion';
import MediaRenderer from '../MediaRenderer';
import { MiniMedia } from '../AnswerReveal';
import { mediaKind } from '@/utils/media';

/**
 * One answer option. The whole row is the tap target, and it answers fast:
 * a stiff spring squeezes it on press, the key chip fills in and sends out one
 * soft ring, and a check pops in.
 *
 * It is a div with a role, not a <button>, because an option can hold an audio or
 * video player and interactive controls inside a <button> do not work in every browser.
 *
 * @param letter    the label in the key chip (A, B, C, or T and F)
 * @param multi     true when several answers can be chosen (square chip, checkbox role)
 * @param tone      after an answer is checked: 'correct' (a right answer), 'wrong' (your wrong
 *                  pick) or 'dim' (neither). Leave it off while the question is still open.
 */
export default function OptionCard({ letter, selected, multi = false, onSelect, media, size = 'md', tone, children }) {
  const choose = () => onSelect?.();
  return (
    <motion.div
      role={multi ? 'checkbox' : 'radio'}
      aria-checked={!!selected}
      tabIndex={0}
      onClick={choose}
      onKeyDown={(e) => { if (e.key === ' ') { e.preventDefault(); choose(); } }}
      whileTap={{ scale: 0.982 }}
      transition={spring}
      className={`group flex w-full cursor-pointer items-center gap-4 rounded-xl border text-left outline-none select-none
        focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring))] focus-visible:ring-offset-2 focus-visible:ring-offset-[hsl(var(--background))]
        ${size === 'lg' ? 'min-h-24 justify-center px-6 py-6 text-xl font-medium' : 'min-h-14 px-4 py-3 text-base'}
        ${tone === 'correct' ? 'border-[hsl(var(--primary))] bg-[hsl(var(--tint-green))]'
          : tone === 'wrong' ? 'border-[hsl(var(--destructive))] bg-[hsl(var(--tint-red))]'
          : tone === 'dim' ? 'border-[hsl(var(--border))] bg-[hsl(var(--card))] opacity-50'
          : selected
            ? 'border-[hsl(var(--primary))] bg-[hsl(var(--tint-green))]'
            : 'border-[hsl(var(--border))] bg-[hsl(var(--card))] hover:border-[hsl(var(--input))] hover:bg-[hsl(var(--muted))]/50'}`}
    >
      <span className="relative grid h-7 w-7 shrink-0 place-items-center">
        {selected && (
          <motion.span
            key="ring"
            className="absolute inset-0 rounded-md bg-[hsl(var(--primary))]"
            initial={{ scale: 1, opacity: 0.35 }}
            animate={{ scale: 2.1, opacity: 0 }}
            transition={{ duration: 0.45, ease: 'easeOut' }}
          />
        )}
        <span
          className={`relative grid h-7 w-7 place-items-center border font-mono text-xs font-medium transition-colors duration-150 ${multi ? 'rounded-md' : 'rounded-full'}
            ${tone === 'correct' ? 'border-[hsl(var(--primary))] bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))]'
            : tone === 'wrong' ? 'border-[hsl(var(--destructive))] bg-[hsl(var(--destructive))] text-[hsl(var(--destructive-foreground))]'
            : selected
              ? 'border-[hsl(var(--primary))] bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))]'
              : 'border-[hsl(var(--input))] text-[hsl(var(--muted-foreground))] group-hover:border-[hsl(var(--ink))]/40'}`}
        >
          <AnimatePresence mode="wait" initial={false}>
            {tone === 'wrong'
              ? <motion.span key="cross" initial={{ scale: 0 }} animate={{ scale: 1 }} exit={{ scale: 0 }} transition={springPop} className="grid place-items-center"><PiXBold className="h-3.5 w-3.5" /></motion.span>
              : selected || tone === 'correct'
              ? <motion.span key="tick" initial={{ scale: 0, rotate: -40 }} animate={{ scale: 1, rotate: 0 }} exit={{ scale: 0 }} transition={springPop} className="grid place-items-center"><PiCheckBold className="h-3.5 w-3.5" /></motion.span>
              : <motion.span key="letter" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.08 }}>{letter}</motion.span>}
          </AnimatePresence>
        </span>
      </span>
      <span className="min-w-0 flex-1 break-words leading-snug">{children}</span>
      {media && (mediaKind(media) === 'image' ? (
        // A picture is part of the answer, so make it big enough to judge, and let a tap on
        // it choose the option instead of opening the zoom.
        <span className="pointer-events-none shrink-0">
          <MediaRenderer media={media} transform="thumbnail" className="h-16 w-24 rounded-lg object-cover" />
        </span>
      ) : (
        // Audio and video need their controls, and pressing play must not choose the option.
        <MiniMedia media={media} />
      ))}
    </motion.div>
  );
}
