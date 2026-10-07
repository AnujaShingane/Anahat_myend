import { useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { usePatientSession } from '../../hooks/usePatientSession';
import PatientDashboardLayout from '../../components/layout/PatientDashboardLayout';
import { PortalError, PortalLoading } from '../../components/layout/PortalStatus';
import { createRelaxationOrder, getRelaxationPaymentStatus, payRelaxationOrder } from '../../services/api';
import { openRazorpayCheckout } from '../../utils/razorpayCheckout';

const PAYMENT_METHODS = [
  { key: 'upi', label: 'UPI', description: 'Pay using a UPI app' },
  { key: 'card', label: 'Credit / Debit Card', description: 'Visa, Mastercard, RuPay and more' },
  { key: 'netbanking', label: 'Net Banking', description: 'Select your bank in Razorpay Checkout' },
  { key: 'wallet', label: 'Wallet', description: 'Available wallets appear in Razorpay Checkout' },
];

export default function RelaxationPaymentPage() {
  const { user, loading, error, reload, logout } = usePatientSession();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const sessionId = searchParams.get('sessionId') || '';
  const concern = searchParams.get('concern') || 'relaxation';
  const track = searchParams.get('track') || '0';
  const [gateway, setGateway] = useState(null);
  const [fee, setFee] = useState(0);
  const [method, setMethod] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');

  useEffect(() => {
    if (!user?.id || !sessionId) return;
    getRelaxationPaymentStatus(user.id, sessionId)
      .then((status) => { setGateway(status.provider); setFee(status.fee || 0); })
      .catch((requestError) => setMessage(requestError.message || 'Could not check payment status.'));
  }, [user?.id, sessionId]);

  if (loading) return <PortalLoading />;
  if (error) return <PortalError message={error} onRetry={reload} onLogout={logout} />;

  const backToMusic = () => navigate(`/dashboard/relaxation?concern=${encodeURIComponent(concern)}&sessionId=${encodeURIComponent(sessionId)}&track=${encodeURIComponent(track)}`);

  const pay = async () => {
    if (!sessionId || !method || gateway === 'unavailable') return;
    setBusy(true);
    setMessage('');
    try {
      const order = await createRelaxationOrder(user.id, sessionId);
      let paymentRef = `mock-${Date.now()}`;
      if (order.provider === 'razorpay') {
        paymentRef = await openRazorpayCheckout({
          order,
          method,
          description: `Relaxation music session: ${concern}`,
          prefill: { name: user.name || '', email: user.email || '' },
          notes: { sessionId, concern },
        });
      }
      await payRelaxationOrder(user.id, order.paymentId, paymentRef, sessionId);
      navigate(`/dashboard/relaxation?concern=${encodeURIComponent(concern)}&sessionId=${encodeURIComponent(sessionId)}&track=${encodeURIComponent(track)}&play=1`, { replace: true });
    } catch (requestError) {
      setMessage(requestError.message || 'Payment could not be completed. Please try again.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <PatientDashboardLayout active="relaxation" user={user} onLogout={logout}>
      <div className="mx-auto max-w-2xl py-4">
        <Link to={`/dashboard/relaxation?concern=${encodeURIComponent(concern)}&sessionId=${encodeURIComponent(sessionId)}&track=${encodeURIComponent(track)}`} className="text-sm font-semibold text-[#0A6976] hover:underline">← Back to music</Link>
        <section className="mt-5 rounded-lg border border-[#E85D35] bg-white p-6 shadow-sm md:p-8">
          <p className="text-xs font-bold uppercase tracking-[0.14em] text-[#0A6976]">One listening session</p>
          <h1 className="mt-2 text-2xl font-bold text-[#292D32]">Choose a payment method</h1>
          <p className="mt-2 text-sm text-slate-600">This payment unlocks this session only. It is not a daily charge.</p>
          <p className="mt-5 text-3xl font-bold text-[#292D32]">₹{fee}</p>

          <fieldset className="mt-6 space-y-2">
            <legend className="mb-2 text-sm font-semibold text-slate-700">Payment source</legend>
            {PAYMENT_METHODS.map((option) => {
              const selected = method === option.key;
              return (
                <label key={option.key} className={`flex cursor-pointer items-center gap-3 rounded-md border px-4 py-3 transition ${selected ? 'border-[#0F8594] bg-[#EAF8F9]' : 'border-black/10 bg-white hover:border-[#0F8594]'}`}>
                  <input type="radio" name="payment-method" value={option.key} checked={selected} onChange={() => setMethod(option.key)} className="accent-[#0F8594]" />
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-semibold text-slate-800">{option.label}</span>
                    <span className="block text-xs text-slate-500">{option.description}</span>
                  </span>
                </label>
              );
            })}
          </fieldset>

          {gateway === 'mock' && <p className="mt-4 rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-800">Razorpay is not configured; local development uses a test payment flow.</p>}
          {gateway === 'unavailable' && <p role="alert" className="mt-4 rounded-md bg-rose-50 px-3 py-2 text-xs text-rose-700">Razorpay payments are not configured for this environment.</p>}
          {message && <p role="alert" className="mt-4 text-sm text-rose-700">{message}</p>}

          <button type="button" onClick={pay} disabled={!method || busy || gateway === null || gateway === 'unavailable'} className="mt-6 w-full rounded-md bg-[#0F8594] px-5 py-3 text-sm font-bold text-white transition hover:bg-[#0F8594] disabled:cursor-not-allowed disabled:opacity-45">
            {busy ? 'Opening secure checkout…' : gateway === 'mock' ? `Continue to test checkout · ₹${fee}` : `Continue to Razorpay · ₹${fee}`}
          </button>
        </section>
      </div>
    </PatientDashboardLayout>
  );
}
