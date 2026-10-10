import { useState } from 'react';
import { PiArrowRightBold, PiSpinnerGapBold } from 'react-icons/pi';
import { Button } from '@/components/ui/button';

/**
 * A code field that is only an underline, with its button beside it: quiz codes, live PINs
 * and class invites all use it. Codes are upper cased and stripped of spaces as they are typed.
 */
export default function JoinField({ label, placeholder, maxLength, button, busy, error, onSubmit, inputMode }) {
  const [value, setValue] = useState('');
  return (
    <form onSubmit={(e) => { e.preventDefault(); onSubmit(value); }}>
      <label className="eyebrow">{label}</label>
      <div className="mt-2 flex items-end gap-3">
        <input
          value={value}
          onChange={(e) => setValue(e.target.value.toUpperCase().replace(/\s/g, ''))}
          placeholder={placeholder}
          maxLength={maxLength}
          inputMode={inputMode}
          autoComplete="off"
          aria-label={label}
          className="min-w-0 flex-1 border-0 border-b-2 border-[hsl(var(--input))] bg-transparent pb-2 font-mono text-2xl tracking-[0.18em] text-[hsl(var(--foreground))] outline-none transition-colors placeholder:tracking-[0.18em] placeholder:text-[hsl(var(--muted-foreground))]/40 focus:border-[hsl(var(--ink))]"
        />
        <Button type="submit" disabled={busy || !value.trim()} size="lg">
          {busy ? <PiSpinnerGapBold className="animate-spin" /> : null}{button}<PiArrowRightBold />
        </Button>
      </div>
      {error && <p role="alert" className="mt-2 text-sm text-[hsl(var(--destructive))]">{error}</p>}
    </form>
  );
}
