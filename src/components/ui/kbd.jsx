import { cn } from '@/lib/utils';

/** A keyboard key, for shortcut hints such as "Enter" next to a Next button. */
export function Kbd({ className, ...props }) {
  return (
    <kbd
      className={cn(
        'inline-flex h-5 min-w-5 items-center justify-center rounded border border-[hsl(var(--border))] bg-[hsl(var(--muted))] px-1.5 font-mono text-[10px] font-medium text-[hsl(var(--muted-foreground))]',
        className
      )}
      {...props}
    />
  );
}
