import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { usePatientSession } from '../../hooks/usePatientSession';
import PatientDashboardLayout from '../../components/layout/PatientDashboardLayout';
import { PortalLoading, PortalError } from '../../components/layout/PortalStatus';
import { Card, TEAL, CREAM } from '../../components/ui/PatientKit';
import { getListeningLog, getActivityLog, getWeeklyFeedback, getMyAppointmentsForPatient, getTrackHistory } from '../../services/api';
import { getProgressSummary, getActivityProgressSummary } from '../../utils/derived';

// Progress is built from three things the patient actually does:
// sessions attended, raags listened, and daily activities completed —
// plus how they've been feeling in their weekly check-ins. Nothing here
// asks a question; the check-in lives in Weekly Feedback.
const MOOD_SCORE = { Struggling: 1, Low: 2, Okay: 3, Good: 4, Great: 5 };

const AFFIRMATIONS = [
  'You are not behind. You are exactly where your healing needs you to be.',
  'Every raag you listen to is a conversation with yourself.',
  'Showing up quietly, day after day, is the whole practice.',
  'Progress is a direction, not a speed.',
  'Rest is part of the rhythm, not a break from it.',
  'You have already done the hardest part — you started.',
];

const dayKey = (d) => new Date(d).toISOString().slice(0, 10);

