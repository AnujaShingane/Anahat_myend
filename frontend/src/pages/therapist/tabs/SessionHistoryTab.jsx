import { useState } from 'react';
import { EmptyState } from '../../../components/ui/Kit';
import { SAGE_DARK, SAGE_SOFT } from '../../../components/layout/TherapistDashboardLayout';

function formatDuration(startedAt, endedAt) {
  if (!startedAt || !endedAt) return '—';
  const mins = Math.max(1, Math.round((new Date(endedAt) - new Date(startedAt)) / 60000));
  return mins < 60 ? `${mins} min` : `${Math.floor(mins / 60)}h ${mins % 60}m`;
}

export default function SessionHistoryTab({ sessions, hasReport, onOpenReport, onOpenPatient, search }) {
  const [patientFilter, setPatientFilter] = useState('all');

  const patientNames = ['all', ...new Set(sessions.map((s) => s.patientName))];
  const q = (search || '').trim().toLowerCase();

  const filtered = sessions
    .filter((s) => patientFilter === 'all' || s.patientName === patientFilter)
    .filter((s) => !q || (s.patientName || '').toLowerCase().includes(q))
    .sort((a, b) => new Date(b.endedAt) - new Date(a.endedAt));

  return (
    <div className="pt-8 space-y-6">
      <div className="td-animate-in">
        <h1 className="font-serif font-bold text-2xl text-slate-900">Session History</h1>
        <p className="text-slate-500 text-sm mt-1">Every completed consultation, most recent first.</p>
      </div>

      {patientNames.length > 1 && (
        <div className="portal-page-filters flex flex-wrap gap-2">
          {patientNames.map((name) => (
            <button
              key={name}
              onClick={() => setPatientFilter(name)}
              className={`td-chip px-3.5 py-1.5 rounded-full text-xs font-bold border ${
                patientFilter === name ? 'text-white border-transparent shadow-sm' : 'text-slate-600 border-black/10 hover:border-black/20 hover:bg-black/[0.02]'
              }`}
              style={patientFilter === name ? { background: SAGE_DARK } : undefined}
            >
              {name === 'all' ? 'All Patients' : name}
            </button>
          ))}
        </div>
      )}

      <div className="td-surface bg-white rounded-2xl border border-black/5 p-6">
        {filtered.length === 0 ? (
          <EmptyState title="No completed sessions yet" subtitle="Sessions you finish with patients will be logged here automatically." />
        ) : (
          <div className="space-y-1">
            {filtered.map((s) => (
              <div key={s.id} className="flex items-center justify-between gap-4 py-3.5 px-2 -mx-2 rounded-xl border-b last:border-0 border-black/[0.04] hover:bg-black/[0.015] transition-colors duration-200">
                <button onClick={() => onOpenPatient(s.patientId)} className="flex items-center gap-3 min-w-0 text-left flex-1">
                  <div className="w-10 h-10 rounded-full flex items-center justify-center text-white text-sm font-bold shrink-0 shadow-sm" style={{ background: SAGE_DARK }}>
                    {(s.patientName || '?').charAt(0).toUpperCase()}
                  </div>
                  <div className="min-w-0">
                    <p className="font-bold text-sm text-slate-800 truncate">{s.patientName}</p>
                    <p className="text-xs text-slate-500">
                      {new Date(s.endedAt).toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' })} · {formatDuration(s.startedAt, s.endedAt)}
                    </p>
                  </div>
                </button>
                <div className="flex items-center gap-3 shrink-0">
                  <span className="text-[10px] font-bold uppercase tracking-widest px-2.5 py-1 rounded-full" style={{ background: SAGE_SOFT, color: SAGE_DARK }}>Completed</span>
                  {hasReport(s.patientId, s.id) ? (
                    <button onClick={() => onOpenReport(s.patientId)} className="td-chip text-xs font-bold" style={{ color: SAGE_DARK }}>View Report</button>
                  ) : (
                    <span className="text-xs text-slate-400">No notes yet</span>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}