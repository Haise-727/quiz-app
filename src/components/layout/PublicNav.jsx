import { Link, useNavigate } from 'react-router-dom';
import { PiMoonBold, PiSunBold } from 'react-icons/pi';
import Logo from '@/components/Logo';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/contexts/AuthContext';
import { useTheme } from '@/contexts/ThemeContext';

const link = 'rounded-md px-3 py-2 text-sm text-[hsl(var(--muted-foreground))] transition-colors hover:text-[hsl(var(--foreground))]';

/**
 * The top bar of every page a visitor can see before signing in. It stays quiet on purpose:
 * a mark, three links and one button. `bare` drops the links for focused pages like sign in.
 */
export default function PublicNav({ bare = false }) {
  const navigate = useNavigate();
  const { currentUser, userRole } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const home = userRole === 'teacher' ? '/teacher/home' : '/student/dashboard';

  return (
    <header className="sticky top-0 z-30 border-b border-[hsl(var(--border))]/70 bg-[hsl(var(--background))]/85 backdrop-blur-md">
      <nav aria-label="Main" className="mx-auto flex h-16 max-w-6xl items-center justify-between px-5 sm:px-8">
        <Link to="/" aria-label="Quizlike home" className="rounded-md outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring))]"><Logo /></Link>
        <div className="flex items-center gap-1">
          {!bare && (
            <>
              <Link to="/play" className={`${link} hidden sm:block`}>Play live</Link>
              <Link to="/browse" className={`${link} hidden sm:block`}>Browse</Link>
              {!currentUser && <Link to="/login" className={link}>Sign in</Link>}
            </>
          )}
          <button
            type="button"
            onClick={toggleTheme}
            aria-label={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
            className="grid h-9 w-9 cursor-pointer place-items-center rounded-md text-[hsl(var(--muted-foreground))] transition-colors hover:bg-[hsl(var(--muted))] hover:text-[hsl(var(--foreground))]"
          >
            {theme === 'dark' ? <PiSunBold className="h-[18px] w-[18px]" /> : <PiMoonBold className="h-[18px] w-[18px]" />}
          </button>
          {!bare && (
            currentUser
              ? <Button size="sm" className="ml-2" onClick={() => navigate(home)}>Dashboard</Button>
              : <Button size="sm" className="ml-2" onClick={() => navigate('/login?tab=signup')}>Get started</Button>
          )}
        </div>
      </nav>
    </header>
  );
}
