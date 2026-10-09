import * as React from 'react';
import { cn } from '@/lib/utils';

const Input = React.forwardRef(({ className, type, ...props }, ref) => (
  <input
    type={type}
    className={cn(
      'flex h-10 w-full rounded-lg border border-[hsl(var(--input))] bg-[hsl(var(--card))] px-3.5 py-2 text-sm text-[hsl(var(--foreground))] placeholder:text-[hsl(var(--muted-foreground))]/80',
      'focus-visible:outline-none focus-visible:border-[hsl(var(--ink))] focus-visible:ring-2 focus-visible:ring-[hsl(var(--ink))]/10',
      'disabled:cursor-not-allowed disabled:opacity-50',
      className
    )}
    ref={ref}
    {...props}
  />
));
Input.displayName = 'Input';

export { Input };
