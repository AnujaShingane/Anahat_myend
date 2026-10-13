import { useState, useEffect } from 'react';
import { useNavigate, useSearchParams, useLocation, Link } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { apiLogin, BACKEND_URL } from '../../services/api';
import AuthShell, { PasswordInput, GoogleButton } from '../../components/auth/AuthShell';

const INPUT = 'w-full px-5 py-3.5 bg-black/[0.03] border border-black/10 rounded-2xl text-slate-900 placeholder-slate-400 focus:border-[#0F8594]/50 focus:bg-white outline-none transition-all';

// Where each role lands after a successful sign-in. Therapists always go to
// their console — the console itself shows a "not approved yet" banner and
// keeps the tabs locked until Anahat Admin approves them.
export function destinationFor(user) {
  if (user.role === 'therapist') return user.isProfileComplete ? '/therapist' : '/therapist/onboarding-survey';
  if (user.role === 'admin') return '/admin';
  if (user.role === 'caregiver') return '/caregiver-status';
  return user.isProfileComplete ? '/dashboard' : '/onboarding';
}

export default function Login() {
  const [searchParams] = useSearchParams();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();
  const { login } = useAuth();

  useEffect(() => {
    const oauthError = searchParams.get('error');
    if (oauthError === 'google_disabled') setError('Google sign-in isn\u2019t configured on this server yet.');
    else if (oauthError === 'google_not_registered') setError('No account found for that Google account.');
    else if (oauthError === 'google_session') setError('Google sign-in could not start a session. Please try again.');
  }, [searchParams]);

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      // The account's role (patient / therapist / admin) comes from the
      // database — the user never has to say which one they are.
      const user = await apiLogin(email, password);
      login(user);
      navigate(location.state?.from || destinationFor(user), { replace: true });
    } catch (err) {
      setError(err.message || 'Email or password is incorrect.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthShell backTo="/" backLabel="Back to home">
      <header className="text-center mb-6">
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">Sign in</h1>
        <p className="text-slate-500 text-sm mt-1">Enter your email below to sign in to your account</p>
      </header>

      {error && (
        <div className="mb-5 py-3 px-4 rounded-xl bg-red-500/10 border border-red-500/20 text-red-500 text-xs text-center animate-shake">{error}</div>
      )}

      <form onSubmit={submit} className="space-y-5">
        <div className="space-y-1.5">
          <label className="text-sm font-semibold text-slate-700">Email</label>
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} className={INPUT} placeholder="m@example.com" required disabled={loading} autoComplete="email" />
        </div>
        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <label className="text-sm font-semibold text-slate-700">Password</label>
            <button type="button" className="text-xs font-semibold text-slate-500 hover:text-[#0F8594] underline underline-offset-2">Forgot your password?</button>
          </div>
          <PasswordInput value={password} onChange={(e) => setPassword(e.target.value)} disabled={loading} autoComplete="current-password" />
        </div>

        <button type="submit" disabled={loading} className={`btn-sunset w-full py-4 rounded-2xl font-bold uppercase tracking-[0.2em] text-xs ${loading ? 'opacity-70' : ''}`}>
          {loading ? 'Signing in…' : 'Sign in'}
        </button>
      </form>

      <div className="flex items-center gap-4 my-6">
        <div className="h-px flex-1 bg-black/10"></div>
        <span className="text-xs text-slate-400">Or</span>
        <div className="h-px flex-1 bg-black/10"></div>
      </div>

      <GoogleButton onClick={() => { window.location.href = `${BACKEND_URL}/api/auth/google`; }} disabled={loading} label="Login with Google" />

      <p className="mt-7 text-center text-sm text-slate-500">
        Don&apos;t have an account? <Link to="/register" className="font-bold text-[#0F8594] underline underline-offset-2">Sign up</Link>
      </p>
    </AuthShell>
  );
}
