import { useEffect, useState } from 'react';
import { Badge, EmptyState, OutlineButton, PrimaryButton } from '../ui/Kit';
import {
  getPatientOnboarding, getReportHistory, getMoodEntries, adminListPayments,
} from '../../services/api';
import OfflineSessionModal from './OfflineSessionModal';

const money = (n) => `\u20b9${Number(n || 0).toLocaleString('en-IN')}`;
const fmtDate = (d) => (d ? new Date(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : '\u2014');
const fmtDateTime = (d) => (d ? new Date(d).toLocaleString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '\u2014');

function Field({ label, value }) {
  return (
    <div>
      <p className="text-[10px] uppercase tracking-widest font-bold text-slate-400">{label}</p>
      <p className="text-sm text-slate-800 mt-0.5">{value || '\u2014'}</p>
    </div>
  );
}

const STATUS_TONE = { confirmed: 'purple', completed: 'emerald', cancelled: 'red', pending_payment: 'amber' };

// Opened when an admin clicks into a patient from the Patients tab. Pulls
// together data from three places that already exist rather than inventing
// a new combined record: Postgres patientProfile (demographics collected at
// signup), the extended Mongo onboarding doc (blood group, city, referral,
// concerns — fields frontend-1's Postgres schema has no columns for), and
// the real bookings/reports/payments for this patient.
export default function PatientDetailView({ patient, appointments, therapists, onBack, onSessionLogged }) {
  const [onboarding, setOnboarding] = useState(null);
  const [reports, setReports] = useState([]);
  const [moodEntries, setMoodEntries] = useState([]);
  const [payments, setPayments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showOfflineModal, setShowOfflineModal] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    Promise.all([
      getPatientOnboarding(patient.id).catch(() => null),
      getReportHistory(patient.id).catch(() => []),
      getMoodEntries(patient.id).catch(() => []),
      adminListPayments().catch(() => []),
    ]).then(([ob, rep, mood, pays]) => {
      if (cancelled) return;
      setOnboarding(ob);
      setReports(rep || []);
      setMoodEntries(mood || []);
      setPayments((pays || []).filter((p) => p.patient?.id === patient.id || p.patientId === patient.id));
    }).finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [patient.id]);

  const pp = patient.patientProfile || {};
  const ob = onboarding?.fields || {};
  const displayName = [patient.firstName, patient.lastName].filter(Boolean).join(' ') || patient.name;

  const patientAppointments = [...appointments].sort((a, b) => new Date(b.scheduledAt || b.createdAt) - new Date(a.scheduledAt || a.createdAt));
  const completedCount = patientAppointments.filter((a) => a.status === 'completed').length;
  const totalPaid = payments.filter((p) => p.status === 'paid').reduce((sum, p) => sum + Number(p.amount || 0), 0);

  return (
    <div className="pt-8 space-y-6 pb-16">
      <button onClick={onBack} className="text-xs font-bold text-slate-500 hover:text-slate-800 flex items-center gap-1.5">
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
        Back to Patients
      </button>

      {/* Header */}
      <div className="bg-white rounded-3xl border border-black/5 p-6 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <div className="w-16 h-16 rounded-full overflow-hidden bg-black/[0.04] flex items-center justify-center shrink-0">
            {patient.avatarFileId ? (
              <img src={`/api/profile/files/${patient.avatarFileId}`} alt={displayName} className="w-full h-full object-cover" />
            ) : (
              <svg className="w-8 h-8 text-slate-300" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" /></svg>
            )}
          </div>
          <div>
            <h1 className="font-serif font-bold text-xl text-slate-900">{displayName}</h1>
            <p className="text-xs text-slate-500 mt-0.5">{patient.email}</p>
            <p className="text-[11px] text-slate-400 mt-0.5">Registered {fmtDate(patient.createdAt)}</p>
          </div>
        </div>
        <PrimaryButton onClick={() => setShowOfflineModal(true)}>+ Add Offline Session</PrimaryButton>
      </div>

      {/* Quick stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-white rounded-2xl border border-black/5 p-4">
          <p className="text-2xl font-bold text-slate-900">{patientAppointments.length}</p>
          <p className="text-[11px] text-slate-500 mt-1">Total Sessions</p>
        </div>
        <div className="bg-white rounded-2xl border border-black/5 p-4">
          <p className="text-2xl font-bold text-slate-900">{completedCount}</p>
          <p className="text-[11px] text-slate-500 mt-1">Sessions Attended</p>
        </div>
        <div className="bg-white rounded-2xl border border-black/5 p-4">
          <p className="text-2xl font-bold text-slate-900">{reports.length}</p>
          <p className="text-[11px] text-slate-500 mt-1">Reports Filed</p>
        </div>
        <div className="bg-white rounded-2xl border border-black/5 p-4">
          <p className="text-2xl font-bold text-slate-900">{money(totalPaid)}</p>
          <p className="text-[11px] text-slate-500 mt-1">Total Paid</p>
        </div>
      </div>

      {/* Demographics */}
      <div className="bg-white rounded-3xl border border-black/5 p-6">
        <h3 className="font-serif font-bold text-lg mb-4">Demographic Information</h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-5">
          <Field label="Age" value={pp.age} />
          <Field label="Gender" value={pp.gender} />
          <Field label="Blood Group" value={ob.bloodGroup} />
          <Field label="Marital Status" value={pp.maritalStatus} />
          <Field label="Occupation" value={pp.occupation === 'Other' ? ob.otherOccupation : pp.occupation} />
          <Field label="City" value={ob.city} />
          <Field label="Country" value={ob.country === 'Other' ? ob.otherCountry : ob.country} />
          <Field label="Education" value={ob.educationLevel === 'Other' ? ob.otherEducationLevel : ob.educationLevel} />
          <Field label="Sleep Pattern" value={ob.sleepPattern} />
          <Field label="How they heard about us" value={ob.referralSource === 'Other' ? ob.otherReferralSource : ob.referralSource} />
          {ob.referredDoctor && <Field label="Referring Doctor" value={ob.referredDoctor} />}
          <Field label="Caregiver" value={pp.caregiverName ? `${pp.caregiverName} (${pp.caregiverRelation || 'n/a'})` : undefined} />
        </div>
        <div className="mt-5 pt-5 border-t border-black/5 grid grid-cols-1 md:grid-cols-2 gap-5">
          <Field label="Primary Concern / Disease" value={pp.disease} />
          <Field label="Problem Description" value={pp.problemDescription} />
        </div>
      </div>

      {/* Session history */}
      <div className="bg-white rounded-3xl border border-black/5 p-6">
        <h3 className="font-serif font-bold text-lg mb-4">Session History</h3>
        {patientAppointments.length === 0 ? (
          <EmptyState title="No sessions yet" subtitle="Booked or manually logged sessions will appear here." />
        ) : (
          <div className="space-y-2">
            {patientAppointments.map((a) => (
              <div key={a.id} className="bg-black/[0.03] rounded-xl px-4 py-3">
                <div className="flex items-center justify-between gap-3 flex-wrap">
                  <div className="min-w-0">
                    <p className="font-bold text-sm text-slate-800">
                      {fmtDateTime(a.scheduledAt || a.createdAt)}
                      {a.mode === 'offline' && <span className="ml-2 text-[10px] font-bold text-slate-400 uppercase">Offline</span>}
                    </p>
                    <p className="text-[11px] text-slate-500 mt-0.5">
                      {a.therapistName ? `with ${a.therapistName}` : ''}{a.reason ? ` \u00b7 ${a.reason}` : ''}
                    </p>
                  </div>
                  <Badge tone={STATUS_TONE[a.status] || 'slate'}>{(a.status || 'confirmed').replace('_', ' ')}</Badge>
                </div>
                {(a.summary || a.notes) && (
                  <div className="mt-2 pt-2 border-t border-black/5 text-xs text-slate-600 space-y-1">
                    {a.summary && <p><span className="font-bold">Summary: </span>{a.summary}</p>}
                    {a.notes && <p><span className="font-bold">Notes: </span>{a.notes}</p>}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Payments */}
      <div className="bg-white rounded-3xl border border-black/5 p-6">
        <h3 className="font-serif font-bold text-lg mb-4">Payment History</h3>
        {payments.length === 0 ? (
          <EmptyState title="No payments on file" />
        ) : (
          <div className="space-y-2">
            {payments.map((p) => (
              <div key={p.id} className="flex items-center justify-between bg-black/[0.03] rounded-xl px-4 py-3">
                <div>
                  <p className="font-bold text-sm text-slate-800">{money(p.amount)} <span className="text-slate-400 font-normal">{p.currency}</span></p>
                  <p className="text-[11px] text-slate-500">{fmtDate(p.createdAt)}{p.therapist ? ` \u00b7 ${p.therapist.firstName} ${p.therapist.lastName}` : ''}</p>
                </div>
                <Badge tone={p.status === 'paid' ? 'emerald' : p.status === 'failed' ? 'red' : 'amber'}>{p.status}</Badge>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Reports */}
      <div className="bg-white rounded-3xl border border-black/5 p-6">
        <h3 className="font-serif font-bold text-lg mb-4">Therapy Reports</h3>
        {reports.length === 0 ? (
          <EmptyState title="No reports filed yet" subtitle="Approved therapy records appear here as reports." />
        ) : (
          <div className="space-y-2">
            {reports.map((r) => (
              <div key={r.id} className="bg-black/[0.03] rounded-xl px-4 py-3">
                <p className="font-bold text-sm text-slate-800">{r.title || 'Session Report'}</p>
                <p className="text-[11px] text-slate-500 mt-0.5">{fmtDate(r.createdAt)}{r.approvedBy ? ` \u00b7 approved by ${r.approvedBy}` : ''}</p>
                {r.summary && <p className="text-xs text-slate-600 mt-2">{r.summary}</p>}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Progress */}
      <div className="bg-white rounded-3xl border border-black/5 p-6">
        <h3 className="font-serif font-bold text-lg mb-4">Patient Progress</h3>
        {moodEntries.length === 0 && completedCount === 0 ? (
          <EmptyState title="Not enough activity yet" subtitle="Mood check-ins and completed sessions will build a progress picture here." />
        ) : (
          <div className="space-y-4">
            <p className="text-sm text-slate-600">
              {completedCount} of {patientAppointments.length} sessions completed
              {moodEntries.length > 0 && ` \u00b7 ${moodEntries.length} mood check-ins logged`}.
            </p>
            {moodEntries.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {moodEntries.slice(0, 10).map((m) => (
                  <span key={m.id} className="px-3 py-1.5 rounded-lg bg-black/[0.04] text-xs text-slate-600">
                    {m.mood} · {fmtDate(m.createdAt)}
                  </span>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {showOfflineModal && (
        <OfflineSessionModal
          patient={patient}
          therapists={therapists}
          onClose={() => setShowOfflineModal(false)}
          onLogged={(appt) => { setShowOfflineModal(false); onSessionLogged?.(appt); }}
        />
      )}
    </div>
  );
}
