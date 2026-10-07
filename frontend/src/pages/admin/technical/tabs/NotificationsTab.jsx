import { useMemo, useState } from 'react';
import NotificationPanel from '../../../../components/admin/NotificationPanel';

export default function NotificationsTab({ notifications, onMarkRead }) {
  const [month, setMonth] = useState(''); // 'YYYY-MM'
  const [date, setDate] = useState('');   // 'YYYY-MM-DD' — takes priority over month when set

  const filtered = useMemo(() => {
    if (!date && !month) return notifications;
    return notifications.filter((n) => {
      if (!n.createdAt) return false;
      const iso = new Date(n.createdAt).toISOString();
      if (date) return iso.slice(0, 10) === date;
      return iso.slice(0, 7) === month;
    });
  }, [notifications, month, date]);

  const clearFilters = () => { setMonth(''); setDate(''); };

  return (
    <div className="pt-8 space-y-6">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="font-serif font-bold text-2xl text-slate-900">Notifications</h1>
          <p className="text-slate-500 text-sm mt-1">System-wide alerts: new registrations, therapist applications, security events.</p>
        </div>
        <div className="flex items-center gap-2">
          <input
            type="month"
            value={month}
            onChange={(e) => { setMonth(e.target.value); setDate(''); }}
            className="px-3 py-2 bg-black/[0.03] border border-black/10 rounded-xl text-sm"
          />
          <input
            type="date"
            value={date}
            onChange={(e) => { setDate(e.target.value); setMonth(''); }}
            className="px-3 py-2 bg-black/[0.03] border border-black/10 rounded-xl text-sm"
          />
          {(month || date) && (
            <button onClick={clearFilters} className="text-xs font-bold text-slate-400 underline">Clear</button>
          )}
        </div>
      </div>
      <div className="bg-white rounded-3xl border border-black/5 p-6">
        {(month || date) && (
          <p className="text-xs text-slate-400 mb-3">{filtered.length} of {notifications.length} notifications shown.</p>
        )}
        <NotificationPanel notifications={filtered} onMarkRead={onMarkRead} />
      </div>
    </div>
  );
}
