import { Link } from 'react-router-dom';
import Logo from '@/components/Logo';

/** One line of navigation and the year. Nothing else belongs down here. */
export default function PublicFooter() {
  return (
    <footer className="border-t border-[hsl(var(--border))]">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4 px-5 py-8 sm:px-8">
        <Logo size={22} />
        <nav aria-label="Footer" className="flex flex-wrap gap-x-6 gap-y-2 text-sm text-[hsl(var(--muted-foreground))]">
          <Link to="/browse" className="hover:text-[hsl(var(--foreground))]">Browse quizzes</Link>
          <Link to="/play" className="hover:text-[hsl(var(--foreground))]">Join a live game</Link>
          <Link to="/login?role=teacher" className="hover:text-[hsl(var(--foreground))]">For teachers</Link>
        </nav>
        <p className="tabular text-xs text-[hsl(var(--muted-foreground))]">&copy; {new Date().getFullYear()} Quizlike</p>
      </div>
    </footer>
  );
}
