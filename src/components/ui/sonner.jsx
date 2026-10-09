import { Toaster as Sonner } from 'sonner';
import { useTheme } from '@/contexts/ThemeContext';

// Toasts follow the app theme (not the operating system) and use a hairline border
// instead of a drop shadow. Success and error only change the border tint.
const Toaster = ({ ...props }) => {
  const { theme } = useTheme();
  return (
    <Sonner
      theme={theme}
      className="toaster group"
      toastOptions={{
        classNames: {
          toast: 'group toast rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--card))] text-[hsl(var(--foreground))] shadow-none',
          description: 'text-[hsl(var(--muted-foreground))]',
          actionButton: 'bg-[hsl(var(--ink))] text-[hsl(var(--ink-foreground))]',
          cancelButton: 'bg-[hsl(var(--muted))] text-[hsl(var(--muted-foreground))]',
          success: '!border-[hsl(var(--primary))]/35',
          error: '!border-[hsl(var(--destructive))]/40',
        },
      }}
      {...props}
    />
  );
};

export { Toaster };
