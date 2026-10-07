import { useState } from 'react';
import { PrimaryButton, OutlineButton, TextField, SelectField, TextAreaField } from '../ui/Kit';
import { createOfflineSession } from '../../services/api';

const SESSION_TYPES = ['In-Person Consultation', 'Phone Call', 'Home Visit', 'Group Session', 'Other'];
const STATUSES = ['completed', 'confirmed', 'cancelled'];

export default function OfflineSessionModal({ patient, therapists, onClose, onLogged }) {
  const [form, setForm] = useState({
    date: new Date().toISOString().slice(0, 10),
    time: new Date().toTimeString().slice(0, 5),
    therapistId: therapists?.[0]?.id || '',
    sessionType: SESSION_TYPES[0],
    status: 'completed',
    summary: '',
    notes: '',
  });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const update = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }));

  const submit = async () => {
    if (!form.date || !form.therapistId) {
      setError('Date and therapist are required.');
      return;
    }
    setSubmitting(true);
    setError('');
    try {
      const therapist = therapists.find((t) => t.id === form.therapistId);
      const appt = await createOfflineSession({
        patientId: patient.id,
        patientName: [patient.firstName, patient.lastName].filter(Boolean).join(' ') || patient.name,
        therapistId: form.therapistId,
        therapistName: therapist ? [therapist.firstName, therapist.lastName].filter(Boolean).join(' ') || therapist.name : undefined,
        date: form.date,
        time: form.time,
        sessionType: form.sessionType,
        status: form.status,
        summary: form.summary,
        notes: form.notes,
      });
      onLogged(appt);
    } catch (err) {
      setError(err.message || 'Failed to log this session. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="bg-white rounded-3xl max-w-lg w-full p-6 max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <h3 className="font-serif font-bold text-xl text-slate-900 mb-1">Add Offline Session</h3>
        <p className="text-xs text-slate-500 mb-5">
          Log a session that happened outside the app for {[patient.firstName, patient.lastName].filter(Boolean).join(' ') || patient.name}.
        </p>

        {error && <div className="mb-4 py-2.5 px-4 rounded-xl bg-red-500/10 border border-red-500/20 text-red-500 text-xs">{error}</div>}

        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <TextField label="Date" type="date" value={form.date} onChange={update('date')} />
            <TextField label="Time" type="time" value={form.time} onChange={update('time')} />
          </div>

          <SelectField
            label="Therapist"
            value={form.therapistId}
            onChange={update('therapistId')}
            options={[
              { value: '', label: 'Select therapist' },
              ...(therapists || []).map((t) => ({ value: t.id, label: [t.firstName, t.lastName].filter(Boolean).join(' ') || t.name })),
            ]}
          />

          <div className="grid grid-cols-2 gap-3">
            <SelectField label="Session Type" value={form.sessionType} onChange={update('sessionType')} options={SESSION_TYPES} />
            <SelectField label="Status" value={form.status} onChange={update('status')} options={STATUSES} />
          </div>

          <TextField label="Session Summary" value={form.summary} onChange={update('summary')} placeholder="Brief summary of what was covered" />
          <TextAreaField label="Notes" value={form.notes} onChange={update('notes')} placeholder="Any additional notes for the patient's record" rows={4} />
        </div>

        <div className="flex justify-end gap-3 mt-6">
          <OutlineButton onClick={onClose}>Cancel</OutlineButton>
          <PrimaryButton onClick={submit} disabled={submitting}>{submitting ? 'Saving…' : 'Save Session'}</PrimaryButton>
        </div>
      </div>
    </div>
  );
}
