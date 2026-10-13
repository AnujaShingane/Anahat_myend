import { Badge, EmptyState } from '../../../../components/ui/Kit';

// Technical Admin's therapist view is the account directory: every
// therapist record with their approval status, specialization, and caseload
// size. Approving/rejecting new applications is an operational workflow and
// lives on Anahat Admin > Therapist Approvals — this page doesn't duplicate
// that logic, it's a read-only directory for technical/account purposes.
export default function TherapistsTab({ therapists }) {
  return (
    <div className="pt-8 space-y-6">
      <div>
        <h1 className="font-serif font-bold text-2xl text-slate-900">Therapists</h1>
        <p className="text-slate-500 text-sm mt-1">
          Full therapist directory. New applications are approved from the Anahat Admin console.
        </p>
      </div>

      <div className="bg-white rounded-3xl border border-black/5 p-6">
        {therapists.length === 0 ? (
          <EmptyState title="No therapists yet" subtitle="Therapist accounts will appear here once they register." />
        ) : (
          <div className="space-y-2">
            {therapists.map((t) => {
              const status = t.approvalStatus || (t.verified ? 'approved' : 'pending');
              const tone = status === 'approved' ? 'emerald' : status === 'rejected' ? 'red' : 'amber';
              return (
                <div key={t.id} className="flex items-center justify-between bg-black/[0.03] rounded-xl px-4 py-3">
                  <div className="min-w-0">
                    <p className="font-bold text-sm text-slate-800 truncate">{t.name}</p>
                    <p className="text-[11px] text-slate-500 truncate">
                      {t.level || 'Therapist'} · {(t.specializations || [t.specialty]).filter(Boolean).join(', ') || 'No specialization set'} · {(t.patients || []).length} patients
                    </p>
                  </div>
                  <Badge tone={tone}>{status}</Badge>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
