import React, { createContext, useContext, useState, useEffect } from 'react';
import {
  watchAuth, signInWithGoogle as googleSignIn, signInWithEmail as emailSignIn,
  createEmailAccount, setAuthDisplayName, signOutUser,
} from '@/api/auth';
import { getUserProfile, createUserProfile as saveUserProfile, updateUserProfile } from '@/api/users';

const AuthContext = createContext();

export function useAuth() {
  return useContext(AuthContext);
}

export function AuthProvider({ children }) {
  const [currentUser, setCurrentUser] = useState(null);
  const [userRole, setUserRole] = useState(null);       // 'teacher' | 'student' | null
  const [displayName, setDisplayName] = useState(null);
  const [loading, setLoading] = useState(true);         // true until first auth check completes
  const [roleLoaded, setRoleLoaded] = useState(false);  // true once Firestore doc has been read

  // ── Profile helpers ─────────────────────────────────────────────────────

  async function fetchUserData(uid) {
    try {
      const data = await getUserProfile(uid);
      if (data) {
        setUserRole(data.role ?? null);
        setDisplayName(data.displayName ?? null);
        // Fire-and-forget lastActive update
        updateUserProfile(uid, { lastActive: new Date().toISOString() }).catch(() => {});
        return data;
      }
      // Doc doesn't exist yet (new social user before role selection)
      setUserRole(null);
      return null;
    } catch (err) {
      console.error('fetchUserData error:', err);
      setUserRole(null);
      return null;
    } finally {
      setRoleLoaded(true);
    }
  }

  async function createUserProfile(uid, email, role, name) {
    const profile = await saveUserProfile(uid, { email, role, displayName: name });
    setUserRole(role);
    setDisplayName(name);
    setRoleLoaded(true);
    return profile;
  }

  // ── Auth methods ──────────────────────────────────────────────────────────

  /** Google sign-in. Returns { user, isNewUser, existingRole } */
  async function signInWithGoogle() {
    const user = await googleSignIn();
    const profile = await getUserProfile(user.uid);
    return {
      user,
      isNewUser: !profile,
      existingRole: profile ? profile.role : null,
    };
  }

  async function signInWithEmail(email, password) {
    return emailSignIn(email, password);
  }

  /** Email sign-up — requires role */
  async function signUpWithEmail(email, password, name, role) {
    const cred = await createEmailAccount(email, password, name);
    await createUserProfile(cred.user.uid, email, role, name || email.split('@')[0]);
    return cred;
  }

  async function updateDisplayName(name) {
    if (!currentUser) return;
    await setAuthDisplayName(currentUser, name);
    await updateUserProfile(currentUser.uid, { displayName: name });
    setDisplayName(name);
  }

  async function switchRole(newRole) {
    if (!currentUser) return;
    await updateUserProfile(currentUser.uid, { role: newRole });
    setUserRole(newRole);
  }

  async function handleSignOut() {
    await signOutUser();
    setUserRole(null);
    setDisplayName(null);
    setCurrentUser(null);
    setRoleLoaded(false);
  }

  // ── Auth state listener ───────────────────────────────────────────────────

  useEffect(() => {
    const unsubscribe = watchAuth(async (user) => {
      setCurrentUser(user);
      if (user) {
        await fetchUserData(user.uid);   // sets userRole + roleLoaded
      } else {
        setUserRole(null);
        setDisplayName(null);
        setRoleLoaded(true);             // no user → nothing to load
      }
      setLoading(false);
    });
    return unsubscribe;
  }, []);

  // ─────────────────────────────────────────────────────────────────────────

  const value = {
    currentUser,
    userRole,
    displayName,
    loading,
    roleLoaded,   // ← expose so ProtectedRoute can distinguish "loading role" vs "no role"
    signInWithGoogle,
    signInWithEmail,
    signUpWithEmail,
    createUserProfile,
    updateDisplayName,
    switchRole,
    signOut: handleSignOut,
    fetchUserData,
  };

  // Don't render children until the first auth check is complete
  return (
    <AuthContext.Provider value={value}>
      {!loading && children}
    </AuthContext.Provider>
  );
}

// Kept here so existing imports keep working; the code lives with the other sign in code.
export { handleAuthError } from '@/api/auth';
