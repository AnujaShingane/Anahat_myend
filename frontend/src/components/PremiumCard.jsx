import { useEffect, useState } from 'react';
import { getSubscriptionStatus, createPremiumOrder, confirmPremiumUpgrade } from '../services/api';

const TEAL = '#0F8594';

/**
 * Shows the patient's current plan (Basic/Premium), their remaining free AI
 * consultations, and an "Upgrade" button (mock payment). Used both as a
 * standing card in Settings and inside the blocking Premium pop-up.
 */
export default function PremiumCard({ userId, onUpgraded, compact = false }) {
  const [sub, setSub] = useState(null);
  const [upgrading, setUpgrading] = useState(false);
  const [error, setError] = useState('');

  const refresh = () => {
    getSubscriptionStatus(userId).then(setSub).catch((err) => console.error('Failed to load subscription:', err));
  };
  useEffect(refresh, [userId]);

  const upgrade = async () => {
    setUpgrading(true);
    setError('');
    try {
      const order = await createPremiumOrder(userId);
      await confirmPremiumUpgrade(userId, order.orderId, `mock-${Date.now()}`);
      refresh();
      onUpgraded?.();
    } catch (err) {
      setError(err.message || 'Upgrade failed. Please try again.');
    } finally {
      setUpgrading(false);
    }
  };

  if (!sub) return null;
  const isPremium = sub.plan === 'premium';

  return (
    <div className={compact ? '' : 'bg-white border border-black/5 rounded-3xl shadow-sm p-6'}>
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <p className="text-[11px] font-bold uppercase tracking-widest text-slate-400 mb-1">Your plan</p>
          <p className="text-lg font-bold text-slate-900 flex items-center gap-2">
            {isPremium ? 'Premium' : 'Basic'}
            {isPremium && <span className="text-[10px] font-bold px-2 py-0.5 rounded-full text-white" style={{ background: TEAL }}>ACTIVE</span>}
          </p>
          {!isPremium && (
            <p className="text-sm text-slate-500 mt-1">
              {sub.aiRemaining > 0
                ? `${sub.aiRemaining} of ${sub.aiFreeLimit} free AI consultations left.`
                : "You've used all your free AI consultations."}
              {' '}Relaxation sessions are paid per day on the Basic plan.
            </p>
          )}
          {isPremium && <p className="text-sm text-slate-500 mt-1">Unlimited AI consultations and unlimited Relaxation sessions.</p>}
        </div>
        {!isPremium && (
          <button
            type="button"
            onClick={upgrade}
            disabled={upgrading}
            className="px-6 py-2.5 rounded-xl text-sm font-bold text-white disabled:opacity-50 transition-all shrink-0"
            style={{ background: TEAL }}
          >
            {upgrading ? 'Processing…' : `Upgrade to Premium — ₹${sub.premiumFee}`}
          </button>
        )}
      </div>
      {error && <p className="text-sm text-red-600 mt-3">{error}</p>}
    </div>
  );
}
