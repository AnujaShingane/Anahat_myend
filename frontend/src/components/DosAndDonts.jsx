import { DOS, DONTS } from '../constants/consent';

const TEAL = '#0F8594';

// Two-column Do's & Don'ts panel, reused on the consent page and at the top
// of the Music Library.
export default function DosAndDonts({ compact = false }) {
  return (
    <div className={`grid grid-cols-1 md:grid-cols-2 ${compact ? 'gap-4' : 'gap-6'}`}>
      <div className="rounded-2xl border border-emerald-200 bg-emerald-50/60 p-5">
        <h3 className="flex items-center gap-2 font-bold text-emerald-800 mb-3">
          <span className="w-6 h-6 rounded-full bg-emerald-600 text-white flex items-center justify-center text-xs">✓</span>
          Do&apos;s
        </h3>
        <ul className="space-y-2 text-sm text-slate-700 leading-relaxed">
          {DOS.map((d) => (
            <li key={d} className="flex gap-2"><span className="text-emerald-600 shrink-0">•</span><span>{d}</span></li>
          ))}
        </ul>
      </div>
      <div className="rounded-2xl border border-rose-200 bg-rose-50/60 p-5">
        <h3 className="flex items-center gap-2 font-bold text-rose-800 mb-3">
          <span className="w-6 h-6 rounded-full bg-rose-600 text-white flex items-center justify-center text-xs">✕</span>
          Don&apos;ts
        </h3>
        <ul className="space-y-2 text-sm text-slate-700 leading-relaxed">
          {DONTS.map((d) => (
            <li key={d} className="flex gap-2"><span className="text-rose-600 shrink-0">•</span><span>{d}</span></li>
          ))}
        </ul>
      </div>
      {!compact && (
        <p className="md:col-span-2 text-xs text-slate-500" style={{ color: TEAL }}>
          These apply to every listening and therapy session.
        </p>
      )}
    </div>
  );
}
