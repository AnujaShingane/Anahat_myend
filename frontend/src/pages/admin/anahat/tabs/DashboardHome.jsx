import StatCard from '../../../../components/admin/StatCard';
import ActivityList from '../../../../components/admin/ActivityList';
import PendingApprovals from '../../../../components/admin/PendingApprovals';
import AppointmentCard from '../../../../components/admin/AppointmentCard';
import EmptyState from '../../../../components/admin/EmptyState';
import { ApprovalIcon, CalendarIcon, TherapistIcon, UsersIcon } from '../../../../components/admin/icons';
import { SAGE_DARK, SAGE_SOFT } from '../../../../components/layout/TherapistDashboardLayout';

// No "patients waiting for assignment" section — there is no
// patient-therapist assignment anywhere in this app; a patient books a
// therapist directly.
export default function DashboardHome({
  stats, pendingTherapists, approvedTherapists,
  upcomingAppointments, recentAppointmentActivity,
  onApprove, onReject, onNavigate,
}) {
  return (
    <div className="pt-8 space-y-8">
      <div
        className="rounded-2xl px-6 py-4"
        style={{ background: `linear-gradient(120deg, ${SAGE_SOFT} 0%, #FBF3E7 100%)` }}
      >
        <p className="text-slate-600 text-sm">Welcome back,</p>
        <h1 className="font-serif font-bold text-2xl text-slate-900">Anahat Admin Console</h1>
        <p className="text-slate-500 text-sm mt-1">Therapist approvals, patients, and bookings across the platform.</p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard icon={ApprovalIcon} value={stats.pendingApprovals} label="Pending Approvals" />
        <StatCard icon={CalendarIcon} value={stats.upcomingAppointments} label="Upcoming Appointments" />
        <StatCard icon={TherapistIcon} value={stats.activeTherapists} label="Active Therapists" />
        <StatCard icon={UsersIcon} value={stats.activePatients} label="Active Patients" />
      </div>

      <section className="bg-white rounded-3xl border border-black/5 p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-serif font-bold text-lg text-slate-900">Pending Therapist Approvals</h2>
          <button onClick={() => onNavigate('approvals')} className="text-xs font-bold" style={{ color: SAGE_DARK }}>View All</button>
        </div>
        <PendingApprovals therapists={pendingTherapists} onApprove={onApprove} onReject={onReject} limit={3} />
      </section>

      <section className="bg-white rounded-3xl border border-black/5 p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-serif font-bold text-lg text-slate-900">Upcoming Appointments</h2>
          <button onClick={() => onNavigate('appointments')} className="text-xs font-bold" style={{ color: SAGE_DARK }}>View All</button>
        </div>
        {upcomingAppointments.length === 0 ? (
          <EmptyState title="No upcoming appointments" subtitle="Confirmed bookings will appear here." />
        ) : (
          <div>{upcomingAppointments.map((a) => <AppointmentCard key={a.id} appointment={a} />)}</div>
        )}
      </section>

      <section className="bg-white rounded-3xl border border-black/5 p-6">
        <h2 className="font-serif font-bold text-lg text-slate-900 mb-4">Recent Booking Activity</h2>
        <ActivityList items={recentAppointmentActivity} emptySubtitle="Booking updates will show up here." />
      </section>
    </div>
  );
}
