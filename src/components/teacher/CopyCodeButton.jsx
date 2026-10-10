import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { toast } from 'sonner';
import { PiCheckBold, PiCopyBold } from 'react-icons/pi';
import { spring } from '@/lib/motion';

/**
 * A small icon button that copies a code to the clipboard. The icon turns into a tick for
 * a moment so the click is acknowledged even if the toast is missed.
 */
export default function CopyCodeButton({ text, label = 'Copy code', successMessage = 'Code copied.' }) {
  const [copied, setCopied] = useState(false);
  const timer = useRef(null);
  useEffect(() => () => clearTimeout(timer.current), []);

  const copy = async (e) => {
    e.stopPropagation();
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      clearTimeout(timer.current);
      timer.current = setTimeout(() => setCopied(false), 1800);
      toast.success(successMessage);
    } catch {
      toast.error('We could not copy that. Copy it by hand.');
    }
  };

  return (
    <motion.button
      type="button"
      onClick={copy}
      aria-label={label}
      title={label}
      whileTap={{ scale: 0.88 }}
      transition={spring}
      className="inline-flex h-7 w-7 cursor-pointer items-center justify-center rounded-md text-[hsl(var(--muted-foreground))] transition-colors hover:bg-[hsl(var(--muted))] hover:text-[hsl(var(--foreground))] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring))]"
    >
      <AnimatePresence mode="wait" initial={false}>
        <motion.span
          key={copied ? 'done' : 'copy'}
          initial={{ opacity: 0, scale: 0.6 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.6 }}
          transition={{ duration: 0.12 }}
          className="flex"
        >
          {copied ? <PiCheckBold className="h-3.5 w-3.5 text-[hsl(var(--primary))]" /> : <PiCopyBold className="h-3.5 w-3.5" />}
        </motion.span>
      </AnimatePresence>
    </motion.button>
  );
}
