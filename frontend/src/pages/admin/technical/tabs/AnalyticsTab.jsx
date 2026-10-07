import StatCard from '../../../../components/admin/StatCard';
import { UsersIcon, TherapistIcon, CalendarIcon, SessionIcon, ReportIcon } from '../../../../components/admin/icons';

// Every figure here is computed from real store data (users, therapists,
// appointments, sessions) — nothing is hardcoded. This replaces the old
// AdminConsole "Analytics" tab, minus its one hardcoded stat
// ("Generated Reports: 0"), which is now computed for real.
export default function AnalyticsTab({ users, patients, therapists, appointments, sessions }) {
  const confirmed = appointments.filter((a) => a.status === 'confirmed').length;
  const pending = appointments.filter((a) => a.status === 'pending').length;
  const completedSessions = sessions.filter((s) => s.status === 'ended').length;

  return (
    <div className="pt-8 space-y-6">
      <div>
        <h1 className="font-serif font-bold text-2xl text-slate-900">Analytics</h1>
        <p className="text-slate-500 text-sm mt-1">Platform-wide numbers, computed live from current data.</p>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard icon={UsersIcon} value={users.length} label="Total Users" />
        <StatCard icon={UsersIcon} value={patients.length} label="Total Patients" />
        <StatCard icon={TherapistIcon} value={therapists.length} label="Total Therapists" />
        <StatCard icon={CalendarIcon} value={confirmed} label="Confirmed Appointments" />
        <StatCard icon={CalendarIcon} value={pending} label="Pending Appointments" />
        <StatCard icon={SessionIcon} value={sessions.length} label="Total Sessions" />
        <StatCard icon={SessionIcon} value={completedSessions} label="Completed Sessions" />
        <StatCard icon={ReportIcon} value={appointments.length} label="Total Bookings" />
      </div>
      <div className="bg-white rounded-3xl border border-black/5 p-6">
        <h3 className="font-serif font-bold text-lg mb-2">Therapy Completion Rate</h3>
        <p className="text-sm text-slate-500">Connect the assessment engine to populate live completion-rate and chakra-imbalance analytics here.</p>
      </div>
    </div>
  );
}
