import { normalizeUser } from '../utils/displayName';
import { createContext, useContext, useState, useCallback, useEffect } from 'react';
import { upsertUser, getOrCreatePatientId, apiMe, apiLogout } from '../services/api';

// Roles supported by RBAC. Stored on the user object and mirrored into this
// context so the frontend can gate routes and tailor navigation.
export const ROLES = {
  PATIENT: 'patient',
  THERAPIST: 'therapist',
  ADMIN: 'admin',
  CAREGIVER: 'caregiver',
};

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  // Auth is a session cookie set by the backend, not a token this app
  // manages — `booting` just tracks whether we've finished asking the
  // backend "am I logged in?" once, on first load.
  const [booting, setBooting] = useState(true);

  useEffect(() => {
    let cancelled = false;
    apiMe()
      .then((u) => { if (!cancelled) setUser(normalizeUser(u)); })
      .catch(() => { if (!cancelled) setUser(null); })
      .finally(() => { if (!cancelled) setBooting(false); });
    return () => { cancelled = true; };
  }, []);

  // Called after a successful /auth/signup or /auth/login response. The
  // backend has already set the session cookie; this just updates local
  // state and keeps the shared user directory (read by therapist/admin
  // consoles) in sync. Fire-and-forget: a directory-sync failure shouldn't
  // block the user from reaching the app.
  const login = useCallback((rawUser) => {
    const nextUser = normalizeUser(rawUser);
    setUser(nextUser);
    if (nextUser?.id && nextUser?.role) {
      (async () => {
        try {
          const patientId = nextUser.role === ROLES.PATIENT ? await getOrCreatePatientId(nextUser.id) : undefined;
          await upsertUser({ id: nextUser.id, name: nextUser.name, role: nextUser.role, patientId, email: nextUser.email, picture: nextUser.picture });
        } catch (err) {
          console.error('Failed to sync user directory:', err);
        }
      })();
    }
  }, []);

  // Any API call that comes back 401 drops us straight to logged-out.
  useEffect(() => {
    const onUnauthorized = () => setUser(null);
    window.addEventListener('anahat:unauthorized', onUnauthorized);
    return () => window.removeEventListener('anahat:unauthorized', onUnauthorized);
  }, []);

  const logout = useCallback(() => {
    setUser(null);
    apiLogout().catch((err) => console.error('Logout request failed:', err));
  }, []);

  const value = {
    user,
    role: user?.role || null,
    isAuthenticated: !!user,
    booting,
    login,
    logout,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
