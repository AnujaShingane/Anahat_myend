import PendingApprovals from '../../../../components/admin/PendingApprovals';
import { Badge, EmptyState } from '../../../../components/ui/Kit';

// Full approval workflow — same logic (setTherapistApproval) the legacy
// AdminConsole "Therapists" tab used for its pending-applications section.
export default function ApprovalsTab({ pending, approved, onApprove, onReject, onRevoke }) {
  return (
    <div className="pt-8 space-y-6">
      <div>
        <h1 className="font-serif font-bold text-2xl text-slate-900">Therapist Approvals</h1>
        <p className="text-slate-500 text-sm mt-1">Review new therapist applications before they can access the platform.</p>
      </div>

      <div className="bg-white rounded-3xl border border-black/5 p-6">
        <h3 className="font-serif font-bold text-lg mb-1">Pending Applications</h3>
        <p className="text-xs text-slate-500 mb-4">New therapist sign-ups can't access the console until approved here.</p>
        <PendingApprovals therapists={pending} onApprove={onApprove} onReject={onReject} />
      </div>

      <div className="bg-white rounded-3xl border border-black/5 p-6">
        <h3 className="font-serif font-bold text-lg mb-4">Active Therapists</h3>
        {approved.length === 0 ? (
          <EmptyState title="No approved therapists yet" />
        ) : (
          <div className="space-y-2">
            {approved.map((t) => (
              <div key={t.id} className="flex items-center justify-between bg-black/[0.03] rounded-xl px-4 py-3">
                <div>
                  <p className="font-bold text-sm text-slate-800">{t.name}</p>
                  <p className="text-[11px] text-slate-500">{t.level} · {(t.specializations || [t.specialty]).filter(Boolean).join(', ')} · {(t.patients || []).length} patients</p>
                </div>
                <div className="flex items-center gap-3">
                  <Badge tone="emerald">Approved</Badge>
                  <button onClick={() => onRevoke(t.id)} className="text-xs font-bold text-red-500">Revoke</button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
