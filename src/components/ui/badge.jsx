import * as React from 'react';
import { cva } from 'class-variance-authority';
import { cn } from '@/lib/utils';

/*
 * Small status chips. A tinted fill with a darker text of the same hue, no border.
 * The tints come from the theme (index.css), so they switch with light and dark mode.
 */
const badgeVariants = cva(
  'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium tracking-wide transition-colors',
  {
    variants: {
      variant: {
        default:     'bg-[hsl(var(--ink))] text-[hsl(var(--ink-foreground))]',
        secondary:   'bg-[hsl(var(--tint-neutral))] text-[hsl(var(--tint-neutral-fg))]',
        destructive: 'bg-[hsl(var(--tint-red))] text-[hsl(var(--tint-red-fg))]',
        outline:     'border border-[hsl(var(--border))] text-[hsl(var(--foreground))]',
        success:     'bg-[hsl(var(--tint-green))] text-[hsl(var(--tint-green-fg))]',
        warning:     'bg-[hsl(var(--tint-yellow))] text-[hsl(var(--tint-yellow-fg))]',
        info:        'bg-[hsl(var(--tint-blue))] text-[hsl(var(--tint-blue-fg))]',
        student:     'bg-[hsl(var(--tint-blue))] text-[hsl(var(--tint-blue-fg))]',
        teacher:     'bg-[hsl(var(--tint-green))] text-[hsl(var(--tint-green-fg))]',
      },
    },
    defaultVariants: { variant: 'default' },
  }
);

const Badge = ({ className, variant, ...props }) => (
  <div className={cn(badgeVariants({ variant }), className)} {...props} />
);

export { Badge, badgeVariants };
