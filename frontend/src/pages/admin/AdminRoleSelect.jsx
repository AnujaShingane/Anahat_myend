import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { PageShell, Card } from '../../components/ui/Kit';

// The app's auth model has a single 'admin' role (see AuthContext.jsx /
// RoleProtectedRoute.jsx) — there is no separate technical-admin /
// anahat-admin account type, and per the brief, authentication logic is not
// being changed. So /admin becomes a lightweight console picker: any
// authenticated admin chooses which operational console to enter, and each
// console is its own RoleProtectedRoute-guarded route underneath.
export default function AdminRoleSelect() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  return (
    <PageShell>
      <div className="max-w-4xl mx-auto px-6 py-16">
        <div className="flex items-center justify-between mb-10">
          <div>
            <span className="text-[11px] font-bold uppercase tracking-widest text-sunset">Admin Access</span>
            <h1 className="text-3xl font-serif font-bold text-slate-900 mt-1">Welcome, {user?.name || 'Admin'}</h1>
            <p className="text-slate-500 mt-1">Choose which console you need.</p>
          </div>
          <button onClick={logout} className="text-xs font-bold uppercase tracking-widest text-slate-500 hover:text-sunset">Logout</button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <Card className="!p-8 flex flex-col">
            <h2 className="text-xl font-serif font-bold text-slate-900 mb-2">Technical Admin</h2>
            <p className="text-sm text-slate-600 mb-6 flex-1">
              Application-level administration: user accounts, therapist directory, system configuration,
              analytics, audit logs, notifications, and feedback/bug reports.
            </p>
            <button
              onClick={() => navigate('/technical-admin/dashboard')}
              className="btn-sunset px-6 py-3.5 rounded-2xl font-bold text-sm"
            >
              Enter Technical Admin
            </button>
          </Card>

          <Card className="!p-8 flex flex-col">
            <h2 className="text-xl font-serif font-bold text-slate-900 mb-2">Anahat Admin</h2>
            <p className="text-sm text-slate-600 mb-6 flex-1">
              Operational administration: approve therapists, assign patients to therapists,
              monitor appointments, sessions, messages, and clinical reports.
            </p>
            <button
              onClick={() => navigate('/anahat-admin/dashboard')}
              className="btn-sunset px-6 py-3.5 rounded-2xl font-bold text-sm"
            >
              Enter Anahat Admin
            </button>
          </Card>
        </div>
      </div>
    </PageShell>
  );
}
