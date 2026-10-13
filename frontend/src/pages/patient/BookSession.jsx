import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { usePatientSession } from '../../hooks/usePatientSession';
import PatientDashboardLayout from '../../components/layout/PatientDashboardLayout';
import TherapistCard from '../../components/patient/TherapistCard';
import { PortalLoading, PortalError } from '../../components/layout/PortalStatus';
import {
  Card, PrimaryButton, EmptyState, CardSkeleton, SelectField,
  LIME, TEAL_LIGHT, initials,
} from '../../components/ui/PatientKit';
import {
  getTherapists, getFreeSlots, bookRealAppointment, payForAppointment,
} from '../../services/api';
import { formatISTDate, formatISTTime, formatISTTimeShort } from '../../utils/time';

const TEAL = '#0F8594';
const TEAL_DARK = '#075E68';

// Platform-wide service fee applied on top of whatever the therapist sets as
// their own session fee — a business policy constant, not per-therapist
// data (the therapist's own fee is read live from their profile).
const PLATFORM_FEE = 49;
const SLOT_LOOKAHEAD_DAYS = 14;

const STEPS = [
  { key: 'therapist', label: 'Select Therapist' },
  { key: 'details', label: 'Appointment Details' },
  { key: 'payment', label: 'Payment' },
];

const MODES = [
  { key: 'offline', label: 'In Person Appointment' },
  { key: 'online', label: 'Online Appointment' },
];

const PAYMENT_METHODS = [
  { key: 'hospital', label: 'Pay At Hospital', sub: 'Pay in person at your selected hospital' },
  { key: 'online', label: 'Pay Online', sub: 'Pay securely online now' },
];

