import EmptyState from './EmptyState';

// Full-page notification list (distinct from the header bell dropdown in
// AdminDashboardLayout) — reads/writes the same getAdminNotifications /
// markNotificationRead store used across the app.
export default function NotificationPanel({ notifications, onMarkRead }) {
  if (notifications.length === 0) {
    return <EmptyState title="All caught up" subtitle="New registrations, therapist applications, and workflow alerts show up here." />;
  }
  return (
    <div className="space-y-2">
      {notifications.map((n) => (
        <div key={n.id} className={`flex justify-between items-center rounded-xl px-4 py-3 ${n.read ? 'bg-black/[0.02]' : 'bg-sunset-soft border border-sunset'}`}>
          <p className="text-sm text-slate-700">{n.message}</p>
          {!n.read && <button onClick={() => onMarkRead(n.id)} className="text-xs font-bold text-sunset shrink-0 ml-3">Mark Read</button>}
        </div>
      ))}
    </div>
  );
}
