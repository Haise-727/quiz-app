import * as React from 'react';
import { Slot } from '@radix-ui/react-slot';
import { cva } from 'class-variance-authority';
import { cn } from '@/lib/utils';

const buttonVariants = cva(
  'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-lg text-sm font-semibold transition-all duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring))] focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0 cursor-pointer',
  {
    variants: {
      variant: {
        default:     'bg-[hsl(var(--primary))] hover:bg-[hsl(var(--primary))]/90 active:bg-[hsl(var(--primary))]/80 text-[hsl(var(--primary-foreground))] border border-[hsl(var(--primary))]/10 shadow-sm',
        destructive: 'bg-[hsl(var(--destructive))] text-white shadow-sm hover:bg-[hsl(var(--destructive))]/90',
        outline:     'border border-[hsl(var(--border))] bg-transparent text-[hsl(var(--foreground))] hover:bg-[hsl(var(--muted))] hover:text-[hsl(var(--foreground))]',
        secondary:   'bg-[hsl(var(--muted))] border border-[hsl(var(--border))] text-[hsl(var(--foreground))] hover:bg-[hsl(var(--muted))]/80',
        ghost:       'text-[hsl(var(--foreground))] hover:bg-[hsl(var(--muted))] hover:text-[hsl(var(--foreground))]',
        link:        'text-[hsl(var(--primary))] underline-offset-4 hover:underline p-0 h-auto',
        student:     'bg-[hsl(var(--primary))] hover:bg-[hsl(var(--primary))]/90 active:bg-[hsl(var(--primary))]/80 text-[hsl(var(--primary-foreground))] border border-[hsl(var(--primary))]/10 shadow-sm',
        teacher:     'bg-[hsl(var(--primary))] hover:bg-[hsl(var(--primary))]/90 active:bg-[hsl(var(--primary))]/80 text-[hsl(var(--primary-foreground))] border border-[hsl(var(--primary))]/10 shadow-sm',
        app:         'bg-[hsl(var(--primary))] hover:bg-[hsl(var(--primary))]/90 active:bg-[hsl(var(--primary))]/80 text-[hsl(var(--primary-foreground))] border border-[hsl(var(--primary))]/10 shadow-sm',
      },
      size: {
        default: 'h-9 px-4 py-2',
        sm:      'h-8 px-3 text-xs rounded-md',
        lg:      'h-10 px-6 text-sm rounded-lg',
        xl:      'h-12 px-8 text-base rounded-lg',
        icon:    'h-9 w-9 rounded-md',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'default',
    },
  }
);

const Button = React.forwardRef(({ className, variant, size, asChild = false, ...props }, ref) => {
  const Comp = asChild ? Slot : 'button';
  return (
    <Comp
      className={cn(buttonVariants({ variant, size, className }))}
      ref={ref}
      {...props}
    />
  );
});
Button.displayName = 'Button';

export { Button, buttonVariants };
