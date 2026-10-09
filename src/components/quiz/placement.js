import { useState } from 'react';

/**
 * Putting answers into slots, for Match the Following and Categorize.
 *
 * Why this is not the drag and drop library used for Reorder: that library decides the
 * target by letting the hovered zone grow by the dragged item's height. With several short
 * slots stacked in a column the grown zones overlap, and a tie goes to the FIRST slot, so
 * the third answer landed in the second slot. Here the target is simply "the slot under the
 * pointer when you let go", which is what a person means.
 *
 * Two ways to place an answer, both feeding the same reducer (dragAnswer in utils/quizAttempt):
 *   1. Drag it onto a slot. It follows the pointer and snaps back if dropped on nothing.
 *   2. Tap it, then tap a slot. Better on a phone, and it works from the keyboard.
 *
 * Slots mark themselves with data-drop-slot="<id>". The answer bank is the slot "bank".
 */

/** The id of the slot under a screen position, or null. */
export const slotAtPoint = (x, y) => {
  const hit = document.elementsFromPoint(x, y).find((node) => node.dataset && node.dataset.dropSlot !== undefined);
  return hit ? hit.dataset.dropSlot : null;
};

/**
 * State for one board: which chip is "held" (tapped, waiting for a slot) and which slot the
 * pointer is over right now. `onMove(from, slotId)` is called when a chip is placed.
 */
export function usePlacement(onMove) {
  const [held, setHeld] = useState(null);       // { id, from }
  const [hover, setHover] = useState(null);     // a slot id while dragging
  const place = (from, slotId) => { setHeld(null); setHover(null); onMove(from, slotId); };
  const tapSlot = (slotId) => { if (held) place(held.from, slotId); };
  return { held, setHeld, hover, setHover, place, tapSlot };
}

/** Spread onto any element that can receive a chip. */
export const slotProps = (id, placement, label) => ({
  'data-drop-slot': id,
  role: 'button',
  tabIndex: 0,
  'aria-label': label,
  onClick: () => placement.tapSlot(id),
  onKeyDown: (e) => {
    if ((e.key === 'Enter' || e.key === ' ') && placement.held) {
      e.preventDefault();
      e.stopPropagation();
      placement.tapSlot(id);
    }
  },
});
