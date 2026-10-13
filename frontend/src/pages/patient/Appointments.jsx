import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { usePatientSession } from '../../hooks/usePatientSession';
import PatientDashboardLayout from '../../components/layout/PatientDashboardLayout';
import { PortalLoading, PortalError } from '../../components/layout/PortalStatus';
import { Card, PrimaryButton, OutlineButton, StatusBadge, EmptyState, CardSkeleton, TEAL } from '../../components/ui/PatientKit';
import { getMyAppointmentsForPatient, updateAppointmentStatus } from '../../services/api';
import { canJoinAppointment, getAppointmentSessionWindow, isAppointmentPast, parseAppointmentDateTime } from '../../utils/derived';
import { formatISTDateTime } from '../../utils/time';

// Appointments are grouped into Upcoming / Completed / Cancelled.
//  • Online → "Join Session" (opens the therapist's Google Meet link; falls
//    back to the in-app session room until a link is added).
//  • Offline → "Attend Session" (in person; no link). The therapist marks it
//    completed afterwards and it moves to Completed as "Attended".
const SECTIONS = [
  { key: 'upcoming', title: 'Upcoming' },
  { key: 'past', title: 'Past' },
  { key: 'completed', title: 'Completed' },
  { key: 'cancelled', title: 'Cancelled' },
];

