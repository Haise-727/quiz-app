import { useEffect, useRef, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { finishGoogleSignIn } from '@/api/auth';
import { handleAuthError } from '@/contexts/AuthContext';

/**
 * Where Google (through Cognito) sends the person back to. The address carries a one time code in the query string.
 * This page trades it for a session and then moves on to /login, which asks a brand new person for their role
 * and sends everyone else home. Only the AWS version uses this page.
 */
export default function AuthCallback() {
  const { search } = useLocation();
  const navigate = useNavigate();
  const [error, setError] = useState('');
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return;      // React runs effects twice in development, and a code works only once
    started.current = true;
    finishGoogleSignIn(search)
      .then(() => navigate('/login?google=1', { replace: true }))
      .catch((err) => setError(handleAuthError(err) || 'Google sign in was cancelled.'));
  }, [search, navigate]);

  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-4 bg-[hsl(var(--background))] px-6 text-center text-[hsl(var(--foreground))]">
      {error ? (
        <>
          <p role="alert" className="max-w-sm text-base">{error}</p>
          <Link to="/login" className="underline">Back to sign in</Link>
        </>
      ) : (
        <>
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-[hsl(var(--border))] border-t-[hsl(var(--ink))]" role="status" aria-label="Signing you in" />
          <p className="text-sm text-[hsl(var(--muted-foreground))]">Signing you in</p>
        </>
      )}
    </main>
  );
}
