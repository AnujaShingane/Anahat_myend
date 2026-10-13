import { EmptyState } from '../../../../components/ui/Kit';

// Operational patient directory: who they are, their stated concern, and
// who they're assigned to. Click a row to open their full profile.
export default function PatientsTab({ patients, onSelect }) {
  return (
    <div className="pt-8 space-y-6">
      <div>
        <h1 className="font-serif font-bold text-2xl text-slate-900">Patients</h1>
        <p className="text-slate-500 text-sm mt-1">Everyone enrolled — {patients.length} patient{patients.length === 1 ? '' : 's'}. Click a patient to view their full profile.</p>
      </div>

      <div className="bg-white rounded-3xl border border-black/5 p-6">
        {patients.length === 0 ? (
          <EmptyState title="No patients yet" subtitle="Patients who register through the app will appear here." />
        ) : (
          <div className="space-y-2">
            {patients.map((p) => (
              <button
                key={p.id}
                onClick={() => onSelect(p)}
                className="w-full text-left flex items-center justify-between bg-black/[0.03] hover:bg-black/[0.06] rounded-xl px-4 py-3 transition-colors"
              >
                <div className="min-w-0 flex items-center gap-3">
                  <div className="w-9 h-9 rounded-full overflow-hidden bg-white flex items-center justify-center shrink-0">
                    {p.avatarFileId ? (
                      <img src={`/api/profile/files/${p.avatarFileId}`} alt={p.name} className="w-full h-full object-cover" />
                    ) : (
                      <svg className="w-4 h-4 text-slate-300" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" /></svg>
                    )}
                  </div>
                  <div className="min-w-0">
                    <p className="font-bold text-sm text-slate-800 truncate">{p.name}</p>
                    <p className="text-[11px] text-slate-500 truncate">{p.email}{p.concern ? ` \u00b7 ${p.concern}` : ''}</p>
                  </div>
                </div>
                <p className="text-xs text-slate-400 shrink-0 ml-3">Click to view profile</p>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
