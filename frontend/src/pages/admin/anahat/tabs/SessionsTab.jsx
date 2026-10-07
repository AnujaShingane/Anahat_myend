import { EmptyState } from '../../../../components/ui/Kit';
import { SAGE } from '../../../../components/layout/TherapistDashboardLayout';

// Reuses getAllSessions() (liveSessions store) to give ops visibility into
// active and completed therapy sessions — the same data the therapist's
// live-session workspace and patient chat already read/write.
export default function SessionsTab({ sessions }) {
  const active = sessions.filter((s) => s.status === 'active');
  const ended = [...sessions.filter((s) => s.status === 'ended')].sort((a, b) => new Date(b.endedAt) - new Date(a.endedAt));

  return (
    <div className="pt-8 space-y-6">
      <div>
        <h1 className="font-serif font-bold text-2xl text-slate-900">Sessions</h1>
        <p className="text-slate-500 text-sm mt-1">Live and completed therapy sessions across the platform.</p>
      </div>

      <div className="bg-white rounded-3xl border border-black/5 p-6">
        <h3 className="font-serif font-bold text-lg mb-4">Live Now</h3>
        {active.length === 0 ? (
          <EmptyState title="No sessions in progress" />
        ) : (
          <div className="space-y-2">
            {active.map((s) => (
              <div key={s.id} className="flex items-center justify-between bg-emerald-50 border border-emerald-200 rounded-xl px-4 py-3">
                <p className="text-sm font-bold text-emerald-700">{s.therapistName} — {s.patientName}</p>
                <span className="text-xs text-emerald-600">Started {new Date(s.startedAt).toLocaleTimeString()}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="bg-white rounded-3xl border border-black/5 p-6">
        <h3 className="font-serif font-bold text-lg mb-4">Completed Sessions</h3>
        {ended.length === 0 ? (
          <EmptyState title="No completed sessions yet" />
        ) : (
          <div className="space-y-1">
            {ended.slice(0, 30).map((s) => (
              <div key={s.id} className="flex items-center justify-between py-2.5 border-b last:border-0 border-black/[0.04]">
                <p className="text-sm text-slate-700"><span className="font-bold" style={{ color: SAGE }}>{s.therapistName}</span> with {s.patientName}</p>
                <span className="text-xs text-slate-400">{new Date(s.endedAt).toLocaleString()}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
