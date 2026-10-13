import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { anahat } from '../../services/api';
import { PageShell, Card, Badge } from '../../components/ui/Kit';
import BackButton from '../../components/layout/BackButton';

const TEAL = '#0F8594';
const CREAM = '#F6F4EC';
const fmt = (d) => (d ? new Date(d).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '—');

// What the therapist sees once a session has ended: a clean record of the
// conversation, the Nadika.AI chakra scan (visible to therapists only) and
// the way into the report builder. Nothing here is shown to the patient.
export default function SessionEndedSummary({ session, patientId, patientName, concern, durationSeconds }) {
  const navigate = useNavigate();
  const [scan, setScan] = useState(null);
  const [scanning, setScanning] = useState(false);
  const [scanError, setScanError] = useState('');

  useEffect(() => { anahat.getScan(session.id).then(setScan).catch(() => {}); }, [session.id]);

  const runScan = () => {
    setScanning(true); setScanError('');
    anahat.chakraScan(session.id, !!scan).then(setScan).catch((e) => setScanError(e.message)).finally(() => setScanning(false));
  };

  const started = new Date(session.startedAt);
  const ended = session.endedAt ? new Date(session.endedAt) : new Date();
  const mins = Math.max(1, Math.round((ended - started) / 60000)) || Math.round(durationSeconds / 60);
  const msgs = session.messages || [];
  const patientMsgs = msgs.filter((m) => m.from === 'patient').length;
  const results = scan?.report?.results || [];
  const imbalanced = results.filter((r) => /IMBALANCED/i.test(r.status || ''));
  const tone = (st = '') => (/^BALANCED/.test(st) ? 'emerald' : /UNRESOLVED/.test(st) ? 'amber' : /IMBALANCED/.test(st) ? 'sunset' : 'slate');

  return (
    <PageShell showBack={false}>
      <div className="max-w-5xl mx-auto px-6 py-8 pb-24">
        <div className="flex items-center justify-between mb-5 flex-wrap gap-3">
          <BackButton to={`/therapist/patient/${patientId}`} label="Back to patient record" />
          <Badge tone="slate">Session ended</Badge>
        </div>

        <div className="bg-white rounded-3xl border border-black/5 p-6 md:p-8 mb-6">
          <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-slate-400">Session summary</p>
          <h1 className="font-serif font-bold text-2xl text-slate-900 mt-1">{patientName}</h1>
          <p className="text-sm text-slate-500 mt-1">Concern: {concern}</p>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-6">
            {[['Started', fmt(session.startedAt)], ['Ended', fmt(session.endedAt)], ['Duration', `${mins} min`], ['Messages', `${msgs.length} (${patientMsgs} from patient)`]].map(([l, v]) => (
              <div key={l} className="rounded-2xl p-4" style={{ background: CREAM }}><p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">{l}</p><p className="text-sm font-bold text-slate-900 mt-1">{v}</p></div>
            ))}
          </div>
          <div className="flex flex-wrap gap-2 mt-6">
            <button onClick={() => navigate(`/therapist/report/${patientId}?session=${session.id}`)} className="px-6 py-3 rounded-2xl text-sm font-bold text-white" style={{ background: TEAL }}>Prepare report (PDF)</button>
            <button onClick={() => navigate(`/therapist/session/${patientId}?mode=offline`)} className="px-5 py-3 rounded-2xl text-sm font-bold border" style={{ borderColor: TEAL, color: TEAL }}>Open ANAHAT session</button>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-[1fr_380px] gap-6 items-start">
          <Card>
            <h2 className="font-serif font-bold text-lg mb-4">Conversation</h2>
            {msgs.length === 0 ? <p className="text-sm text-slate-400">No messages were exchanged.</p> : (
              <div className="space-y-2">
                {msgs.map((m, i) => (
                  <div key={m.id || i} className={`flex ${m.from === 'therapist' ? 'justify-end' : 'justify-start'}`}>
                    <div className="max-w-[80%] rounded-2xl px-4 py-2.5 text-sm" style={{ background: m.from === 'therapist' ? '#E6F0EA' : '#FBFAF6', border: '1px solid rgba(0,0,0,0.05)' }}>
                      <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-0.5">{m.from === 'therapist' ? 'You' : patientName} · {m.at ? new Date(m.at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : ''}</p>
                      <p className="text-slate-800">{m.text}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Card>

          <Card>
            <div className="flex items-center justify-between mb-1">
              <h2 className="font-serif font-bold text-lg">Nadika.AI chakra scan</h2>
              <Badge tone="amber">Therapist only</Badge>
            </div>
            <p className="text-xs text-slate-500 mb-4">Runs the patient's own words through the ANAHAT engine. Findings are <b>provisional</b> — nothing here was confirmed with the patient. Use it to prepare the report, not as a diagnosis.</p>
            {scanError && <p className="text-xs text-red-600 mb-3">{scanError}</p>}
            {!scan ? (
              <button onClick={runScan} disabled={scanning} className="px-5 py-2.5 rounded-xl text-xs font-bold text-white disabled:opacity-50" style={{ background: TEAL }}>{scanning ? 'Scanning…' : 'Run chakra scan'}</button>
            ) : (
              <>
                <p className="text-xs text-slate-500 mb-3">{scan.messagesScanned} patient message{scan.messagesScanned === 1 ? '' : 's'} · {scan.evidence?.length || 0} provisional indicator{(scan.evidence?.length || 0) === 1 ? '' : 's'}{scan.status === 'escalated' ? ' · safety signal present' : ''}</p>
                {scan.safetyEvents?.length > 0 && <div className="rounded-xl bg-red-50 border border-red-200 text-red-700 text-xs px-3 py-2 mb-3">Safety escalation was triggered on {scan.safetyEvents.length} message(s). Follow the safety protocol.</div>}
                {imbalanced.length > 0 ? (
                  <div className="space-y-2 mb-3">
                    {imbalanced.map((r) => (
                      <div key={r.chakra} className="rounded-xl px-4 py-3 border border-black/5" style={{ background: CREAM }}>
                        <div className="flex items-center justify-between"><p className="text-sm font-bold text-slate-900">{r.chakra}</p><Badge tone={tone(r.status)}>{r.status}</Badge></div>
                        <p className="text-xs text-slate-600 mt-1">{r.direction ? `${r.direction} · ` : ''}confidence {Math.round(r.confidence_pct || 0)}% · {r.independent_evidence_units} indicator(s)</p>
                      </div>
                    ))}
                  </div>
                ) : <p className="text-sm text-slate-600 mb-3">{results.length ? 'No chakra passed the imbalance gate from this transcript.' : (scan.report?.note || 'No canonical indicators were found.')}</p>}
                {results.length > 0 && (
                  <details className="text-xs"><summary className="cursor-pointer font-bold text-slate-600">All 7 chakras</summary>
                    <div className="mt-2 space-y-1">{results.map((r) => <div key={r.chakra} className="flex items-center justify-between"><span>{r.chakra}</span><Badge tone={tone(r.status)}>{r.status}</Badge></div>)}</div>
                  </details>
                )}
                <button onClick={runScan} disabled={scanning} className="mt-4 text-xs font-bold underline" style={{ color: TEAL }}>{scanning ? 'Scanning…' : 'Re-run scan'}</button>
              </>
            )}
          </Card>
        </div>
      </div>
    </PageShell>
  );
}
