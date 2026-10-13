import { useState } from 'react';
import { EmptyState, PrimaryButton } from '../../../components/ui/Kit';
import { SAGE_DARK, SAGE, SAGE_SOFT } from '../../../components/layout/TherapistDashboardLayout';
import { CHAKRAS } from '../../../constants/options';

const ACTIVITY_FREQUENCIES = ['Daily', 'Twice a Week', 'Thrice a Week'];

const EMPTY_FORM = {
  patientId: '',
  prescriptionDate: new Date().toISOString().slice(0, 10),
  summary: '', // "Summarized Information about the Patient"
  disorders: '', // "Disorders / Reason for Therapist"
  notes: '', // general therapist notes / clinical observations
  raga: '', // single quick-pick, kept for backward compatibility with existing saved reports
  activityFrequency: '',
  listeningTime: '',
  nextRecommendationNote: '', // "Next Therapist Recommendation — Message Therapist"
  additionalNote: '',
  aiSuggestion: '',
  chakraImbalances: [], // ordered array of chakra names, most important first
  attachmentNote: '',
};

// Move an item within an array by one position (used for the drag-free
// up/down chakra priority reordering below).
function moveItem(arr, index, dir) {
  const next = [...arr];
  const target = index + dir;
  if (target < 0 || target >= next.length) return next;
  [next[index], next[target]] = [next[target], next[index]];
  return next;
}

