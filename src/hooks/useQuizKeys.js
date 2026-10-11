import { useEffect, useRef } from 'react';

/**
 * Keyboard shortcuts while taking a quiz, so a fast player never needs the mouse.
 *
 *   Enter or right arrow   next question (or submit on the last one)
 *   left arrow             previous question
 *   1 to 9, or A to Z      choose that option, when the question has a simple list of options
 *   T and F                true and false
 *
 * Nothing fires while someone is typing in a field, so a fill in answer is never hijacked.
 * The handlers are read through a ref, so the listener is added once and never goes stale.
 */
export default function useQuizKeys(handlers, enabled = true) {
  const ref = useRef(handlers);
  ref.current = handlers;

  useEffect(() => {
    if (!enabled) return undefined;
    const onKey = (e) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const el = e.target;
      const typing = el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT' || el.isContentEditable);
      if (typing) return;
      // Something on the page may need the arrow keys for itself (the click on the image picture
      // moves its marker with them). It says so with data-owns-keys, and we keep out of its way.
      if (e.key.startsWith('Arrow') && el && el.closest && el.closest('[data-owns-keys]')) return;
      const h = ref.current;
      // A focused button or link already turns Enter into a click. Handling it here too
      // would fire twice, so after clicking "Next" a press of Enter would skip a question.
      const onButton = el && el.closest && el.closest('button, a');
      if (e.key === 'Enter' && onButton) return;
      if (e.key === 'Enter' || e.key === 'ArrowRight') { e.preventDefault(); h.onNext?.(); return; }
      if (e.key === 'ArrowLeft') { e.preventDefault(); h.onPrev?.(); return; }
      if (h.onChoose && e.key.length === 1) {
        const k = e.key.toLowerCase();
        if (k >= '1' && k <= '9') { h.onChoose(Number(k) - 1); return; }
        if (k >= 'a' && k <= 'z') { h.onChoose(k.charCodeAt(0) - 97, k); }
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [enabled]);
}
