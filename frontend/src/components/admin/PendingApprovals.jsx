import EmptyState from './EmptyState';
import { Badge } from '../ui/Kit';

// Pending therapist-application list with Approve/Reject actions. Used on
// the Anahat Admin dashboard summary and the full Therapist Approvals page.
// The underlying data + mutation (setTherapistApproval) is the same one the
// legacy AdminConsole "Therapists" tab used — no duplicate logic here.
export default function PendingApprovals({ therapists, onApprove, onReject, limit }) {
  const list = limit ? therapists.slice(0, limit) : therapists;

  if (list.length === 0) {
    return <EmptyState title="No pending applications" subtitle="New therapist sign-ups will appear here for review." />;
  }

  return (
    <div className="space-y-3">
      {list.map((t) => (
        <div key={t.id} className="bg-black/[0.03] rounded-xl px-4 py-4">
          <div className="flex items-center justify-between mb-2 gap-3">
            <div className="min-w-0">
              <p className="font-bold text-sm text-slate-800 truncate">{t.name}</p>
              <p className="text-[11px] text-slate-500 truncate">
                {t.age && `Age ${t.age} · `}{t.gender}{t.gender ? ' · ' : ''}{t.qualification} · {t.yearsExperience} experience
              </p>
            </div>
            <Badge tone="amber">Pending</Badge>
          </div>
          {t.specializations?.length > 0 && (
            <div className="flex flex-wrap gap-1.5 mb-2">
              {t.specializations.map((s) => (
                <span key={s} className="px-2.5 py-1 rounded-lg bg-black/[0.05] text-[10px] font-bold text-slate-600">{s}</span>
              ))}
            </div>
          )}
          <div className="flex gap-2">
            <button onClick={() => onApprove(t.id)} className="px-4 py-2 rounded-lg text-xs font-bold bg-emerald-600 hover:bg-emerald-700 text-white">Approve</button>
            <button onClick={() => onReject(t.id)} className="px-4 py-2 rounded-lg text-xs font-bold bg-red-500 hover:bg-red-600 text-white">Reject</button>
          </div>
        </div>
      ))}
    </div>
  );
}
