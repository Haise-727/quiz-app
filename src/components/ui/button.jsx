import * as React from 'react';
import { Slot } from '@radix-ui/react-slot';
import { cva } from 'class-variance-authority';
import { cn } from '@/lib/utils';

const buttonVariants = cva(
  'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-xl text-sm font-semibold transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring))] focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0 cursor-pointer',
  {
    variants: {
      variant: {
        default:     'bg-[hsl(var(--primary))] text-white shadow hover:bg-[hsl(var(--primary))]/90 hover:shadow-md hover:-translate-y-px',
        destructive: 'bg-[hsl(var(--destructive))] text-white shadow hover:bg-[hsl(var(--destructive))]/90',
        outline:     'border-2 border-[hsl(var(--border))] bg-white text-[hsl(var(--foreground))] hover:bg-[hsl(var(--muted))] hover:border-[hsl(var(--primary))]/50',
        secondary:   'bg-[hsl(var(--secondary))] text-[hsl(var(--secondary-foreground))] hover:bg-[hsl(var(--secondary))]/80',
        ghost:       'text-[hsl(var(--foreground))] hover:bg-[hsl(var(--muted))] hover:text-[hsl(var(--foreground))]',
        link:        'text-[hsl(var(--primary))] underline-offset-4 hover:underline p-0 h-auto',
        student:     'bg-gradient-to-r from-[hsl(var(--student-dark))] to-[hsl(var(--student))] text-white shadow hover:shadow-lg hover:-translate-y-px',
        teacher:     'bg-gradient-to-r from-[hsl(var(--teacher))] to-[hsl(var(--teacher-light))] text-white shadow hover:shadow-lg hover:-translate-y-px',
        app:         'bg-gradient-to-r from-[#4776e6] to-[#8b5cf6] text-white shadow hover:shadow-lg hover:-translate-y-px',
      },
      size: {
        default: 'h-10 px-5 py-2',
        sm:      'h-8 px-3 text-xs rounded-lg',
        lg:      'h-12 px-8 text-base rounded-2xl',
        xl:      'h-14 px-10 text-lg rounded-2xl',
        icon:    'h-9 w-9 rounded-lg',
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
