import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { usePatientSession } from '../../hooks/usePatientSession';
import PatientDashboardLayout from '../../components/layout/PatientDashboardLayout';
import { PortalLoading, PortalError } from '../../components/layout/PortalStatus';
import { Card, PrimaryButton, OutlineButton, StatusBadge, CardSkeleton, TEAL, LIME, CREAM } from '../../components/ui/PatientKit';
import {
  getMyAppointmentsForPatient,
} from '../../services/api';
import { canJoinAppointment, getAppointmentSessionWindow, isAppointmentPast, parseAppointmentDateTime } from '../../utils/derived';
import { formatISTDateTime, formatISTTime } from '../../utils/time';
import { getSubscriptionStatus } from '../../services/api';
import PremiumUpsellModal from '../../components/PremiumUpsellModal';

function greeting() {
  const h = new Date().getHours();
  if (h < 12) return 'Wishing you a calm start to your morning.';
  if (h < 17) return 'Hope your day is going gently so far.';
  return 'Take a moment to breathe this evening.';
}

const QUICK_ACTIONS = [
  { key: 'book-session', label: 'Book Session', sub: 'Find an open time', to: '/dashboard/book-session', icon: 'calendar' },
  { key: 'tracking', label: 'Tracking', sub: 'Log how you feel', to: '/dashboard/tracking', icon: 'pulse' },
  { key: 'messages', label: 'Messages', sub: 'Talk to your therapist', to: '/dashboard/messages', icon: 'chat' },
  { key: 'reports', label: 'Reports', sub: 'View your reports', to: '/dashboard/reports', icon: 'doc' },
];

const ICON_PATHS = {
  calendar: 'M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2zM12 13v4m-2-2h4',
  pulse: 'M3 12h4l2-7 4 14 2-7h6',
  chat: 'M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-6l-4 4v-4z',
  doc: 'M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z',
};

