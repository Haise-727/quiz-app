import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import {
  listenToNotifications,
  markAllNotificationsAsRead,
  markNotificationAsRead,
} from '../api/notifications';
import { playNotification } from '../utils/sounds';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { PiBellBold, PiBellRingingBold, PiCheckBold, PiGraduationCapBold, PiNotePencilBold, PiTrayBold } from 'react-icons/pi';
import { motion } from 'framer-motion';

const NotificationBell = () => {
  const navigate = useNavigate();
  const { currentUser } = useAuth();
  const [notifications, setNotifications] = useState([]);
  const seenIds = useRef(null);

  useEffect(() => {
    if (!currentUser) return;

    // Set up real-time listener for notifications
    const unsubscribe = listenToNotifications(currentUser.uid, (list) => {
      // Only chime for notifications that weren't present on the previous snapshot —
      // avoids playing a sound for pre-existing unread items on initial load.
      if (seenIds.current) {
        const isNew = list.some(n => !n.read && !seenIds.current.has(n.id));
        if (isNew) playNotification();
      }
      seenIds.current = new Set(list.map(n => n.id));
      setNotifications(list);
    });

    return () => unsubscribe();
  }, [currentUser]);

  const unreadCount = notifications.filter((n) => !n.read).length;

  const handleMarkAllRead = async (e) => {
    e.stopPropagation();
    if (!currentUser || unreadCount === 0) return;
    try {
      await markAllNotificationsAsRead(currentUser.uid);
    } catch (err) {
      console.error('Failed to mark all as read:', err);
    }
  };

  const handleNotificationClick = async (n) => {
    try {
      if (!n.read) {
        await markNotificationAsRead(n.id);
      }
      
      // Navigate to the appropriate route if details exist
      if (n.type === 'grading' && n.data?.quizId) {
        navigate(`/teacher/grading/${n.data.quizId}`);
      } else if (n.type === 'grade_released') {
        navigate('/student/results');
      }
    } catch (err) {
      console.error('Failed to handle notification click:', err);
    }
  };

  const formatTime = (ts) => {
    if (!ts) return 'Just now';
    const d = ts.toDate ? ts.toDate() : new Date(ts);
    const diffMs = Date.now() - d.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMins / 60);

    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  };

  // Each kind of notification gets a small tinted tile, from the theme so it follows dark mode.
  const getIcon = (type) => {
    switch (type) {
      case 'grading':
        return <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-[hsl(var(--tint-yellow))] text-[hsl(var(--tint-yellow-fg))]"><PiNotePencilBold className="h-4 w-4" /></span>;
      case 'grade_released':
        return <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-[hsl(var(--tint-green))] text-[hsl(var(--tint-green-fg))]"><PiGraduationCapBold className="h-4 w-4" /></span>;
      default:
        return <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-[hsl(var(--tint-blue))] text-[hsl(var(--tint-blue-fg))]"><PiTrayBold className="h-4 w-4" /></span>;
    }
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className="relative grid h-9 w-9 place-items-center rounded-lg text-[hsl(var(--muted-foreground))] outline-none hover:bg-[hsl(var(--muted))] hover:text-[hsl(var(--foreground))] focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring))]"
          aria-label={unreadCount > 0 ? `Notifications, ${unreadCount} unread` : 'Notifications'}
          title="Notifications"
        >
          {unreadCount > 0 ? (
            <motion.span animate={{ rotate: [0, -12, 12, -8, 8, 0] }} transition={{ repeat: Infinity, repeatDelay: 6, duration: 0.6 }} className="inline-flex text-[hsl(var(--foreground))]">
              <PiBellRingingBold className="h-4 w-4" />
            </motion.span>
          ) : (
            <PiBellBold className="h-4 w-4" />
          )}
          {unreadCount > 0 && (
            <span className="tabular absolute right-1 top-1 grid h-4 min-w-4 place-items-center rounded-full bg-[hsl(var(--primary))] px-1 text-[10px] font-medium leading-none text-[hsl(var(--primary-foreground))] ring-2 ring-[hsl(var(--background))]">
              {unreadCount}
            </span>
          )}
        </button>
      </DropdownMenuTrigger>

      <DropdownMenuContent align="end" className="flex max-h-[450px] w-80 flex-col overflow-hidden border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-0 md:w-96">
        <div className="flex shrink-0 items-center justify-between px-4 py-3">
          <DropdownMenuLabel className="p-0 text-sm font-semibold text-[hsl(var(--foreground))]">Notifications</DropdownMenuLabel>
          {unreadCount > 0 && (
            <button type="button" onClick={handleMarkAllRead} className="inline-flex items-center gap-1 text-xs font-medium text-[hsl(var(--foreground))] underline-offset-4 hover:underline">
              <PiCheckBold className="h-3.5 w-3.5" /> Mark all read
            </button>
          )}
        </div>

        <DropdownMenuSeparator className="m-0" />

        <div className="max-h-[350px] flex-1 overflow-y-auto">
          {notifications.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-10 text-center text-[hsl(var(--muted-foreground))]">
              <PiTrayBold className="mb-2 h-7 w-7 opacity-50" />
              <p className="text-sm">Nothing new</p>
            </div>
          ) : (
            notifications.map((n) => (
              <DropdownMenuItem
                key={n.id}
                onClick={() => handleNotificationClick(n)}
                className="flex cursor-pointer gap-3 border-b border-[hsl(var(--border))] px-4 py-3.5 text-left last:border-0 focus:bg-[hsl(var(--muted))]/60"
              >
                {getIcon(n.type)}
                <div className="min-w-0 flex-1">
                  <p className={`text-sm leading-snug text-[hsl(var(--foreground))] ${!n.read ? 'font-medium' : 'text-[hsl(var(--muted-foreground))]'}`}>{n.message}</p>
                  <span className="mt-1 block text-[11px] text-[hsl(var(--muted-foreground))]">{formatTime(n.createdAt)}</span>
                </div>
                {!n.read && <span className="h-2 w-2 shrink-0 self-center rounded-full bg-[hsl(var(--primary))]" aria-label="Unread" />}
              </DropdownMenuItem>
            ))
          )}
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
};

export default NotificationBell;