export default function Tracking() {
  const { user, loading, error, reload, logout } = usePatientSession();
  const navigate = useNavigate();
  const [listeningLog, setListeningLog] = useState([]);
  const [activityLog, setActivityLog] = useState([]);
  const [feedback, setFeedback] = useState([]);
  const [appointments, setAppointments] = useState([]);
  const [trackHistory, setTrackHistory] = useState([]);

  useEffect(() => {
    if (!user?.id) return;
    getListeningLog(user.id).then(setListeningLog).catch(() => {});
    getActivityLog(user.id).then(setActivityLog).catch(() => {});
    getWeeklyFeedback(user.id).then(setFeedback).catch(() => {});
    getMyAppointmentsForPatient().then(setAppointments).catch(() => {});
    getTrackHistory(user.id).then(setTrackHistory).catch(() => {});
  }, [user?.id]);

  const music = getProgressSummary(listeningLog);
  const acts = getActivityProgressSummary(activityLog);
  const sessionsDone = appointments.filter((a) => a.status === 'completed').length;
  const sessionsBooked = appointments.filter((a) => !['cancelled'].includes(a.status)).length;
  const ragasListened = new Set([
    ...(listeningLog || []).map((l) => l.trackId || l.trackName || l.date),
    ...(trackHistory || []).flatMap((h) => h.trackIds || []),
  ]).size;

  // Mood trend from weekly check-ins (older → newer).
  const moods = useMemo(() => (feedback || []).map((f) => ({ at: f.submittedAt, score: MOOD_SCORE[f.mood] || 3, label: f.mood })), [feedback]);
  const latest = moods[moods.length - 1];
  const previous = moods[moods.length - 2];
  const delta = latest && previous ? latest.score - previous.score : 0;

  // Overall momentum: last 7 days of listening + activities, on a 0–100 scale.
  const momentum = Math.round(((music.weeklyCompleted + acts.weeklyCompleted) / 14) * 100);

  // 28-day strip of "did something today" days.
  const strip = useMemo(() => {
    const listenDays = new Set(music.qualifyingDates || []);
    const actDays = new Set((activityLog || []).filter((e) => Object.values(e.responses || {}).some(Boolean)).map((e) => e.date));
    const sessionDays = new Set(appointments.filter((a) => a.status === 'completed').map((a) => a.date));
    return [...Array(28)].map((_, i) => {
      const d = new Date(); d.setDate(d.getDate() - (27 - i));
      const k = dayKey(d);
      return { key: k, day: d.getDate(), score: (listenDays.has(k) ? 1 : 0) + (actDays.has(k) ? 1 : 0) + (sessionDays.has(k) ? 1 : 0) };
    });
  }, [music.qualifyingDates, activityLog, appointments]);

  const activeDays = strip.filter((d) => d.score > 0).length;

  if (loading) return <PortalLoading />;
  if (error) return <PortalError message={error} onRetry={reload} onLogout={logout} />;

  const affirmation = AFFIRMATIONS[new Date().getDate() % AFFIRMATIONS.length];

  // Honest, encouraging headline.
  let headline; let sub;
  if (activeDays === 0 && sessionsDone === 0) {
    headline = 'Your journey starts with one listen.';
    sub = 'Nothing logged yet — open the Music Library or book a session and this page starts filling in.';
  } else if (delta > 0) {
    headline = 'You are improving.';
    sub = `Your last check-in moved from ${previous.label} to ${latest.label}. Keep doing what you're doing.`;
  } else if (delta < 0) {
    headline = 'A harder week — and you still showed up.';
    sub = `Your check-in went from ${previous.label} to ${latest.label}. Dips are part of it; your listening streak is ${music.streak} day${music.streak === 1 ? '' : 's'}.`;
  } else if (momentum >= 50) {
    headline = 'Steady and consistent.';
    sub = `${activeDays} active day${activeDays === 1 ? '' : 's'} in the last four weeks. Consistency is what turns raags into relief.`;
  } else {
    headline = 'Building the habit.';
    sub = `${activeDays} active day${activeDays === 1 ? '' : 's'} in the last four weeks. A little more this week and the graph will show it.`;
  }

  return (
    <PatientDashboardLayout active="tracking" user={user} onLogout={logout}>
      <div className="rounded-3xl p-8 md:p-10 mb-6" style={{ background: 'linear-gradient(100deg, #D7E8BE 0%, #EDE9D8 45%, #F5D7B0 90%)' }}>
        <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-slate-500 mb-2">Your progress</p>
        <h1 className="text-3xl md:text-4xl font-bold text-slate-900">{headline}</h1>
        <p className="text-slate-700 mt-3 max-w-2xl">{sub}</p>
        <p className="mt-5 text-sm italic text-slate-600">“{affirmation}”</p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <Stat value={sessionsDone} label="Sessions attended" hint={sessionsBooked > sessionsDone ? `${sessionsBooked - sessionsDone} upcoming` : 'Book your next one'} onClick={() => navigate('/dashboard/appointments')} />
        <Stat value={ragasListened} label="Raags listened" hint={`${music.streak}-day listening streak`} onClick={() => navigate('/consultation/music')} />
        <Stat value={`${acts.weeklyCompleted}/7`} label="Activity days this week" hint={`${acts.streak}-day streak`} onClick={() => navigate('/consultation/activities')} />
        <Stat value={latest ? latest.label : '—'} label="Last check-in" hint={delta > 0 ? '▲ better than last week' : delta < 0 ? '▼ lower than last week' : moods.length > 1 ? 'same as last week' : 'from Weekly Feedback'} onClick={() => navigate('/consultation/feedback')} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-6 mb-6">
        <Card className="p-6 md:p-8">
          <div className="flex items-center justify-between mb-2">
            <h2 className="text-lg font-bold text-slate-900">How you've been feeling</h2>
            <span className="text-xs text-slate-400">from weekly check-ins</span>
          </div>
          {moods.length < 2 ? (
            <p className="text-sm text-slate-500 py-8 text-center">Two weekly check-ins are needed to draw a trend. {moods.length === 1 ? 'One down — one to go.' : 'Your first one takes a minute.'}</p>
          ) : (
            <MoodLine moods={moods} />
          )}
        </Card>

        <Card className="p-6 md:p-8">
          <h2 className="text-lg font-bold text-slate-900 mb-1">Momentum</h2>
          <p className="text-xs text-slate-500 mb-5">Listening + activities, last 7 days</p>
          <div className="flex items-center justify-center">
            <Ring pct={momentum} label={`${momentum}%`} />
          </div>
          <p className="text-xs text-slate-500 text-center mt-4">
            {momentum >= 70 ? 'Excellent rhythm — protect it.' : momentum >= 40 ? 'Good. One more listen this week lifts this.' : 'Start small: one track tonight.'}
          </p>
        </Card>
      </div>

      <Card className="p-6 md:p-8">
        <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
          <h2 className="text-lg font-bold text-slate-900">Last 28 days</h2>
          <span className="text-xs text-slate-500">{activeDays} active day{activeDays === 1 ? '' : 's'} · darker = more done that day</span>
        </div>
        <div className="grid gap-1.5" style={{ gridTemplateColumns: 'repeat(14, minmax(0, 1fr))' }}>
          {strip.map((d) => (
            <div
              key={d.key}
              title={`${d.key}: ${d.score} activit${d.score === 1 ? 'y' : 'ies'}`}
              className="aspect-square rounded-md flex items-center justify-center text-[10px] font-bold"
              style={{ background: ['#EDEBE2', '#BFE0D3', '#7FC4AC', TEAL][d.score], color: d.score >= 2 ? '#fff' : '#64748B' }}
            >
              {d.day}
            </div>
          ))}
        </div>
      </Card>
    </PatientDashboardLayout>
  );
}

