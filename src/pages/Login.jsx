import React, { useState, useEffect } from 'react';
import { useNavigate, useSearchParams, Link } from 'react-router-dom';
import { useAuth, handleAuthError } from '../contexts/AuthContext';
import { motion, AnimatePresence } from 'framer-motion';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { FaGoogle } from 'react-icons/fa';
import { Eye, EyeOff, GraduationCap, BookOpen, ArrowLeft, Loader2 } from 'lucide-react';

// ── Role selection modal (for new Google users) ────────────────────────────────
const RoleSelectionModal = ({ user, onSelect, loading }) => (
  <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4 animate-fade-in">
    <motion.div
      initial={{ scale: 0.95, opacity: 0, y: 16 }}
      animate={{ scale: 1, opacity: 1, y: 0 }}
      transition={{ type: 'spring', stiffness: 300, damping: 25 }}
      className="w-full max-w-md"
    >
      <Card className="w-full shadow-lg border border-[hsl(var(--border))] bg-[hsl(var(--card))] text-[hsl(var(--foreground))] overflow-hidden rounded-2xl">
        <CardHeader className="relative text-center pb-2">
          <div className="w-14 h-14 rounded-2xl bg-[hsl(var(--primary))]/10 mx-auto mb-3 flex items-center justify-center text-[hsl(var(--primary))] border border-[hsl(var(--primary))]/20">
            <GraduationCap className="w-7 h-7" />
          </div>
          <CardTitle className="text-[hsl(var(--foreground))] text-2xl">One last step</CardTitle>
          <CardDescription className="text-[hsl(var(--muted-foreground))] text-base">
            How do you use Quizlike, {user?.displayName?.split(' ')[0] || 'friend'}?
          </CardDescription>
        </CardHeader>
        <CardContent className="relative flex flex-col gap-3 pb-6">
          <div className="grid grid-cols-2 gap-3">
            {[
              { role: 'student', icon: GraduationCap, label: 'Student', desc: 'Join & take quizzes', colorClass: 'bg-blue-500/10 text-blue-500 border-blue-500/20' },
              { role: 'teacher', icon: BookOpen,      label: 'Teacher', desc: 'Create & host quizzes', colorClass: 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20' },
            ].map(({ role, icon: Icon, label, desc, colorClass }) => (
              <button
                key={role}
                onClick={() => onSelect(role)}
                disabled={loading}
                className="group flex flex-col items-center gap-3 p-5 rounded-2xl border border-[hsl(var(--border))] bg-[hsl(var(--muted))]/30 hover:bg-[hsl(var(--muted))]/70 hover:border-[hsl(var(--primary))]/50 transition-all disabled:opacity-50 cursor-pointer"
              >
                <div className={`w-14 h-14 rounded-xl flex items-center justify-center shadow-sm ${colorClass} border`}>
                  <Icon className="w-7 h-7" />
                </div>
                <div className="text-center">
                  <p className="font-bold text-[hsl(var(--foreground))]">{label}</p>
                  <p className="text-[hsl(var(--muted-foreground))] text-xs mt-0.5">{desc}</p>
                </div>
              </button>
            ))}
          </div>
          {loading && (
            <div className="flex items-center justify-center gap-2 text-[hsl(var(--muted-foreground))] text-sm pt-2">
              <Loader2 className="w-4 h-4 animate-spin" />
              Setting up your account...
            </div>
          )}
        </CardContent>
      </Card>
    </motion.div>
  </div>
);

// ── Main Login page ────────────────────────────────────────────────────────────
const Login = () => {
  const [searchParams] = useSearchParams();
  const defaultTab  = searchParams.get('tab') === 'signup' ? 'signup' : 'signin';
  const defaultRole = searchParams.get('role') || '';

  const [tab, setTab]                 = useState(defaultTab);
  const [email, setEmail]             = useState('');
  const [password, setPassword]       = useState('');
  const [name, setName]               = useState('');
  const [role, setRole]               = useState(defaultRole);
  const [showPw, setShowPw]           = useState(false);
  const [error, setError]             = useState('');
  const [loading, setLoading]         = useState(false);
  const [pendingGoogleUser, setPending] = useState(null);
  const [roleLoading, setRoleLoading] = useState(false);

  const { signInWithGoogle, signInWithEmail, signUpWithEmail, createUserProfile, currentUser, userRole } = useAuth();
  const navigate = useNavigate();

  // Auto-redirect if already logged in
  useEffect(() => {
    if (currentUser && userRole) {
      navigate(userRole === 'teacher' ? '/teacher/home' : '/student/dashboard', { replace: true });
    }
  }, [currentUser, userRole]);

  const goHome = (r) => navigate(r === 'teacher' ? '/teacher/home' : '/student/dashboard', { replace: true });

  // ── Google ─────────────────────────────────────────────────────────────────
  const handleGoogle = async () => {
    setError(''); setLoading(true);
    try {
      const { user, isNewUser, existingRole } = await signInWithGoogle();
      if (isNewUser) {
        setPending(user);
      } else {
        toast.success(`Welcome back, ${user.displayName?.split(' ')[0] || 'there'}!`);
        goHome(existingRole);
      }
    } catch (err) {
      const msg = handleAuthError(err);
      if (msg) setError(msg);
    } finally {
      setLoading(false);
    }
  };

  const handleRoleSelect = async (selectedRole) => {
    if (!pendingGoogleUser) return;
    setRoleLoading(true);
    try {
      await createUserProfile(
        pendingGoogleUser.uid,
        pendingGoogleUser.email,
        selectedRole,
        pendingGoogleUser.displayName || pendingGoogleUser.email.split('@')[0]
      );
      toast.success('Account created! Welcome to Quizlike.');
      goHome(selectedRole);
    } catch {
      setError('Failed to set up account. Please try again.');
      setPending(null);
    } finally {
      setRoleLoading(false);
    }
  };

  // ── Email sign-in ─────────────────────────────────────────────────────────
  const handleSignIn = async (e) => {
    e.preventDefault();
    if (!email || !password) { setError('Please fill in all fields.'); return; }
    setError(''); setLoading(true);
    try {
      await signInWithEmail(email, password);
      // redirect handled by useEffect
    } catch (err) {
      setError(handleAuthError(err));
    } finally {
      setLoading(false);
    }
  };

  // ── Email sign-up ─────────────────────────────────────────────────────────
  const handleSignUp = async (e) => {
    e.preventDefault();
    if (!email || !password || !name) { setError('Please fill in all fields.'); return; }
    if (!role)  { setError('Please choose Student or Teacher.'); return; }
    if (password.length < 6) { setError('Password must be at least 6 characters.'); return; }
    setError(''); setLoading(true);
    try {
      await signUpWithEmail(email, password, name, role);
      toast.success('Account created! Welcome to Quizlike.');
      goHome(role);
    } catch (err) {
      setError(handleAuthError(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      {pendingGoogleUser && (
        <RoleSelectionModal user={pendingGoogleUser} onSelect={handleRoleSelect} loading={roleLoading} />
      )}

      <div className="relative min-h-screen w-screen flex items-center justify-center bg-[hsl(var(--background))] text-[hsl(var(--foreground))] overflow-hidden p-4">
        {/* Background grid and blobs */}
        <div className="pointer-events-none absolute inset-0 overflow-hidden">
          <div className="absolute inset-0 opacity-[0.03] dark:opacity-[0.05] bg-[linear-gradient(to_right,hsl(var(--foreground))_1px,transparent_1px),linear-gradient(to_bottom,hsl(var(--foreground))_1px,transparent_1px)] bg-[size:3rem_3rem]" />
          <div className="absolute -top-40 -left-40 w-[500px] h-[500px] rounded-full bg-[hsl(var(--primary))]/10 blur-[120px]" />
          <div className="absolute -bottom-40 -right-40 w-[500px] h-[500px] rounded-full bg-[hsl(var(--primary))]/5 blur-[120px]" />
        </div>

        <div className="relative z-10 w-full max-w-md flex flex-col gap-6">

          {/* Logo */}
          <Link to="/" className="flex items-center justify-center gap-2.5">
            <div className="w-10 h-10 rounded-xl bg-[hsl(var(--primary))] flex items-center justify-center text-white font-black text-base shadow-sm">Q</div>
            <span className="text-[hsl(var(--foreground))] font-bold text-2xl tracking-tight">Quizlike</span>
          </Link>

          {/* Card */}
          <Card className="border border-[hsl(var(--border))] bg-[hsl(var(--card))] shadow-sm text-[hsl(var(--foreground))] rounded-2xl overflow-hidden">
            <CardHeader className="pb-4">
              <CardTitle className="text-[hsl(var(--foreground))] text-2xl text-center">
                {tab === 'signin' ? 'Welcome back' : 'Join Quizlike'}
              </CardTitle>
              <CardDescription className="text-[hsl(var(--muted-foreground))] text-center">
                {tab === 'signin'
                  ? 'Sign in to continue your journey'
                  : 'Create your free account today'}
              </CardDescription>
            </CardHeader>

            <CardContent className="flex flex-col gap-4">
              {/* Google */}
              <Button
                variant="outline"
                size="lg"
                onClick={handleGoogle}
                disabled={loading}
                className="w-full font-semibold border border-[hsl(var(--border))] bg-[hsl(var(--muted))]/50 hover:bg-[hsl(var(--muted))]/85 text-[hsl(var(--foreground))] shadow-sm flex items-center justify-center gap-2.5"
              >
                {loading ? (
                  <Loader2 className="w-4 h-4 animate-spin text-[hsl(var(--foreground))]" />
                ) : (
                  <FaGoogle className="text-[#4285f4]" />
                )}
                Continue with Google
              </Button>

              {/* Divider */}
              <div className="flex items-center gap-3">
                <Separator className="flex-1 bg-[hsl(var(--border))]" />
                <span className="text-[hsl(var(--muted-foreground))] text-xs font-medium">or continue with email</span>
                <Separator className="flex-1 bg-[hsl(var(--border))]" />
              </div>

              {/* Form */}
              <form onSubmit={tab === 'signin' ? handleSignIn : handleSignUp} className="flex flex-col gap-3">

                {/* Sign-up extras */}
                <AnimatePresence>
                  {tab === 'signup' && (
                    <motion.div
                      key="signup-fields"
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: 'auto' }}
                      exit={{ opacity: 0, height: 0 }}
                      className="flex flex-col gap-3 overflow-hidden"
                    >
                      {/* Name */}
                      <div className="flex flex-col gap-1.5">
                        <Label className="text-[hsl(var(--muted-foreground))]">Display name</Label>
                        <Input
                          placeholder="Your name"
                          value={name}
                          onChange={e => setName(e.target.value)}
                          className="bg-[hsl(var(--muted))]/30 border-[hsl(var(--border))] text-[hsl(var(--foreground))] placeholder-[hsl(var(--muted-foreground))]/50 focus-visible:border-[hsl(var(--primary))] focus-visible:ring-[hsl(var(--primary))]/20"
                          autoComplete="name"
                        />
                      </div>

                      {/* Role */}
                      <div className="flex flex-col gap-1.5">
                        <Label className="text-[hsl(var(--muted-foreground))]">I am a...</Label>
                        <div className="grid grid-cols-2 gap-2">
                          {[
                            { r: 'student', icon: GraduationCap, label: 'Student' },
                            { r: 'teacher', icon: BookOpen,      label: 'Teacher' },
                          ].map(({ r, icon: Icon, label }) => (
                            <button
                              key={r}
                              type="button"
                              onClick={() => setRole(r)}
                              className={`flex items-center gap-2.5 px-4 py-3 rounded-xl border-2 text-sm font-semibold transition-all cursor-pointer ${
                                role === r
                                  ? 'border-[hsl(var(--primary))] text-[hsl(var(--foreground))] bg-[hsl(var(--primary))]/5'
                                  : 'border-[hsl(var(--border))] text-[hsl(var(--muted-foreground))] hover:border-[hsl(var(--primary))]/50 hover:bg-[hsl(var(--muted))]/50'
                              }`}
                            >
                              <Icon className={`w-4 h-4 ${role === r ? 'text-[hsl(var(--primary))]' : ''}`} />
                              {label}
                              {role === r && <span className="ml-auto text-xs text-[hsl(var(--primary))]">✓</span>}
                            </button>
                          ))}
                        </div>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>

                {/* Email */}
                <div className="flex flex-col gap-1.5">
                  <Label className="text-[hsl(var(--muted-foreground))]">Email</Label>
                  <Input
                    type="email"
                    placeholder="you@example.com"
                    value={email}
                    onChange={e => setEmail(e.target.value)}
                    className="bg-[hsl(var(--muted))]/30 border-[hsl(var(--border))] text-[hsl(var(--foreground))] placeholder-[hsl(var(--muted-foreground))]/50 focus-visible:border-[hsl(var(--primary))] focus-visible:ring-[hsl(var(--primary))]/20"
                    autoComplete="email"
                    required
                  />
                </div>

                {/* Password */}
                <div className="flex flex-col gap-1.5">
                  <Label className="text-[hsl(var(--muted-foreground))]">Password</Label>
                  <div className="relative">
                    <Input
                      type={showPw ? 'text' : 'password'}
                      placeholder={tab === 'signup' ? 'Min. 6 characters' : 'Your password'}
                      value={password}
                      onChange={e => setPassword(e.target.value)}
                      className="bg-[hsl(var(--muted))]/30 border-[hsl(var(--border))] text-[hsl(var(--foreground))] placeholder-[hsl(var(--muted-foreground))]/50 focus-visible:border-[hsl(var(--primary))] focus-visible:ring-[hsl(var(--primary))]/20 pr-10"
                      autoComplete={tab === 'signin' ? 'current-password' : 'new-password'}
                      required
                    />
                    <button
                      type="button"
                      onClick={() => setShowPw(v => !v)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-[hsl(var(--muted-foreground))]/50 hover:text-[hsl(var(--muted-foreground))] transition-colors"
                    >
                      {showPw ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>

                {/* Error */}
                <AnimatePresence>
                  {error && (
                    <motion.p
                      initial={{ opacity: 0, y: -4 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0 }}
                      className="text-red-500 text-sm bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2 text-center"
                    >
                      {error}
                    </motion.p>
                  )}
                </AnimatePresence>

                <Button
                  type="submit"
                  size="lg"
                  variant="default"
                  disabled={loading}
                  className="w-full font-bold bg-[hsl(var(--primary))] text-white hover:bg-[hsl(var(--primary-hover))]"
                >
                  {loading ? (
                    <><Loader2 className="w-4 h-4 animate-spin" /> Processing...</>
                  ) : tab === 'signin' ? (
                    'Sign In'
                  ) : (
                    'Create Account'
                  )}
                </Button>
              </form>

              {/* Tab toggle */}
              <p className="text-center text-[hsl(var(--muted-foreground))] text-sm">
                {tab === 'signin' ? "Don't have an account?" : 'Already have an account?'}{' '}
                <button
                  onClick={() => { setTab(tab === 'signin' ? 'signup' : 'signin'); setError(''); }}
                  className="text-[hsl(var(--primary))] hover:underline font-semibold transition-colors cursor-pointer bg-transparent border-0"
                >
                  {tab === 'signin' ? 'Sign Up Free' : 'Sign In'}
                </button>
              </p>
            </CardContent>
          </Card>

          {/* Back link */}
          <Link to="/" className="flex items-center justify-center gap-1.5 text-[hsl(var(--muted-foreground))]/70 hover:text-[hsl(var(--foreground))] text-sm transition-colors">
            <ArrowLeft className="w-3.5 h-3.5" />
            Back to home
          </Link>
        </div>
      </div>
    </>
  );
};

export default Login;