export default function Appointments() {
  const { user, loading, error, reload, logout } = usePatientSession();
  const navigate = useNavigate();
  const [appointments, setAppointments] = useState(null);
  const [now, setNow] = useState(new Date());
  const [cancellingId, setCancellingId] = useState(null);
  const [query, setQuery] = useState('');

  const refresh = () => {
    if (!user?.id) return;
    getMyAppointmentsForPatient().then(setAppointments).catch((err) => console.error('Failed to load appointments:', err));
  };
  useEffect(() => { refresh(); }, [user?.id]);
  useEffect(() => { const t = setInterval(() => setNow(new Date()), 20000); return () => clearInterval(t); }, []);

  const grouped = useMemo(() => {
    if (!appointments) return null;
    const q = query.trim().toLowerCase();
    const list = [...appointments]
      .filter((a) => !q || [a.therapistName, a.date, a.startTime, a.status, a.mode].some((v) => String(v || '').toLowerCase().includes(q)));
    const active = list.filter((a) => !['cancelled', 'completed'].includes(a.status));
    const up = active.filter((a) => !isAppointmentPast(a, now)).sort((a, b) => parseAppointmentDateTime(a) - parseAppointmentDateTime(b));
    const past = active.filter((a) => isAppointmentPast(a, now)).sort((a, b) => parseAppointmentDateTime(b) - parseAppointmentDateTime(a));
    const done = list.filter((a) => a.status === 'completed').sort((a, b) => parseAppointmentDateTime(b) - parseAppointmentDateTime(a));
    const cancelled = list.filter((a) => a.status === 'cancelled').sort((a, b) => parseAppointmentDateTime(b) - parseAppointmentDateTime(a));
    return { upcoming: up, past, completed: done, cancelled };
  }, [appointments, query, now]);

  if (loading) return <PortalLoading />;
  if (error) return <PortalError message={error} onRetry={reload} onLogout={logout} />;

  const handleCancel = (id) => {
    setCancellingId(id);
    updateAppointmentStatus(id, { status: 'cancelled' }).then(refresh).catch((err) => console.error('Failed to cancel appointment:', err)).finally(() => setCancellingId(null));
  };
  const handleJoin = (appt) => {
    if (appt.mode === 'offline') {
      alert('This is an in-person session — no need to join online. Please arrive at your therapist\u2019s location at the scheduled time.');
      return;
    }
    if (appt.meetLink) { window.open(appt.meetLink, '_blank', 'noopener,noreferrer'); return; }
    alert('Your therapist hasn\u2019t added a meeting link for this session yet. Please check back closer to the appointment time.');
  };

  return (
    <PatientDashboardLayout active="appointments" user={user} onLogout={logout} search={{ placeholder: 'Search appointments by therapist, date or status', value: query, onChange: setQuery }}>
      <div className="mb-6 flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Appointments</h1>
          <p className="text-slate-500 text-sm mt-1">Every session you've booked, in one place.</p>
        </div>
        <PrimaryButton onClick={() => navigate('/dashboard/book-session')} className="!py-2.5">Book Session</PrimaryButton>
      </div>

      {grouped === null ? (
        <div className="space-y-4"><CardSkeleton /><CardSkeleton /></div>
      ) : SECTIONS.map((sec) => {
        const items = grouped[sec.key];
        return (
          <section key={sec.key} className="mb-8">
            <div className="flex items-center gap-3 mb-3">
              <h2 className="text-sm font-bold uppercase tracking-widest text-slate-500">{sec.title}</h2>
              <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-white border border-black/5 text-slate-500">{items.length}</span>
            </div>
            {items.length === 0 ? (
              <Card className="p-5"><p className="text-sm text-slate-400">{sec.key === 'upcoming' ? "Nothing scheduled — book a session when you're ready." : `No ${sec.title.toLowerCase()} sessions.`}</p></Card>
            ) : (
              <div className="space-y-3">
                {items.map((a) => {
                  const offline = a.mode === 'offline';
                  const canJoin = canJoinAppointment(a, now);
                  const { opensAt } = getAppointmentSessionWindow(a);
                  const isActive = sec.key === 'upcoming';
                  return (
                    <Card key={a.id} className="p-5 md:p-6">
                      <div className="flex flex-col md:flex-row md:items-center gap-5">
                        <div className="flex items-center gap-4 flex-1 min-w-0">
                          <div className="w-12 h-12 rounded-full flex items-center justify-center text-white shrink-0" style={{ background: TEAL }}>
                            {offline
                              ? <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M17.657 16.657L13.414 20.9a2 2 0 01-2.828 0l-4.243-4.243a8 8 0 1111.314 0zM15 11a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
                              : <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" /></svg>}
                          </div>
                          <div className="min-w-0">
                            <p className="font-bold text-slate-900 truncate">Session with {a.therapistName}</p>
                            <p className="text-sm text-slate-500 mt-0.5">{a.scheduledAt ? formatISTDateTime(new Date(a.scheduledAt)) : a.slot}{a.endTime ? ` – ${a.endTime}` : ''}</p>
                            <p className="text-xs text-slate-400 mt-1">{offline ? 'Offline · in person at the clinic' : a.meetLink ? 'Online · Google Meet' : 'Online · link will be added by your therapist'}</p>
                          </div>
                        </div>

                        <div className="flex items-center gap-3 shrink-0 flex-wrap">
                          {sec.key === 'completed' ? <span className="px-3 py-1 rounded-full text-[11px] font-bold uppercase tracking-widest bg-emerald-50 text-emerald-700">{offline ? 'Attended' : 'Completed'}</span> : sec.key === 'past' ? <span className="px-3 py-1 rounded-full text-[11px] font-bold uppercase tracking-widest bg-slate-100 text-slate-600">Past session</span> : <StatusBadge status={a.status} />}
                          {isActive && opensAt && (
                            offline ? (
                              <PrimaryButton disabled={!canJoin} onClick={() => handleJoin(a)} className="!py-2 !px-4 text-xs" title={canJoin ? 'Meet your therapist in person now' : 'Opens 5 minutes before your slot'}>
                                Attend Session
                              </PrimaryButton>
                            ) : (
                              <PrimaryButton disabled={!canJoin} onClick={() => handleJoin(a)} className="!py-2 !px-4 text-xs">
                                Join Session
                              </PrimaryButton>
                            )
                          )}
                          {isActive && (
                            <OutlineButton disabled={cancellingId === a.id} onClick={() => handleCancel(a.id)} className="!py-2 !px-4 text-xs !text-red-600 !border-red-200 hover:!bg-red-50">Cancel</OutlineButton>
                          )}
                        </div>
                      </div>
                      {isActive && offline && canJoin && (
                        <p className="mt-3 text-xs text-slate-500">You are in your session window. Please meet your therapist in person — they will mark this session as attended.</p>
                      )}
                    </Card>
                  );
                })}
              </div>
            )}
          </section>
        );
      })}
    </PatientDashboardLayout>
  );
}
