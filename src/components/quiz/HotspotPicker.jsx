import { useRef } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { springPop } from '@/lib/motion';

/** ImageKit resizes on the fly, so a phone is not sent a 6 MB photo for a 380 pixel wide slot. */
const sized = (url) => (url ? `${url}${url.includes('?') ? '&' : '?'}tr=w-1200` : '');

const clamp = (n) => Math.min(100, Math.max(0, n));
const round1 = (n) => Math.round(n * 10) / 10;

/**
 * "Click on the image" questions. The picture is drawn at its own shape, and the answer is
 * where the student taps, saved as percentages of the picture ({ x: 42.5, y: 61 }), so it
 * means the same on a phone and on a projector.
 *
 * Tapping places the marker, and tapping again moves it. It works from the keyboard too:
 * focus the picture, then the arrow keys move the marker by 2% (10% with Shift), starting
 * from the middle. There is no drag, so the page still scrolls normally under a finger.
 *
 * It can also show the answer afterwards: `regions` outlines the right area(s), and `marks`
 * adds one small dot per player (the host's reveal screen).
 *
 * @param media     the stored image object { url, ... }
 * @param value     { x, y } or null
 * @param onChange  ({ x, y }) => void, left out for a read only picture
 * @param regions   [{ id, x, y, w, h }] areas to outline, optional
 * @param marks     [{ x, y, right }] other people's clicks, optional
 */
export default function HotspotPicker({ media, value, onChange, regions = [], marks = [], className = '' }) {
  const box = useRef(null);
  const interactive = typeof onChange === 'function';

  const fromPointer = (e) => {
    const r = box.current.getBoundingClientRect();
    return { x: round1(clamp(((e.clientX - r.left) / r.width) * 100)), y: round1(clamp(((e.clientY - r.top) / r.height) * 100)) };
  };

  const onKeyDown = (e) => {
    if (!interactive || !e.key.startsWith('Arrow')) return;
    e.preventDefault();
    const step = e.shiftKey ? 10 : 2;
    const at = value || { x: 50, y: 50 };
    const next = { ...at };
    if (e.key === 'ArrowLeft') next.x = clamp(at.x - step);
    if (e.key === 'ArrowRight') next.x = clamp(at.x + step);
    if (e.key === 'ArrowUp') next.y = clamp(at.y - step);
    if (e.key === 'ArrowDown') next.y = clamp(at.y + step);
    onChange({ x: round1(next.x), y: round1(next.y) });
  };

  return (
    <div className={`relative inline-block max-w-full ${className}`}>
      <div
        ref={box}
        role={interactive ? 'button' : 'img'}
        tabIndex={interactive ? 0 : undefined}
        aria-label={interactive
          ? (value ? 'Picture. Your mark is placed. Tap to move it, or use the arrow keys.' : 'Picture. Tap the place you mean, or use the arrow keys to move a marker.')
          : 'Picture with the answer marked'}
        onClick={interactive ? (e) => onChange(fromPointer(e)) : undefined}
        onKeyDown={onKeyDown}
        className={`relative overflow-hidden rounded-xl border border-[hsl(var(--border))] leading-[0] outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring))] focus-visible:ring-offset-2 focus-visible:ring-offset-[hsl(var(--background))] ${interactive ? 'cursor-crosshair' : ''}`}
      >
        <img src={sized(media?.url)} alt="" draggable={false} className="block max-h-[min(26rem,52vh)] w-auto max-w-full select-none" />

        {regions.map((r) => (
          <span
            key={r.id}
            aria-hidden
            className="pointer-events-none absolute rounded-md border-2 border-dashed border-[hsl(var(--primary))] bg-[hsl(var(--primary))]/15"
            style={{ left: `${r.x}%`, top: `${r.y}%`, width: `${r.w}%`, height: `${r.h}%` }}
          />
        ))}

        {marks.map((m, i) => (
          <span
            key={i}
            aria-hidden
            className={`pointer-events-none absolute h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full border border-white ${m.right ? 'bg-[hsl(var(--primary))]' : 'bg-[hsl(var(--destructive))]'}`}
            style={{ left: `${m.x}%`, top: `${m.y}%` }}
          />
        ))}

        <AnimatePresence>
          {value && (
            <motion.span
              key="marker"
              aria-hidden
              initial={{ scale: 0.3, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.3, opacity: 0 }}
              transition={springPop}
              className="pointer-events-none absolute grid h-9 w-9 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full border-[3px] border-white bg-[hsl(var(--ink))]/25 shadow-[0_0_0_2px_hsl(var(--ink))]"
              style={{ left: `${value.x}%`, top: `${value.y}%` }}
            >
              <span className="h-2 w-2 rounded-full bg-[hsl(var(--ink))]" />
            </motion.span>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
