/** A pulsing placeholder block, used while teacher pages load their rows. */
export default function Skeleton({ className = '' }) {
  return <div aria-hidden="true" className={`animate-pulse rounded-lg bg-[hsl(var(--muted))] ${className}`} />;
}
