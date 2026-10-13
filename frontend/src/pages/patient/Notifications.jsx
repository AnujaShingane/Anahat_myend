import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { usePatientSession } from '../../hooks/usePatientSession';
import PatientDashboardLayout from '../../components/layout/PatientDashboardLayout';
import { PortalLoading, PortalError } from '../../components/layout/PortalStatus';
import { Card, OutlineButton, EmptyState, TEAL, CREAM } from '../../components/ui/PatientKit';
import {
  getPatientNotifications, markPatientNotificationRead, markAllPatientNotificationsRead,
} from '../../services/api';

const ICONS = {
  message: (<path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-6l-4 4v-4z" />),
  appointment: (<path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />),
  report: (<path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />),
};

export default function Notifications() {
  const { user, loading, error, reload, logout } = usePatientSession();
  const navigate = useNavigate();
  const [notifications, setNotifications] = useState(null);

  const refresh = () => {
    if (!user?.id) return;
    getPatientNotifications(user.id).then(setNotifications).catch((err) => console.error('Failed to load notifications:', err));
  };

  useEffect(() => { refresh(); }, [user?.id]);

  if (loading) return <PortalLoading />;
  if (error) return <PortalError message={error} onRetry={reload} onLogout={logout} />;

  const handleClick = (n) => {
    markPatientNotificationRead(user.id, n.id).then(refresh).catch((err) => console.error('Failed to mark notification read:', err));

    if (n.type === 'appointment') {
      navigate('/dashboard/appointments');
    } else if (n.type === 'message') {
      navigate('/dashboard/messages');
    } else if (n.type === 'report') {
      navigate('/dashboard/reports');
    }
  };

  const markAllRead = () => {
    markAllPatientNotificationsRead(user.id).then(refresh).catch((err) => console.error('Failed to mark all notifications read:', err));
  };

  const unreadCount = notifications?.filter((n) => !n.read).length || 0;

  return (
    <PatientDashboardLayout active="notifications" user={user} onLogout={logout}>
      <div className="mb-6 flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Notifications</h1>
          <p className="text-slate-500 text-sm mt-1">Updates about your sessions, messages, and reports.</p>
        </div>
        {unreadCount > 0 && (
          <OutlineButton onClick={markAllRead} className="!py-2 !px-4 text-xs">Mark All Read</OutlineButton>
        )}
      </div>

      {notifications === null ? null : notifications.length === 0 ? (
        <Card>
          <EmptyState title="You're all caught up" subtitle="Notifications about your sessions, messages, and reports will show up here." />
        </Card>
      ) : (
        <Card className="divide-y divide-black/5 overflow-hidden">
          {notifications.map((n) => (
            <button
              key={n.id}
              onClick={() => handleClick(n)}
              className="w-full text-left px-6 py-5 flex items-start gap-4 hover:bg-[#F6F4EC] transition-all"
              style={!n.read ? { background: '#FBFBF6' } : undefined}
            >
              <div className="w-10 h-10 rounded-full flex items-center justify-center shrink-0" style={{ background: CREAM }}>
                <svg className="w-5 h-5" style={{ color: TEAL }} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  {ICONS[n.type] || ICONS.appointment}
                </svg>
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between gap-3">
                  <p className={`text-sm ${n.read ? 'font-semibold text-slate-700' : 'font-bold text-slate-900'}`}>{n.title || n.message}</p>
                  {!n.read && <span className="w-2 h-2 rounded-full shrink-0" style={{ background: TEAL }} />}
                </div>
                {(n.body || n.detail?.text) && <p className="text-sm text-slate-500 mt-1">{n.body || n.detail?.text}</p>}
                <p className="text-xs text-slate-400 mt-1.5">{new Date(n.createdAt).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}</p>
              </div>
            </button>
          ))}
        </Card>
      )}
    </PatientDashboardLayout>
  );
}