// This is the ONLY place therapists are shown to a patient — reached from
// the dashboard's "Book a Session" action, never during registration or
// onboarding. The patient picks a therapist and a real open slot directly;
// there is no assignment step anywhere in this flow.
export default function BookSession() {
  const { user, loading, error, reload, logout } = usePatientSession();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  const [step, setStep] = useState(() => searchParams.get('therapistId') ? 1 : 0);
  const [therapists, setTherapists] = useState(null);
  const [locationFilter, setLocationFilter] = useState('');
  const [selectedTherapistId, setSelectedTherapistId] = useState(() => searchParams.get('therapistId'));
  const [slotsLoading, setSlotsLoading] = useState(false);
  const [occurrences, setOccurrences] = useState([]);
  const [selectedOccurrence, setSelectedOccurrence] = useState(null);
  const [title, setTitle] = useState('');
  const [patientName, setPatientName] = useState(() => user?.name || '');
  const [dateOfBirth, setDateOfBirth] = useState('');
  const [mode, setMode] = useState('');
  const [appointmentDate, setAppointmentDate] = useState('');
  const [preferredHospital, setPreferredHospital] = useState('');
  const [paymentMethod, setPaymentMethod] = useState('');
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [booking, setBooking] = useState(false);
  const [bookingError, setBookingError] = useState(null);
  const [confirmed, setConfirmed] = useState(null);
  const [query, setQuery] = useState('');

  useEffect(() => {
    if (!user?.id) return;
    getTherapists()
      // GET /api/therapists already only returns approved + profile-complete
      // therapists (see backend controllers/therapistController.js) — no
      // client-side filter needed here. (An earlier version of this file
      // re-filtered on t.isApproved, a field the public directory endpoint
      // deliberately doesn't return, which silently hid every therapist.)
      .then((list) => setTherapists(list))
      .catch((err) => console.error('Failed to load therapists:', err));
  }, [user?.id]);

  const selectedTherapist = therapists?.find((t) => t.id === selectedTherapistId) || null;
  const availableDates = [...new Set(occurrences.map((occurrence) => occurrence.dateStr))];

  // Real, live free-slot computation for the chosen therapist over the next
  // two weeks — considers recurring weekly availability, blocked dates, and
  // already-booked slots (see backend services/bookingService.js#freeSlotsOn).
  // Prevents double-booking because the same check re-runs server-side at
  // the moment of booking.
  useEffect(() => {
    if (!selectedTherapistId) { setOccurrences([]); return; }
    setSlotsLoading(true);
    setSelectedOccurrence(null);
    const today = new Date();
    const dateStrs = Array.from({ length: SLOT_LOOKAHEAD_DAYS }, (_, i) => {
      const d = new Date(today.getTime() + i * 24 * 60 * 60 * 1000);
      return d.toISOString().slice(0, 10);
    });
    Promise.all(dateStrs.map((dateStr) => getFreeSlots(selectedTherapistId, dateStr).then((slots) => (slots || []).map((s) => ({ dateStr, ...s }))).catch(() => [])))
      .then((results) => {
        const flat = results.flat().map((s) => ({
          dateStr: s.dateStr,
          startTime: s.startTime,
          endTime: s.endTime,
          date: new Date(`${s.dateStr}T${s.startTime}:00+05:30`),
        })).sort((a, b) => a.date - b.date);
        setOccurrences(flat);
      })
      .finally(() => setSlotsLoading(false));
  }, [selectedTherapistId]);

  if (loading) return <PortalLoading />;
  if (error) return <PortalError message={error} onRetry={reload} onLogout={logout} />;

  const locations = therapists ? [...new Set(therapists.map((t) => t.location).filter(Boolean))].sort() : [];
  const visibleTherapists = therapists
    ? (locationFilter ? therapists.filter((t) => t.location === locationFilter) : therapists)
    : [];

  const goTo = (i) => setStep(Math.max(0, Math.min(STEPS.length - 1, i)));

  const bookTherapist = (id) => {
    setSelectedTherapistId(id);
    goTo(1);
  };

  const canContinueFromStep = [
    !!selectedTherapistId,
    !!title && !!patientName.trim() && !!dateOfBirth && !!mode && !!appointmentDate && !!selectedOccurrence && !!preferredHospital,
    false,
  ];

  const submitPayment = async () => {
    if (!selectedTherapist || !selectedOccurrence) return;
    setBooking(true);
    setBookingError(null);
    try {
      // Real booking: server re-validates the slot is still free (prevents
      // double-booking even under concurrent requests) and opens a mock
      // payment order.
      const { appointment, payment } = await bookRealAppointment(
        selectedTherapist.id, selectedOccurrence.dateStr, selectedOccurrence.startTime, mode,
        { title, patientName: patientName.trim(), dateOfBirth, preferredHospital },
      );
      // ---------------------------------------------------------------
      // NOTE for a real payment gateway integration (Razorpay, per the
      // product's UPI-first design): this is where its Checkout SDK would
      // collect payment client-side and return a signed reference, verified
      // server-side in payForAppointment before the appointment is
      // confirmed. Today the mock gateway accepts any reference.
      // ---------------------------------------------------------------
      const paymentResult = await payForAppointment(
        payment.id,
        paymentMethod === 'online' ? `mock-${Date.now()}` : '',
        paymentMethod,
        termsAccepted,
      );
      setConfirmed(paymentResult.appointment || appointment);
    } catch (err) {
      setBookingError(err.message || 'Payment failed. Please try again.');
    } finally {
      setBooking(false);
    }
  };

  if (confirmed) {
    return (
      <PatientDashboardLayout active="book-session" user={user} onLogout={logout} search={{ placeholder: 'Search therapists by name or specialization', value: query, onChange: setQuery }}>
        <Card className="p-12 text-center max-w-xl mx-auto">
          <div className="w-16 h-16 rounded-full mx-auto mb-5 flex items-center justify-center" style={{ background: LIME }}>
            <svg className="w-8 h-8" style={{ color: TEAL }} fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <h2 className="text-xl font-bold text-slate-900 mb-2">Your appointment is confirmed</h2>
          <p className="text-slate-500 text-sm mb-6">
            {title} {patientName}, your appointment with {selectedTherapist?.name} is confirmed for{' '}
            {formatISTDate(selectedOccurrence.date)} at {formatISTTime(selectedOccurrence.date)}.
          </p>
          <div className="mb-6 rounded-xl bg-[#F6FAF8] p-4 text-left text-sm text-slate-600">
            <p className="font-bold text-slate-900">Appointment ID: {confirmed.id}</p>
            <p className="mt-2">Date of birth: {dateOfBirth}</p>
            <p>Appointment type: {MODES.find((option) => option.key === mode)?.label}</p>
            <p>Preferred hospital: {preferredHospital}</p>
            <p>Payment: {paymentMethod === 'hospital' ? 'Pay At Hospital' : 'Paid Online'}</p>
          </div>
          <PrimaryButton onClick={() => navigate('/dashboard/appointments')} className="mx-auto" style={{ background: TEAL }}>View Appointments</PrimaryButton>
        </Card>
      </PatientDashboardLayout>
    );
  }

  return (
    <PatientDashboardLayout active="book-session" user={user} onLogout={logout} search={{ placeholder: 'Search therapists by name or specialization', value: query, onChange: setQuery }}>
      <div className="flex items-center gap-3 mb-1">
        {step > 0 && (
          <button onClick={() => goTo(step - 1)} aria-label="Back" className="text-slate-400 hover:text-slate-700">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
          </button>
        )}
        <h1 className="text-2xl font-bold text-slate-900">Book an Appointment</h1>
      </div>
      <p className="text-slate-500 text-sm mt-1 mb-6">
        {step === 0 ? "Book a session with the right therapist for you." : "You're almost there! Just a few more steps."}
      </p>

      <Stepper steps={STEPS} current={step} />

      {therapists === null ? (
        <CardSkeleton className="p-8 mt-6" />
      ) : (
        <div className={`mt-8 ${step === 2 ? 'grid grid-cols-1 lg:grid-cols-[1fr_360px] gap-6 items-start' : ''}`}>
          <div>
            {step === 0 && (
              <TherapistStep therapists={visibleTherapists.filter((t) => { const q = query.trim().toLowerCase(); return !q || [t.name, ...(t.expertise || []), t.profile?.profession].filter(Boolean).some((v) => String(v).toLowerCase().includes(q)); })}
                locations={locations}
                locationFilter={locationFilter}
                onLocationFilter={setLocationFilter}
                selectedId={selectedTherapistId}
                onViewProfile={(id) => navigate(`/dashboard/therapists/${id}`)}
                onBook={bookTherapist}
              />
            )}
            {step === 1 && selectedTherapist && (
              <DetailsStep
                title={title} setTitle={setTitle}
                patientName={patientName} setPatientName={setPatientName}
                dateOfBirth={dateOfBirth} setDateOfBirth={setDateOfBirth}
                mode={mode} setMode={setMode}
                appointmentDate={appointmentDate}
                setAppointmentDate={(date) => { setAppointmentDate(date); setSelectedOccurrence(null); }}
                availableDates={availableDates}
                occurrences={occurrences}
                slotsLoading={slotsLoading}
                selected={selectedOccurrence}
                onSelect={setSelectedOccurrence}
                preferredHospital={preferredHospital} setPreferredHospital={setPreferredHospital}
                locations={locations}
              />
            )}
            {step === 2 && selectedTherapist && selectedOccurrence && (
              <PaymentStep
                paymentMethod={paymentMethod} setPaymentMethod={setPaymentMethod}
                termsAccepted={termsAccepted} setTermsAccepted={setTermsAccepted}
              />
            )}
          </div>

          {step === 2 && selectedTherapist && selectedOccurrence && (
            <AppointmentSummary
              therapist={selectedTherapist}
              occurrence={selectedOccurrence}
              mode={mode}
              title={title}
              patientName={patientName}
              preferredHospital={preferredHospital}
              paymentMethod={paymentMethod}
              booking={booking}
              error={bookingError}
              disabled={!termsAccepted || !paymentMethod}
              onPay={submitPayment}
            />
          )}

          {step < 2 && (
            <div className="flex justify-end mt-8">
              <PrimaryButton disabled={!canContinueFromStep[step]} onClick={() => goTo(step + 1)} style={{ background: TEAL }}>
                Continue
              </PrimaryButton>
            </div>
          )}
        </div>
      )}
    </PatientDashboardLayout>
  );
}

