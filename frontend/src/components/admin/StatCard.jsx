import { SAGE_DARK } from '../layout/TherapistDashboardLayout';

// Small stat tile for admin dashboard headers/grids. Mirrors the StatPill
// pattern used on the Therapist DashboardHome so both consoles share the
// same visual language.
export default function StatCard({ icon: Icon, value, label, tone }) {
  return (
    <div className="bg-white rounded-3xl border border-black/5 p-5 flex items-center gap-4">
      <div className="w-11 h-11 rounded-2xl flex items-center justify-center shrink-0" style={{ background: '#EAF1EA', color: tone || SAGE_DARK }}>
        {Icon ? <Icon className="w-5 h-5" /> : <span className="w-2 h-2 rounded-full bg-current" />}
      </div>
      <div className="min-w-0">
        <p className="font-serif font-bold text-2xl text-slate-900 leading-none">{value}</p>
        <p className="text-xs text-slate-500 mt-1 truncate">{label}</p>
      </div>
    </div>
  );
}
