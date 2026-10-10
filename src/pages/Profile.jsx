import { useState } from 'react';
import { motion } from 'framer-motion';
import { toast } from 'sonner';
import { PiArrowsLeftRightBold, PiSpinnerGapBold } from 'react-icons/pi';
import { useAuth } from '@/contexts/AuthContext';
import { useProgress } from '@/contexts/ProgressContext';
import PageHeader from '@/components/layout/PageHeader';
import LevelBadge from '@/components/game/LevelBadge';
import XPBar from '@/components/game/XPBar';
import StreakChip from '@/components/game/StreakChip';
import { Button } from '@/components/ui/button';
import { rise, stagger } from '@/lib/motion';

export default function Profile() {
  const { currentUser, displayName, userRole, updateDisplayName, switchRole } = useAuth();
  const { level, stats, badges } = useProgress();
  const [name, setName] = useState(displayName || currentUser?.displayName || '');
  const [saving, setSaving] = useState(false);
  const [switching, setSwitching] = useState(false);

  const current = displayName || currentUser?.displayName || '';
  const initials = (name || currentUser?.email || 'U').split(' ').map((n) => n[0]).join('').toUpperCase().slice(0, 2);
  const joined = currentUser?.metadata?.creationTime
    ? new Date(currentUser.metadata.creationTime).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })
    : null;
  const other = userRole === 'teacher' ? 'student' : 'teacher';
  const isStudent = userRole === 'student';
  const earned = badges?.filter((b) => b.earned).length ?? 0;

  const save = async (e) => {
    e.preventDefault();
    if (!name.trim()) { toast.error('Your name cannot be empty.'); return; }
    if (name.trim() === current) { toast.info('Nothing to save.'); return; }
    setSaving(true);
    try {
      await updateDisplayName(name.trim());
      toast.success('Profile updated.');
    } catch {
      toast.error('We could not update your profile.');
    } finally {
      setSaving(false);
    }
  };

  const swap = async () => {
    setSwitching(true);
    try {
      await switchRole(other);
      toast.success(`Switched to ${other} mode.`);
    } catch {
      toast.error('We could not switch your role.');
      setSwitching(false);
    }
  };

  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader serif eyebrow="Profile" title={current || currentUser?.email?.split('@')[0] || 'Your profile'} description={currentUser?.email} />

      <motion.div variants={stagger(0.06)} initial="hidden" animate="show">
        {isStudent && level && (
          <motion.section variants={rise} aria-label="Progress" className="mt-12 border-t border-[hsl(var(--border))] pt-8">
            <div className="flex items-center justify-between gap-4">
              <div className="flex items-center gap-4">
                <LevelBadge level={level.level} size="lg" />
                <div>
                  <p className="eyebrow">Level {level.level}</p>
                  <p className="mt-1 text-2xl font-medium">{level.title}</p>
                </div>
              </div>
              <StreakChip days={stats?.streak?.current ?? 0} doneToday={!!stats?.streak?.doneToday} />
            </div>
            <XPBar before={level} className="mt-6" />
            <p className="mt-4 text-sm text-[hsl(var(--muted-foreground))]">
              <span className="tabular font-medium text-[hsl(var(--foreground))]">{earned}</span> of {badges?.length ?? 0} badges earned
            </p>
          </motion.section>
        )}

        <motion.form variants={rise} onSubmit={save} className="mt-12 border-t border-[hsl(var(--border))] pt-8">
          <label htmlFor="profile-name" className="eyebrow">Display name</label>
          <div className="mt-2 flex items-end gap-3">
            <div className="flex min-w-0 flex-1 items-center gap-3 border-b-2 border-[hsl(var(--input))] pb-2 transition-colors focus-within:border-[hsl(var(--ink))]">
              <span aria-hidden className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-[hsl(var(--ink))] font-mono text-xs font-medium text-[hsl(var(--ink-foreground))]">{initials}</span>
              <input
                id="profile-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                maxLength={40}
                placeholder="Your name"
                autoComplete="name"
                className="min-w-0 flex-1 bg-transparent text-xl outline-none placeholder:text-[hsl(var(--muted-foreground))]/50"
              />
            </div>
            <Button type="submit" size="lg" disabled={saving || name.trim() === current}>
              {saving && <PiSpinnerGapBold className="animate-spin" />}Save
            </Button>
          </div>
        </motion.form>

        <motion.dl variants={rise} className="mt-10 divide-y divide-[hsl(var(--border))] border-y border-[hsl(var(--border))]">
          {[['Email', currentUser?.email], ['Role', userRole === 'teacher' ? 'Teacher' : 'Student'], joined && ['Joined', joined]].filter(Boolean).map(([term, value]) => (
            <div key={term} className="flex items-baseline justify-between gap-6 py-4">
              <dt className="eyebrow">{term}</dt>
              <dd className="min-w-0 truncate text-sm">{value}</dd>
            </div>
          ))}
        </motion.dl>

        <motion.section variants={rise} className="mt-12">
          <h2 className="text-xl font-semibold tracking-tight">Switch to {other} mode</h2>
          <p className="mt-2 max-w-prose text-sm text-[hsl(var(--muted-foreground))]">
            You are in {userRole} mode now. Switching opens the {other} side of Quizlike with the same account. Nothing you made is lost.
          </p>
          <Button variant="outline" className="mt-5" onClick={swap} disabled={switching}>
            {switching ? <PiSpinnerGapBold className="animate-spin" /> : <PiArrowsLeftRightBold />} Switch to {other}
          </Button>
        </motion.section>
      </motion.div>
    </div>
  );
}
