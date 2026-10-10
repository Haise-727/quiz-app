import { useEffect, useState } from 'react';
import { Link, matchPath, useLocation, useNavigate } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { toast } from 'sonner';
import {
  PiArrowsLeftRightBold, PiBookOpenBold, PiBooksBold, PiCaretLeftBold, PiGraduationCapBold, PiListBold,
  PiMoonBold, PiPlayCircleBold, PiSignOutBold, PiSpeakerHighBold, PiSpeakerSlashBold, PiSquaresFourBold,
  PiSunBold, PiTrophyBold, PiUserCircleBold, PiXBold,
} from 'react-icons/pi';
import { useAuth } from '@/contexts/AuthContext';
import { useProgress } from '@/contexts/ProgressContext';
import { useTheme } from '@/contexts/ThemeContext';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import Logo from '@/components/Logo';
import NotificationBell from '@/components/NotificationBell';
import LevelBadge from '@/components/game/LevelBadge';
import StreakChip from '@/components/game/StreakChip';
import { isSoundEnabled, toggleSound } from '@/utils/sounds';
import { spring } from '@/lib/motion';

/**
 * Pages that sit under another page get a back link in the top bar instead of a breadcrumb
 * trail. (The trail used to read "Home > Student > Dashboard" for a three item menu, and two
 * of those links led to a 404.) Anything not listed here is a top level page: no back link.
 */
const NESTED = [
  { pattern: '/teacher/create-quiz', label: 'New quiz', parent: ['/teacher/your-quizzes', 'Your quizzes'] },
  { pattern: '/teacher/edit-quiz/:quizId', label: 'Edit quiz', parent: ['/teacher/your-quizzes', 'Your quizzes'] },
  { pattern: '/teacher/analytics/:quizId', label: 'Analytics', parent: ['/teacher/your-quizzes', 'Your quizzes'] },
  { pattern: '/teacher/grading/:quizId', label: 'Grading', parent: ['/teacher/your-quizzes', 'Your quizzes'] },
];

const LINKS = {
  teacher: [
    { path: '/teacher/home', label: 'Dashboard', icon: PiSquaresFourBold },
    { path: '/teacher/your-quizzes', label: 'Your quizzes', icon: PiBookOpenBold },
    { path: '/teacher/classes', label: 'Classes', icon: PiGraduationCapBold },
    { path: '/teacher/question-bank', label: 'Question bank', icon: PiBooksBold },
  ],
  student: [
    { path: '/student/dashboard', label: 'Dashboard', icon: PiSquaresFourBold },
    { path: '/student/attend-quiz', label: 'Join a quiz', icon: PiPlayCircleBold },
    { path: '/student/results', label: 'Results', icon: PiTrophyBold },
  ],
};

const IconButton = ({ label, onClick, children }) => (
  <button
    type="button"
    onClick={onClick}
    aria-label={label}
    title={label}
    className="grid h-9 w-9 place-items-center rounded-lg text-[hsl(var(--muted-foreground))] hover:bg-[hsl(var(--muted))] hover:text-[hsl(var(--foreground))]"
  >
    {children}
  </button>
);