export default function ReportsTab({ patients, reports, ragaCatalog, therapistName, onCreateReport, onUpdateReport }) {
  const [showForm, setShowForm] = useState(false);
  const [editingReportId, setEditingReportId] = useState(null);
  const [form, setForm] = useState({ ...EMPTY_FORM, patientId: patients[0]?.id || '' });
  const [saved, setSaved] = useState(false);

  const {
    patientId, prescriptionDate, summary, disorders, notes, raga, activityFrequency,
    listeningTime, nextRecommendationNote, additionalNote, aiSuggestion, chakraImbalances, attachmentNote,
  } = form;
  const setField = (key) => (value) => setForm((f) => ({ ...f, [key]: value }));
  const setSummary = setField('summary');
  const setNotes = setField('notes');

  const selectedPatient = patients.find((p) => p.id === patientId);

  const toggleChakra = (chakra) => {
    setForm((f) => ({
      ...f,
      chakraImbalances: f.chakraImbalances.includes(chakra)
        ? f.chakraImbalances.filter((c) => c !== chakra)
        : [...f.chakraImbalances, chakra],
    }));
  };
  const reorderChakra = (index, dir) => setForm((f) => ({ ...f, chakraImbalances: moveItem(f.chakraImbalances, index, dir) }));

  const openNewForm = () => {
    setEditingReportId(null);
    setForm({ ...EMPTY_FORM, patientId: patients[0]?.id || '' });
    setShowForm(true);
  };

  const openEditForm = (report) => {
    setEditingReportId(report.id);
    setForm({
      patientId: report.patientId,
      prescriptionDate: report.prescriptionDate || new Date().toISOString().slice(0, 10),
      summary: report.sessionSummary || '',
      disorders: report.disorders || '',
      notes: report.therapistNotes || '',
      raga: report.recommendedTrack || '',
      activityFrequency: report.activityFrequency || '',
      listeningTime: report.listeningTime || '',
      nextRecommendationNote: report.nextRecommendationNote || '',
      additionalNote: report.additionalNote || '',
      aiSuggestion: report.aiSuggestion || '',
      chakraImbalances: report.chakraImbalances || [],
      attachmentNote: report.attachmentNote || '',
    });
    setShowForm(true);
  };

  const cancelForm = () => {
    setShowForm(false);
    setEditingReportId(null);
  };

  const submit = () => {
    if (!patientId || !summary.trim()) return;
    const fields = {
      // Patient-identifying fields the therapist doesn't have to type —
      // resolved from the selected patient at save time so they're always
      // accurate (phone/admin number can't drift out of sync this way).
      patientPhone: selectedPatient?.phone || '',
      adminNumber: selectedPatient?.adminNumber || '',
      patientFullName: selectedPatient?.name || '',
      therapistName: therapistName || '',
      prescriptionDate,
      sessionSummary: summary.trim(),
      disorders: disorders.trim(),
      therapistNotes: notes.trim(),
      recommendedTrack: raga,
      activityFrequency,
      listeningTime: listeningTime.trim(),
      nextRecommendationNote: nextRecommendationNote.trim(),
      additionalNote: additionalNote.trim(),
      aiSuggestion: aiSuggestion.trim(),
      chakraImbalances,
      attachmentNote: attachmentNote.trim(),
    };
    if (editingReportId) {
      onUpdateReport(patientId, editingReportId, fields);
    } else {
      onCreateReport(patientId, fields);
    }
    setForm({ ...EMPTY_FORM, patientId: patients[0]?.id || '' });
    setEditingReportId(null);
    setSaved(true);
    setShowForm(false);
    setTimeout(() => setSaved(false), 2500);
  };

  return (
    <div className="pt-8 space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="font-serif font-bold text-2xl text-slate-900">Prescriptions</h1>
          <p className="text-slate-500 text-sm mt-1">Session notes and recommendations, organized by patient.</p>
        </div>
        {patients.length > 0 && (
          <button
            onClick={() => (showForm ? cancelForm() : openNewForm())}
            className="px-5 py-2.5 rounded-xl text-white text-sm font-bold shrink-0 hover:opacity-90 transition-all"
            style={{ background: SAGE_DARK }}
          >
            {showForm ? 'Cancel' : '+ New Prescription'}
          </button>
        )}
      </div>

      {saved && (
        <div className="bg-emerald-50 border border-emerald-200 text-emerald-700 text-sm font-semibold rounded-2xl px-5 py-3">
          Prescription saved to the patient's history.
        </div>
      )}

      {showForm && (
        <div className="max-w-3xl">
          <div className="bg-white rounded-3xl border border-black/[0.06] shadow-sm shadow-black/[0.03] p-6 space-y-4">
            {editingReportId && (
              <div className="text-xs font-bold px-3 py-1.5 rounded-lg inline-block" style={{ background: SAGE_SOFT, color: SAGE_DARK }}>
                Editing existing prescription
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="text-[11px] uppercase tracking-widest font-bold text-slate-500 block mb-1.5">Patient</label>
                <select
                  value={patientId}
                  onChange={(e) => setField('patientId')(e.target.value)}
                  disabled={!!editingReportId}
                  className="w-full px-4 py-2.5 bg-black/[0.03] border border-black/10 rounded-xl text-sm disabled:opacity-60"
                >
                  {patients.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
              </div>
              <div>
                <label className="text-[11px] uppercase tracking-widest font-bold text-slate-500 block mb-1.5">Prescription Date</label>
                <input type="date" value={prescriptionDate} onChange={(e) => setField('prescriptionDate')(e.target.value)}
                  className="w-full px-4 py-2.5 bg-black/[0.03] border border-black/10 rounded-xl text-sm" />
              </div>
            </div>

            {/* Auto-resolved, read-only reference fields — not editable here since
                they come straight from the patient/therapist record. */}
            {selectedPatient && (
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs bg-black/[0.02] rounded-xl px-4 py-3">
                <div><span className="text-slate-400">Phone: </span><span className="font-semibold text-slate-700">{selectedPatient.phone || '—'}</span></div>
                <div><span className="text-slate-400">Admin Number: </span><span className="font-semibold text-slate-700">{selectedPatient.adminNumber || '—'}</span></div>
                <div><span className="text-slate-400">Therapist: </span><span className="font-semibold text-slate-700">{therapistName || '—'}</span></div>
              </div>
            )}

            <div>
              <label className="text-[11px] uppercase tracking-widest font-bold text-slate-500 block mb-1.5">Disorders / Reason for Therapy</label>
              <input value={disorders} onChange={(e) => setField('disorders')(e.target.value)} placeholder="e.g. Anxiety, Stress & Burnout"
                className="w-full px-4 py-2.5 bg-black/[0.03] border border-black/10 rounded-xl text-sm" />
            </div>

            <div>
              <label className="text-[11px] uppercase tracking-widest font-bold text-slate-500 block mb-1.5">Summarized Information about the Patient</label>
              <textarea value={summary} onChange={(e) => setSummary(e.target.value)} rows={3} placeholder="What was covered in this session..."
                className="w-full px-4 py-2.5 bg-black/[0.03] border border-black/10 rounded-xl text-sm resize-none" />
            </div>

            <div>
              <label className="text-[11px] uppercase tracking-widest font-bold text-slate-500 block mb-1.5">Therapist Notes / Recommendations</label>
              <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={4} placeholder="Clinical notes, homework, next steps..."
                className="w-full px-4 py-2.5 bg-black/[0.03] border border-black/10 rounded-xl text-sm resize-none whitespace-pre-line" />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="text-[11px] uppercase tracking-widest font-bold text-slate-500 block mb-1.5">Activities</label>
                <select value={activityFrequency} onChange={(e) => setField('activityFrequency')(e.target.value)}
                  className="w-full px-4 py-2.5 bg-black/[0.03] border border-black/10 rounded-xl text-sm">
                  <option value="">Select frequency</option>
                  {ACTIVITY_FREQUENCIES.map((f) => <option key={f} value={f}>{f}</option>)}
                </select>
              </div>
              <div>
                <label className="text-[11px] uppercase tracking-widest font-bold text-slate-500 block mb-1.5">Recommended Listening Time</label>
                <input value={listeningTime} onChange={(e) => setField('listeningTime')(e.target.value)} placeholder="e.g. 20 minutes, twice daily"
                  className="w-full px-4 py-2.5 bg-black/[0.03] border border-black/10 rounded-xl text-sm" />
              </div>
            </div>

            {ragaCatalog.length > 0 && (
              <div>
                <label className="text-[11px] uppercase tracking-widest font-bold text-slate-500 block mb-1.5">Recommended Raga / Track (optional)</label>
                <select value={raga} onChange={(e) => setField('raga')(e.target.value)} className="w-full px-4 py-2.5 bg-black/[0.03] border border-black/10 rounded-xl text-sm">
                  <option value="">None</option>
                  {ragaCatalog.map((t) => <option key={t.id} value={t.name}>{t.name}</option>)}
                </select>
              </div>
            )}

            {/* AI pointers: every chakra is shown so the therapist can mark which
                ones are imbalanced for this patient, then reorder that list by
                priority — the order is what's saved and shown to the patient. */}
            <div>
              <label className="text-[11px] uppercase tracking-widest font-bold text-slate-500 block mb-1.5">Chakra Imbalances</label>
              <div className="flex flex-wrap gap-2 mb-3">
                {CHAKRAS.map((c) => {
                  const on = chakraImbalances.includes(c);
                  return (
                    <button key={c} type="button" onClick={() => toggleChakra(c)}
                      className={`px-3 py-1.5 rounded-full text-xs font-bold border transition-all ${on ? 'text-white' : 'border-black/10 text-slate-500'}`}
                      style={on ? { background: SAGE_DARK, borderColor: SAGE_DARK } : undefined}
                    >
                      {c}
                    </button>
                  );
                })}
              </div>
              {chakraImbalances.length > 0 && (
                <div className="space-y-1.5 rounded-xl border border-black/[0.06] p-3">
                  <p className="text-[10px] uppercase tracking-widest font-bold text-slate-400 mb-1">Priority order (most important first)</p>
                  {chakraImbalances.map((c, i) => (
                    <div key={c} className="flex items-center justify-between gap-3 bg-black/[0.02] rounded-lg px-3 py-1.5">
                      <span className="text-sm font-semibold text-slate-700">{i + 1}. {c}</span>
                      <div className="flex gap-1">
                        <button type="button" disabled={i === 0} onClick={() => reorderChakra(i, -1)} className="w-6 h-6 rounded-md text-xs border border-black/10 disabled:opacity-30">↑</button>
                        <button type="button" disabled={i === chakraImbalances.length - 1} onClick={() => reorderChakra(i, 1)} className="w-6 h-6 rounded-md text-xs border border-black/10 disabled:opacity-30">↓</button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div>
              <label className="text-[11px] uppercase tracking-widest font-bold text-slate-500 block mb-1.5">AI Suggestion (optional)</label>
              <textarea value={aiSuggestion} onChange={(e) => setField('aiSuggestion')(e.target.value)} rows={2} placeholder="Notes from the AI assessment, if relevant..."
                className="w-full px-4 py-2.5 bg-black/[0.03] border border-black/10 rounded-xl text-sm resize-none" />
            </div>

            <div>
              <label className="text-[11px] uppercase tracking-widest font-bold text-slate-500 block mb-1.5">Next Therapist Recommendation — Message Therapist</label>
              <textarea value={nextRecommendationNote} onChange={(e) => setField('nextRecommendationNote')(e.target.value)} rows={2} placeholder="Anything the next therapist (or you, next time) should know..."
                className="w-full px-4 py-2.5 bg-black/[0.03] border border-black/10 rounded-xl text-sm resize-none" />
            </div>

            <div>
              <label className="text-[11px] uppercase tracking-widest font-bold text-slate-500 block mb-1.5">Any Additional Note</label>
              <textarea value={additionalNote} onChange={(e) => setField('additionalNote')(e.target.value)} rows={2}
                className="w-full px-4 py-2.5 bg-black/[0.03] border border-black/10 rounded-xl text-sm resize-none" />
            </div>

            <div>
              <label className="text-[11px] uppercase tracking-widest font-bold text-slate-500 block mb-1.5">Attachment reference (optional)</label>
              <input value={attachmentNote} onChange={(e) => setField('attachmentNote')(e.target.value)} placeholder="File name or link to attach"
                className="w-full px-4 py-2.5 bg-black/[0.03] border border-black/10 rounded-xl text-sm" />
            </div>

            <div className="flex items-center gap-3">
              <PrimaryButton onClick={submit} disabled={!patientId || !summary.trim()}>
                {editingReportId ? 'Update Prescription' : 'Save Prescription'}
              </PrimaryButton>
            </div>
          </div>
        </div>
      )}

      {reports.length === 0 ? (
        <div className="bg-white rounded-3xl border border-black/[0.06] p-6">
          <EmptyState title="No prescriptions yet" subtitle="Prescriptions you create after sessions will be listed here and shared with the patient." />
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {reports.map((r) => (
            <div key={r.id} className="flex h-[360px] flex-col overflow-hidden border-b border-black/10 bg-white p-5">
              <div className="flex items-start justify-between gap-3 mb-3">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-10 h-10 rounded-full flex items-center justify-center text-white text-sm font-bold shrink-0" style={{ background: SAGE }}>
                    {(r.patientName || '?').charAt(0).toUpperCase()}
                  </div>
                  <div className="min-w-0">
                    <p className="font-bold text-sm text-slate-800 truncate">{r.patientName}</p>
                    <p className="text-[11px] text-slate-400">
                      {new Date(r.createdAt).toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' })}
                      {r.updatedAt && <span> · edited {new Date(r.updatedAt).toLocaleDateString([], { month: 'short', day: 'numeric' })}</span>}
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => openEditForm(r)}
                  className="text-[11px] font-bold px-2.5 py-1 rounded-lg border border-black/10 text-slate-500 hover:border-black/20 hover:text-slate-700 transition-all shrink-0"
                >
                  Edit
                </button>
              </div>

              {r.disorders && (
                <p className="text-[11px] font-bold text-slate-400 mb-1">{r.disorders}</p>
              )}
              {r.sessionSummary && (
                <p className="mb-2 text-sm leading-relaxed text-slate-700" style={{ display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{r.sessionSummary}</p>
              )}
              {r.therapistNotes && (
                <p className="mb-2 whitespace-pre-line text-xs leading-relaxed text-slate-500" style={{ display: '-webkit-box', WebkitLineClamp: 4, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{r.therapistNotes}</p>
              )}

              <div className="mt-auto pt-2 flex flex-wrap gap-2">
                {r.recommendedTrack && (
                  <span className="text-[11px] font-bold px-2.5 py-1 rounded-full" style={{ background: SAGE_SOFT, color: SAGE_DARK }}>
                    {r.recommendedTrack}
                  </span>
                )}
                {r.activityFrequency && (
                  <span className="text-[11px] font-bold px-2.5 py-1 rounded-full bg-black/[0.04] text-slate-600">{r.activityFrequency}</span>
                )}
                {(r.chakraImbalances || []).slice(0, 3).map((c, i) => (
                  <span key={c} className="text-[11px] font-bold px-2.5 py-1 rounded-full bg-rose-50 text-rose-700">{i + 1}. {c}</span>
                ))}
                {r.attachmentNote && (
                  <span className="text-[11px] font-bold px-2.5 py-1 rounded-full bg-black/[0.04] text-slate-600">
                    {r.attachmentNote}
                  </span>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
