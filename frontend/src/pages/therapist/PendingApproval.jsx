import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { apiMe } from '../../services/api';
import { PageShell, Card, PrimaryButton, Badge } from '../../components/ui/Kit';

// Reads the real isApproved flag (via GET /api/auth/me) rather than a
// separately-tracked status — this is the same flag Anahat Admin flips via
// PATCH /api/admin/therapists/:id/approve, so "Check Again" here reflects
// the actual admin decision, not a mirrored copy of it.
export default function PendingApproval() {
  const { user, login, logout } = useAuth();
  const navigate = useNavigate();
  const [checking, setChecking] = useState(false);
  const [checkedOnce, setCheckedOnce] = useState(false);

  const checkStatus = async () => {
    setChecking(true);
    try {
      const fresh = await apiMe();
      login(fresh);
      if (fresh.isApproved) {
        navigate('/therapist', { replace: true });
        return;
      }
    } catch (err) {
      console.error('Failed to refresh approval status:', err);
    } finally {
      setCheckedOnce(true);
      setChecking(false);
    }
  };

  useEffect(() => {
    if (!user?.id) return;
    checkStatus();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  return (
    <PageShell>
      <div className="min-h-screen flex items-center justify-center px-6">
        <Card className="max-w-lg w-full text-center">
          <div className="w-16 h-16 mx-auto mb-6 rounded-full bg-sunset-soft border border-sunset flex items-center justify-center">
            <svg className="w-8 h-8 text-sunset" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <Badge tone="amber" className="mb-4">Awaiting Approval</Badge>
          <h1 className="text-2xl font-serif font-bold mb-3">Your application is under review</h1>
          <p className="text-slate-600 text-sm mb-8 leading-relaxed">
            Thanks for completing your therapist survey. An administrator needs to review and approve your
            account before you can access the therapist console. This usually doesn't take long — check
            back soon, or contact the Anahat team if it's been a while.
          </p>
          <div className="flex justify-center gap-3">
            <button onClick={handleLogout} className="btn-sunset-outline px-6 py-3 rounded-2xl font-bold text-sm">Log Out</button>
            <PrimaryButton onClick={checkStatus} disabled={checking}>{checking ? 'Checking…' : 'Check Again'}</PrimaryButton>
          </div>
          {checkedOnce && !checking && (
            <p className="text-xs text-slate-400 mt-4">Still pending as of your last check.</p>
          )}
        </Card>
      </div>
    </PageShell>
  );
}
