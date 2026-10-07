import mongoose from 'mongoose';
import { LiveSession, ReportHistory, PatientNotification, AuditLog } from '../models/mongo/patientData.js';
import { AnahatBaseline } from './anahatModels.js';
import { engine, EngineError } from './engineClient.js';
class AppError extends Error { constructor(message, status = 400, extra = {}) { super(message); this.status = status; Object.assign(this, extra); } }
export { AppError as NadikaError };

// ---------------------------------------------------------------------------
// "Nadika.AI" — the in-session assistant + post-session chakra scan.
//
//  • suggestNext(): asks the ENGINE to pick the next question from the ANAHAT
//    knowledge base (opening styles + quadrant question bank). Questions are
//    never generated or read from files here; only chosen by the engine.
//  • chakraScan(): after a session ends, feeds the patient's own words to the
//    AI engine (safety → Gemini → BGE-M3/Qdrant → candidates), auto-records
//    candidates as PROVISIONAL evidence and asks the engine to score all 7
//    chakras. Result is therapist-only and clearly labelled provisional.
// ---------------------------------------------------------------------------

async function loadOwnedSession(user, sessionId) {
  if (!mongoose.isValidObjectId(sessionId)) throw new AppError('Session not found.', 404);
  const s = await LiveSession.findById(sessionId);
  if (!s) throw new AppError('Session not found.', 404);
  if (user.role !== 'admin' && s.therapistId !== user.id) throw new AppError('Only the session therapist can use Nadika.AI here.', 403);
  return s;
}

export async function suggestNext(user, sessionId, { style } = {}) {
  const s = await loadOwnedSession(user, sessionId);
  const asked = (s.aiMessages || []).map((m) => m.questionId).filter(Boolean);
  const patientText = (s.messages || []).filter((m) => m.from === 'patient').slice(-3).map((m) => String(m.text || '')).join(' ');
  const suggestion = await engine.suggestQuestion({ patient_text: patientText, asked_ids: asked, style: style || null });
  if (!suggestion) throw new AppError('The engine has no further unasked question for this conversation.', 404);
  const answer = `${suggestion.text}`;
  await LiveSession.findByIdAndUpdate(sessionId, { $push: { aiMessages: { question: suggestion.reason, answer, questionId: suggestion.id, quadrant: suggestion.quadrant, source: suggestion.source, at: new Date() } } });
  return suggestion;
}

// ---- post-session chakra scan (therapist-only) ------------------------------

const scanSchema = new mongoose.Schema({
  sessionId: { type: String, required: true, index: true },
  patientId: { type: String, index: true },
  therapistId: { type: String, index: true },
  engineSessionId: String,
  status: { type: String, default: 'pending' },      // pending | done | escalated | failed
  messagesScanned: { type: Number, default: 0 },
  candidates: { type: [mongoose.Schema.Types.Mixed], default: [] },
  evidence: { type: [mongoose.Schema.Types.Mixed], default: [] },
  safetyEvents: { type: [mongoose.Schema.Types.Mixed], default: [] },
  report: mongoose.Schema.Types.Mixed,
  error: String,
}, { timestamps: true });
export const AnahatSessionScan = mongoose.model('AnahatSessionScan', scanSchema);

export async function getScan(user, sessionId) {
  await loadOwnedSession(user, sessionId);
  const row = await AnahatSessionScan.findOne({ sessionId }).sort({ createdAt: -1 });
  return row ? { id: row._id, ...row.toObject(), _id: undefined, __v: undefined } : null;
}

export async function chakraScan(user, sessionId, { force = false } = {}) {
  const s = await loadOwnedSession(user, sessionId);
  if (s.active) throw new AppError('End the session before running the chakra scan.', 409);
  const existing = await AnahatSessionScan.findOne({ sessionId, status: 'done' });
  if (existing && !force) return { id: existing._id, ...existing.toObject(), _id: undefined, __v: undefined, cached: true };

  const patientMsgs = (s.messages || []).filter((m) => m.from === 'patient' && String(m.text || '').trim());
  if (!patientMsgs.length) throw new AppError('The patient did not say anything in this session, so there is nothing to scan.', 409);

  const scan = await AnahatSessionScan.create({ sessionId, patientId: s.patientId, therapistId: s.therapistId, messagesScanned: patientMsgs.length });
  try {
    const es = await engine.createSession({ patient_id: s.patientId, language: 'en', communication_preferences: { source: 'live_session_scan', sessionId } });
    scan.engineSessionId = es.session_id;
    // Use the patient's own recorded baseline when there is one; otherwise
    // the engine is scored without a baseline (it does not require one for
    // response processing).
    const b = await AnahatBaseline.findOne({ patientId: s.patientId }).sort({ createdAt: -1 });
    if (b) { try { await engine.baseline(es.session_id, { stress: b.stress, anxiety: b.anxiety, mood: b.mood, sleep_quality: b.sleep_quality, energy: b.energy }); } catch { /* optional */ } }

    let escalated = false;
    for (const m of patientMsgs) {
      const r = await engine.respond(es.session_id, { text: m.text });
      if (r.status === 'SAFETY_ESCALATION') { scan.safetyEvents.push({ text: m.text, safety: r.safety }); escalated = true; continue; }
      for (const c of r.candidates || []) {
        scan.candidates.push({ ...c, sourceText: m.text });
        try {
          const conf = await engine.confirm(es.session_id, c.candidate_id, { response_id: r.response_id, confirmed: true, evidence_status: 'PROVISIONAL', confirmation_actor: 'therapist', therapist_note: 'auto-recorded from live session transcript (provisional; not therapist-confirmed)' });
          if (conf.evidence) scan.evidence.push(conf.evidence);
        } catch { /* candidate not canonical → skipped by engine */ }
      }
    }
    // NOTE: a transcript scan has no assessed quadrants, so the engine (correctly) reports low
    // coverage and will not call any chakra imbalanced or balanced from it alone.
    scan.report = scan.evidence.length ? { ...(await engine.chakraReport(es.session_id)), window: await engine.result(es.session_id) } : { results: [], supported_chakras: [], note: 'No canonical indicators were found in the transcript.' };
    scan.status = escalated ? 'escalated' : 'done';
    await scan.save();
    await AuditLog.create({ action: 'anahat.session.chakra_scan', actor: user.id, detail: { sessionId, evidence: scan.evidence.length, escalated } });
    return { id: scan._id, ...scan.toObject(), _id: undefined, __v: undefined, cached: false };
  } catch (err) {
    scan.status = 'failed'; scan.error = err.message; await scan.save();
    if (err instanceof EngineError) throw err;
    throw new AppError(`Chakra scan failed: ${err.message}`, 502);
  }
}

// ---- send a therapist-written report to the patient (existing models) -------

export async function sendReport(user, { patientId, sessionId, report }) {
  if (!patientId || !report?.title) throw new AppError('patientId and a report title are required.');
  if (sessionId) await loadOwnedSession(user, sessionId);
  const row = await ReportHistory.create({
    patientId,
    report: { ...report, type: report.type || 'session_report', sessionId: sessionId || null, therapistId: user.id, status: 'approved', approvedAt: new Date() },
  });
  await PatientNotification.create({ patientId, message: `Your therapist has shared a report: "${report.title}". Open Reports to read it.`, detail: { kind: 'report', reportId: String(row._id) } });
  await AuditLog.create({ action: 'anahat.report.sent', actor: user.id, detail: { patientId, reportId: row._id, sessionId } });
  return { id: row._id, ...row.report, createdAt: row.createdAt };
}
