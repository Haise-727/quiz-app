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
  const roleColor = userRole === 'teacher' ? '#e85a19' : '#4776e6';
  const roleLabel = userRole === 'teacher' ? '🏫 Teacher' : '🎓 Student';
  const gradientBg = userRole === 'teacher'
    ? 'bg-gradient-to-br from-[#f12711] via-[#e85a19] to-[#f5af19]'
    : 'bg-gradient-to-br from-[#3a1c71] via-[#2d3a9e] to-[#4776e6]';

  return (
    <div className={`min-h-screen w-screen ${gradientBg} relative overflow-x-hidden`}>
      <div className="absolute inset-0 pointer-events-none"
        style={{ background: 'radial-gradient(ellipse at 70% 20%,rgba(255,255,255,0.06) 0%,transparent 60%)' }} />

      {/* Header */}
      <header className="relative z-10 flex items-center justify-between px-6 md:px-10 py-5">
        <button onClick={() => navigate(backPath)}
          className="flex items-center gap-2 text-white/70 hover:text-white text-sm font-medium transition-colors">
          <ArrowLeft className="w-4 h-4" /> Dashboard
        </button>
        <Badge variant="outline" className="border-white/20 text-white bg-white/10">{roleLabel}</Badge>
      </header>

      {/* Hero */}
      <div className="relative z-10 flex flex-col items-center pb-8 px-6">
        <motion.div initial={{ opacity: 0, scale: 0.8 }} animate={{ opacity: 1, scale: 1 }} transition={{ type: 'spring', stiffness: 300, damping: 25 }}>
          <div className="w-24 h-24 rounded-3xl flex items-center justify-center text-4xl font-black text-white shadow-2xl mb-4"
            style={{ background: `linear-gradient(135deg, ${roleColor}cc, ${roleColor})` }}>
            {initials}
          </div>
        </motion.div>
        <motion.h1 initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}
          className="text-2xl font-black text-white drop-shadow">
          {displayName || currentUser?.email?.split('@')[0] || 'Your Profile'}
        </motion.h1>
        <p className="text-white/60 text-sm mt-1">{currentUser?.email}</p>
      </div>

      {/* Main card */}
      <div className="relative z-10 mx-4 md:mx-auto md:max-w-xl mb-10 rounded-3xl bg-[#f8fafc] shadow-2xl overflow-hidden">
        <div className="p-6 md:p-8 flex flex-col gap-6">

          {/* Display name edit */}
          <section>
            <h2 className="text-base font-bold text-[hsl(var(--foreground))] mb-4">Account Info</h2>
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
                  />
                  <Button onClick={handleSave} disabled={saving} className="gap-2 shrink-0"
                    style={{ background: `linear-gradient(135deg, ${roleColor}, ${roleColor}cc)`, border: 0, color: '#fff' }}>
                    {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                    Save
                  </Button>
                </div>
              </div>

              <div className="flex flex-col gap-1.5">
                <Label className="flex items-center gap-2 text-[hsl(var(--muted-foreground))] text-xs font-semibold uppercase tracking-wide">
                  <Mail className="w-3.5 h-3.5" /> Email
                </Label>
                <p className="text-sm text-[hsl(var(--foreground))] bg-[hsl(var(--muted))] rounded-lg px-3 py-2.5">
                  {currentUser?.email}
                </p>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="flex flex-col gap-1.5">
                  <Label className="flex items-center gap-2 text-[hsl(var(--muted-foreground))] text-xs font-semibold uppercase tracking-wide">
                    <Shield className="w-3.5 h-3.5" /> Role
                  </Label>
                  <div className="flex items-center gap-2 bg-[hsl(var(--muted))] rounded-lg px-3 py-2.5">
                    <span className="text-sm">{roleLabel}</span>
                  </div>
                </div>

                {joinDate && (
                  <div className="flex flex-col gap-1.5">
                    <Label className="flex items-center gap-2 text-[hsl(var(--muted-foreground))] text-xs font-semibold uppercase tracking-wide">
                      <Calendar className="w-3.5 h-3.5" /> Joined
                    </Label>
                    <p className="text-sm text-[hsl(var(--foreground))] bg-[hsl(var(--muted))] rounded-lg px-3 py-2.5">
                      {joinDate}
                    </p>
                  </div>
                )}
              </div>
            </div>
          </section>

          <Separator />

          {/* Role switcher */}
          <section>
            <h2 className="text-base font-bold text-[hsl(var(--foreground))] mb-1">Switch Role</h2>
            <p className="text-sm text-[hsl(var(--muted-foreground))] mb-4">
              You're currently a <strong>{userRole}</strong>. Switch to access the {userRole === 'teacher' ? 'student' : 'teacher'} side.
            </p>
            <Button variant="outline" onClick={handleSwitchRole} disabled={switching} className="gap-2">
              {switching ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
              Switch to {userRole === 'teacher' ? 'Student' : 'Teacher'}
            </Button>
          </section>

        </div>
      </div>
    </div>
  );
};

export default Profile;
