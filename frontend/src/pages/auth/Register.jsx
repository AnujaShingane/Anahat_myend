import { useState, useEffect } from 'react';
import { useNavigate, useSearchParams, Link } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { apiSignup, BACKEND_URL } from '../../services/api';
import AuthShell, { RoleTabs, PasswordInput, GoogleButton } from '../../components/auth/AuthShell';

const INPUT = 'w-full px-5 py-3.5 bg-black/[0.03] border border-black/10 rounded-2xl text-slate-900 placeholder-slate-400 focus:border-[#0F8594]/50 focus:bg-white outline-none transition-all';
const STRONG_PASSWORD = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z0-9]).{8,}$/;

// After sign-up: patients fill the demographic form, then the consent form,
// then land on their dashboard. Therapists fill their profile form and go
// straight to their console (locked until an admin approves them).
const SIGNUP_DESTINATIONS = {
  patient: '/onboarding',
  therapist: '/therapist/onboarding-survey',
};

export default function Register() {
  const [searchParams] = useSearchParams();
  const [role, setRole] = useState(searchParams.get('role') === 'therapist' ? 'therapist' : 'patient');
  const [form, setForm] = useState({ name: '', email: '', password: '', confirmPassword: '' });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();
  const { login } = useAuth();

  useEffect(() => {
    if (searchParams.get('error') === 'invalid_role') {
      setError('Choose Patient or Therapist before signing up with Google.');
    }
  }, [searchParams]);

  const update = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }));

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    if (!form.name.trim() || !form.email || !form.password || !form.confirmPassword) { setError('All fields are required.'); return; }
    if (form.password !== form.confirmPassword) { setError('Passwords do not match.'); return; }
    if (!STRONG_PASSWORD.test(form.password)) { setError('Password needs 8+ characters with uppercase, lowercase, a number, and a special character.'); return; }

    const [firstName, ...rest] = form.name.trim().split(/\s+/);
    setLoading(true);
    try {
      const user = await apiSignup({
        firstName, lastName: rest.join(' '),
        email: form.email, password: form.password, confirmPassword: form.confirmPassword,
        role, accountType: 'self',
      });
      login(user);
      navigate(SIGNUP_DESTINATIONS[role], { replace: true });
    } catch (err) {
      setError(err.message || 'Something went wrong during registration.');
      setLoading(false);
    }
  };

  return (
    <AuthShell backTo="/" backLabel="Back to home">
      <header className="text-center mb-6">
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">Create an account</h1>
        <p className="text-slate-500 text-sm mt-1">Enter your details below to create your account</p>
      </header>

      <RoleTabs role={role} onChange={(r) => { setRole(r); setError(''); }} />

      {error && (
        <div className="mb-5 py-3 px-4 rounded-xl bg-red-500/10 border border-red-500/20 text-red-500 text-xs text-center animate-shake">{error}</div>
      )}

      <form onSubmit={submit} className="space-y-4">
        <div className="space-y-1.5">
          <label className="text-sm font-semibold text-slate-700">Name</label>
          <input type="text" value={form.name} onChange={update('name')} className={INPUT} placeholder="John Doe" disabled={loading} autoComplete="name" />
        </div>
        <div className="space-y-1.5">
          <label className="text-sm font-semibold text-slate-700">Email</label>
          <input type="email" value={form.email} onChange={update('email')} className={INPUT} placeholder="m@example.com" disabled={loading} autoComplete="email" />
        </div>
        <div className="space-y-1.5">
          <label className="text-sm font-semibold text-slate-700">Password</label>
          <PasswordInput value={form.password} onChange={update('password')} disabled={loading} autoComplete="new-password" />
        </div>
        <div className="space-y-1.5">
          <label className="text-sm font-semibold text-slate-700">Confirm password</label>
          <PasswordInput value={form.confirmPassword} onChange={update('confirmPassword')} disabled={loading} autoComplete="new-password" />
          <p className="text-[11px] text-slate-400">8+ characters, with uppercase, lowercase, a number and a special character.</p>
        </div>

        <button type="submit" disabled={loading} className={`btn-sunset w-full py-4 mt-2 rounded-2xl font-bold uppercase tracking-[0.2em] text-xs ${loading ? 'opacity-70' : ''}`}>
          {loading ? 'Creating account…' : 'Sign up'}
        </button>
      </form>

      <div className="flex items-center gap-4 my-6">
        <div className="h-px flex-1 bg-black/10"></div>
        <span className="text-xs text-slate-400">Or</span>
        <div className="h-px flex-1 bg-black/10"></div>
      </div>

      <GoogleButton onClick={() => { window.location.href = `${BACKEND_URL}/api/auth/google?role=${encodeURIComponent(role)}`; }} disabled={loading} label="Sign up with Google" />

      <p className="mt-7 text-center text-sm text-slate-500">
        Already have an account? <Link to="/login" className="font-bold text-[#0F8594] underline underline-offset-2">Sign in</Link>
      </p>
    </AuthShell>
  );
}