function Stepper({ steps, current }) {
  return (
    <div className="flex items-center">
      {steps.map((s, i) => (
        <div key={s.key} className="flex items-center flex-1 last:flex-none">
          <div className="flex flex-col items-center">
            <div
              className="w-9 h-9 rounded-full flex items-center justify-center text-sm font-bold border-2 shrink-0"
              style={
                i < current
                  ? { background: TEAL, borderColor: TEAL, color: '#fff' }
                  : i === current
                  ? { borderColor: TEAL, color: TEAL, background: '#fff' }
                  : { borderColor: '#E2E8F0', color: '#94A3B8', background: '#fff' }
              }
            >
              {i < current ? (
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" /></svg>
              ) : (i + 1)}
            </div>
            <p className={`mt-2 text-[11px] font-bold uppercase tracking-wide text-center ${i === current ? '' : 'text-slate-400'}`} style={i === current ? { color: TEAL } : undefined}>
              {s.label}
            </p>
          </div>
          {i < steps.length - 1 && (
            <div className="flex-1 h-0.5 mx-2 -mt-5" style={{ background: i < current ? TEAL : '#E2E8F0' }} />
          )}
        </div>
      ))}
    </div>
  );
}

function TherapistStep({ therapists, locations, locationFilter, onLocationFilter, selectedId, onViewProfile, onBook }) {
  return (
    <>
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4">
        <p className="text-xs font-bold uppercase tracking-widest text-slate-500">Choose a Therapist</p>
        {locations.length > 0 && (
          <div className="w-full sm:w-64">
            <SelectField
              value={locationFilter}
              onChange={(e) => onLocationFilter(e.target.value)}
              options={[{ value: '', label: 'All Locations' }, ...locations.map((l) => ({ value: l, label: l }))]}
            />
          </div>
        )}
      </div>

      {therapists.length === 0 ? (
        <Card>
          <EmptyState title="No therapists available yet" subtitle="Check back soon, or try a different location." />
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {therapists.map((therapist) => (
            <TherapistCard
              key={therapist.id}
              therapist={therapist}
              selected={selectedId === therapist.id}
              onViewProfile={() => onViewProfile(therapist.id)}
              onBook={() => onBook(therapist.id)}
            />
          ))}
        </div>
      )}
    </>
  );
}

