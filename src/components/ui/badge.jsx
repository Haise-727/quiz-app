import * as React from 'react';
import { cva } from 'class-variance-authority';
import { cn } from '@/lib/utils';

const badgeVariants = cva(
  'inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold transition-colors',
  {
    variants: {
      variant: {
        default:     'bg-[hsl(var(--primary))] text-white',
        secondary:   'bg-[hsl(var(--secondary))] text-[hsl(var(--secondary-foreground))]',
        destructive: 'bg-[hsl(var(--destructive))]/10 text-[hsl(var(--destructive))] border border-[hsl(var(--destructive))]/20',
        outline:     'border-2 border-[hsl(var(--border))] text-[hsl(var(--foreground))]',
        success:     'bg-green-100 text-green-700 border border-green-200',
        warning:     'bg-amber-100 text-amber-700 border border-amber-200',
        info:        'bg-blue-100 text-blue-700 border border-blue-200',
        student:     'bg-[hsl(var(--student))]/10 text-[hsl(var(--student))] border border-[hsl(var(--student))]/20',
        teacher:     'bg-[hsl(var(--teacher))]/10 text-[hsl(var(--teacher))] border border-[hsl(var(--teacher))]/20',
      },
    },
    defaultVariants: { variant: 'default' },
  }
);

const Badge = ({ className, variant, ...props }) => (
  <div className={cn(badgeVariants({ variant }), className)} {...props} />
);

export { Badge, badgeVariants };
