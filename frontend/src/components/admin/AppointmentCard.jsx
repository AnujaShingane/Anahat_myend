import { StatusBadge } from '../ui/Kit';

// Read-only appointment row for admin monitoring views (Anahat Admin >
// Appointments / Dashboard). Reuses the same StatusBadge tone mapping the
// therapist and patient sides already use, so "confirmed/pending/cancelled"
// reads identically everywhere in the app.
export default function AppointmentCard({ appointment }) {
  return (
    <div className="flex items-center justify-between gap-4 py-3.5 border-b last:border-0 border-black/[0.04]">
      <div className="min-w-0">
        <p className="font-bold text-sm text-slate-800 truncate">{appointment.patientName || appointment.patientId}</p>
        <p className="text-xs text-slate-500 truncate">with {appointment.therapistName || 'therapist'} · {appointment.slot}</p>
      </div>
      <StatusBadge status={appointment.status} />
    </div>
  );
}
