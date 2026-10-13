import { SAGE_DARK } from '../layout/TherapistDashboardLayout';

// Grid of shortcut buttons into other tabs of the same console — same
// pattern as the Therapist DashboardHome "Quick Actions" section.
export default function QuickActions({ actions, onNavigate }) {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-3">
      {actions.map((a) => (
        <button
          key={a.key}
          onClick={() => onNavigate(a.key)}
          className="flex flex-col items-center gap-2 rounded-2xl px-3 py-5 bg-black/[0.02] hover:bg-black/[0.04] transition-all text-center"
        >
          <span className="w-11 h-11 rounded-2xl flex items-center justify-center bg-white" style={{ color: SAGE_DARK }}>
            <a.icon className="w-5 h-5" />
          </span>
          <span className="text-xs font-bold text-slate-700">{a.label}</span>
        </button>
      ))}
    </div>
  );
}
