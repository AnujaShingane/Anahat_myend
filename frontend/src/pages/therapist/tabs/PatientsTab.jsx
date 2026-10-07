import { EmptyState } from '../../../components/ui/Kit';
import { initialsOf } from '../../../utils/initials';
import { SAGE_DARK, SAGE, SAGE_SOFT, MINT } from '../../../components/layout/TherapistDashboardLayout';

// Card grid of this therapist's patients. Clicking a card opens the full
// patient record (sessions, payments, demographics, reports, progress).
export default function PatientsTab({ patients, onOpenProfile }) {
  return (
    <div className="pt-8 space-y-6">
      <div className="td-animate-in">
        <h1 className="font-serif font-bold text-2xl text-slate-900">Patients</h1>
        <p className="text-slate-500 text-sm mt-1">Everyone who has booked with you — {patients.length} patient{patients.length === 1 ? '' : 's'}, numbered in the order they first booked.</p>
      </div>

      {patients.length === 0 ? (
        <div className="td-surface bg-white rounded-2xl border border-black/5 p-10">
          <EmptyState title="No patients yet" subtitle="Patients appear here as soon as they book a session with you." />
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {patients.map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => onOpenProfile(p.id)}
              className="td-card-hover td-animate-in bg-white rounded-2xl border border-black/5 p-5 text-left flex flex-col hover:border-black/15"
            >
              <div className="flex items-center gap-3 mb-4">
                <div className="w-14 h-14 rounded-full overflow-hidden flex items-center justify-center text-white font-bold shrink-0 shadow-sm ring-4" style={{ background: SAGE, '--tw-ring-color': SAGE_SOFT }}>
                  {p.avatarUrl ? <img src={p.avatarUrl} alt={p.name} className="w-full h-full object-cover" /> : initialsOf(p.name)}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="font-bold text-sm text-slate-800 truncate">{p.name}</p>
                  <p className="text-xs text-slate-500 truncate">Patient {p.patientId}{p.age ? ` · ${p.age} yrs` : ''}</p>
                  {p.concern && <p className="text-xs text-slate-500 truncate">{p.concern}</p>}
                </div>
                {p.upcomingSlot && (
                  <span className="text-[10px] font-bold uppercase tracking-wide px-2.5 py-1 rounded-full shrink-0" style={{ background: MINT, color: SAGE_DARK }}>Upcoming</span>
                )}
              </div>
              <div className="text-xs text-slate-500 space-y-1">
                <p>{p.upcomingSlot ? `Next appointment: ${p.upcomingSlot}` : 'No upcoming appointment'}</p>
                <p>{p.lastSession ? `Last session: ${p.lastSession}` : 'No sessions held yet'}</p>
              </div>
              <p className="mt-4 text-xs font-bold" style={{ color: SAGE_DARK }}>View full record →</p>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
