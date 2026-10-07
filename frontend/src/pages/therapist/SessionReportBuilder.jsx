import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { anahat, getSession, getMyTherapistPatients, getPatientOnboarding } from '../../services/api';
import { PageShell, Card, Badge } from '../../components/ui/Kit';
import BackButton from '../../components/layout/BackButton';
import { CHAKRAS } from '../../constants/options';

const TEAL = '#0F8594';

// Editable session report. Pre-filled from the session and the Nadika.AI
// chakra scan; every field can be changed by the therapist. "Download PDF"
// uses the browser's print-to-PDF with a print stylesheet (no extra
// dependencies); "Send to patient" writes the report to the patient's
// existing Reports feed and notifies them.
export default function SessionReportBuilder() {
  const { patientId } = useParams();
  const [params] = useSearchParams();
  const sessionId = params.get('session');
  const assessmentId = params.get('assessment');
  const navigate = useNavigate();
  const { user } = useAuth();

  const [patient, setPatient] = useState(null);
  const [session, setSession] = useState(null);
  const [scan, setScan] = useState(null);
  const [sent, setSent] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const [form, setForm] = useState({
    title: 'Session report',
    summary: '',
    observations: '',
    chakra: Object.fromEntries(CHAKRAS.map((c) => [c, { engineStatus: 'Not assessed', overrideStatus: '', note: '' }])),
    ragas: '',
    activities: '',
    advice: '',
    nextSteps: '',
    shareChakra: false,
  });
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));
  const setChakra = (c, k, v) => setForm((f) => ({ ...f, chakra: { ...f.chakra, [c]: { ...f.chakra[c], [k]: v } } }));

  useEffect(() => {
    getMyTherapistPatients().then((appts) => {
      const u = appts.find((a) => a.patient?.id === patientId)?.patient;
      if (u) setPatient({ ...u, name: [u.firstName, u.lastName].filter(Boolean).join(' ') });
    }).catch(() => {});
    getPatientOnboarding(patientId).then((o) => {
      const c = (o?.fields?.concerns || []).join(', ');
      if (c) setForm((f) => ({ ...f, summary: f.summary || `Session focused on: ${c}.` }));
    }).catch(() => {});
    if (assessmentId) {
      anahat.get(assessmentId).then((d) => {
        const results = d.finalChakraResult?.chakras || d.recommendations?.chakra_report?.results || d.chakraReport?.results || [];
        // Prefer what the therapist approved in the prescription (edits), then the draft,
        // then the engine's full candidate list.
        const approved = d.prescriptionDecision?.edits || {};
        const ragaSrc = approved.raga_candidates || d.prescriptionDraft?.raga_candidates || d.recommendations?.raga?.candidates || [];
        const actSrc = approved.activities || d.prescriptionDraft?.activities || d.recommendations?.activities || [];
        const ragas = ragaSrc.map((r) => r.raga || r.name || r.raga_name).filter(Boolean);
        const acts = [...new Set(actSrc.map((a) => a.activity || a.name || a.title || (typeof a === 'string' ? a : '')).filter(Boolean))];
        setForm((f) => ({
          ...f,
          title: `Session report — ${new Date(d.createdAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' })}`,
          observations: f.observations || d.therapistContext || '',
          ragas: f.ragas || ragas.join(', '),
          activities: f.activities || acts.join('\n'),
          chakra: results.length ? Object.fromEntries(CHAKRAS.map((c) => {
            const r = results.find((x) => x.chakra === c);
            return [c, {
              engineStatus: r?.status_label || r?.status || 'Not assessed',
              overrideStatus: '',
              note: r ? chakraNote(r) : '',
            }];
          })) : f.chakra,
        }));
      }).catch(() => {});
    }
    if (!sessionId) return;
    getSession(sessionId).then((s) => {
      setSession(s);
      setForm((f) => ({ ...f, title: `Session report — ${new Date(s?.startedAt || Date.now()).toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' })}` }));
    }).catch(() => {});
    if (!assessmentId) anahat.getScan(sessionId).then((sc) => {
      setScan(sc);
      const results = sc?.report?.results || [];
      if (results.length) {
        setForm((f) => ({
          ...f,
          chakra: Object.fromEntries(CHAKRAS.map((c) => {
            const r = results.find((x) => x.chakra === c);
            return [c, {
              engineStatus: r?.status_label || r?.status || 'Not assessed',
              overrideStatus: '',
              note: r ? `Provisional Nadika.AI result: ${Math.round(r.confidence_pct || 0)}% confidence, ${r.independent_evidence_units} indicator(s).` : '',
            }];
          })),
        }));
      }
    }).catch(() => {});
  }, [patientId, sessionId, assessmentId]);

  const transcript = useMemo(() => (session?.messages || []).map((m) => `${m.from === 'therapist' ? 'Therapist' : 'Patient'}: ${m.text}`).join('\n'), [session]);

  const download = () => window.print();

  const send = () => {
    setBusy(true); setError('');
    const report = {
      title: form.title,
      summary: form.summary,
      observations: form.observations,
      raga: form.ragas,
      activities: form.activities.split('\n').map((x) => x.trim()).filter(Boolean),
      advice: form.advice,
      nextSteps: form.nextSteps,
      chakraAnalysis: form.shareChakra ? CHAKRAS.map((c) => ({
        chakra: c,
        status: form.chakra[c].overrideStatus || form.chakra[c].engineStatus,
        engineStatus: form.chakra[c].engineStatus,
        therapistOverride: form.chakra[c].overrideStatus || null,
        note: form.chakra[c].note,
      })) : undefined,
      therapistName: user?.name,
    };
    anahat.sendReport({ patientId, sessionId, report })
      .then((r) => setSent(r))
      .catch((e) => setError(e.message))
      .finally(() => setBusy(false));
  };

  return (
    <PageShell showBack={false}>
      <style>{`
        @media print {
          body { background: #fff !important; }
          nav, .no-print, footer { display: none !important; }
          .print-only { display: block !important; }
          .report-sheet { box-shadow: none !important; border: none !important; }
          textarea, input, select { border: none !important; background: transparent !important; padding: 0 !important; resize: none; }
          .screen-only { display: none !important; }
          .report-table td, .report-table th { vertical-align: top; }
          .overflow-x-auto { overflow: visible !important; }
        }
        .print-only { display: none; }
      `}</style>
      <div className="max-w-4xl mx-auto px-6 py-8 pb-24">
        <div className="no-print flex items-center justify-between mb-5 flex-wrap gap-3">
          <BackButton to={sessionId ? `/therapist/session/${patientId}` : `/therapist/patient/${patientId}`} label="Back" />
          <div className="flex items-center gap-2">
            <button onClick={download} className="px-5 py-2.5 rounded-xl text-xs font-bold border" style={{ borderColor: TEAL, color: TEAL }}>Download PDF</button>
            <button onClick={send} disabled={busy || !!sent} className="px-5 py-2.5 rounded-xl text-xs font-bold text-white disabled:opacity-50" style={{ background: TEAL }}>{sent ? 'Sent to patient' : busy ? 'Sending…' : 'Send to patient'}</button>
          </div>
        </div>
        {error && <p className="no-print text-sm text-red-600 mb-4">{error}</p>}
        {sent && <p className="no-print text-sm mb-4" style={{ color: TEAL }}>Prescription sent. The patient can read it under Prescriptions and has been notified. <button className="underline" onClick={() => navigate(`/therapist/patient/${patientId}`)}>Back to patient record</button></p>}

        <div className="report-sheet bg-white rounded-3xl border border-black/5 shadow-sm p-8 md:p-10">
          <div className="flex items-start justify-between gap-4 border-b border-black/10 pb-5 mb-6">
            <div className="flex items-center gap-3">
              <img src="/assets/anahat-logo.png" alt="" className="w-12 h-12 object-contain" />
              <div><p className="font-bold" style={{ color: TEAL }}>Anahat Transformations</p><p className="text-xs text-slate-500">Music therapy · session report</p></div>
            </div>
            <div className="text-right text-xs text-slate-500">
              <p><b className="text-slate-800">{patient?.name || 'Patient'}</b></p>
              <p>Therapist: {user?.name}</p>
              <p>{new Date().toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' })}</p>
            </div>
          </div>

          <Field label="Title"><input value={form.title} onChange={set('title')} className="w-full text-xl font-serif font-bold text-slate-900 bg-transparent outline-none" /></Field>
          <Field label="Summary"><textarea rows={3} value={form.summary} onChange={set('summary')} placeholder="What the session covered, in plain language for the patient." className="screen-only w-full text-sm px-3 py-2 bg-black/[0.03] border border-black/10 rounded-xl resize-none" /><PrintText value={form.summary} /></Field>
          <Field label="Observations"><textarea rows={4} value={form.observations} onChange={set('observations')} placeholder="What you noticed — mood, energy, themes that came up." className="screen-only w-full text-sm px-3 py-2 bg-black/[0.03] border border-black/10 rounded-xl resize-none" /><PrintText value={form.observations} /></Field>

          <div className="mb-6">
            <div className="flex items-center justify-between mb-2">
              <p className="text-[11px] font-bold uppercase tracking-widest text-slate-400">Chakra assessment</p>
              <label className="no-print flex items-center gap-2 text-xs text-slate-600"><input type="checkbox" checked={form.shareChakra} onChange={(e) => setForm((f) => ({ ...f, shareChakra: e.target.checked }))} className="accent-[#0F8594]" /> include in the patient's copy</label>
            </div>
            {scan && !assessmentId && <p className="no-print text-[11px] text-amber-700 mb-2">Pre-filled from the Nadika.AI scan (provisional). Edit anything before sending.</p>}
            <div className="overflow-x-auto">
              <table className="report-table w-full text-sm">
                <thead><tr className="text-left text-[10px] uppercase tracking-widest text-slate-400"><th className="py-1.5">Chakra</th><th>Final ANAHAT engine result</th><th>Therapist override</th><th>Reason / note</th></tr></thead>
                <tbody>{CHAKRAS.map((c) => (
                  <tr key={c} className="border-t border-black/5">
                    <td className="py-2 font-semibold text-slate-800 whitespace-nowrap pr-3">{c}</td>
                    <td className="py-2 pr-3 text-xs font-semibold">{form.chakra[c].engineStatus}</td>
                    <td className="pr-3"><span className="print-only text-xs">{form.chakra[c].overrideStatus || '—'}</span><select value={form.chakra[c].overrideStatus} onChange={(e) => setChakra(c, 'overrideStatus', e.target.value)} className="screen-only px-2 py-1.5 bg-black/[0.03] border border-black/10 rounded-lg text-xs">
                      {['', 'Balanced', 'Imbalanced — Deficient', 'Imbalanced — Excess', 'Imbalanced', 'Unresolved', 'Not assessed'].map((o) => <option key={o} value={o}>{o || 'No override'}</option>)}
                    </select></td>
                    <td><textarea rows={2} value={form.chakra[c].note} onChange={(e) => setChakra(c, 'note', e.target.value)} className="screen-only w-full px-2 py-1.5 bg-black/[0.03] border border-black/10 rounded-lg text-xs resize-y" /><PrintText value={form.chakra[c].note} small /></td>
                  </tr>))}</tbody>
              </table>
            </div>
          </div>

          <Field label="Recommended raags"><input value={form.ragas} onChange={set('ragas')} placeholder="e.g. Raag Yaman (evening), Raag Bhairavi (morning)" className="screen-only w-full text-sm px-3 py-2 bg-black/[0.03] border border-black/10 rounded-xl" /><PrintText value={form.ragas} empty="None prescribed." /></Field>
          <Field label="Daily activities (one per line)"><textarea rows={Math.min(10, Math.max(3, (form.activities || '').split('\n').length))} value={form.activities} onChange={set('activities')} className="screen-only w-full text-sm px-3 py-2 bg-black/[0.03] border border-black/10 rounded-xl resize-y" /><PrintText value={form.activities} /></Field>
          <Field label="Advice"><textarea rows={3} value={form.advice} onChange={set('advice')} className="screen-only w-full text-sm px-3 py-2 bg-black/[0.03] border border-black/10 rounded-xl resize-none" /><PrintText value={form.advice} /></Field>
          <Field label="Next steps"><textarea rows={2} value={form.nextSteps} onChange={set('nextSteps')} className="screen-only w-full text-sm px-3 py-2 bg-black/[0.03] border border-black/10 rounded-xl resize-none" /><PrintText value={form.nextSteps} /></Field>

          {transcript && (
            <details className="no-print mt-4 text-xs"><summary className="cursor-pointer font-bold text-slate-500">Session transcript (reference — not included in the patient's copy)</summary><pre className="mt-2 whitespace-pre-wrap text-slate-600 bg-black/[0.03] rounded-xl p-3">{transcript}</pre></details>
          )}
          <p className="text-[10px] text-slate-400 mt-8 border-t border-black/5 pt-3">Music therapy is complementary care and not a substitute for medical, psychological or psychiatric treatment. Chakra findings are the therapist's assessment and, where AI-assisted, are provisional.</p>
        </div>
      </div>
    </PageShell>
  );
}

// Printed copy of a form field: the full text, wrapped (textareas/inputs only print what is visible).
function PrintText({ value, empty = '—', small = false }) {
  return <div className={`print-only whitespace-pre-wrap ${small ? 'text-xs' : 'text-sm'} text-slate-800`}>{(value || '').trim() || empty}</div>;
}

// One readable line per chakra for the report (the full engine trace stays in the engine result).
function chakraNote(r) {
  const strength = Math.round(Math.min(1, Number(r.score ?? r.scores?.presence ?? 0)) * 100);
  const evidence = [...new Set((r.trace || r.evidence || []).filter((t) => t.counted).map((t) => t.term).filter(Boolean))];
  const parts = [`Evidence strength ${strength}%`, `confidence ${Math.round(r.confidence_pct || 0)}%`];
  if (evidence.length) parts.push(`evidence: ${evidence.join(', ')}`);
  else if (!/IMBALANCED/i.test(r.status || '')) parts.push('no confirmed evidence');
  return parts.join(' · ');
}

function Field({ label, children }) {
  return <div className="mb-5"><p className="text-[11px] font-bold uppercase tracking-widest text-slate-400 mb-1.5">{label}</p>{children}</div>;
}