function DetailsStep({
  title, setTitle, patientName, setPatientName, dateOfBirth, setDateOfBirth,
  mode, setMode, appointmentDate, setAppointmentDate, availableDates,
  occurrences, slotsLoading, selected, onSelect, preferredHospital,
  setPreferredHospital, locations,
}) {
  const detailsReady = Boolean(title && patientName.trim() && dateOfBirth && mode && preferredHospital);
  const slots = occurrences.filter((occurrence) => occurrence.dateStr === appointmentDate);

  return (
    <Card className="p-6 md:p-8">
      <div className="grid grid-cols-1 gap-x-6 gap-y-5 md:grid-cols-3">
        <label className="block text-sm font-semibold text-slate-700">Title: <span className="text-rose-600">*</span>
          <select required value={title} onChange={(event) => setTitle(event.target.value)} className="mt-2 w-full rounded-md border border-black/15 bg-white px-4 py-3 font-normal">
            <option value="">Title*</option>
            {['Mr.', 'Master', 'Mrs.', 'Ms.', 'Baby', 'Dr.', 'Baby Of'].map((option) => <option key={option} value={option}>{option}</option>)}
          </select>
        </label>
        <label className="block text-sm font-semibold text-slate-700">Name: <span className="text-rose-600">*</span>
          <input required value={patientName} onChange={(event) => setPatientName(event.target.value)} className="mt-2 w-full rounded-md border border-black/15 bg-white px-4 py-3 font-normal" />
        </label>
        <label className="block text-sm font-semibold text-slate-700">Date Of Birth: <span className="text-rose-600">*</span>
          <input required type="date" max={new Date().toISOString().slice(0, 10)} value={dateOfBirth} onChange={(event) => setDateOfBirth(event.target.value)} className="mt-2 w-full rounded-md border border-black/15 bg-white px-4 py-3 font-normal" />
        </label>
        <label className="block text-sm font-semibold text-slate-700">Appointment Type: <span className="text-rose-600">*</span>
          <select required value={mode} onChange={(event) => setMode(event.target.value)} className="mt-2 w-full rounded-md border border-black/15 bg-white px-4 py-3 font-normal">
            <option value="">Select Appointment Type</option>
            {MODES.map((option) => <option key={option.key} value={option.key}>{option.label}</option>)}
          </select>
        </label>
        <label className="block text-sm font-semibold text-slate-700">Appointment Date: <span className="text-rose-600">*</span>
          <input
            required
            type="date"
            min={availableDates[0]}
            max={availableDates[availableDates.length - 1]}
            value={appointmentDate}
            onChange={(event) => setAppointmentDate(event.target.value)}
            className="mt-2 w-full rounded-md border border-black/15 bg-white px-4 py-3 font-normal"
          />
        </label>
        <label className="block text-sm font-semibold text-slate-700">Preferred Hospital: <span className="text-rose-600">*</span>
          <select required value={preferredHospital} onChange={(event) => setPreferredHospital(event.target.value)} className="mt-2 w-full rounded-md border border-black/15 bg-white px-4 py-3 font-normal">
            <option value="">Select a hospital</option>
            {locations.length ? locations.map((location) => <option key={location} value={location}>{location}</option>) : <option value="To be confirmed">To be confirmed</option>}
          </select>
        </label>
      </div>

      {mode === 'online' && <p className="mt-4 text-xs text-slate-500">Your therapist will add the meeting link after your appointment is booked.</p>}

      {appointmentDate && detailsReady && (
        <div className="mt-7 border-t border-black/10 pt-5">
          <p className="text-sm font-semibold text-slate-800">Available Time Slots</p>
          <p className="mb-4 mt-1 text-xs text-slate-500">{formatISTDate(new Date(`${appointmentDate}T12:00:00Z`))} · Times shown in IST</p>
          {slotsLoading ? (
            <p className="text-sm text-slate-500">Checking available slots…</p>
          ) : slots.length ? (
            <div className="flex flex-wrap gap-3">
              {slots.map((occurrence) => {
                const active = selected?.date.getTime() === occurrence.date.getTime();
                return (
                  <button
                    key={occurrence.date.toISOString()}
                    type="button"
                    aria-pressed={active}
                    aria-label={`${formatISTTimeShort(occurrence.date)}${active ? ' selected' : ''}`}
                    onClick={() => onSelect(occurrence)}
                    className={`min-w-24 rounded-md px-5 py-3 text-sm font-semibold text-white transition hover:brightness-110 ${active ? 'ring-2 ring-[#075E68] ring-offset-2' : ''}`}
                    style={{ background: active ? TEAL_DARK : TEAL }}
                  >
                    {formatISTTimeShort(occurrence.date)}
                  </button>
                );
              })}
            </div>
          ) : <p className="text-sm text-slate-500">No available slots on this date. Choose another date.</p>}
        </div>
      )}
    </Card>
  );
}

