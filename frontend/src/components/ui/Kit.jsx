import PublicNav from '../public/PublicNav';
import PublicFooter from '../public/PublicFooter';
import { useNavigate } from 'react-router-dom';
// Shared UI primitives for the ANAHAT patient / therapist / admin experiences.
// Kept deliberately lightweight and dependency-free so they drop into the
// existing Tailwind + serif/amber design language without any redesign.

export function PageShell({ children, className = '', fullScreen = false, showBack = true }) {
  const navigate = useNavigate();
  return (
    <div className={`${fullScreen ? 'h-[100dvh] overflow-hidden' : 'min-h-screen overflow-y-auto'} relative flex w-full flex-col bg-[#FDF6EE] font-sans text-slate-900 ${className}`}>
      {!fullScreen && <div
        className="fixed inset-0 opacity-[0.04] pointer-events-none z-0 mix-blend-overlay"
        style={{ backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.65'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' fill='%23000'/%3E%3C/svg%3E")` }}
      />}
      {!fullScreen && <PublicNav tone="light" />}
      <div className={`relative z-10 flex ${fullScreen ? 'h-full min-h-0 flex-col' : 'min-h-0 flex-1 flex-col pt-24'}`}>
        {showBack && <div className="shrink-0 px-4 pt-2 sm:px-6">
          <button type="button" onClick={() => (window.history.length > 1 ? navigate(-1) : navigate('/'))} aria-label="Go back" title="Go back" className="flex h-10 w-10 items-center justify-center rounded-full border border-black/10 bg-white text-slate-600 hover:text-slate-900">
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.25} d="M15 19l-7-7 7-7" /></svg>
          </button>
        </div>}
        <div className={`flex-1 ${fullScreen ? 'min-h-0' : ''}`}>{children}</div>
      </div>
      {!fullScreen && <PublicFooter />}
    </div>
  );
}

export function Card({ children, className = '' }) {
  return (
    <div className={`border-b border-black/10 bg-white px-5 py-5 md:px-6 md:py-6 ${className}`}>
      {children}
    </div>
  );
}

export function SectionHeading({ eyebrow, title, subtitle, right }) {
  return (
    <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-4 mb-6">
      <div>
        {eyebrow && (
          <span className="text-[11px] font-bold uppercase tracking-widest text-sunset">{eyebrow}</span>
        )}
        <h1 className="text-3xl md:text-4xl font-serif font-bold text-slate-900 mt-2">{title}</h1>
        {subtitle && <p className="text-slate-600 mt-3 max-w-2xl leading-relaxed">{subtitle}</p>}
      </div>
      {right && <div>{right}</div>}
    </div>
  );
}

export function PrimaryButton({ children, className = '', icon, ...props }) {
  return (
    <button
      className={`btn-sunset td-btn-pop px-6 py-3.5 rounded-2xl font-bold text-sm inline-flex items-center justify-center gap-2 ${className}`}
      {...props}
    >
      {icon}
      {children}
    </button>
  );
}

export function OutlineButton({ children, className = '', ...props }) {
  return (
    <button
      className={`btn-sunset-outline td-btn-pop px-6 py-3.5 rounded-2xl font-bold text-sm inline-flex items-center justify-center gap-2 ${className}`}
      {...props}
    >
      {children}
    </button>
  );
}

export function Badge({ children, tone = 'sunset', className = '' }) {
  const tones = {
    sunset: 'bg-sunset-soft border-sunset text-sunset',
    emerald: 'bg-emerald-500/10 border-emerald-500/20 text-emerald-700',
    purple: 'bg-purple-500/10 border-purple-500/20 text-purple-700',
    slate: 'bg-slate-500/10 border-slate-500/20 text-slate-600',
    red: 'bg-red-500/10 border-red-500/20 text-red-600',
    amber: 'bg-amber-500/10 border-amber-500/20 text-amber-700',
  };
  return (
    <span className={`td-chip inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wide border ${tones[tone]} ${className}`}>
      {children}
    </span>
  );
}

// Shared status → { tone, label } mapping so appointments, requests, and
// activity check-ins all use the same green/red/yellow language everywhere
// they're shown (patient side, therapist side, admin side).
export function statusMeta(status) {
  const map = {
    pending: { tone: 'amber', label: 'Pending' },
    requested: { tone: 'amber', label: 'Pending' },
    confirmed: { tone: 'emerald', label: 'Upcoming' },
    scheduled: { tone: 'emerald', label: 'Upcoming' },
    completed: { tone: 'emerald', label: 'Done' },
    done: { tone: 'emerald', label: 'Done' },
    past: { tone: 'slate', label: 'Past' },
    cancelled: { tone: 'red', label: 'Cancelled' },
    rejected: { tone: 'red', label: 'Cancelled' },
    declined: { tone: 'red', label: 'Cancelled' },
  };
  return map[status] || { tone: 'slate', label: status };
}

export function StatusBadge({ status, className = '' }) {
  const { tone, label } = statusMeta(status);
  return <Badge tone={tone} className={className}>{label}</Badge>;
}

export function TextField({ label, className = '', ...props }) {
  return (
    <div className={`space-y-1.5 ${className}`}>
      {label && <label className="text-[10px] uppercase tracking-widest font-bold text-slate-500 ml-1">{label}</label>}
      <input
        className="w-full px-5 py-3.5 bg-black/[0.025] border border-black/10 rounded-2xl text-slate-900 placeholder-slate-400 focus:border-[#0F8594] focus:bg-white focus:shadow-[0_0_0_3px_rgba(32,175,192,0.15)] outline-none transition-all duration-200"
        {...props}
      />
    </div>
  );
}

export function SelectField({ label, options, className = '', ...props }) {
  return (
    <div className={`space-y-1.5 ${className}`}>
      {label && <label className="text-[10px] uppercase tracking-widest font-bold text-slate-500 ml-1">{label}</label>}
      <select
        className="w-full px-5 py-3.5 bg-black/[0.025] border border-black/10 rounded-2xl text-slate-900 focus:border-[#0F8594] focus:bg-white focus:shadow-[0_0_0_3px_rgba(32,175,192,0.15)] outline-none transition-all duration-200"
        {...props}
      >
        {options.map((opt) => (
          <option key={opt.value ?? opt} value={opt.value ?? opt}>{opt.label ?? opt}</option>
        ))}
      </select>
    </div>
  );
}

export function TextAreaField({ label, className = '', ...props }) {
  return (
    <div className={`space-y-1.5 ${className}`}>
      {label && <label className="text-[10px] uppercase tracking-widest font-bold text-slate-500 ml-1">{label}</label>}
      <textarea
        className="w-full px-5 py-3.5 bg-black/[0.025] border border-black/10 rounded-2xl text-slate-900 placeholder-slate-400 focus:border-[#0F8594] focus:bg-white focus:shadow-[0_0_0_3px_rgba(32,175,192,0.15)] outline-none transition-all duration-200 resize-none"
        {...props}
      />
    </div>
  );
}

export function Tabs({ tabs, active, onChange }) {
  return (
    <div className="flex gap-2 overflow-x-auto no-scrollbar">
      {tabs.map((t) => (
        <button
          key={t.key}
          onClick={() => onChange(t.key)}
          className={`td-chip px-5 py-2.5 rounded-full text-xs font-bold uppercase tracking-widest whitespace-nowrap border ${
            active === t.key
              ? 'bg-slate-900 text-white border-slate-900 shadow-md'
              : 'bg-white/60 text-slate-500 border-black/10 hover:border-sunset hover:text-sunset'
          }`}
        >
          {t.label}
        </button>
      ))}
    </div>
  );
}

export function EmptyState({ title, subtitle, action, icon }) {
  return (
    <div className="text-center py-16 px-6">
      <div className="w-14 h-14 rounded-2xl flex items-center justify-center mx-auto mb-4" style={{ background: 'var(--td-green-light, #EAF5EE)' }}>
        {icon || <EmptyStateGlyph className="w-6 h-6" style={{ color: 'var(--td-green, #2F5D50)' }} />}
      </div>
      <h3 className="text-xl font-serif font-bold text-slate-800 mb-2">{title}</h3>
      {subtitle && <p className="text-slate-500 text-sm max-w-md mx-auto mb-6">{subtitle}</p>}
      {action}
    </div>
  );
}

function EmptyStateGlyph(props) {
  return (
    <svg {...props} fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.6} d="M9 13h6m-6 4h3m-7 4h14a2 2 0 002-2V7.5a2 2 0 00-.586-1.414l-3.5-3.5A2 2 0 0011.5 2H5a2 2 0 00-2 2v14a2 2 0 002 2z" />
    </svg>
  );
}

export function StatCard({ label, value, tone = 'slate' }) {
  const tones = {
    slate: { text: 'text-slate-900', bg: '#F1F5F9' },
    sunset: { text: 'text-sunset', bg: 'var(--td-mint, #DDF3E5)' },
    emerald: { text: 'text-emerald-600', bg: 'var(--td-green-light, #EAF5EE)' },
    purple: { text: 'text-purple-600', bg: 'var(--td-lavender, #F2ECFF)' },
    red: { text: 'text-red-600', bg: '#FEF2F2' },
  };
  const t = tones[tone] || tones.slate;
  return (
    <div className="td-card-hover rounded-2xl p-6 text-center border border-black/5" style={{ background: t.bg }}>
      <p className={`text-3xl font-serif font-bold ${t.text}`}>{value}</p>
      <p className="text-xs text-slate-500 uppercase tracking-widest mt-2">{label}</p>
    </div>
  );
}