function Stat({ value, label, hint, onClick }) {
  return (
    <button type="button" onClick={onClick} className="text-left bg-white rounded-2xl border border-black/5 p-5 hover:border-black/15 transition-colors">
      <p className="text-2xl font-bold text-slate-900">{value}</p>
      <p className="text-xs font-semibold text-slate-600 mt-1">{label}</p>
      <p className="text-[11px] text-slate-400 mt-1">{hint}</p>
    </button>
  );
}

function Ring({ pct, label }) {
  const r = 44; const c = 2 * Math.PI * r;
  return (
    <svg width="120" height="120" viewBox="0 0 120 120">
      <circle cx="60" cy="60" r={r} fill="none" stroke="#EDEBE2" strokeWidth="11" />
      <circle cx="60" cy="60" r={r} fill="none" stroke={TEAL} strokeWidth="11" strokeLinecap="round" strokeDasharray={c} strokeDashoffset={c * (1 - pct / 100)} transform="rotate(-90 60 60)" style={{ transition: 'stroke-dashoffset 0.6s ease' }} />
      <text x="60" y="66" textAnchor="middle" fontSize="20" fontWeight="700" fill="#0f172a">{label}</text>
    </svg>
  );
}

function MoodLine({ moods }) {
  const W = 640; const H = 180; const padL = 70; const padR = 16; const padT = 16; const padB = 30;
  const pts = moods.slice(-8);
  const x = (i) => padL + (i * (W - padL - padR)) / Math.max(1, pts.length - 1);
  const y = (v) => padT + ((5 - v) * (H - padT - padB)) / 4;
  const d = pts.map((p, i) => `${i ? 'L' : 'M'}${x(i)},${y(p.score)}`).join(' ');
  const labels = ['Struggling', 'Low', 'Okay', 'Good', 'Great'];
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label="Weekly mood trend">
      {labels.map((l, i) => (
        <g key={l}>
          <line x1={padL} x2={W - padR} y1={y(i + 1)} y2={y(i + 1)} stroke="#EDEBE2" strokeDasharray="3 4" />
          <text x={padL - 8} y={y(i + 1) + 4} textAnchor="end" fontSize="10" fill="#94A3B8">{l}</text>
        </g>
      ))}
      <path d={d} fill="none" stroke={TEAL} strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" />
      {pts.map((p, i) => (
        <g key={p.at}>
          <circle cx={x(i)} cy={y(p.score)} r="5.5" fill="#fff" stroke={TEAL} strokeWidth="2.5" />
          <text x={x(i)} y={H - 10} textAnchor="middle" fontSize="10" fill="#475569" fontWeight="600">
            {new Date(p.at).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}
          </text>
        </g>
      ))}
    </svg>
  );
}