function PaymentStep({ paymentMethod, setPaymentMethod, termsAccepted, setTermsAccepted }) {
  return (
    <Card className="space-y-5 p-6 md:p-8">
      <h2 className="text-lg font-bold text-slate-900">Payment</h2>
      <div className="space-y-3">
        {PAYMENT_METHODS.map((option) => {
          const active = paymentMethod === option.key;
          return (
            <button
              key={option.key}
              type="button"
              aria-pressed={active}
              onClick={() => setPaymentMethod(option.key)}
              className="flex w-full items-center gap-4 rounded-md px-5 py-4 text-left text-white transition hover:brightness-110"
              style={{ background: active ? TEAL_DARK : TEAL }}
            >
              <span className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full border-2 border-white">
                {active && <span className="h-2 w-2 rounded-full bg-white" />}
              </span>
              <span>
                <span className="block text-sm font-semibold">{option.label}</span>
                <span className="block text-xs text-white/80">{option.sub}</span>
              </span>
            </button>
          );
        })}
      </div>
      <label className="flex items-start justify-center gap-2 text-sm text-slate-600">
        <input type="checkbox" checked={termsAccepted} onChange={(event) => setTermsAccepted(event.target.checked)} className="mt-1 accent-[#0F8594]" />
        <span>I agree to the <span className="font-semibold text-[#0F8594]">Terms and Conditions</span> and <span className="font-semibold text-[#0F8594]">Privacy Policy</span>.</span>
      </label>
    </Card>
  );
}

