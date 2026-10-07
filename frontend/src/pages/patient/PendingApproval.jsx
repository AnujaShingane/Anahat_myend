import { useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { usePatientSession } from '../../hooks/usePatientSession';
import { getPatientOnboarding } from '../../services/api';

const TEAL = '#0F8594';
const CREAM = '#F6F4EC';

export default function PendingApproval() {
  const navigate = useNavigate();
  const { user } = usePatientSession();
  const intervalRef = useRef(null);

  // Poll the onboarding record so the patient is moved forward automatically
  // the moment a therapist approves or rejects the request, without needing
  // to refresh or log back in.
  useEffect(() => {
    if (!user?.id) return;
    let cancelled = false;
    const check = () => {
      getPatientOnboarding(user.id)
        .then((data) => {
          if (cancelled) return;
          if (data?.status === 'approved') navigate('/dashboard', { replace: true });
          if (data?.status === 'rejected') navigate('/onboarding', { replace: true });
        })
        .catch((err) => console.error('Failed to check onboarding status:', err));
    };
    check();
    intervalRef.current = setInterval(check, 3000);
    return () => { cancelled = true; clearInterval(intervalRef.current); };
  }, [user?.id, navigate]);

  return (
    <div className="min-h-screen flex items-center justify-center px-6" style={{ background: 'linear-gradient(160deg, #F6F1E4 0%, #FBF7EC 40%, #FDF3E4 100%)' }}>
      <div className="max-w-md w-full bg-white rounded-[28px] shadow-sm border border-black/5 p-10 text-center">
        <div className="w-16 h-16 rounded-full mx-auto mb-6 flex items-center justify-center" style={{ background: CREAM }}>
          <svg className="w-8 h-8 animate-pulse" style={{ color: TEAL }} fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        </div>
        <h1 className="text-xl font-bold text-slate-900 mb-2">Your account is awaiting approval</h1>
        <p className="text-sm text-slate-500 leading-relaxed">
          Thank you for submitting your details. A therapist is reviewing your information and identity proof.
          You'll be able to access your dashboard as soon as your account is approved.
        </p>
        <p className="text-xs text-slate-400 mt-6">This page will update automatically — no need to refresh.</p>
      </div>
    </div>
  );
}