export default function Dashboard() {
  const { user, loading, error, reload, logout } = usePatientSession();
  const navigate = useNavigate();
  const [appointments, setAppointments] = useState(null);
  const [now, setNow] = useState(new Date());
  const [showPremiumUpsell, setShowPremiumUpsell] = useState(false);

  useEffect(() => {
    if (!user?.id) return;
    getMyAppointmentsForPatient()
      .then(setAppointments)
      .catch((err) => console.error('Failed to load appointments:', err));
  }, [user?.id]);

  // Show the Premium pop-up once per browser, the first time a Basic-plan
  // patient reaches the dashboard (see General Updates: "Show a pop-up for
  // the Premium Plan.").
  useEffect(() => {
    if (!user?.id) return;
    const seenKey = `anahat_premium_upsell_seen_${user.id}`;
    if (localStorage.getItem(seenKey)) return;
    getSubscriptionStatus(user.id)
      .then((sub) => {
        if (sub?.plan !== 'premium') {
          setShowPremiumUpsell(true);
          localStorage.setItem(seenKey, '1');
        }
      })
      .catch((err) => console.error('Failed to load subscription status:', err));
  }, [user?.id]);

  useEffect(() => {
    const interval = setInterval(() => setNow(new Date()), 20000);
    return () => clearInterval(interval);
  }, []);

  const upcoming = useMemo(() => {
    if (!appointments) return null;
    return appointments
      .filter((a) => a.status !== 'cancelled' && a.status !== 'completed' && !isAppointmentPast(a, now))
      .sort((a, b) => parseAppointmentDateTime(a) - parseAppointmentDateTime(b))[0] || null;
  }, [appointments, now]);

  // Care-journey milestones — derived purely from the patient's real
  // appointment history, never invented.
  const journey = useMemo(() => {
    if (!appointments) return null;
    const completedCount = appointments.filter((a) => a.status === 'completed').length;
    const hasAnyBooking = appointments.some((a) => a.status !== 'cancelled');
    return [
      { label: 'Concern Shared', sub: 'Onboarding complete', state: 'done' },
      { label: 'Session Booked', sub: hasAnyBooking ? 'Time confirmed' : 'Not booked yet', state: hasAnyBooking ? 'done' : 'pending' },
      {
        label: 'First Session',
        sub: completedCount > 0 ? 'Completed' : upcoming ? 'Scheduled' : 'Awaiting booking',
        state: completedCount > 0 ? 'done' : upcoming ? 'active' : 'pending',
      },
      {
        label: 'Ongoing Care',
        sub: completedCount > 1 ? `${completedCount} sessions completed` : completedCount === 1 ? 'Just getting started' : 'Not started',
        state: completedCount > 1 ? 'done' : completedCount === 1 ? 'active' : 'pending',
      },
    ];
  }, [appointments, upcoming]);

  if (loading) return <PortalLoading />;
  if (error) return <PortalError message={error} onRetry={reload} onLogout={logout} />;

  const displayName = user?.first_name || user?.name?.split(' ')?.[0] || user?.full_name?.split(' ')?.[0] || 'there';

  const handleJoin = () => {
    if (!upcoming) return;
    if (upcoming.mode === 'offline') {
      alert('This is an in-person session — no need to join online. Please arrive at your therapist\u2019s location at the scheduled time.');
      return;
    }
    if (!upcoming.meetLink) {
      alert('Your therapist hasn\u2019t added a meeting link for this session yet. Please check back closer to the appointment time.');
      return;
    }
    window.open(upcoming.meetLink, '_blank', 'noopener,noreferrer');
  };

  return (
    <PatientDashboardLayout active="dashboard" user={user} onLogout={logout}>
      {showPremiumUpsell && <PremiumUpsellModal userId={user.id} onClose={() => setShowPremiumUpsell(false)} />}
      {/* Welcome card */}
      <div
        className="rounded-3xl px-6 py-4 md:px-7 md:py-5 mb-6 relative overflow-hidden flex items-center justify-between gap-6 flex-wrap"
        style={{ background: 'linear-gradient(100deg, #D7E8BE 0%, #EDE9D8 45%, #F5D7B0 90%)' }}
      >
        <div>
          <p className="text-xs font-bold uppercase tracking-widest mb-1" style={{ color: TEAL }}>Patient Portal</p>
          <h1 className="text-2xl md:text-3xl font-bold text-slate-900">Welcome, {displayName}</h1>
          <p className="text-slate-600 mt-1 text-sm italic">{greeting()}</p>
        </div>
        <div className="w-12 h-12 rounded-full flex items-center justify-center shrink-0 bg-white/50">
          <svg className="w-6 h-6" style={{ color: TEAL }} fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.25} d="M12 21c-4.5-2.5-8-6-8-10.5A5.5 5.5 0 0112 6a5.5 5.5 0 018 4.5C20 15 16.5 18.5 12 21z" />
          </svg>
        </div>
      </div>

      {/* Quick actions */}
      <div className="mb-6">
        <p className="text-sm font-bold text-slate-700 mb-3">What would you like to do?</p>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {QUICK_ACTIONS.map((a) => (
            <button
              key={a.key}
              onClick={() => navigate(a.to)}
              className="bg-white border border-black/5 rounded-2xl p-5 text-left hover:shadow-md transition-all flex flex-col gap-3"
            >
              <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: CREAM }}>
                <svg className="w-5 h-5" style={{ color: TEAL }} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d={ICON_PATHS[a.icon]} />
                </svg>
              </div>
              <div>
                <p className="text-sm font-bold text-slate-900">{a.label}</p>
                <p className="text-xs text-slate-400 mt-0.5">{a.sub}</p>
              </div>
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-6">
        {/* Upcoming session / book prompt */}
        <div className="lg:col-span-2">
          {appointments === null ? (
            <CardSkeleton className="p-8 h-full" />
          ) : upcoming ? (
            <Card className="p-6 md:p-8 h-full">
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-lg font-bold text-slate-900">Upcoming Session</h2>
                <StatusBadge status={upcoming.status} />
              </div>

              <div className="flex flex-col md:flex-row md:items-center gap-6">
                <div className="flex items-center gap-4 flex-1 min-w-0">
                  <div className="w-14 h-14 rounded-full flex items-center justify-center shrink-0" style={{ background: TEAL }}>
                    <svg className="w-6 h-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                    </svg>
                  </div>
                  <div className="min-w-0">
                    <p className="font-bold text-slate-900 text-base">Session with {upcoming.therapistName}</p>
                    <p className="text-sm text-slate-500 mt-0.5">
                      {upcoming.scheduledAt
                        ? formatISTDateTime(new Date(upcoming.scheduledAt))
                        : upcoming.slot}
                    </p>
                    <p className="text-xs text-slate-400 mt-1 capitalize">{upcoming.mode || 'online'} session</p>
                  </div>
                </div>

                <JoinControl appointment={upcoming} now={now} onJoin={handleJoin} />
              </div>

              <div className="mt-6 pt-5 border-t border-black/5 flex justify-end">
                <OutlineButton onClick={() => navigate('/dashboard/appointments')} className="!py-2 !px-4 text-xs">
                  View All Appointments
                </OutlineButton>
              </div>
            </Card>
          ) : (
            <Card className="p-10 md:p-12 text-center h-full flex flex-col items-center justify-center">
              <div className="w-16 h-16 rounded-full mx-auto mb-5 flex items-center justify-center" style={{ background: LIME }}>
                <svg className="w-8 h-8" style={{ color: TEAL }} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2zM12 13v4m-2-2h4" />
                </svg>
              </div>
              <h2 className="text-xl font-bold text-slate-900 mb-2">You don't have a session booked yet</h2>
              <p className="text-slate-500 text-sm max-w-md mx-auto mb-6">Browse open times and book whenever you're ready.</p>
              <PrimaryButton onClick={() => navigate('/dashboard/book-session')} className="mx-auto">Book a Session</PrimaryButton>
            </Card>
          )}
        </div>

        {/* Care journey sidebar */}
        <Card className="p-6 md:p-8">
          <h2 className="text-base font-bold text-slate-900 mb-5">Your Care Journey</h2>
          {journey === null ? null : (
            <div className="space-y-5">
              {journey.map((step, i) => (
                <div key={step.label} className="flex items-start gap-3">
                  <div className="flex flex-col items-center shrink-0">
                    <div
                      className="w-6 h-6 rounded-full flex items-center justify-center"
                      style={{
                        background: step.state === 'done' ? TEAL : step.state === 'active' ? LIME : CREAM,
                        border: step.state === 'pending' ? '2px solid #E2E0D4' : 'none',
                      }}
                    >
                      {step.state === 'done' && (
                        <svg className="w-3.5 h-3.5 text-white" fill="currentColor" viewBox="0 0 20 20">
                          <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 111.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                        </svg>
                      )}
                    </div>
                    {i < journey.length - 1 && <div className="w-px flex-1 min-h-[24px]" style={{ background: '#E2E0D4' }} />}
                  </div>
                  <div className="pb-1">
                    <p className="text-sm font-bold text-slate-900">{step.label}</p>
                    <p className="text-xs text-slate-400 mt-0.5">{step.sub}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>

      {/* Calming quote strip — static, decorative copy (not patient data) */}
      <div className="rounded-3xl p-6 md:p-8 flex items-center gap-4" style={{ background: CREAM }}>
        <svg className="w-8 h-8 shrink-0" style={{ color: TEAL }} fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.25} d="M12 21c-4.5-2.5-8-6-8-10.5A5.5 5.5 0 0112 6a5.5 5.5 0 018 4.5C20 15 16.5 18.5 12 21z" />
        </svg>
        <p className="text-slate-700 italic text-sm md:text-base">"Healing takes time, and asking for help is a courageous step."</p>
      </div>
    </PatientDashboardLayout>
  );
}

function JoinControl({ appointment, now, onJoin }) {
  const canJoin = canJoinAppointment(appointment, now);
  const { opensAt } = getAppointmentSessionWindow(appointment);

  if (!opensAt) {
    return (
      <div className="shrink-0 text-right">
        <PrimaryButton disabled className="w-full md:w-auto">Join Session</PrimaryButton>
        <p className="text-[11px] text-slate-400 mt-2">Waiting on scheduling confirmation.</p>
      </div>
    );
  }

  return (
    <div className="shrink-0 text-right">
      <PrimaryButton disabled={!canJoin} onClick={onJoin} className="w-full md:w-auto">
        Join Session
      </PrimaryButton>
      <p className="text-[11px] text-slate-400 mt-2">
        {canJoin ? 'You can enter the session now.' : `Opens ${formatISTTime(opensAt)}`}
      </p>
    </div>
  );
}