function AppointmentSummary({ therapist, occurrence, mode, title, patientName, preferredHospital, paymentMethod, booking, error, disabled, onPay }) {
  const total = (therapist.fee || 0) + PLATFORM_FEE;

  return (
    <Card className="p-6 sticky top-6">
      <h3 className="text-sm font-bold text-slate-900 mb-4">Appointment Summary</h3>

      <div className="flex items-center gap-3 mb-5 pb-5 border-b border-black/5">
        <div className="w-12 h-12 rounded-full overflow-hidden flex items-center justify-center text-sm font-bold text-white shrink-0" style={{ background: TEAL_LIGHT }}>
          {therapist.avatarUrl ? <img src={therapist.avatarUrl} alt={therapist.name} className="w-full h-full object-cover" /> : initials(therapist.name)}
        </div>
        <div>
          <p className="text-sm font-bold text-slate-900">{therapist.name}</p>
          {therapist.location && <p className="text-xs text-slate-400">{therapist.location}</p>}
        </div>
      </div>

      <div className="space-y-3 text-sm mb-5 pb-5 border-b border-black/5">
        <SummaryRow label="Date & Time" value={`${formatISTDate(occurrence.date)}, ${formatISTTime(occurrence.date)}`} />
        <SummaryRow label="Patient" value={`${title} ${patientName}`} />
        <SummaryRow label="Appointment Type" value={MODES.find((option) => option.key === mode)?.label || mode} />
        <SummaryRow label="Hospital" value={preferredHospital} />
        <SummaryRow label="Payment" value={paymentMethod === 'hospital' ? 'Pay At Hospital' : paymentMethod === 'online' ? 'Pay Online' : 'Select a payment option'} />
      </div>

      <div className="space-y-2 text-sm mb-5">
        <div className="flex justify-between text-slate-500">
          <span>Session Fee</span>
          <span>{therapist.fee != null ? `₹${therapist.fee}` : 'To be confirmed'}</span>
        </div>
        <div className="flex justify-between text-slate-500">
          <span>Platform Fee</span>
          <span>₹{PLATFORM_FEE}</span>
        </div>
        <div className="flex justify-between font-bold text-slate-900 pt-2 border-t border-black/5">
          <span>Total Amount</span>
          <span>₹{total}</span>
        </div>
      </div>

      {error && <p className="text-xs text-red-600 mb-3">{error}</p>}

      <PrimaryButton onClick={onPay} disabled={booking || disabled || !paymentMethod} className="w-full justify-center" style={{ background: TEAL }}>
        {booking ? 'Processing…' : paymentMethod === 'hospital' ? 'Confirm Appointment · Pay At Hospital' : paymentMethod === 'online' ? `Pay Online · ₹${total}` : 'Choose a payment option'}
      </PrimaryButton>
    </Card>
  );
}

function SummaryRow({ label, value }) {
  return (
    <div className="flex justify-between gap-3">
      <span className="text-slate-500">{label}</span>
      <span className="font-bold text-slate-900 text-right">{value}</span>
    </div>
  );
}
