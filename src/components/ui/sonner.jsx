import { Toaster as Sonner } from 'sonner';

const Toaster = ({ ...props }) => (
  <Sonner
    className="toaster group"
    toastOptions={{
      classNames: {
        toast: 'group toast rounded-xl border border-[hsl(var(--border))] bg-white text-[hsl(var(--foreground))] shadow-lg',
        description: 'text-[hsl(var(--muted-foreground))]',
        actionButton: 'bg-[hsl(var(--primary))] text-white',
        cancelButton: 'bg-[hsl(var(--muted))] text-[hsl(var(--muted-foreground))]',
      },
    }}
    {...props}
  />
);

export { Toaster };
