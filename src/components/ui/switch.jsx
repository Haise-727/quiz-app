import { motion } from 'framer-motion';
import { spring } from '@/lib/motion';

/**
 * An on/off switch. Real role="switch" semantics, so screen readers announce it and the
 * space bar toggles it. The knob slides on the shared stiff spring.
 */
export function Switch({ checked, onCheckedChange, label, disabled = false, id }) {
  return (
    <button
      id={id}
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onCheckedChange(!checked)}
      className={`relative inline-flex h-6 w-10 shrink-0 items-center rounded-full border border-transparent outline-none transition-colors
        focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring))] focus-visible:ring-offset-2 focus-visible:ring-offset-[hsl(var(--background))]
        disabled:cursor-not-allowed disabled:opacity-50 ${checked ? 'bg-[hsl(var(--primary))]' : 'bg-[hsl(var(--input))]'}`}
    >
      <motion.span
        layout
        transition={spring}
        className="block h-[18px] w-[18px] rounded-full bg-white"
        style={{ marginLeft: checked ? 18 : 3 }}
      />
    </button>
  );
}
