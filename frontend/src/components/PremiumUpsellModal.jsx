import PremiumCard from './PremiumCard';

const TEAL = '#0F8594';

/**
 * Blocking-but-dismissible pop-up promoting the Premium plan. Used two ways:
 *  - once, the first time a patient reaches the dashboard on the Basic plan
 *    (see Dashboard.jsx — dismissal is remembered per-browser)
 *  - whenever a patient's free AI consultations run out (title/subtitle
 *    swap to reflect that they've hit the limit, not just a suggestion)
 */
export default function PremiumUpsellModal({ userId, blocking = false, onClose }) {
  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/40 backdrop-blur-sm px-4" onClick={() => !blocking && onClose?.()}>
      <div className="bg-white rounded-3xl shadow-2xl max-w-md w-full p-7" onClick={(e) => e.stopPropagation()}>
        <p className="text-[11px] font-bold uppercase tracking-[0.2em]" style={{ color: TEAL }}>Anahat Premium</p>
        <h2 className="text-xl font-bold text-slate-900 mt-1">
          {blocking ? "You've used your free AI consultations" : 'Get more from Anahat'}
        </h2>
        <p className="text-sm text-slate-500 mt-1 mb-5">
          {blocking
            ? 'Upgrade to Premium for unlimited AI consultations and unlimited Relaxation sessions.'
            : "You're on the Basic plan — 5 AI consultations free, then Premium unlocks unlimited AI and unlimited Relaxation sessions."}
        </p>
        <PremiumCard userId={userId} onUpgraded={onClose} compact />
        {!blocking && (
          <button type="button" onClick={onClose} className="mt-5 text-xs text-slate-400 underline w-full text-center">
            Maybe later
          </button>
        )}
      </div>
    </div>
  );
}
