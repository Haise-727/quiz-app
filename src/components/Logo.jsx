/**
 * The Quizlike mark: an ink tile, a white ring and a green tail, the same drawing as the
 * favicon. Use `withWord` for the mark plus the name.
 */
export function LogoMark({ size = 28, className = '' }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" role="img" aria-label="Quizlike" className={className}>
      <rect width="32" height="32" rx="8" fill="hsl(var(--ink))" />
      <circle cx="15.5" cy="15" r="7" fill="none" stroke="hsl(var(--ink-foreground))" strokeWidth="3" />
      <path d="M19.6 19.2 L24.2 23.8" stroke="hsl(var(--brand))" strokeWidth="3.2" strokeLinecap="round" />
    </svg>
  );
}

export default function Logo({ size = 28, withWord = true, className = '' }) {
  return (
    <span className={`inline-flex items-center gap-2.5 ${className}`}>
      <LogoMark size={size} />
      {withWord && <span className="text-[17px] font-semibold tracking-tight text-[hsl(var(--foreground))]">Quizlike</span>}
    </span>
  );
}
