import { useCallback, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

// Single source of truth for "who is the logged-in patient" + logout, shared
// by every page built on PatientDashboardLayout (Dashboard, Reports, Profile,
// Settings). Thin wrapper around AuthContext (the real /api/auth/me + cookie
// session) so existing pages built against this hook's shape keep working.
export function usePatientSession() {
  const { user, booting, logout: authLogout } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (!booting && !user) navigate('/login');
  }, [booting, user, navigate]);

  const logout = useCallback(() => {
    authLogout();
    localStorage.removeItem('resumeSessionId');
    navigate('/login');
  }, [authLogout, navigate]);

  return { user, loading: booting, error: null, reload: () => {}, logout };
}
