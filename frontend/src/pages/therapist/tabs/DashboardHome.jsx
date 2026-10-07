import { EmptyState } from '../../../components/ui/Kit';
import { initialsOf } from '../../../utils/initials';
import { SAGE_DARK, SAGE, SAGE_SOFT, MINT, SOFT_YELLOW, SOFT_LAVENDER, SOFT_BLUE } from '../../../components/layout/TherapistDashboardLayout';
import { formatDateTime, formatCountdown, isJoinable, timeAgo } from '../scheduleUtils';

const STAT_ICONS = {
  sessions: (p) => (<svg {...p} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>),
  patients: (p) => (<svg {...p} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M17 20h5v-2a4 4 0 00-3-3.87M9 20H4v-2a4 4 0 013-3.87m5-4.13a4 4 0 100-8 4 4 0 000 8zm6 4a4 4 0 100-8 4 4 0 000 8z" /></svg>),
  reports: (p) => (<svg {...p} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>),
  pending: (p) => (<svg {...p} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>),
};

// Each stat pill gets its own soft pastel tint so the welcome banner reads
// at a glance instead of blending into one flat block.
const STAT_TINTS = {
  sessions: MINT,
  patients: SOFT_BLUE,
  reports: SOFT_LAVENDER,
  pending: SOFT_YELLOW,
};

function StatPill({ icon, value, label }) {
  const Icon = STAT_ICONS[icon];
  const tint = STAT_TINTS[icon];
  return (
    <div
      className="td-card-hover rounded-2xl px-5 py-3.5 flex flex-col items-center text-center min-w-[110px] border border-black/[0.03]"
      style={{ background: tint }}
    >
      <div className="w-9 h-9 rounded-full bg-white/90 flex items-center justify-center mb-1.5 shadow-sm" style={{ color: SAGE_DARK }}>
        <Icon className="w-4 h-4" />
      </div>
      <p className="font-serif font-bold text-2xl text-slate-900 leading-none">{value}</p>
      <p className="text-[11px] text-slate-500 mt-1">{label}</p>
    </div>
  );
}

const ACTIVITY_DOT = {
  appointment: '#3F6B4F',
  message: '#B98A4D',
  session: '#2F4A3B',
  report: '#8A6FB0',
  feedback: '#4D8CB9',
};

// Quick action tiles get a matching soft icon-background tint too, cycling
// through the same calm palette as the stat pills above.
const QUICK_ACTION_TINTS = [MINT, SOFT_BLUE, SOFT_LAVENDER, SOFT_YELLOW, MINT];

export default function DashboardHome({
  therapistName,
  avatarUrl,
  level,
  stats,
  upcomingSessions,
  recentPatients,
  recentActivity,
  onNavigate,
  onJoinSession,
  availabilityCard = null,
}) {
  return (
    <div className="pt-8 space-y-8">
      {/* Welcome banner */}
      <div
        className="td-animate-in rounded-2xl px-6 py-4 flex flex-col md:flex-row md:items-center gap-4 justify-between"
        style={{ background: `linear-gradient(120deg, ${SAGE_SOFT} 0%, #FBF3E7 100%)` }}
      >
        <div className="flex items-center gap-5">
          <div className="w-12 h-12 rounded-full overflow-hidden bg-white flex items-center justify-center text-lg font-bold shrink-0 shadow-sm" style={{ color: SAGE_DARK }}>
            {avatarUrl ? <img src={avatarUrl} alt={therapistName} className="w-full h-full object-cover" /> : initialsOf(therapistName)}
          </div>
          <div>
            <p className="text-slate-600 text-sm">Welcome,</p>
            <h1 className="font-serif font-bold text-3xl text-slate-900 flex items-center gap-2">
              {therapistName}
              <svg className="w-6 h-6" viewBox="0 0 24 24" fill="none"><path d="M6 20c0-8 5-13 13-14-1 8-6 13-13 14z" fill={SAGE} /></svg>
            </h1>
            <p className="text-slate-500 text-sm mt-1">You are making a difference in people's lives every day.</p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2 md:justify-end">
          <StatPill icon="sessions" value={stats.todaySessions} label="Today's Sessions" />
          <StatPill icon="patients" value={stats.totalPatients} label="Total Patients" />
          <StatPill icon="reports" value={stats.reportsShared} label="Reports Shared" />
          <StatPill icon="pending" value={stats.pendingReviews} label="Pending Reviews" />
        </div>
      </div>

      {availabilityCard}

      {/* Upcoming sessions */}
      <section className="td-surface td-animate-in bg-white rounded-2xl border border-black/5 p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-serif font-bold text-lg text-slate-900">Upcoming Sessions</h2>
          <button onClick={() => onNavigate('appointments')} className="td-chip text-xs font-bold" style={{ color: SAGE_DARK }}>View All</button>
        </div>

        {upcomingSessions.length === 0 ? (
          <EmptyState title="No upcoming sessions scheduled" subtitle="Once a patient's appointment is confirmed, it will appear here." />
        ) : (
          <div className="space-y-1">
            {upcomingSessions.map((s) => {
              const joinable = isJoinable(s.date);
              return (
                <div key={s.id} className="flex items-center justify-between gap-4 py-3.5 px-2 -mx-2 rounded-xl border-b last:border-0 border-black/[0.04] hover:bg-black/[0.015] transition-colors duration-200">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-11 h-11 rounded-full flex items-center justify-center text-sm font-bold shrink-0 text-white shadow-sm" style={{ background: SAGE }}>
                      {initialsOf(s.patientName)}
                    </div>
                    <div className="min-w-0">
                      <p className="font-bold text-sm text-slate-800 truncate">{s.patientName}</p>
                      <p className="text-xs text-slate-500 flex items-center gap-2 mt-0.5">
                        <span>{s.date ? formatDateTime(s.date) : s.slot}</span>
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3 shrink-0">
                    <span className="text-xs font-semibold text-slate-500 hidden sm:block">{s.date ? formatCountdown(s.date) : 'Scheduled'}</span>
                    <button
                      onClick={() => joinable && onJoinSession(s.patientId, s.id)}
                      disabled={!joinable}
                      title={!joinable ? 'Opens 5 minutes before the scheduled time' : ''}
                      className={`td-btn-pop px-4 py-2 rounded-xl text-xs font-bold ${
                        joinable ? 'text-white hover:opacity-90 shadow-sm' : 'text-slate-400 bg-black/[0.04] cursor-not-allowed'
                      }`}
                      style={joinable ? { background: SAGE_DARK } : undefined}
                    >
                      Join Session
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* Quick actions */}
      <section className="td-surface td-animate-in bg-white rounded-2xl border border-black/5 p-6">
        <h2 className="font-serif font-bold text-lg text-slate-900 mb-4">Quick Actions</h2>
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-3">
          {[
            { key: 'patients', label: 'View Patients', icon: 'users' },
            { key: 'appointments', label: 'Appointments', icon: 'calendar' },
            { key: 'reports', label: 'Create Report', icon: 'report' },
            { key: 'messages', label: 'Messages', icon: 'message' },
            { key: 'history', label: 'Session History', icon: 'history' },
          ].map((a, i) => (
            <button
              key={a.key}
              onClick={() => onNavigate(a.key)}
              className="td-card-hover td-chip flex flex-col items-center gap-2 rounded-2xl px-3 py-5 bg-black/[0.02] hover:bg-black/[0.03] text-center"
            >
              <span className="w-11 h-11 rounded-2xl flex items-center justify-center shadow-sm" style={{ color: SAGE_DARK, background: QUICK_ACTION_TINTS[i % QUICK_ACTION_TINTS.length] }}>
                <QuickIcon name={a.icon} className="w-5 h-5" />
              </span>
              <span className="text-xs font-bold text-slate-700">{a.label}</span>
            </button>
          ))}
        </div>
      </section>

      {/* Recent patients */}
      <section className="td-surface td-animate-in bg-white rounded-2xl border border-black/5 p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-serif font-bold text-lg text-slate-900">Recent Patients</h2>
          <button onClick={() => onNavigate('patients')} className="td-chip text-xs font-bold" style={{ color: SAGE_DARK }}>View All</button>
        </div>
        {recentPatients.length === 0 ? (
          <EmptyState title="No assigned patients yet" subtitle="New patients matched to you will appear here." />
        ) : (
          <div className="space-y-1">
            {recentPatients.map((p) => (
              <button
                key={p.id}
                onClick={() => onNavigate('patient', p.id)}
                className="w-full flex items-center justify-between gap-4 py-3 border-b last:border-0 border-black/[0.04] text-left hover:bg-black/[0.02] rounded-xl px-2 -mx-2 transition-colors duration-200"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold text-white shrink-0 shadow-sm" style={{ background: SAGE }}>
                    {initialsOf(p.name)}
                  </div>
                  <div className="min-w-0">
                    <p className="font-bold text-sm text-slate-800 truncate">{p.name}</p>
                    <p className="text-xs text-slate-500">{p.lastSession ? `Last session: ${p.lastSession}` : 'No sessions yet'}</p>
                  </div>
                </div>
                <svg className="w-4 h-4 text-slate-300 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 18l6-6-6-6" /></svg>
              </button>
            ))}
          </div>
        )}
      </section>

      {/* Recent activity */}
      <section className="td-surface td-animate-in bg-white rounded-2xl border border-black/5 p-6">
        <h2 className="font-serif font-bold text-lg text-slate-900 mb-4">Recent Activity</h2>
        {recentActivity.length === 0 ? (
          <EmptyState title="No recent activity" subtitle="Booking updates, messages, and session events will show up here." />
        ) : (
          <div className="space-y-1">
            {recentActivity.map((a) => (
              <div key={a.id} className="flex items-center justify-between gap-4 py-2.5 border-b last:border-0 border-black/[0.04]">
                <div className="flex items-center gap-3 min-w-0">
                  <span className="w-2 h-2 rounded-full shrink-0" style={{ background: ACTIVITY_DOT[a.type] || SAGE }} />
                  <p className="text-sm text-slate-700 truncate">{a.text}</p>
                </div>
                <span className="text-xs text-slate-400 shrink-0">{timeAgo(a.at)}</span>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

function QuickIcon({ name, ...p }) {
  const paths = {
    users: 'M17 20h5v-2a4 4 0 00-3-3.87M9 20H4v-2a4 4 0 013-3.87m5-4.13a4 4 0 100-8 4 4 0 000 8zm6 4a4 4 0 100-8 4 4 0 000 8z',
    calendar: 'M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z',
    report: 'M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z',
    message: 'M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-6l-4 4v-4z',
    history: 'M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z',
  };
  return (<svg {...p} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d={paths[name]} /></svg>);
}