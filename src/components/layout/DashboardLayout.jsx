import React, { useState, useEffect } from 'react';
import { useNavigate, useLocation, Link } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { useTheme } from '../../contexts/ThemeContext';
import { toast } from 'sonner';
import { Avatar, AvatarFallback } from '../ui/avatar';
import { Badge } from '../ui/badge';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '../ui/dropdown-menu';
import {
  LayoutDashboard,
  BookOpen,
  GraduationCap,
  Library,
  Upload,
  PlayCircle,
  Trophy,
  BarChart2,
  User,
  Sun,
  Moon,
  Menu,
  X,
  ChevronRight,
  LogOut,
  Sparkles,
} from 'lucide-react';
import NotificationBell from '../NotificationBell';

const DashboardLayout = ({ children }) => {
  const navigate = useNavigate();
  const location = useLocation();
  const { currentUser, userRole, signOut: ctxSignOut, switchRole, displayName } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const [mobileOpen, setMobileOpen] = useState(false);

  // Close mobile sidebar on route change
  useEffect(() => {
    setMobileOpen(false);
  }, [location.pathname]);

  const handleSignOut = async () => {
    try {
      await ctxSignOut();
      navigate('/login');
    } catch {
      toast.error('Failed to sign out.');
    }
  };

  const handleSwitchRole = async () => {
    const targetRole = userRole === 'teacher' ? 'student' : 'teacher';
    try {
      await switchRole(targetRole);
      toast.success(`Switched to ${targetRole === 'teacher' ? 'Teacher' : 'Student'} mode`);
      navigate(targetRole === 'teacher' ? '/teacher/home' : '/student/dashboard');
    } catch {
      toast.error('Failed to switch roles.');
    }
  };

  // Define sidebar links based on role
  const getLinks = () => {
    if (userRole === 'teacher') {
      return [
        { path: '/teacher/home', label: 'Dashboard', icon: LayoutDashboard },
        { path: '/teacher/your-quizzes', label: 'Your Quizzes', icon: BookOpen },
        { path: '/teacher/classes', label: 'My Classes', icon: GraduationCap },
        { path: '/teacher/question-bank', label: 'Question Bank', icon: Library },
        { path: '/teacher/media-test', label: 'Media Test', icon: Upload },
      ];
    } else {
      return [
        { path: '/student/dashboard', label: 'Dashboard', icon: LayoutDashboard },
        { path: '/student/attend-quiz', label: 'Join Quiz', icon: PlayCircle },
        { path: '/student/results', label: 'Results & History', icon: Trophy },
      ];
    }
  };

  const links = getLinks();
  const initials = displayName
    ? displayName.split(' ').map((n) => n[0]).join('').toUpperCase().slice(0, 2)
    : currentUser?.email?.split('@')[0]?.slice(0, 2).toUpperCase() || 'U';

  // Breadcrumbs generation
  const pathnames = location.pathname.split('/').filter((x) => x);
  const breadcrumbs = pathnames.map((value, index) => {
    const to = `/${pathnames.slice(0, index + 1).join('/')}`;
    const isLast = index === pathnames.length - 1;
    const formattedValue = value
      .replace(/-/g, ' ')
      .replace(/\b\w/g, (char) => char.toUpperCase());

    return {
      to,
      label: formattedValue,
      isLast,
    };
  });

  const SidebarContent = () => (
    <div className="flex flex-col h-full bg-[hsl(var(--surface))]">
      {/* Brand Logo */}
      <div className="h-14 flex items-center gap-3 px-6 border-b border-[hsl(var(--border))] shrink-0 bg-[hsl(var(--surface-dim))]">
        <div className="w-8 h-8 rounded-lg bg-[hsl(var(--primary))] flex items-center justify-center text-[hsl(var(--primary-foreground))] font-black text-sm">
          Q
        </div>
        <span className="text-[hsl(var(--foreground))] font-bold text-base tracking-tight">
          Quizlike
        </span>
      </div>

      {/* Nav List */}
      <nav className="flex-1 py-6 space-y-1 overflow-y-auto px-3">
        {links.map((link) => {
          const isActive = location.pathname === link.path;
          const Icon = link.icon;
          return (
            <Link
              key={link.path}
              to={link.path}
              className={`flex items-center gap-3 px-4 py-2.5 rounded-interactive text-sm font-semibold transition-all relative group ${
                isActive
                  ? 'bg-[hsl(var(--surface-container-high))] text-[hsl(var(--foreground))]'
                  : 'text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))] hover:bg-[hsl(var(--surface-container-low))]'
              }`}
            >
              {/* 2px green vertical pill on active far left */}
              {isActive && (
                <div className="absolute left-0 top-1/2 -translate-y-1/2 w-[2px] h-6 bg-[hsl(var(--primary))] rounded-r-full" />
              )}
              <Icon
                className={`w-4.5 h-4.5 shrink-0 ${
                  isActive ? 'text-[hsl(var(--primary))]' : 'text-[hsl(var(--muted-foreground))] group-hover:text-[hsl(var(--foreground))]'
                }`}
              />
              <span>{link.label}</span>
            </Link>
          );
        })}
      </nav>

      {/* Switcher & Profile Footer */}
      <div className="p-4 border-t border-[hsl(var(--border))] shrink-0 bg-[hsl(var(--surface-container-lowest))] space-y-3">
        <button
          onClick={handleSwitchRole}
          className="w-full flex items-center justify-center gap-2 px-3 py-2 text-xs font-semibold rounded-interactive border border-[hsl(var(--border))] hover:border-[hsl(var(--primary))] hover:bg-[hsl(var(--primary))]/5 text-[hsl(var(--foreground))] transition-all cursor-pointer"
        >
          <Sparkles className="w-3.5 h-3.5 text-[hsl(var(--primary))]" />
          Switch to {userRole === 'teacher' ? 'Student' : 'Teacher'}
        </button>

        <div className="flex items-center justify-between">
          <Link to="/profile" className="flex items-center gap-2 min-w-0 group">
            <Avatar className="w-8 h-8 border border-[hsl(var(--border))] group-hover:border-[hsl(var(--primary))] transition-all">
              <AvatarFallback className="bg-[hsl(var(--muted))] text-[hsl(var(--foreground))] font-bold text-xs">
                {initials}
              </AvatarFallback>
            </Avatar>
            <div className="min-w-0">
              <p className="text-xs font-bold text-[hsl(var(--foreground))] truncate leading-tight group-hover:text-[hsl(var(--primary))] transition-colors">
                {displayName || 'User'}
              </p>
              <p className="text-[10px] text-[hsl(var(--muted-foreground))] truncate leading-tight">
                {userRole === 'teacher' ? 'Teacher' : 'Student'} Account
              </p>
            </div>
          </Link>
          <button
            onClick={handleSignOut}
            className="p-1.5 rounded-interactive hover:bg-red-500/10 text-red-500 hover:text-red-600 transition-colors cursor-pointer"
            title="Sign Out"
          >
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen flex bg-[hsl(var(--background))] text-[hsl(var(--foreground))] overflow-x-hidden">
      {/* Desktop Sidebar (Fixed 240px) */}
      <aside className="hidden md:block w-[240px] shrink-0 border-r border-[hsl(var(--border))] h-screen sticky top-0 overflow-hidden z-20">
        <SidebarContent />
      </aside>

      {/* Mobile Drawer Overlay */}
      {mobileOpen && (
        <div className="md:hidden fixed inset-0 z-30 flex">
          {/* Overlay backdrop */}
          <div
            className="fixed inset-0 bg-black/50 backdrop-blur-xs transition-opacity duration-200"
            onClick={() => setMobileOpen(false)}
          />
          {/* Sidebar Drawer */}
          <div className="relative flex flex-col w-[240px] max-w-xs h-full bg-[hsl(var(--surface))] animate-slide-in-right z-40">
            <SidebarContent />
            {/* Close Button inside Drawer */}
            <button
              onClick={() => setMobileOpen(false)}
              className="absolute top-4.5 right-4 w-7 h-7 flex items-center justify-center rounded-interactive border border-[hsl(var(--border))] text-[hsl(var(--foreground))] bg-[hsl(var(--surface-bright))] cursor-pointer hover:bg-[hsl(var(--surface-container-high))]"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* Main Body Stack */}
      <div className="flex-1 flex flex-col min-w-0 min-h-screen">
        {/* Sticky 56px Top Header with Glassmorphism */}
        <header className="sticky top-0 z-10 h-14 flex items-center justify-between px-6 border-b border-[hsl(var(--border))] bg-[hsl(var(--card))]/80 backdrop-blur-md shrink-0">
          <div className="flex items-center gap-3">
            {/* Hamburger Button */}
            <button
              onClick={() => setMobileOpen(true)}
              className="md:hidden p-1.5 rounded-interactive border border-[hsl(var(--border))] hover:border-[hsl(var(--primary))] text-[hsl(var(--foreground))] cursor-pointer transition-colors"
            >
              <Menu className="w-4 h-4" />
            </button>

            {/* Breadcrumbs */}
            <nav className="flex items-center gap-1.5 text-xs select-none">
              <Link
                to={userRole === 'teacher' ? '/teacher/home' : '/student/dashboard'}
                className="text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))] font-semibold"
              >
                Home
              </Link>
              {breadcrumbs.length > 0 && <ChevronRight className="w-3.5 h-3.5 text-[hsl(var(--muted-foreground))]" />}
              {breadcrumbs.map((crumb, idx) => (
                <React.Fragment key={crumb.to}>
                  {idx > 0 && <ChevronRight className="w-3.5 h-3.5 text-[hsl(var(--muted-foreground))]" />}
                  {crumb.isLast ? (
                    <span className="text-[hsl(var(--foreground))] font-semibold truncate max-w-[120px] sm:max-w-[200px]">
                      {crumb.label}
                    </span>
                  ) : (
                    <Link
                      to={crumb.to}
                      className="text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))] font-semibold truncate max-w-[100px]"
                    >
                      {crumb.label}
                    </Link>
                  )}
                </React.Fragment>
              ))}
            </nav>
          </div>

          <div className="flex items-center gap-3">
            <NotificationBell />

            {/* Theme Toggle */}
            <button
              onClick={toggleTheme}
              className="w-8 h-8 rounded-interactive bg-[hsl(var(--muted))] hover:bg-[hsl(var(--muted))]/80 text-[hsl(var(--foreground))] flex items-center justify-center transition-colors border border-[hsl(var(--border))] cursor-pointer"
              aria-label="Toggle Theme"
            >
              {theme === 'dark' ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
            </button>

            {/* Header User Badge & Quick Menu */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Avatar className="w-8 h-8 border border-[hsl(var(--border))] cursor-pointer hover:border-[hsl(var(--primary))] transition-colors shrink-0">
                  <AvatarFallback className="bg-[hsl(var(--muted))] text-[hsl(var(--foreground))] font-bold text-xs">
                    {initials}
                  </AvatarFallback>
                </Avatar>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-52 bg-[hsl(var(--card))] border-[hsl(var(--border))] text-[hsl(var(--foreground))]">
                <DropdownMenuLabel className="font-normal p-3">
                  <p className="font-semibold text-sm">{displayName || 'User'}</p>
                  <p className="text-xs text-[hsl(var(--muted-foreground))]">
                    {userRole === 'teacher' ? 'Teacher' : 'Student'} mode
                  </p>
                </DropdownMenuLabel>
                <DropdownMenuSeparator className="bg-[hsl(var(--border))]" />
                <DropdownMenuItem
                  onClick={() => navigate('/profile')}
                  className="gap-2 cursor-pointer text-sm py-2 px-3 hover:bg-[hsl(var(--muted))]/50"
                >
                  <User className="w-4 h-4 text-[hsl(var(--muted-foreground))]" />
                  My Profile
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={handleSwitchRole}
                  className="gap-2 cursor-pointer text-sm py-2 px-3 hover:bg-[hsl(var(--muted))]/50"
                >
                  <Sparkles className="w-4 h-4 text-[hsl(var(--muted-foreground))]" />
                  Switch Mode
                </DropdownMenuItem>
                <DropdownMenuSeparator className="bg-[hsl(var(--border))]" />
                <DropdownMenuItem
                  onClick={handleSignOut}
                  className="gap-2 cursor-pointer text-sm py-2 px-3 text-red-500 focus:text-red-500 hover:bg-red-500/10"
                >
                  <LogOut className="w-4 h-4" />
                  Sign Out
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </header>

        {/* Page Content viewport */}
        <main className="flex-1 p-4 md:p-6 relative">
          {children}
        </main>
      </div>
    </div>
  );
};

export default DashboardLayout;
