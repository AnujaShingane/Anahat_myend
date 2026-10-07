import EmptyState from './EmptyState';
import { SAGE } from '../layout/TherapistDashboardLayout';
import { timeAgo } from '../../pages/therapist/scheduleUtils';

const DOT_COLORS = {
  appointment: '#3F6B4F',
  session: '#2F4A3B',
  report: '#8A6FB0',
  user: '#B98A4D',
  therapist: '#4D8CB9',
  audit: '#6B7280',
};

// Generic "text + timestamp" activity feed, reused by both admin dashboards
// for recent activity / audit-derived summaries.
export default function ActivityList({ items, emptyTitle = 'No recent activity', emptySubtitle }) {
  if (!items || items.length === 0) {
    return <EmptyState title={emptyTitle} subtitle={emptySubtitle} />;
  }
  return (
    <div className="space-y-1">
      {items.map((a) => (
        <div key={a.id} className="flex items-center justify-between gap-4 py-2.5 border-b last:border-0 border-black/[0.04]">
          <div className="flex items-center gap-3 min-w-0">
            <span className="w-2 h-2 rounded-full shrink-0" style={{ background: DOT_COLORS[a.type] || SAGE }} />
            <p className="text-sm text-slate-700 truncate">{a.text}</p>
          </div>
          <span className="text-xs text-slate-400 shrink-0">{a.at ? timeAgo(a.at) : ''}</span>
        </div>
      ))}
    </div>
  );
}
