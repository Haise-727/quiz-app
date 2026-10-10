import { PiDivideBold, PiLightningFill } from 'react-icons/pi';

/**
 * The player's two power-ups, one use of each per game:
 *   50/50   removes wrong answers until half the choices are left, but halves the points
 *   double  doubles the points for this question, but only if the answer is right
 * Each button explains itself, because a power-up nobody understands is never used.
 */
export default function PowerUpBar({ powerups, canFifty, doubleArmed, answered, onUse }) {
  if (!powerups) return null;
  const fifty = Number(powerups.fifty) || 0;
  const double = Number(powerups.double) || 0;

  const Button = ({ kind, icon, title, hint, disabled, active, count }) => (
    <button
      type="button"
      disabled={disabled}
      onClick={() => onUse(kind)}
      aria-pressed={active}
      className={`flex flex-1 items-center gap-3 rounded-xl border px-3.5 py-2.5 text-left outline-none transition-colors
        focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring))]
        ${active ? 'border-[hsl(var(--primary))] bg-[hsl(var(--tint-green))]' : 'border-[hsl(var(--border))] bg-[hsl(var(--card))] hover:border-[hsl(var(--input))]'}
        disabled:cursor-not-allowed disabled:opacity-45`}
    >
      <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-[hsl(var(--muted))] text-[hsl(var(--foreground))]">{icon}</span>
      <span className="min-w-0">
        <span className="block text-sm font-medium leading-tight">{title} <span className="tabular font-mono text-xs text-[hsl(var(--muted-foreground))]">{active ? 'on' : `x${count}`}</span></span>
        <span className="block truncate text-[11px] text-[hsl(var(--muted-foreground))]">{hint}</span>
      </span>
    </button>
  );

  return (
    <div className="flex gap-2.5">
      <Button kind="fifty" icon={<PiDivideBold className="h-4 w-4" />} title="50/50" hint="Half the points" count={fifty} disabled={answered || !canFifty || fifty <= 0} active={false} />
      <Button kind="double" icon={<PiLightningFill className="h-4 w-4" />} title="Double" hint="If you are right" count={double} disabled={answered || double <= 0 || doubleArmed} active={doubleArmed} />
    </div>
  );
}
