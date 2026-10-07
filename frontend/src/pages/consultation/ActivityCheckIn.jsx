import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { getActivityPlan, getActivityLog, submitActivityCheckIn } from '../../services/api';
import { isActivityCheckInDoneToday, getActivityProgressSummary } from '../../utils/derived';
import PatientDashboardLayout from '../../components/layout/PatientDashboardLayout';

const TEAL = '#0F8594';
const CREAM = '#F6F4EC';

// Daily Activities: everything the therapist has assigned (across all
// sessions) as a checklist. Ticking saves immediately; the day's check-in
// is what Tracking and the therapist's patient record read.
export default function ActivityCheckIn() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const handleLogout = () => { logout(); navigate('/login'); };

  const [plan, setPlan] = useState([]);
  const [done, setDone] = useState({});
  const [log, setLog] = useState([]);
  const [saving, setSaving] = useState(false);
  const [query, setQuery] = useState('');

  const today = new Date().toISOString().slice(0, 10);

  const refreshLog = () => getActivityLog(user.id).then((entries) => {
    setLog(entries.slice().reverse());
    const todays = entries.find((e) => e.date === today);
    if (todays) setDone(todays.responses || {});
  }).catch(() => {});

  useEffect(() => {
    getActivityPlan(user.id).then(setPlan).catch(() => {});
    refreshLog();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user.id]);

  const summary = getActivityProgressSummary(log);
  const doneCount = plan.filter((a) => done[a.id]).length;
  const pct = plan.length ? Math.round((doneCount / plan.length) * 100) : 0;
  const q = query.trim().toLowerCase();
  const visible = q ? plan.filter((a) => a.text.toLowerCase().includes(q)) : plan;

  const toggle = (id) => {
    const next = { ...Object.fromEntries(plan.map((a) => [a.id, !!done[a.id]])), [id]: !done[id] };
    setDone(next);
    setSaving(true);
    submitActivityCheckIn(user.id, next).then(refreshLog).catch(() => {}).finally(() => setSaving(false));
  };

  const streakLine = summary.streak >= 3
    ? `${summary.streak} days in a row — that is discipline.`
    : summary.streak > 0 ? `${summary.streak}-day streak. Tomorrow makes it ${summary.streak + 1}.` : 'Tick one thing today and a streak begins.';

  return (
    <PatientDashboardLayout active="daily" user={user} onLogout={handleLogout} search={{ placeholder: 'Search your activities', value: query, onChange: setQuery }}>
      <div className="rounded-3xl p-7 md:p-9 mb-6 flex items-center justify-between gap-6 flex-wrap" style={{ background: 'linear-gradient(100deg, #D7E8BE 0%, #EDE9D8 45%, #F5D7B0 90%)' }}>
        <div>
          <h1 className="text-3xl font-bold text-slate-900">Daily activities</h1>
          <p className="text-slate-600 mt-2 text-sm md:text-base">{streakLine}</p>
        </div>
        <div className="flex gap-3">
          <Pill label="Today" value={plan.length ? `${doneCount}/${plan.length}` : '—'} />
          <Pill label="This week" value={`${summary.weeklyCompleted}/7`} />
          <Pill label="Streak" value={`${summary.streak}d`} />
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-6">
        <div className="bg-white border border-black/5 rounded-3xl shadow-sm p-6 md:p-8">
          <div className="flex items-center justify-between mb-2">
            <h2 className="text-lg font-bold text-slate-900">Today&apos;s checklist</h2>
            <span className="text-xs text-slate-400">{saving ? 'Saving…' : `${pct}% done`}</span>
          </div>
          <div className="h-2 rounded-full bg-[#F6F4EC] overflow-hidden mb-6">
            <div className="h-full rounded-full transition-all duration-500" style={{ width: `${pct}%`, background: TEAL }} />
          </div>

          {plan.length === 0 ? (
            <div className="text-center py-12">
              <p className="font-bold text-slate-800">No activities yet</p>
              <p className="text-sm text-slate-500 mt-1 max-w-sm mx-auto">Your therapist adds activities after each session. They will show up here as a checklist.</p>
            </div>
          ) : visible.length === 0 ? (
            <p className="text-sm text-slate-400 py-8 text-center">No activity matches “{query}”.</p>
          ) : (
            <ul className="space-y-2.5">
              {visible.map((a) => {
                const on = !!done[a.id];
                return (
                  <li key={a.id}>
                    <label className={`flex items-center gap-4 rounded-2xl border px-5 py-4 cursor-pointer transition-all ${on ? 'border-[#0F8594]/30' : 'border-black/5 hover:border-black/15'}`} style={{ background: on ? '#E6F0EA' : '#FBFAF6' }}>
                      <input type="checkbox" checked={on} onChange={() => toggle(a.id)} className="w-5 h-5 accent-[#0F8594] shrink-0" />
                      <span className={`flex-1 text-sm font-semibold ${on ? 'text-slate-500 line-through' : 'text-slate-800'}`}>{a.text}</span>
                      {on && <span className="text-[11px] font-bold" style={{ color: TEAL }}>Done</span>}
                    </label>
                  </li>
                );
              })}
            </ul>
          )}

          {plan.length > 0 && doneCount === plan.length && (
            <p className="mt-6 text-sm font-semibold text-center rounded-2xl py-3" style={{ background: CREAM, color: TEAL }}>All done for today. Rest well — you earned it.</p>
          )}
        </div>

        <div className="bg-white border border-black/5 rounded-3xl shadow-sm p-6 md:p-8">
          <h3 className="font-bold text-slate-900 mb-1">Last 14 days</h3>
          <p className="text-xs text-slate-500 mb-5">How much of the checklist you completed each day.</p>
          {log.length === 0 ? (
            <p className="text-sm text-slate-400">History appears after your first check-in.</p>
          ) : (
            <div className="space-y-2">
              {log.slice(0, 14).map((entry) => {
                const vals = Object.values(entry.responses || {});
                const n = vals.filter(Boolean).length;
                const p = vals.length ? Math.round((n / vals.length) * 100) : 0;
                return (
                  <div key={entry.id} className="flex items-center gap-3 text-xs">
                    <span className="w-16 font-semibold text-slate-600 shrink-0">{new Date(entry.date).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}</span>
                    <div className="flex-1 h-2 rounded-full bg-[#F6F4EC] overflow-hidden">
                      <div className="h-full rounded-full" style={{ width: `${p}%`, background: p === 100 ? TEAL : '#B45309' }} />
                    </div>
                    <span className="w-10 text-right font-bold text-slate-700">{n}/{vals.length}</span>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </PatientDashboardLayout>
  );
}

function Pill({ label, value }) {
  return (
    <div className="bg-white/70 rounded-2xl px-4 py-3 min-w-[96px] text-center">
      <p className="text-lg font-bold text-slate-900">{value}</p>
      <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500">{label}</p>
    </div>
  );
}
