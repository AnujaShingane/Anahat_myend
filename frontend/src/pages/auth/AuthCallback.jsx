import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { apiMe } from '../../services/api';
import { destinationFor } from './Login';

// Landing point for the backend's Google OAuth redirect. The session cookie
// is already set by the time we land here; this just loads the user and
// routes them exactly like a normal login.
export default function AuthCallback() {
  const navigate = useNavigate();
  const { login } = useAuth();

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const user = await apiMe();
        if (cancelled) return;
        login(user);
        navigate(destinationFor(user), { replace: true });
      } catch {
        if (!cancelled) navigate('/login?error=google_not_registered', { replace: true });
      }
    })();
    return () => { cancelled = true; };
  }, [login, navigate]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#FDF6EE] text-slate-600 text-sm">
      Signing you in…
    </div>
  );
}
