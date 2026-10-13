import { useEffect, useState } from 'react';
import { EmptyState } from '../../../../components/ui/Kit';

// Aggregates the same per-patient reportHistory store the therapist's
// ReportsTab and patient's Reports page already read (getReportHistory),
// just rolled up across every patient for an operational overview. Admins
// don't create reports here — therapists do, this is read-only.
export default function ReportsTab({ patients, getReportHistory }) {
  const [allReports, setAllReports] = useState([]);

  useEffect(() => {
    if (patients.length === 0) { setAllReports([]); return; }
    let cancelled = false;
    Promise.all(patients.map((p) => getReportHistory(p.id).then((list) => list.map((r) => ({ ...r, patientName: p.name })))))
      .then((results) => {
        if (cancelled) return;
        const flat = results.flat().sort((a, b) => new Date(b.createdAt || b.approvedAt || 0) - new Date(a.createdAt || a.approvedAt || 0));
        setAllReports(flat);
      })
      .catch((err) => console.error('Failed to load report history:', err));
    return () => { cancelled = true; };
  }, [patients, getReportHistory]);

  return (
    <div className="pt-8 space-y-6">
      <div>
        <h1 className="font-serif font-bold text-2xl text-slate-900">Reports</h1>
        <p className="text-slate-500 text-sm mt-1">Every therapist-approved session report, across all patients.</p>
      </div>

      <div className="bg-white rounded-3xl border border-black/5 p-6">
        {allReports.length === 0 ? (
          <EmptyState title="No reports yet" subtitle="Reports approved by therapists after a session will appear here." />
        ) : (
          <div className="space-y-2">
            {allReports.map((r) => (
              <div key={r.id} className="bg-black/[0.03] rounded-xl px-4 py-3">
                <div className="flex items-center justify-between mb-1">
                  <p className="font-bold text-sm text-slate-800">{r.patientName}</p>
                  <span className="text-xs text-slate-400">{r.approvedAt ? new Date(r.approvedAt).toLocaleDateString() : ''}</span>
                </div>
                <p className="text-xs text-slate-500">By {r.therapistName || 'therapist'}{r.appointmentDate ? ` · ${r.appointmentDate}` : ''}</p>
                {r.sessionSummary && <p className="text-xs text-slate-600 mt-1.5 line-clamp-2">{r.sessionSummary}</p>}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
