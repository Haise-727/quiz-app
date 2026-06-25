import * as React from 'react';
import { cva } from 'class-variance-authority';
import { cn } from '@/lib/utils';

const badgeVariants = cva(
  'inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold transition-colors',
  {
    variants: {
      variant: {
        default:     'bg-[hsl(var(--primary))] text-white border border-[hsl(var(--primary))]/20',
        secondary:   'bg-[hsl(var(--secondary))] text-[hsl(var(--secondary-foreground))] border border-[hsl(var(--border))]',
        destructive: 'bg-[hsl(var(--destructive))]/10 text-[hsl(var(--destructive))] border border-[hsl(var(--destructive))]/25',
        outline:     'border border-[hsl(var(--border))] text-[hsl(var(--foreground))]',
        success:     'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/25',
        warning:     'bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/25',
        info:        'bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-500/25',
        student:     'bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-500/25',
        teacher:     'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/25',
      },
    },
    defaultVariants: { variant: 'default' },
  }
);

const Badge = ({ className, variant, ...props }) => (
  <div className={cn(badgeVariants({ variant }), className)} {...props} />
);

export { Badge, badgeVariants };
