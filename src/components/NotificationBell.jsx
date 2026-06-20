import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import {
  listenToNotifications,
  markAllNotificationsAsRead,
  markNotificationAsRead,
} from '../utils/notifications';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Badge } from '@/components/ui/badge';
import { Bell, BellRing, Check, Inbox, GraduationCap, CheckSquare } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

const NotificationBell = () => {
  const navigate = useNavigate();
  const { currentUser } = useAuth();
  const [notifications, setNotifications] = useState([]);

  useEffect(() => {
    if (!currentUser) return;

    // Set up real-time listener for notifications
    const unsubscribe = listenToNotifications(currentUser.uid, (list) => {
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

  const getIcon = (type) => {
    switch (type) {
      case 'grading':
        return <CheckSquare className="w-4 h-4 text-amber-500" />;
      case 'grade_released':
        return <GraduationCap className="w-4 h-4 text-green-500" />;
      default:
        return <Inbox className="w-4 h-4 text-blue-500" />;
    }
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          className="relative w-9 h-9 rounded-xl bg-white/10 hover:bg-white/20 text-white flex items-center justify-center transition-all border border-white/10 cursor-pointer focus:outline-none"
          aria-label="Notifications"
        >
          {unreadCount > 0 ? (
            <motion.div
              animate={{ rotate: [0, -10, 10, -10, 10, 0] }}
              transition={{ repeat: Infinity, repeatDelay: 5, duration: 0.5 }}
            >
              <BellRing className="w-4 h-4 text-amber-300" />
            </motion.div>
          ) : (
            <Bell className="w-4 h-4" />
          )}

          {unreadCount > 0 && (
            <span className="absolute -top-1.5 -right-1.5 bg-red-550 text-white text-[10px] font-bold rounded-full w-5 h-5 flex items-center justify-center border-2 border-[#e85a19]">
              {unreadCount}
            </span>
          )}
        </button>
      </DropdownMenuTrigger>

      <DropdownMenuContent align="end" className="w-80 md:w-96 max-h-[450px] overflow-hidden flex flex-col p-0 bg-[hsl(var(--card))] border border-[hsl(var(--border))]">
        <div className="flex items-center justify-between px-4 py-3 shrink-0">
          <DropdownMenuLabel className="font-bold text-sm text-[hsl(var(--foreground))]">
            Notifications
          </DropdownMenuLabel>
          {unreadCount > 0 && (
            <button
              onClick={handleMarkAllRead}
              className="flex items-center gap-1 text-xs font-semibold text-[#e85a19] hover:underline cursor-pointer bg-transparent border-none p-0 focus:outline-none"
            >
              <Check className="w-3.5 h-3.5" /> Mark all read
            </button>
          )}
        </div>

        <DropdownMenuSeparator className="m-0" />

        <div className="overflow-y-auto flex-1 max-h-[350px]">
          {notifications.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-10 text-center text-slate-400">
              <Inbox className="w-8 h-8 opacity-40 mb-2" />
              <p className="text-xs">No notifications yet</p>
            </div>
          ) : (
            notifications.map((n, idx) => (
              <DropdownMenuItem
                key={n.id}
                onClick={() => handleNotificationClick(n)}
                className={`flex gap-3 px-4 py-3.5 cursor-pointer text-left focus:bg-[hsl(var(--muted))]/50 border-b border-[hsl(var(--border))]/50 last:border-0 ${
                  !n.read ? 'bg-[hsl(var(--muted))]/20' : ''
                }`}
              >
                <div className="w-8 h-8 rounded-lg bg-[hsl(var(--muted))] flex items-center justify-center shrink-0">
                  {getIcon(n.type)}
                </div>
                <div className="flex-1 min-w-0">
                  <p className={`text-xs leading-normal text-[hsl(var(--foreground))] ${!n.read ? 'font-semibold' : ''}`}>
                    {n.message}
                  </p>
                  <span className="text-[10px] text-[hsl(var(--muted-foreground))] block mt-1">
                    {formatTime(n.createdAt)}
                  </span>
                </div>
                {!n.read && (
                  <span className="w-2.5 h-2.5 rounded-full bg-blue-500 shrink-0 self-center" />
                )}
              </DropdownMenuItem>
            ))
          )}
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
};

export default NotificationBell;
