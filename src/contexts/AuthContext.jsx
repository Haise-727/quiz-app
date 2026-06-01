import React, { createContext, useContext, useState, useEffect } from 'react';
import { auth, db, googleProvider } from '../firebase';
import {
  onAuthStateChanged,
  signOut,
  signInWithPopup,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  updateProfile,
} from 'firebase/auth';
import { doc, getDoc, setDoc, updateDoc } from 'firebase/firestore';

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

  // ── Firestore helpers ─────────────────────────────────────────────────────

  async function fetchUserData(uid) {
    try {
      const snap = await getDoc(doc(db, 'users', uid));
      if (snap.exists()) {
        const data = snap.data();
        setUserRole(data.role ?? null);
        setDisplayName(data.displayName ?? null);
        // Fire-and-forget lastActive update
        updateDoc(doc(db, 'users', uid), { lastActive: new Date().toISOString() }).catch(() => {});
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
    const profile = {
      email,
      role,
      displayName: name,
      createdAt: new Date().toISOString(),
      lastActive: new Date().toISOString(),
    };
    await setDoc(doc(db, 'users', uid), profile);
    setUserRole(role);
    setDisplayName(name);
    setRoleLoaded(true);
    return profile;
  }

  // ── Auth methods ──────────────────────────────────────────────────────────

  /** Google sign-in. Returns { user, isNewUser, existingRole } */
  async function signInWithGoogle() {
    const result = await signInWithPopup(auth, googleProvider);
    const user = result.user;
    const snap = await getDoc(doc(db, 'users', user.uid));
    return {
      user,
      isNewUser: !snap.exists(),
      existingRole: snap.exists() ? snap.data().role : null,
    };
  }

  async function signInWithEmail(email, password) {
    return signInWithEmailAndPassword(auth, email, password);
  }

  /** Email sign-up — requires role */
  async function signUpWithEmail(email, password, name, role) {
    const cred = await createUserWithEmailAndPassword(auth, email, password);
    await updateProfile(cred.user, { displayName: name || email.split('@')[0] });
    await createUserProfile(cred.user.uid, email, role, name || email.split('@')[0]);
    return cred;
  }

  async function updateDisplayName(name) {
    if (!currentUser) return;
    await updateProfile(currentUser, { displayName: name });
    await updateDoc(doc(db, 'users', currentUser.uid), { displayName: name });
    setDisplayName(name);
  }

  async function switchRole(newRole) {
    if (!currentUser) return;
    await updateDoc(doc(db, 'users', currentUser.uid), { role: newRole });
    setUserRole(newRole);
  }

  async function handleSignOut() {
    await signOut(auth);
    setUserRole(null);
    setDisplayName(null);
    setCurrentUser(null);
    setRoleLoaded(false);
  }

  // ── Auth state listener ───────────────────────────────────────────────────

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
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

export function handleAuthError(error) {
  switch (error?.code) {
    case 'auth/user-not-found':
    case 'auth/wrong-password':
    case 'auth/invalid-credential': return 'Incorrect email or password.';
    case 'auth/email-already-in-use': return 'An account with this email already exists.';
    case 'auth/weak-password': return 'Password must be at least 6 characters.';
    case 'auth/invalid-email': return 'Please enter a valid email address.';
    case 'auth/too-many-requests': return 'Too many attempts. Please try again later.';
    case 'auth/popup-closed-by-user': return null; // user cancelled, no error message needed
    default: return error?.message || 'Something went wrong. Please try again.';
  }
}
