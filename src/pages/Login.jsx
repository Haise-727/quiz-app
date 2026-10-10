import { useEffect, useId, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { toast } from 'sonner';
import { FcGoogle } from 'react-icons/fc';
import { PiArrowLeftBold, PiBookOpenTextBold, PiCheckBold, PiEyeBold, PiEyeSlashBold, PiGraduationCapBold, PiSpinnerGapBold } from 'react-icons/pi';
import { handleAuthError, useAuth } from '@/contexts/AuthContext';
import PublicNav from '@/components/layout/PublicNav';
import { Button } from '@/components/ui/button';
import { ease, rise, spring, stagger } from '@/lib/motion';

const ROLES = [
  { id: 'student', label: 'Student', hint: 'Take quizzes, earn XP', Icon: PiGraduationCapBold },
  { id: 'teacher', label: 'Teacher', hint: 'Build and host quizzes', Icon: PiBookOpenTextBold },
];

/** Two options side by side: a hairline box, with the chosen one outlined in ink. */
function RolePicker({ value, onChange, disabled }) {
  return (
    <div role="radiogroup" aria-label="I am a" className="grid grid-cols-2 gap-3">
      {ROLES.map(({ id, label, hint, Icon }) => {
        const on = value === id;
        return (
          <motion.button
            key={id}
            type="button"
            role="radio"
            aria-checked={on}
            disabled={disabled}
            whileTap={{ scale: 0.97 }}
            transition={spring}
            onClick={() => onChange(id)}
            className={`relative flex cursor-pointer flex-col items-start gap-3 rounded-xl border p-4 text-left outline-none transition-colors focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring))] disabled:opacity-50 ${on ? 'border-[hsl(var(--ink))]' : 'border-[hsl(var(--border))] hover:border-[hsl(var(--input))]'}`}
          >
            <Icon className={`h-5 w-5 ${on ? 'text-[hsl(var(--foreground))]' : 'text-[hsl(var(--muted-foreground))]'}`} />
            <span>
              <span className="block text-sm font-medium">{label}</span>
              <span className="mt-0.5 block text-xs text-[hsl(var(--muted-foreground))]">{hint}</span>
            </span>
            <AnimatePresence>
              {on && (
                <motion.span initial={{ scale: 0 }} animate={{ scale: 1 }} exit={{ scale: 0 }} transition={spring} className="absolute right-3 top-3 grid h-5 w-5 place-items-center rounded-full bg-[hsl(var(--ink))] text-[hsl(var(--ink-foreground))]">
                  <PiCheckBold className="h-3 w-3" />
                </motion.span>
              )}
            </AnimatePresence>
          </motion.button>
        );
      })}
    </div>
  );
}

/** A label above a field that is only an underline, so a form is a column of lines, not boxes. */
function Field({ label, trailing, ...input }) {
  const id = useId();
  return (
    <div>
      <label htmlFor={id} className="eyebrow">{label}</label>
      <div className="mt-1 flex items-center gap-2 border-b-2 border-[hsl(var(--input))] transition-colors focus-within:border-[hsl(var(--ink))]">
        <input id={id} {...input} className="min-w-0 flex-1 bg-transparent py-2.5 text-base outline-none placeholder:text-[hsl(var(--muted-foreground))]/50" />
        {trailing}
      </div>
    </div>
  );
}

export default function Login() {
  const [searchParams] = useSearchParams();
  const [tab, setTab] = useState(searchParams.get('tab') === 'signup' ? 'signup' : 'signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [role, setRole] = useState(searchParams.get('role') || '');
  const [showPw, setShowPw] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [pendingGoogleUser, setPending] = useState(null);
  const [roleLoading, setRoleLoading] = useState(false);

  const { signInWithGoogle, signInWithEmail, signUpWithEmail, createUserProfile, currentUser, userRole } = useAuth();
  const navigate = useNavigate();
  const goHome = (r) => navigate(r === 'teacher' ? '/teacher/home' : '/student/dashboard', { replace: true });
  const signup = tab === 'signup';

  // Someone who is already signed in has no use for this page.
  useEffect(() => {
    if (currentUser && userRole) navigate(userRole === 'teacher' ? '/teacher/home' : '/student/dashboard', { replace: true });
  }, [currentUser, userRole, navigate]);

  const handleGoogle = async () => {
    setError(''); setLoading(true);
    try {
      const { user, isNewUser, existingRole } = await signInWithGoogle();
      if (isNewUser) {
        setPending(user);
      } else {
        toast.success(`Welcome back, ${user.displayName?.split(' ')[0] || 'there'}`);
        goHome(existingRole);
      }
    } catch (err) {
      const msg = handleAuthError(err);
      if (msg) setError(msg);
    } finally {
      setLoading(false);
    }
  };

  // A new Google account has no role yet, so ask before creating the profile.
  const handleRoleSelect = async (selectedRole) => {
    if (!pendingGoogleUser) return;
    setRoleLoading(true);
    try {
      await createUserProfile(pendingGoogleUser.uid, pendingGoogleUser.email, selectedRole, pendingGoogleUser.displayName || pendingGoogleUser.email.split('@')[0]);
      toast.success('Account created. Welcome to Quizlike.');
      goHome(selectedRole);
    } catch {
      setError('We could not set up your account. Please try again.');
      setPending(null);
    } finally {
      setRoleLoading(false);
    }
  };

  const submit = async (e) => {
    e.preventDefault();
    if (signup) {
      if (!email || !password || !name) { setError('Fill in every field.'); return; }
      if (!role) { setError('Choose Student or Teacher.'); return; }
      if (password.length < 6) { setError('Your password needs at least 6 characters.'); return; }
    } else if (!email || !password) { setError('Enter your email and password.'); return; }
    setError(''); setLoading(true);
    try {
      if (signup) {
        await signUpWithEmail(email, password, name, role);
        toast.success('Account created. Welcome to Quizlike.');
        goHome(role);
      } else {
        await signInWithEmail(email, password);   // the effect above does the redirect
      }
    } catch (err) {
      setError(handleAuthError(err));
    } finally {
      setLoading(false);
    }
  };

  const switchTab = () => { setTab(signup ? 'signin' : 'signup'); setError(''); };

  return (
    <div className="min-h-dvh bg-[hsl(var(--background))] text-[hsl(var(--foreground))]">
      <PublicNav bare />

      <main className="mx-auto grid max-w-6xl grid-cols-1 gap-16 px-5 pb-20 pt-12 sm:px-8 lg:grid-cols-[1fr_28rem] lg:items-center lg:pt-24">
        <div className="hidden lg:block">
          <p className="eyebrow">{signup ? 'Create an account' : 'Welcome back'}</p>
          <h1 className="text-hero mt-5 text-7xl leading-[0.98]">{signup ? 'Start with a first quiz.' : 'Your streak is waiting.'}</h1>
          <p className="mt-6 max-w-sm text-lg text-[hsl(var(--muted-foreground))]">
            {signup ? 'Free for students and teachers. Takes a minute.' : 'Pick up where you left off: your level, your badges and your results.'}
          </p>
        </div>

        <motion.div variants={stagger(0.05)} initial="hidden" animate="show" className="w-full max-w-md justify-self-center lg:justify-self-end">
          <motion.h1 variants={rise} className="text-hero text-5xl leading-none lg:hidden">{signup ? 'Create an account' : 'Welcome back'}</motion.h1>

          <motion.div variants={rise} className="mt-8 lg:mt-0">
            <Button type="button" variant="outline" size="xl" className="w-full" onClick={handleGoogle} disabled={loading}>
              {loading ? <PiSpinnerGapBold className="animate-spin" /> : <FcGoogle className="!size-5" />}
              Continue with Google
            </Button>
          </motion.div>

          <motion.div variants={rise} className="my-7 flex items-center gap-4 text-xs text-[hsl(var(--muted-foreground))]">
            <span className="h-px flex-1 bg-[hsl(var(--border))]" />or with email<span className="h-px flex-1 bg-[hsl(var(--border))]" />
          </motion.div>

          <motion.form variants={rise} onSubmit={submit} noValidate className="flex flex-col gap-6">
            <AnimatePresence initial={false}>
              {signup && (
                <motion.div key="extras" initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} transition={{ duration: 0.28, ease }} className="-mx-1 overflow-hidden px-1">
                  <div className="flex flex-col gap-6 pb-1">
                    <Field label="Display name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Your name" autoComplete="name" />
                    <div>
                      <p className="eyebrow mb-2">I am a</p>
                      <RolePicker value={role} onChange={setRole} disabled={loading} />
                    </div>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            <Field label="Email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" autoComplete="email" />
            <Field
              label="Password"
              type={showPw ? 'text' : 'password'}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder={signup ? 'At least 6 characters' : 'Your password'}
              autoComplete={signup ? 'new-password' : 'current-password'}
              trailing={
                <button type="button" onClick={() => setShowPw((v) => !v)} aria-label={showPw ? 'Hide password' : 'Show password'} className="grid h-8 w-8 cursor-pointer place-items-center rounded-md text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))]">
                  {showPw ? <PiEyeSlashBold className="h-4 w-4" /> : <PiEyeBold className="h-4 w-4" />}
                </button>
              }
            />

            <AnimatePresence>
              {error && (
                <motion.p key={error} role="alert" initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="-mt-2 rounded-lg bg-[hsl(var(--tint-red))] px-3 py-2 text-sm text-[hsl(var(--tint-red-fg))]">
                  {error}
                </motion.p>
              )}
            </AnimatePresence>

            <Button type="submit" size="xl" disabled={loading} className="w-full">
              {loading ? <><PiSpinnerGapBold className="animate-spin" /> Working</> : signup ? 'Create account' : 'Sign in'}
            </Button>
          </motion.form>

          <motion.p variants={rise} className="mt-7 text-sm text-[hsl(var(--muted-foreground))]">
            {signup ? 'Already have an account?' : 'New to Quizlike?'}{' '}
            <button type="button" onClick={switchTab} className="cursor-pointer font-medium text-[hsl(var(--foreground))] underline underline-offset-4">{signup ? 'Sign in' : 'Create an account'}</button>
          </motion.p>
          <motion.div variants={rise} className="mt-10">
            <Link to="/" className="inline-flex items-center gap-1.5 text-sm text-[hsl(var(--muted-foreground))] transition-colors hover:text-[hsl(var(--foreground))]"><PiArrowLeftBold className="h-3.5 w-3.5" /> Back to home</Link>
          </motion.div>
        </motion.div>
      </main>

      {/* New Google accounts choose a role before anything is created. */}
      <AnimatePresence>
        {pendingGoogleUser && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-50 grid place-items-center bg-[hsl(var(--background))]/80 p-5 backdrop-blur-md" role="dialog" aria-modal="true" aria-label="Choose your role">
            <motion.div initial={{ opacity: 0, y: 16, scale: 0.98 }} animate={{ opacity: 1, y: 0, scale: 1 }} transition={spring} className="w-full max-w-md rounded-2xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-7">
              <p className="eyebrow">One last step</p>
              <h2 className="text-hero mt-3 text-4xl">How will you use Quizlike, {pendingGoogleUser.displayName?.split(' ')[0] || 'friend'}?</h2>
              <div className="mt-6">
                <RolePicker value="" onChange={handleRoleSelect} disabled={roleLoading} />
              </div>
              {roleLoading && <p className="mt-4 flex items-center gap-2 text-sm text-[hsl(var(--muted-foreground))]"><PiSpinnerGapBold className="animate-spin" /> Setting up your account</p>}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
