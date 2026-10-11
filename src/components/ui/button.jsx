import * as React from 'react';
import { Slot } from '@radix-ui/react-slot';
import { cva } from 'class-variance-authority';
import { cn } from '@/lib/utils';

/*
 * Buttons.
 *
 * Ink (near black) is the default, so a page has one calm primary action. Green is kept
 * for moments that mean "go": starting a quiz, joining a game, hosting live. Everything
 * else is outline or ghost. No gradients and no shadows, the press is the feedback.
 */
const buttonVariants = cva(
  'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-lg text-sm font-medium select-none cursor-pointer border border-transparent ' +
  'transition-[background-color,border-color,color,transform,opacity] duration-150 active:scale-[0.97] ' +
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring))] focus-visible:ring-offset-2 focus-visible:ring-offset-[hsl(var(--background))] ' +
  'disabled:pointer-events-none disabled:opacity-45 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0',
  {
    variants: {
      variant: {
        default:     'bg-[hsl(var(--ink))] text-[hsl(var(--ink-foreground))] hover:bg-[hsl(var(--ink))]/85',
        brand:       'bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))] hover:brightness-90',
        destructive: 'border-[hsl(var(--destructive))]/40 bg-transparent text-[hsl(var(--destructive))] hover:bg-[hsl(var(--tint-red))]',
        outline:     'border-[hsl(var(--border))] bg-[hsl(var(--card))] text-[hsl(var(--foreground))] hover:bg-[hsl(var(--muted))] hover:border-[hsl(var(--input))]',
        secondary:   'bg-[hsl(var(--muted))] text-[hsl(var(--foreground))] hover:bg-[hsl(var(--surface-container-high))]',
        ghost:       'bg-transparent text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))] hover:bg-[hsl(var(--muted))]',
        link:        'text-[hsl(var(--primary))] underline-offset-4 hover:underline p-0 h-auto rounded-none active:scale-100',
        // Older call sites. They all mean "the green go button" now, without the gradients.
        student:     'bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))] hover:brightness-90',
        teacher:     'bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))] hover:brightness-90',
        app:         'bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))] hover:brightness-90',
      },
      size: {
        default: 'h-9 px-4',
        sm:      'h-8 px-3 text-xs',
        lg:      'h-11 px-6 text-sm',
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
