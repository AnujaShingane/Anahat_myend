import StatCard from '../../../../components/admin/StatCard';
import ActivityList from '../../../../components/admin/ActivityList';
import EmptyState from '../../../../components/admin/EmptyState';
import QuickActions from '../../../../components/admin/QuickActions';
import { UsersIcon, TherapistIcon, SessionIcon, BellIcon, UsersIcon as UserIconAlias, TherapistIcon as TherapistIconAlias, AuditIcon, ReportIcon, AnalyticsIcon } from '../../../../components/admin/icons';
import { SAGE_DARK, SAGE_SOFT } from '../../../../components/layout/TherapistDashboardLayout';

export default function DashboardHome({ stats, recentUsers, recentTherapists, recentActivity, onNavigate }) {
  return (
    <div className="pt-8 space-y-8">
      <div
        className="rounded-2xl px-6 py-4"
        style={{ background: `linear-gradient(120deg, ${SAGE_SOFT} 0%, #FBF3E7 100%)` }}
      >
        <p className="text-slate-600 text-sm">Welcome back,</p>
        <h1 className="font-serif font-bold text-2xl text-slate-900">Technical Admin Console</h1>
        <p className="text-slate-500 text-sm mt-1">Application, accounts, and infrastructure-level administration.</p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard icon={UsersIcon} value={stats.totalUsers} label="Total Users" />
        <StatCard icon={TherapistIcon} value={stats.totalTherapists} label="Registered Therapists" />
        <StatCard icon={SessionIcon} value={stats.totalSessions} label="Total Sessions" />
        <StatCard icon={BellIcon} value={stats.unreadNotifications} label="Unread Notifications" />
      </div>

      <section className="bg-white rounded-3xl border border-black/5 p-6">
        <h2 className="font-serif font-bold text-lg text-slate-900 mb-4">Quick Actions</h2>
        <QuickActions
          onNavigate={onNavigate}
          actions={[
            { key: 'users', label: 'Manage Users', icon: UserIconAlias },
            { key: 'therapists', label: 'Therapists', icon: TherapistIconAlias },
            { key: 'audit', label: 'Audit Logs', icon: AuditIcon },
            { key: 'reports', label: 'Reports', icon: ReportIcon },
            { key: 'analytics', label: 'Analytics', icon: AnalyticsIcon },
          ]}
        />
      </section>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <section className="bg-white rounded-3xl border border-black/5 p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-serif font-bold text-lg text-slate-900">Recent Users</h2>
            <button onClick={() => onNavigate('users')} className="text-xs font-bold" style={{ color: SAGE_DARK }}>View All</button>
          </div>
          {recentUsers.length === 0 ? (
            <EmptyState title="No users yet" subtitle="Users created here, or who register through the app, will appear here." />
          ) : (
            <div className="space-y-1">
              {recentUsers.map((u) => (
                <div key={u.id} className="flex items-center justify-between py-2.5 border-b last:border-0 border-black/[0.04]">
                  <div className="min-w-0">
                    <p className="font-bold text-sm text-slate-800 truncate">{u.name}</p>
                    <p className="text-[11px] text-slate-500 uppercase tracking-wide">{u.role}</p>
                  </div>
                  <span className={`text-[10px] font-bold uppercase tracking-wide ${u.status === 'active' ? 'text-emerald-600' : 'text-red-500'}`}>{u.status}</span>
                </div>
              ))}
            </div>
          )}
        </section>

        <section className="bg-white rounded-3xl border border-black/5 p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-serif font-bold text-lg text-slate-900">Recent Therapists</h2>
            <button onClick={() => onNavigate('therapists')} className="text-xs font-bold" style={{ color: SAGE_DARK }}>View All</button>
          </div>
          {recentTherapists.length === 0 ? (
            <EmptyState title="No therapists yet" subtitle="Therapist sign-ups will appear here." />
          ) : (
            <div className="space-y-1">
              {recentTherapists.map((t) => (
                <div key={t.id} className="flex items-center justify-between py-2.5 border-b last:border-0 border-black/[0.04]">
                  <p className="font-bold text-sm text-slate-800 truncate">{t.name}</p>
                  <span className="text-[10px] font-bold uppercase tracking-wide text-slate-500">{t.approvalStatus || (t.verified ? 'approved' : 'pending')}</span>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>

      <section className="bg-white rounded-3xl border border-black/5 p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-serif font-bold text-lg text-slate-900">Recent Activity</h2>
          <button onClick={() => onNavigate('audit')} className="text-xs font-bold" style={{ color: SAGE_DARK }}>View All</button>
        </div>
        <ActivityList items={recentActivity} emptySubtitle="System and account changes will show up here." />
      </section>
    </div>
  );
}
