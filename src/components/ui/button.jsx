import * as React from 'react';
import { Slot } from '@radix-ui/react-slot';
import { cva } from 'class-variance-authority';
import { cn } from '@/lib/utils';

const buttonVariants = cva(
  'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-[10px] text-sm font-semibold transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--primary))]/20 focus-visible:border-[hsl(var(--primary))] disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0 cursor-pointer border border-transparent',
  {
    variants: {
      variant: {
        default:     'bg-[hsl(var(--primary))] hover:bg-[hsl(var(--primary))]/90 active:bg-[hsl(var(--primary))]/80 text-[hsl(var(--primary-foreground))] border-transparent shadow-none',
        destructive: 'border-red-500/80 bg-transparent text-red-500 hover:bg-red-500/10 hover:text-red-600 shadow-none',
        outline:     'border border-[hsl(var(--border))] bg-transparent text-[hsl(var(--foreground))] hover:bg-[hsl(var(--surface-container-low))] hover:text-[hsl(var(--foreground))]',
        secondary:   'bg-[hsl(var(--surface-container-high))] border border-[hsl(var(--border))] text-[hsl(var(--foreground))] hover:bg-[hsl(var(--surface-container-highest))]',
        ghost:       'bg-transparent text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))] hover:bg-[hsl(var(--surface-container-low))]',
        link:        'text-[hsl(var(--primary))] underline-offset-4 hover:underline p-0 h-auto border-0',
        student:     'bg-[hsl(var(--primary))] hover:bg-[hsl(var(--primary))]/90 active:bg-[hsl(var(--primary))]/80 text-[hsl(var(--primary-foreground))] border-transparent shadow-none',
        teacher:     'bg-[hsl(var(--primary))] hover:bg-[hsl(var(--primary))]/90 active:bg-[hsl(var(--primary))]/80 text-[hsl(var(--primary-foreground))] border-transparent shadow-none',
        app:         'bg-[hsl(var(--primary))] hover:bg-[hsl(var(--primary))]/90 active:bg-[hsl(var(--primary))]/80 text-[hsl(var(--primary-foreground))] border-transparent shadow-none',
      },
      size: {
        default: 'h-9 px-4 py-2',
        sm:      'h-8 px-3 text-xs',
        lg:      'h-10 px-6 text-sm',
        xl:      'h-12 px-8 text-base',
        icon:    'h-9 w-9',
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
