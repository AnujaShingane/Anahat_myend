import { useEffect, useState } from 'react';
import { EmptyState, StatusBadge } from '../../../components/ui/Kit';
import { isAppointmentPast, parseAppointmentDateTime } from '../../../utils/derived';

const FILTERS = [
  { key: 'upcoming', label: 'Upcoming' },
  { key: 'past', label: 'Past' },
  { key: 'completed', label: 'Completed' },
  { key: 'cancelled', label: 'Cancelled' },
];

// A booking is already confirmed once the patient pays — there is no
// separate accept/reject step and no "request" concept on the therapist
// side (the patient chose this therapist and slot directly). The therapist
// can mark a session completed after it happens, or cancel it if needed.
import { useNavigate } from 'react-router-dom';
import { anahat } from '../../../services/api';

export default function AppointmentsTab({ appointments, onComplete, onCancel, onRefresh }) {
  const navigate = useNavigate();
  const [linkFor, setLinkFor] = useState(null);
  const [linkText, setLinkText] = useState('');
  const [linkMsg, setLinkMsg] = useState('');
  const [now, setNow] = useState(new Date());
  const saveLink = (a) => anahat.setMeetLink(a.id, linkText).then(() => { setLinkFor(null); setLinkText(''); setLinkMsg('Link saved and sent to the patient.'); setTimeout(() => setLinkMsg(''), 2500); onRefresh?.(); }).catch((e) => setLinkMsg(e.message));
  const [filter, setFilter] = useState('upcoming');

  useEffect(() => {
    const interval = setInterval(() => setNow(new Date()), 20000);
    return () => clearInterval(interval);
  }, []);

  const active = appointments.filter((a) => a.status === 'confirmed');
  const upcoming = active.filter((a) => !isAppointmentPast(a, now)).sort((a, b) => parseAppointmentDateTime(a) - parseAppointmentDateTime(b));
  const past = active.filter((a) => isAppointmentPast(a, now)).sort((a, b) => parseAppointmentDateTime(b) - parseAppointmentDateTime(a));
  const completed = appointments.filter((a) => a.status === 'completed');
  const cancelled = appointments.filter((a) => a.status === 'cancelled');

  const list = { upcoming, past, completed, cancelled }[filter];

  return (
    <div className="pt-8 space-y-6">
      <div className="td-animate-in">
        <h1 className="font-serif font-bold text-2xl text-slate-900">Appointments</h1>
        <p className="text-slate-500 text-sm mt-1">Sessions patients have booked directly with you.</p>
      </div>

      <div className="portal-page-filters flex gap-1 bg-black/[0.04] rounded-2xl p-1 w-fit">
        {FILTERS.map((f) => (
          <button
            key={f.key}
            onClick={() => setFilter(f.key)}
            className={`td-chip px-4 py-2 rounded-xl text-xs font-bold ${filter === f.key ? 'bg-white shadow-sm text-slate-900' : 'text-slate-500 hover:text-slate-700'}`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {linkMsg && <p className="text-xs font-semibold" style={{ color: '#0F8594' }}>{linkMsg}</p>}
      <div className="td-surface bg-white rounded-2xl border border-black/5 p-6">
        {list.length === 0 ? (
          <EmptyState title={`No ${filter} appointments`} subtitle="Bookings will show up here once patients schedule with you." />
        ) : (
          <div className="space-y-1">
            {list.map((a) => (
              <div key={a.id} className="py-3.5 px-2 -mx-2 rounded-xl border-b last:border-0 border-black/[0.04] hover:bg-black/[0.015] transition-colors duration-200">
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <p className="font-bold text-sm text-slate-800">{a.patientName}</p>
                    <p className="text-xs text-slate-500">{a.date} at {a.startTime}{a.endTime ? `–${a.endTime}` : ''} · <span className="capitalize">{a.mode || 'online'}</span>{a.mode !== 'offline' && (a.meetLink ? ' · Meet link added' : ' · no link yet')}</p>
                  </div>
                  <div className="flex items-center gap-2 flex-wrap justify-end">
                    {filter === 'past' ? <span className="td-chip text-xs font-bold text-slate-500">Past session</span> : a.status === 'completed' ? <span className="td-chip text-xs font-bold text-emerald-700">{a.mode === 'offline' ? 'Attended' : 'Completed'}</span> : <StatusBadge status={a.status} />}
                    {filter === 'upcoming' && a.status === 'confirmed' && (
                      <>
                        {a.mode === 'offline' ? (
                          <button onClick={() => navigate(`/therapist/session/${a.patientId}?appointment=${a.id}&mode=offline`)} className="td-chip text-xs font-bold text-white" style={{ background: '#0F8594' }}>Attend Session</button>
                        ) : (
                          <>
                            <button onClick={() => { setLinkFor(a.id); setLinkText(a.meetLink || ''); }} className="td-chip text-xs font-bold text-slate-700">{a.meetLink ? 'Edit Meet link' : 'Add Meet link'}</button>
                            {a.meetLink && <a href={a.meetLink} target="_blank" rel="noreferrer" className="td-chip text-xs font-bold text-white" style={{ background: '#0F8594' }}>Join Session</a>}
                          </>
                        )}
                        <button onClick={() => onComplete(a.id)} className="td-chip text-xs font-bold text-emerald-600">{a.mode === 'offline' ? 'Mark Attended' : 'Mark Completed'}</button>
                        <button onClick={() => onCancel(a.id)} className="td-chip text-xs font-bold text-red-500">Cancel</button>
                      </>
                    )}
                  </div>
                </div>
                {linkFor === a.id && (
                  <div className="mt-3 flex gap-2 items-center">
                    <input value={linkText} onChange={(e) => setLinkText(e.target.value)} placeholder="https://meet.google.com/xxx-xxxx-xxx" className="flex-1 px-3 py-2 bg-black/[0.03] border border-black/10 rounded-xl text-sm" />
                    <button onClick={() => saveLink(a)} className="px-4 py-2 rounded-xl text-xs font-bold text-white" style={{ background: '#0F8594' }}>Save</button>
                    <button onClick={() => setLinkFor(null)} className="px-3 py-2 text-xs font-bold text-slate-500">Cancel</button>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
