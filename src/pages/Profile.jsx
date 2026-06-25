import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { motion } from 'framer-motion';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { ArrowLeft, Save, Loader2, User, Mail, Shield, Calendar, RefreshCw } from 'lucide-react';

const Profile = () => {
  const navigate = useNavigate();
  const { currentUser, displayName, userRole, updateDisplayName, switchRole } = useAuth();

  const [name, setName]       = useState(displayName || currentUser?.displayName || '');
  const [saving, setSaving]   = useState(false);
  const [switching, setSwitching] = useState(false);

  const initials = (name || currentUser?.email || 'U')
    .split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);

  const joinDate = currentUser?.metadata?.creationTime
    ? new Date(currentUser.metadata.creationTime).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })
    : null;

  const handleSave = async () => {
    if (!name.trim()) { toast.error('Name cannot be empty.'); return; }
    if (name.trim() === (displayName || currentUser?.displayName)) {
      toast.info('No changes to save.'); return;
    }
    setSaving(true);
    try {
      await updateDisplayName(name.trim());
      toast.success('Profile updated!');
    } catch { toast.error('Failed to update profile.'); }
    finally { setSaving(false); }
  };

  const handleSwitchRole = async () => {
    const newRole = userRole === 'teacher' ? 'student' : 'teacher';
    setSwitching(true);
    try {
      await switchRole(newRole);
      toast.success(`Switched to ${newRole} mode`);
    } catch { toast.error('Failed to switch role.'); setSwitching(false); }
  };

  const backPath = userRole === 'teacher' ? '/teacher/home' : '/student/dashboard';
  const roleLabel = userRole === 'teacher' ? 'Teacher' : 'Student';

  return (
    <div className="w-full max-w-xl mx-auto relative">
      {/* Hero */}
      <div className="flex flex-col items-center pb-6">
        <div className="w-20 h-20 rounded-full border border-[hsl(var(--border))] bg-[hsl(var(--muted))] flex items-center justify-center text-2xl font-bold text-[hsl(var(--foreground))] mb-3">
          {initials}
        </div>
        <h1 className="text-xl font-bold text-[hsl(var(--foreground))] tracking-tight">
          {displayName || currentUser?.email?.split('@')[0] || 'Your Profile'}
        </h1>
        <p className="text-[hsl(var(--muted-foreground))] text-xs mt-1">{currentUser?.email}</p>
      </div>

      {/* Main card */}
      <motion.div 
        initial={{ opacity: 0, y: 15 }} 
        animate={{ opacity: 1, y: 0 }} 
        transition={{ duration: 0.3, delay: 0.05 }}
        className="relative z-10 mb-10 rounded-[12px] border border-[hsl(var(--border))] bg-[hsl(var(--card))] overflow-hidden"
      >
        <div className="p-6 md:p-8 flex flex-col gap-6">

          {/* Display name edit */}
          <section>
            <h2 className="text-sm font-semibold text-[hsl(var(--muted-foreground))] uppercase tracking-wider mb-4">Account Info</h2>
            <div className="flex flex-col gap-4">
              <div className="flex flex-col gap-1.5">
                <Label className="flex items-center gap-2 text-[hsl(var(--muted-foreground))] text-xs font-semibold uppercase tracking-wide">
                  <User className="w-3.5 h-3.5" /> Display Name
                </Label>
                <div className="flex gap-2">
                  <Input
                    value={name}
                    onChange={e => setName(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && handleSave()}
                    placeholder="Your name"
                    maxLength={40}
                    className="bg-[hsl(var(--muted))]/20 border-[hsl(var(--border))] focus-visible:ring-[hsl(var(--primary))]/30 focus-visible:border-[hsl(var(--primary))]"
                  />
                  <Button onClick={handleSave} disabled={saving} className="gap-2 shrink-0 bg-[hsl(var(--primary))] hover:bg-[hsl(var(--primary))]/90 text-[hsl(var(--primary-foreground))] border-0">
                    {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                    Save
                  </Button>
                </div>
              </div>

              <div className="flex flex-col gap-1.5">
                <Label className="flex items-center gap-2 text-[hsl(var(--muted-foreground))] text-xs font-semibold uppercase tracking-wide">
                  <Mail className="w-3.5 h-3.5" /> Email
                </Label>
                <p className="text-sm text-[hsl(var(--foreground))] bg-[hsl(var(--muted))]/40 border border-[hsl(var(--border))] rounded-lg px-3 py-2">
                  {currentUser?.email}
                </p>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="flex flex-col gap-1.5">
                  <Label className="flex items-center gap-2 text-[hsl(var(--muted-foreground))] text-xs font-semibold uppercase tracking-wide">
                    <Shield className="w-3.5 h-3.5" /> Role
                  </Label>
                  <div className="flex items-center gap-2 bg-[hsl(var(--muted))]/40 border border-[hsl(var(--border))] rounded-lg px-3 py-2">
                    <span className="text-sm">{roleLabel}</span>
                  </div>
                </div>

                {joinDate && (
                  <div className="flex flex-col gap-1.5">
                    <Label className="flex items-center gap-2 text-[hsl(var(--muted-foreground))] text-xs font-semibold uppercase tracking-wide">
                      <Calendar className="w-3.5 h-3.5" /> Joined
                    </Label>
                    <p className="text-sm text-[hsl(var(--foreground))] bg-[hsl(var(--muted))]/40 border border-[hsl(var(--border))] rounded-lg px-3 py-2">
                      {joinDate}
                    </p>
                  </div>
                )}
              </div>
            </div>
          </section>

          <Separator className="bg-[hsl(var(--border))]" />

          {/* Role switcher */}
          <section>
            <h2 className="text-sm font-semibold text-[hsl(var(--muted-foreground))] uppercase tracking-wider mb-2">Switch Role</h2>
            <p className="text-xs text-[hsl(var(--muted-foreground))] mb-4 leading-relaxed">
              You're currently in <strong>{userRole}</strong> view. Switch to access the {userRole === 'teacher' ? 'student' : 'teacher'} interface.
            </p>
            <Button variant="outline" onClick={handleSwitchRole} disabled={switching} className="gap-2 border-[hsl(var(--border))] hover:bg-[hsl(var(--muted))]">
              {switching ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4 text-[hsl(var(--muted-foreground))]" />}
              Switch to {userRole === 'teacher' ? 'Student' : 'Teacher'}
            </Button>
          </section>

        </div>
      </motion.div>
    </div>
  );
};

export default Profile;
