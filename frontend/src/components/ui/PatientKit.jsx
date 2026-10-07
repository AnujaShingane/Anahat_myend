// Shared visual language for the redesigned patient portal. Every new/rebuilt
// patient page (Dashboard, Book Session, Appointments, Tracking, Messages,
// Notifications, Reports, Profile) composes these instead of one-off markup,
// so spacing, radii, shadows, and color stay identical everywhere.

export const TEAL = '#0F8594';
export const TEAL_DARK = '#0A6976';
export const TEAL_LIGHT = '#0F8594';
export const LIME = '#E3F0A0';
export const CREAM = '#F6F4EC';

export function PageHeader({ title, subtitle, right }) {
  return (
    <div className="mb-4 flex items-start justify-between flex-wrap gap-4">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">{title}</h1>
        {subtitle && <p className="text-slate-500 text-sm mt-1 max-w-xl">{subtitle}</p>}
      </div>
      {right && <div>{right}</div>}
    </div>
  );
}

export function Card({ children, className = '', ...props }) {
  return (
    <div className={`border-b border-black/10 bg-white ${className}`} {...props}>
      {children}
    </div>
  );
}

export function PrimaryButton({ children, className = '', disabled, ...props }) {
  return (
    <button
      disabled={disabled}
      className={`px-6 py-3 rounded-xl font-bold text-sm text-white transition-all inline-flex items-center justify-center gap-2 ${
        disabled ? 'opacity-40 cursor-not-allowed' : 'hover:opacity-90'
      } ${className}`}
      style={{ background: TEAL }}
      {...props}
    >
      {children}
    </button>
  );
}

export function OutlineButton({ children, className = '', ...props }) {
  return (
    <button
      className={`px-6 py-3 rounded-xl font-bold text-sm border border-black/10 text-slate-700 hover:bg-[#F6F4EC] transition-all inline-flex items-center justify-center gap-2 ${className}`}
      {...props}
    >
      {children}
    </button>
  );
}

const STATUS_STYLES = {
  pending: { bg: '#FEF3C7', fg: '#92400E', label: 'Pending' },
  requested: { bg: '#FEF3C7', fg: '#92400E', label: 'Pending' },
  confirmed: { bg: '#DCFCE7', fg: '#166534', label: 'Upcoming' },
  scheduled: { bg: '#DCFCE7', fg: '#166534', label: 'Upcoming' },
  upcoming: { bg: '#DCFCE7', fg: '#166534', label: 'Upcoming' },
  rescheduled: { bg: '#DBEAFE', fg: '#1E40AF', label: 'Rescheduled' },
  completed: { bg: '#E2E8F0', fg: '#334155', label: 'Completed' },
  done: { bg: '#E2E8F0', fg: '#334155', label: 'Completed' },
  cancelled: { bg: '#FEE2E2', fg: '#991B1B', label: 'Cancelled' },
  rejected: { bg: '#FEE2E2', fg: '#991B1B', label: 'Cancelled' },
  declined: { bg: '#FEE2E2', fg: '#991B1B', label: 'Cancelled' },
};

export function StatusBadge({ status, className = '' }) {
  const meta = STATUS_STYLES[status] || { bg: '#F1F5F9', fg: '#475569', label: status || 'Unknown' };
  return (
    <span
      className={`inline-flex items-center px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-widest ${className}`}
      style={{ background: meta.bg, color: meta.fg }}
    >
      {meta.label}
    </span>
  );
}

export function Skeleton({ className = '' }) {
  return <div className={`animate-pulse rounded-xl bg-black/[0.06] ${className}`} />;
}

export function CardSkeleton({ className = '' }) {
  return (
    <Card className={`p-6 ${className}`}>
      <Skeleton className="h-4 w-1/3 mb-3" />
      <Skeleton className="h-3 w-2/3 mb-2" />
      <Skeleton className="h-3 w-1/2" />
    </Card>
  );
}

export function EmptyState({ icon, title, subtitle, action }) {
  return (
    <div className="text-center py-16 px-6">
      <div className="w-16 h-16 rounded-full mx-auto mb-5 flex items-center justify-center" style={{ background: CREAM }}>
        {icon || (
          <svg className="w-8 h-8" style={{ color: TEAL }} fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.25} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
          </svg>
        )}
      </div>
      <h3 className="text-lg font-bold text-slate-900 mb-1">{title}</h3>
      {subtitle && <p className="text-slate-500 text-sm max-w-sm mx-auto">{subtitle}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

export function ErrorState({ message, onRetry }) {
  return (
    <Card className="p-12 text-center">
      <svg className="w-12 h-12 text-red-400 mx-auto mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
      </svg>
      <p className="text-slate-700 font-semibold mb-4">{message || 'Something went wrong loading this page.'}</p>
      {onRetry && <OutlineButton onClick={onRetry}>Try Again</OutlineButton>}
    </Card>
  );
}

export function Spinner({ className = 'h-6 w-6' }) {
  return (
    <svg className={`animate-spin ${className}`} style={{ color: TEAL }} viewBox="0 0 24 24">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
    </svg>
  );
}

export function TextField({ label, className = '', ...props }) {
  return (
    <div className={`space-y-1.5 ${className}`}>
      {label && <label className="text-[11px] uppercase tracking-widest font-bold text-slate-500 ml-0.5">{label}</label>}
      <input
        className="w-full px-4 py-3 bg-[#F6F4EC] border border-black/5 rounded-xl text-slate-900 placeholder-slate-400 focus:border-[#0F8594] focus:bg-white outline-none transition-all text-sm"
        {...props}
      />
    </div>
  );
}

export function TextAreaField({ label, className = '', ...props }) {
  return (
    <div className={`space-y-1.5 ${className}`}>
      {label && <label className="text-[11px] uppercase tracking-widest font-bold text-slate-500 ml-0.5">{label}</label>}
      <textarea
        className="w-full px-4 py-3 bg-[#F6F4EC] border border-black/5 rounded-xl text-slate-900 placeholder-slate-400 focus:border-[#0F8594] focus:bg-white outline-none transition-all text-sm resize-none"
        {...props}
      />
    </div>
  );
}

export function SelectField({ label, options, className = '', ...props }) {
  return (
    <div className={`space-y-1.5 ${className}`}>
      {label && <label className="text-[11px] uppercase tracking-widest font-bold text-slate-500 ml-0.5">{label}</label>}
      <select
        className="w-full px-4 py-3 bg-[#F6F4EC] border border-black/5 rounded-xl text-slate-900 focus:border-[#0F8594] focus:bg-white outline-none transition-all text-sm"
        {...props}
      >
        {options.map((opt) => (
          <option key={opt.value ?? opt} value={opt.value ?? opt}>{opt.label ?? opt}</option>
        ))}
      </select>
    </div>
  );
}

export function initials(name) {
  if (!name) return '?';
  const parts = name.trim().split(/\s+/);
  return ((parts[0]?.[0] || '') + (parts[1]?.[0] || '')).toUpperCase() || name.charAt(0).toUpperCase();
}