export default function DashboardLayout({ children }) {
  const navigate = useNavigate();
  const location = useLocation();
  const { currentUser, userRole, signOut: ctxSignOut, switchRole, displayName } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const { level, stats } = useProgress();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [soundOn, setSoundOn] = useState(isSoundEnabled());

  useEffect(() => { setMobileOpen(false); }, [location.pathname]);

  const handleSignOut = async () => {
    try { await ctxSignOut(); navigate('/login'); } catch { toast.error('We could not sign you out.'); }
  };

  const handleSwitchRole = async () => {
    const target = userRole === 'teacher' ? 'student' : 'teacher';
    try {
      await switchRole(target);
      toast.success(`Switched to ${target} mode`);
      navigate(target === 'teacher' ? '/teacher/home' : '/student/dashboard');
    } catch { toast.error('We could not switch modes.'); }
  };

  const links = LINKS[userRole === 'teacher' ? 'teacher' : 'student'];
  const initials = displayName
    ? displayName.split(' ').map((n) => n[0]).join('').toUpperCase().slice(0, 2)
    : currentUser?.email?.slice(0, 2).toUpperCase() || 'U';

  const nested = NESTED.find((n) => matchPath(n.pattern, location.pathname));
  const isStudent = userRole !== 'teacher';

  const Sidebar = () => (
    <div className="flex h-full flex-col bg-[hsl(var(--background))]">
      <div className="flex h-16 shrink-0 items-center px-5"><Link to="/" aria-label="Quizlike home"><Logo /></Link></div>

      <nav className="flex-1 space-y-0.5 overflow-y-auto px-3 py-2" aria-label="Main">
        {links.map((link) => {
          const active = location.pathname === link.path;
          const Icon = link.icon;
          return (
            <Link
              key={link.path}
              to={link.path}
              aria-current={active ? 'page' : undefined}
              className={`relative flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium ${active ? 'text-[hsl(var(--foreground))]' : 'text-[hsl(var(--muted-foreground))] hover:bg-[hsl(var(--muted))]/60 hover:text-[hsl(var(--foreground))]'}`}
            >
              {/* The highlight slides between items instead of jumping. */}
              {active && <motion.span layoutId="nav-active" transition={spring} className="absolute inset-0 rounded-lg bg-[hsl(var(--muted))]" />}
              <Icon className="relative h-[18px] w-[18px] shrink-0" />
              <span className="relative">{link.label}</span>
            </Link>
          );
        })}
      </nav>

      <div className="shrink-0 space-y-3 border-t border-[hsl(var(--border))] p-4">
        {/* Students always see where they stand. */}
        {isStudent && level && (
          <Link to="/student/dashboard" className="block rounded-lg p-1 hover:bg-[hsl(var(--muted))]/60" aria-label="Your progress">
            <div className="flex items-center gap-3">
              <LevelBadge level={level.level} size="sm" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-xs font-medium">{level.title}</p>
                <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-[hsl(var(--border))]">
                  <motion.div className="h-full origin-left rounded-full bg-[hsl(var(--brand))]" initial={{ scaleX: 0 }} animate={{ scaleX: level.progress }} transition={{ ...spring, delay: 0.1 }} />
                </div>
              </div>
              {stats && <StreakChip days={stats.streak.current} doneToday={stats.streak.doneToday} className="!px-2 !py-0.5 text-[11px]" />}
            </div>
          </Link>
        )}

        <button type="button" onClick={handleSwitchRole} className="flex w-full items-center gap-2 rounded-lg px-1 py-1 text-xs font-medium text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))]">
          <PiArrowsLeftRightBold className="h-3.5 w-3.5" /> Switch to {userRole === 'teacher' ? 'student' : 'teacher'} mode
        </button>

        <div className="flex items-center justify-between gap-2">
          <Link to="/profile" className="group flex min-w-0 items-center gap-2.5">
            <Avatar className="h-8 w-8 border border-[hsl(var(--border))]"><AvatarFallback className="bg-[hsl(var(--muted))] text-xs font-medium">{initials}</AvatarFallback></Avatar>
            <span className="min-w-0">
              <span className="block truncate text-sm font-medium leading-tight group-hover:underline">{displayName || 'Your account'}</span>
              <span className="block truncate text-[11px] capitalize leading-tight text-[hsl(var(--muted-foreground))]">{userRole || 'student'}</span>
            </span>
          </Link>
          <IconButton label="Sign out" onClick={handleSignOut}><PiSignOutBold className="h-4 w-4" /></IconButton>
        </div>
      </div>
    </div>
  );

  return (
    <div className="flex min-h-dvh bg-[hsl(var(--background))] text-[hsl(var(--foreground))]">
      <aside className="sticky top-0 hidden h-dvh w-60 shrink-0 border-r border-[hsl(var(--border))] md:block"><Sidebar /></aside>

      <AnimatePresence>
        {mobileOpen && (
          <div className="fixed inset-0 z-40 md:hidden">
            <motion.div className="absolute inset-0 bg-black/30 backdrop-blur-[2px]" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setMobileOpen(false)} />
            <motion.div className="absolute inset-y-0 left-0 w-64 border-r border-[hsl(var(--border))]" initial={{ x: '-100%' }} animate={{ x: 0 }} exit={{ x: '-100%' }} transition={spring}>
              <Sidebar />
              <button type="button" onClick={() => setMobileOpen(false)} aria-label="Close menu" className="absolute right-3 top-4 grid h-8 w-8 place-items-center rounded-lg text-[hsl(var(--muted-foreground))] hover:bg-[hsl(var(--muted))]"><PiXBold className="h-4 w-4" /></button>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-20 flex h-16 shrink-0 items-center justify-between gap-3 border-b border-[hsl(var(--border))] bg-[hsl(var(--background))]/85 px-4 backdrop-blur-md md:px-8">
          <div className="flex min-w-0 items-center gap-3">
            <button type="button" onClick={() => setMobileOpen(true)} aria-label="Open menu" className="grid h-9 w-9 place-items-center rounded-lg text-[hsl(var(--foreground))] hover:bg-[hsl(var(--muted))] md:hidden"><PiListBold className="h-5 w-5" /></button>
            <Link to="/" className="md:hidden" aria-label="Quizlike home"><Logo withWord={false} size={26} /></Link>
            {nested && (
              <nav aria-label="Back" className="flex min-w-0 items-center gap-2 text-sm">
                <Link to={nested.parent[0]} className="inline-flex items-center gap-1 font-medium text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))]">
                  <PiCaretLeftBold className="h-3.5 w-3.5" />{nested.parent[1]}
                </Link>
                <span className="text-[hsl(var(--border))]">/</span>
                <span className="truncate font-medium">{nested.label}</span>
              </nav>
            )}
          </div>

          <div className="flex items-center gap-1">
            <NotificationBell />
            <IconButton label={soundOn ? 'Mute sounds' : 'Unmute sounds'} onClick={() => setSoundOn(toggleSound())}>
              {soundOn ? <PiSpeakerHighBold className="h-4 w-4" /> : <PiSpeakerSlashBold className="h-4 w-4" />}
            </IconButton>
            <IconButton label={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'} onClick={toggleTheme}>
              {theme === 'dark' ? <PiSunBold className="h-4 w-4" /> : <PiMoonBold className="h-4 w-4" />}
            </IconButton>
            <div className="md:hidden">
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button type="button" aria-label="Account menu" className="ml-1 rounded-full">
                    <Avatar className="h-8 w-8 border border-[hsl(var(--border))]"><AvatarFallback className="bg-[hsl(var(--muted))] text-xs font-medium">{initials}</AvatarFallback></Avatar>
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-52 border-[hsl(var(--border))] bg-[hsl(var(--card))] text-[hsl(var(--foreground))]">
                  <DropdownMenuLabel className="p-3 font-normal">
                    <p className="text-sm font-medium">{displayName || 'Your account'}</p>
                    <p className="text-xs capitalize text-[hsl(var(--muted-foreground))]">{userRole} mode</p>
                  </DropdownMenuLabel>
                  <DropdownMenuSeparator className="bg-[hsl(var(--border))]" />
                  <DropdownMenuItem onClick={() => navigate('/profile')} className="cursor-pointer gap-2 px-3 py-2 text-sm"><PiUserCircleBold className="h-4 w-4" />Profile</DropdownMenuItem>
                  <DropdownMenuItem onClick={handleSwitchRole} className="cursor-pointer gap-2 px-3 py-2 text-sm"><PiArrowsLeftRightBold className="h-4 w-4" />Switch mode</DropdownMenuItem>
                  <DropdownMenuSeparator className="bg-[hsl(var(--border))]" />
                  <DropdownMenuItem onClick={handleSignOut} className="cursor-pointer gap-2 px-3 py-2 text-sm text-[hsl(var(--destructive))]"><PiSignOutBold className="h-4 w-4" />Sign out</DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>
        </header>

        <main className="relative flex-1 px-4 py-8 md:px-8 md:py-10">{children}</main>
      </div>
    </div>
  );
}
