import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { PageShell, Card, PrimaryButton, TextField } from '../../components/ui/Kit';
import DosAndDonts from '../../components/DosAndDonts';
import { isValidPhone } from '../../utils/phone';
import {
  saveRelaxationSession, getRelaxationPaymentStatus, createRelaxationOrder, payRelaxationOrder,
} from '../../services/api';

const TEAL = '#0F8594';

// Relaxation, per the current spec, is a short gated flow before the
// existing track-picker/player page:
//  1. Small basic-info form
//  2. Payment (Relaxation is now a paid feature)
//  3. Do's & Don'ts agreement
//  4. -> existing Relaxation tracks page, which itself asks the concern
export default function RelaxationIntake() {
  const { user } = useAuth();
  const navigate = useNavigate();

  const [step, setStep] = useState('checking'); // checking | info | payment | agreement
  const [form, setForm] = useState({ name: user?.name || '', age: '', phone: '' });
  const [error, setError] = useState('');
  const [paying, setPaying] = useState(false);
  const [fee, setFee] = useState(199);
  const [agreed, setAgreed] = useState(false);

  useEffect(() => {
    if (!user?.id) return;
    getRelaxationPaymentStatus(user.id)
      .then((s) => {
        setFee(s.fee);
        setStep(s.paid ? 'agreement' : 'info');
      })
      .catch(() => setStep('info'));
  }, [user?.id]);

  const submitInfo = () => {
    if (!form.name.trim() || !form.age || !isValidPhone(form.phone)) {
      setError('Please fill in your name, age and a valid phone number.');
      return;
    }
    setError('');
    saveRelaxationSession(user.id, { intake: form }).catch(() => {});
    setStep('payment');
  };

  const pay = async () => {
    setPaying(true);
    setError('');
    try {
      const order = await createRelaxationOrder(user.id);
      // Mock gateway — a real integration would open Razorpay/Stripe's
      // checkout here and use the ref it returns.
      await payRelaxationOrder(user.id, order.paymentId, `mock-${Date.now()}`);
      setStep('agreement');
    } catch (err) {
      setError(err.message || 'Payment failed. Please try again.');
    } finally {
      setPaying(false);
    }
  };

  const proceed = () => {
    if (!agreed) return;
    navigate('/relaxation');
  };

  if (step === 'checking') {
    return <PageShell><div className="min-h-screen" /></PageShell>;
  }

  return (
    <PageShell>
      <div className="max-w-2xl mx-auto px-6 py-16">
        <div className="text-center mb-10">
          <span className="text-[11px] font-bold uppercase tracking-widest text-sunset">Relaxation Session</span>
          <h1 className="text-3xl md:text-4xl font-serif font-bold text-slate-900 mt-2">
            {step === 'info' && 'A few quick details'}
            {step === 'payment' && 'Confirm your payment'}
            {step === 'agreement' && "Please review the Do's & Don'ts"}
          </h1>
        </div>

        {step === 'info' && (
          <Card className="space-y-4">
            <TextField label="Full Name" value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} placeholder="Your name" />
            <TextField label="Age" type="number" min={1} value={form.age} onChange={(e) => setForm((f) => ({ ...f, age: e.target.value }))} placeholder="Age" />
            <TextField label="Phone Number" value={form.phone} onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))} placeholder="Mobile number (add country code if outside India)" />
            {error && <p className="text-sm text-red-600">{error}</p>}
            <div className="flex justify-end pt-2">
              <PrimaryButton onClick={submitInfo}>Continue to payment</PrimaryButton>
            </div>
          </Card>
        )}

        {step === 'payment' && (
          <Card className="text-center space-y-5">
            <p className="text-slate-600 text-sm">Relaxation sessions are a paid feature — this unlocks unlimited listening for today.</p>
            <p className="text-4xl font-bold" style={{ color: TEAL }}>₹{fee}</p>
            {error && <p className="text-sm text-red-600">{error}</p>}
            <button
              type="button"
              onClick={pay}
              disabled={paying}
              className="px-8 py-3.5 rounded-2xl text-sm font-bold text-white disabled:opacity-50 transition-all"
              style={{ background: TEAL }}
            >
              {paying ? 'Processing…' : `Pay ₹${fee} Securely`}
            </button>
          </Card>
        )}

        {step === 'agreement' && (
          <Card className="space-y-6">
            <DosAndDonts />
            <label className="flex items-start gap-3 cursor-pointer pt-2 border-t border-black/5">
              <input type="checkbox" checked={agreed} onChange={(e) => setAgreed(e.target.checked)} className="mt-1 w-4 h-4 accent-[#0F8594]" />
              <span className="text-sm text-slate-700">I have read and agree to follow these guidelines for my Relaxation session.</span>
            </label>
            <div className="flex justify-end">
              <PrimaryButton onClick={proceed} disabled={!agreed}>Continue to tracks</PrimaryButton>
            </div>
          </Card>
        )}
      </div>
    </PageShell>
  );
}
