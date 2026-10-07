import { AnahatAssessment, AnahatBaseline } from './anahatModels.js';
import { engine, EngineError, QUADRANTS, BASELINE_FIELDS } from './engineClient.js';
import { User, PatientProfile, Appointment } from '../models/postgres/index.js';
import { Prescription } from '../models/mongo/Prescription.js';
import { ReportHistory, ActivityPlan, PatientNotification, AuditLog, PatientMeta } from '../models/mongo/patientData.js';
import { env } from '../config/env.js';

// ---------------------------------------------------------------------------
// Orchestration layer between the existing application and the ANAHAT AI
// Engine. Translates application data → engine contract → application
// records. No clinical reasoning lives here: every score, candidate, raga
// and activity comes from the engine; this layer only persists, authorises
// and makes the state machine safe against retries.
// ---------------------------------------------------------------------------

export class AppError extends Error {
  constructor(message, status = 400, extra = {}) { super(message); this.status = status; Object.assign(this, extra); }
}

const audit = (action, actor, detail = {}) => AuditLog.create({ action, actor, detail });

// Subscription: Basic plan signups get a fixed number of free AI
// consultations (see General Updates: "Allow 5 consultations free to use
// AI, after which the patient needs the Premium Plan."). Only gates
// patient-initiated consultations — a therapist assessing a patient they
// already booked (paid separately) is never blocked by this.
async function assertAiQuota(patientId) {
  const meta = await PatientMeta.findOneAndUpdate(
    { userId: patientId },
    { $setOnInsert: { plan: 'basic', aiConsultationsUsed: 0 } },
    { upsert: true, new: true },
  );
  if (meta.plan === 'premium') return;
  if ((meta.aiConsultationsUsed || 0) >= env.freeAiConsultations) {
    throw new AppError(
      `You've used all ${env.freeAiConsultations} free AI consultations on the Basic plan. Upgrade to Premium for unlimited AI consultations.`,
      402,
      { code: 'PREMIUM_REQUIRED' },
    );
  }
  meta.aiConsultationsUsed = (meta.aiConsultationsUsed || 0) + 1;
  await meta.save();
}

export const toPublic = (doc) => {
  const o = doc.toObject ? doc.toObject() : doc;
  const { _id, __v, ...rest } = o;
  return { id: String(_id), ...rest };
};

// ---- access -----------------------------------------------------------------

export async function therapistHasPatient(therapistId, patientId) {
  const n = await Appointment.count({ where: { therapistId, patientId, status: ['confirmed', 'completed'] } });
  return n > 0;
}

export async function assertPatientAccess(user, patientId) {
  if (user.role === 'admin') return;
  if (user.role === 'patient' && user.id === patientId) return;
  if (user.role === 'therapist' && user.isApproved && await therapistHasPatient(user.id, patientId)) return;
  throw new AppError('You do not have access to this patient.', 403);
}

export async function loadAssessment(user, id) {
  const doc = await AnahatAssessment.findById(id).catch(() => null);
  if (!doc) throw new AppError('Assessment not found.', 404);
  const ok = user.role === 'admin'
    || (user.role === 'therapist' && doc.therapistId === user.id)
    || (user.role === 'patient' && doc.patientId === user.id);
  if (!ok) throw new AppError('You do not have access to this assessment.', 403);
  return doc;
}

export function assertTherapistOwner(user, doc) {
  if (user.role === 'admin' || (user.role === 'therapist' && doc.therapistId === user.id)) return;
  throw new AppError('Only the assessing therapist can do this.', 403);
}

function assertOpen(doc) {
  if (doc.status === 'completed') throw new AppError('This assessment is already completed.', 409);
  if (doc.status === 'engine_session_lost') throw new AppError('The AI engine no longer has this session (it was restarted). Start a new assessment; this record stays readable.', 409, { code: 'ENGINE_SESSION_LOST' });
}

// Wrap engine calls: mark the record when the engine lost the session.
async function withEngine(doc, fn) {
  try {
    return await fn();
  } catch (err) {
    if (err instanceof EngineError && !err.infrastructure && err.status !== 503) {
      // Non-runtime engine routes surface "session not found" as a bare 500,
      // so confirm with a probe before blaming the session.
      const lost = err.sessionLost || !(await engine.sessionExists(doc.engineSessionId));
      if (lost) {
        doc.engineAlive = false; doc.status = 'engine_session_lost'; await doc.save();
        throw new AppError('The AI engine no longer has this session (it was restarted). Start a new assessment; this record stays readable.', 409, { code: 'ENGINE_SESSION_LOST' });
      }
    }
    throw err;
  }
}

// ---- reference ------------------------------------------------------------

export async function health() {
  try {
    const status = await engine.health();
    return { ok: status?.status === 'ok', aiReady: status?.ai_ready === true,
      url: engine.url, engine: status };
  }
  catch (err) { return { ok: false, url: engine.url, message: err.message }; }
}

export async function reference() {
  let chakras = ['Root Chakra', 'Sacral Chakra', 'Solar Plexus Chakra', 'Heart Chakra', 'Throat Chakra', 'Third Eye Chakra', 'Crown Chakra'];
  try { const r = await engine.reference(); if (r?.chakras?.length) chakras = r.chakras; } catch { /* engine offline: canonical fallback list */ }
  // Opening styles come from the engine (KB assessments folder); never from local files.
  let openingSets = [];
  try { const o = await engine.openingStyles(); openingSets = (o.styles || []).map((x) => ({ set_id: x.id, name: x.name, recommended_for: x.recommended_for, questionCount: x.question_count })); } catch { /* engine offline: therapist cannot start an opening until it is back */ }
  return { quadrants: QUADRANTS, openingSets, baselineFields: BASELINE_FIELDS, chakras, safetyTiers: ['CLEAR', 'AMBER', 'ESCALATE'], clinicalValidation: false };
}

// ---- baseline (step 2) ----------------------------------------------------

export const listBaselines = (patientId) => AnahatBaseline.find({ patientId }).sort({ createdAt: -1 }).limit(10).then((r) => r.map(toPublic));

export async function recordBaseline(actor, patientId, body) {
  const { stress, anxiety, mood, sleep_quality, energy, note } = body;
  const row = await AnahatBaseline.create({ patientId, stress, anxiety, mood, sleep_quality, energy, note: note || '' });
  await audit('anahat.baseline.recorded', actor.id, { patientId, baselineId: row._id });
  return toPublic(row);
}

// ---- lifecycle ------------------------------------------------------------

export const listForPatient = (patientId) => AnahatAssessment.find({ patientId }).sort({ createdAt: -1 }).then((r) => r.map(toPublic));
export const listMine = (user) => {
  const filter = user.role === 'therapist' ? { therapistId: user.id } : user.role === 'patient' ? { patientId: user.id } : {};
  return AnahatAssessment.find(filter).sort({ createdAt: -1 }).limit(100).then((r) => r.map(toPublic));
};

// Step 1 → engine session from the EXISTING patient profile.
// A fresh assessment start must create a brand-new session; resume only happens
// when the caller explicitly targets the same appointment/session or passes
// force=true.
export async function createOrResume(user, { patientId, appointmentId, liveSessionId, force = false }) {
  if (!patientId) throw new AppError('patientId is required.');
  if (user.role === 'therapist' && !(await therapistHasPatient(user.id, patientId))) {
    throw new AppError('You can only assess patients who have booked a session with you.', 403);
  }
  if (!force && (appointmentId || liveSessionId)) {
    const match = {};
    if (appointmentId) match.appointmentId = appointmentId;
    if (liveSessionId) match.liveSessionId = liveSessionId;
    const open = await AnahatAssessment.findOne({
      patientId,
      therapistId: user.id,
      status: { $in: ['in_progress', 'escalated'] },
      ...match,
    }).sort({ createdAt: -1 });
    if (open) return { assessment: toPublic(open), resumed: true };
  }
  // A brand-new consultation (not a resume) counts against the patient's
  // free AI-consultation quota on the Basic plan.
  if (user.role === 'patient') await assertAiQuota(patientId);
  const patient = await User.findByPk(patientId, { attributes: { exclude: ['passwordHash'] }, include: [{ model: PatientProfile, as: 'patientProfile', required: false }] });
  if (!patient) throw new AppError('Patient not found.', 404);

  const session = await engine.createSession({
    patient_id: patientId,
    language: 'en',
    communication_preferences: {
      name: `${patient.firstName} ${patient.lastName}`.trim(),
      age: patient.patientProfile?.age ?? null,
      gender: patient.patientProfile?.gender ?? null,
      concerns: patient.patientProfile?.disease ?? null,
    },
  });
  const doc = await AnahatAssessment.create({ patientId, therapistId: user.id, appointmentId: appointmentId || null, liveSessionId: liveSessionId || null, engineSessionId: session.session_id, stage: session.current_stage });

  // Step 2 from the patient's own stored baseline, if there is an unused one.
  const stored = await AnahatBaseline.findOne({ patientId, usedInAssessmentId: null }).sort({ createdAt: -1 });
  if (stored) {
    const b = { stress: stored.stress, anxiety: stored.anxiety, mood: stored.mood, sleep_quality: stored.sleep_quality, energy: stored.energy };
    const r = await engine.baseline(session.session_id, b);
    doc.baseline = b; doc.stage = r.stage;
    stored.usedInAssessmentId = String(doc._id); await stored.save();
    await doc.save();
  }
  await audit('anahat.assessment.created', user.id, { patientId, assessmentId: doc._id, engineSessionId: session.session_id });
  return { assessment: toPublic(doc), resumed: false };
}

export async function setBaseline(user, doc, body) {
  assertTherapistOwner(user, doc); assertOpen(doc);
  if (doc.baseline) return toPublic(doc);                        // engine forbids re-recording; idempotent
  const r = await withEngine(doc, () => engine.baseline(doc.engineSessionId, body));
  doc.baseline = body; doc.stage = r.stage; await doc.save();
  await audit('anahat.baseline.set', user.id, { assessmentId: doc._id });
  return toPublic(doc);
}

export async function setContext(user, doc, context) {
  assertTherapistOwner(user, doc); assertOpen(doc);
  doc.therapistContext = String(context || ''); await doc.save();
  return toPublic(doc);
}

// Step 3/4 — fixed opening questions.
export async function selectOpening(user, doc, setId) {
  assertTherapistOwner(user, doc); assertOpen(doc);
  if (doc.openingSetId === setId && doc.openingQuestions.length) return { opening: { set_id: setId, questions: doc.openingQuestions }, assessment: toPublic(doc) };
  const r = await withEngine(doc, () => engine.opening(doc.engineSessionId, setId));
  doc.openingSetId = setId; doc.openingQuestions = r.questions || []; doc.stage = r.stage; await doc.save();
  await audit('anahat.opening.selected', user.id, { assessmentId: doc._id, setId });
  return { opening: { set_id: setId, questions: doc.openingQuestions }, assessment: toPublic(doc) };
}

// Step 5 — engine's quadrant analysis (read-ish; the engine records the
// current issue so we use POST semantics).
export async function analyseQuadrants(user, doc, currentIssue) {
  assertTherapistOwner(user, doc); assertOpen(doc);
  const rec = await withEngine(doc, () => engine.quadrants(doc.engineSessionId, currentIssue));
  if (currentIssue !== undefined) { doc.currentIssue = currentIssue || ''; await doc.save(); }
  return { recommended: rec, all: QUADRANTS, selected: doc.scope };
}

// Step 6 — therapist selects one or more quadrants (assessment SCOPE). The
// engine's own selection endpoint is called once per quadrant; nothing
// about chakras is inferred here. Can be called again later to ADD scope.
export async function selectQuadrants(user, doc, quadrants) {
  assertTherapistOwner(user, doc); assertOpen(doc);
  const list = [...new Set((quadrants || []).filter((q) => QUADRANTS.includes(q)))];
  if (!list.length) throw new AppError('Select at least one valid quadrant.');
  if (!doc.openingSetId) throw new AppError('Choose the opening question set before selecting quadrants.', 409);
  const questions = { ...(doc.quadrantQuestions || {}) };
  for (const q of list) {
    if (questions[q]) continue;                                  // already in scope → idempotent
    const r = await withEngine(doc, () => engine.selectQuadrant(doc.engineSessionId, q));
    questions[q] = r.questions || [];
    doc.stage = r.stage;
  }
  doc.scope = [...new Set([...doc.scope, ...list])];
  doc.quadrantQuestions = questions; doc.markModified('quadrantQuestions');
  await doc.save();
  await audit('anahat.scope.selected', user.id, { assessmentId: doc._id, quadrants: list });
  return { scope: doc.scope, questions, assessment: toPublic(doc) };
}

// Steps 7–16 — raw response → safety → understanding → candidates.
// `requestId` (client-generated) makes retries safe: the same requestId
// returns the stored engine result instead of re-running the engine.
export async function submitResponse(user, doc, { text, questionId, question, quadrant, requestId }) {
  assertTherapistOwner(user, doc); assertOpen(doc);
  if (!text || !String(text).trim()) throw new AppError('Patient response text is required.');
  if (quadrant && !doc.scope.includes(quadrant)) throw new AppError(`"${quadrant}" is not in the selected assessment scope. Add it first.`, 409);
  if (requestId) {
    const prev = doc.transcript.find((t) => t.requestId === requestId);
    if (prev) return { ...(doc.candidatesByResponse?.[prev.responseId] || { status: prev.status, response_id: prev.responseId, safety: prev.safety }), replayed: true, assessment: toPublic(doc) };
  }
  const openingResponse = doc.stage === 'opening' && !questionId && !quadrant;
  const r = await withEngine(doc, () => openingResponse
    ? engine.openingResponse(doc.engineSessionId, text)
    : engine.respond(doc.engineSessionId, { text, question_id: questionId || null, quadrant: quadrant || null }));
  const status = r.status === 'ESCALATE' ? 'SAFETY_ESCALATION' : r.status;
  const safety = r.safety || (r.status === 'ESCALATE' ? { status: 'ESCALATE' } : { status: 'CLEAR' });
  const amber = safety.level === 'AMBER' || safety.status === 'AMBER';
  const responseId = r.response_id || `opening_${Date.now()}`;
  const candidates = r.candidates || [];
  doc.transcript.push({ requestId: requestId || null, question: question || null, questionId: questionId || null, quadrant: quadrant || null, text, responseId, status, safety, candidateCount: candidates.length, at: new Date() });
  doc.candidatesByResponse = { ...(doc.candidatesByResponse || {}), [responseId]: { status, response_id: responseId, extraction: r.extraction || null, candidates, safety } };
  doc.markModified('candidatesByResponse');
  // The engine now turns validated indicators extracted from patient session
  // responses into confirmed session evidence immediately. Persist that
  // evidence with the assessment so the existing scoring path can consume it
  // without a separate Confirm/Reject action.
  for (const evidence of r.evidence || []) {
    if (!doc.evidence.some((item) => item.candidate_id === evidence.candidate_id)) {
      doc.evidence.push({ ...evidence, clarifications: [] });
    }
  }
  if (status === 'SAFETY_ESCALATION') {
    // Product-level response: record, audit, notify, surface. Never hidden.
    doc.safetyEvents.push({ responseId, safety, at: new Date(), acknowledged: false });
    doc.status = 'escalated'; doc.stage = 'safety_escalation';
    await audit('anahat.safety.escalation', user.id, { assessmentId: doc._id, responseId, safety });
  } else {
    if (amber) {
      // AMBER: assessment continues, the therapist is alerted and automatic deep-dive pauses until acknowledged.
      doc.safetyEvents.push({ responseId, safety, at: new Date(), acknowledged: false });
      await audit('anahat.safety.amber', user.id, { assessmentId: doc._id, responseId, safety });
    }
    doc.stage = r.stage || (openingResponse ? 'quadrant_recommendation' : 'evidence_review');
  }
  await doc.save();
  return { ...r, status, response_id: responseId, candidates, safety, assessment: toPublic(doc) };
}

// Therapist acknowledges an escalation (after following the safety
// protocol) so the UI can continue; the engine's own escalation record and
// stage are untouched — this is application state only.
export async function acknowledgeSafety(user, doc, { note, continueAssessment }) {
  assertTherapistOwner(user, doc);
  // Tell the engine too: a RED escalation stays in force there until a therapist explicitly clears it.
  if (doc.engineSessionId && doc.status !== 'engine_session_lost') {
    await withEngine(doc, () => engine.safetyAck(doc.engineSessionId, { therapist_note: note || null, resume: !!continueAssessment }));
  }
  doc.safetyEvents = doc.safetyEvents.map((e) => ({ ...e, acknowledged: true, note: e.acknowledged ? e.note : (note || ''), acknowledgedAt: e.acknowledgedAt || new Date() }));
  doc.markModified('safetyEvents');
  doc.status = continueAssessment ? 'in_progress' : 'abandoned';
  await doc.save();
  await audit('anahat.safety.acknowledged', user.id, { assessmentId: doc._id, continueAssessment: !!continueAssessment });
  return toPublic(doc);
}

// Step 17 — confirm / reject a candidate.
export async function confirmCandidate(user, doc, candidateId, body) {
  assertTherapistOwner(user, doc); assertOpen(doc);
  const { response_id, confirmed = true, evidence_status = 'CONFIRMED', therapist_note, selected_chakra, confirmation_actor = 'therapist' } = body;
  const already = doc.evidence.find((e) => e.candidate_id === candidateId);
  if (already) return { status: 'CONFIRMED', evidence: already, replayed: true };
  const r = await withEngine(doc, () => engine.confirm(doc.engineSessionId, candidateId, { response_id, confirmed, evidence_status, therapist_note, selected_chakra, confirmation_actor }));
  if (r.status === 'CONFIRMED' && r.evidence) doc.evidence.push({ ...r.evidence, candidate_id: candidateId, clarifications: r.clarifications || [] });
  const bucket = doc.candidatesByResponse?.[response_id];
  if (bucket) { bucket.candidates = (bucket.candidates || []).map((c) => (c.candidate_id === candidateId ? { ...c, decision: r.status } : c)); doc.markModified('candidatesByResponse'); }
  await doc.save();
  await audit(`anahat.candidate.${r.status === 'CONFIRMED' ? 'confirmed' : 'rejected'}`, user.id, { assessmentId: doc._id, candidateId, evidence_status });
  return r;
}

export async function resolveEvidence(user, doc, evidenceId, body) {
  assertTherapistOwner(user, doc); assertOpen(doc);
  const r = await withEngine(doc, () => engine.resolveEvidence(doc.engineSessionId, evidenceId, body));
  doc.evidence = doc.evidence.map((e) => (e.evidence_id === evidenceId ? { ...e, ...r } : e));
  doc.markModified('evidence'); await doc.save();
  await audit('anahat.evidence.resolved', user.id, { assessmentId: doc._id, evidenceId, selected_chakra: body.selected_chakra });
  return r;
}

// Question paging (engine): next unanswered questions for a quadrant; the engine reports when a quadrant
// is exhausted and which quadrant to move to (no more "out of questions").
export async function nextQuestions(user, doc, quadrant, limit, deepDive = false) {
  assertTherapistOwner(user, doc); assertOpen(doc);
  return withEngine(doc, () => engine.nextQuestions(doc.engineSessionId, quadrant, limit, deepDive));
}

export async function completeQuadrant(user, doc, quadrant) {
  assertTherapistOwner(user, doc); assertOpen(doc);
  const r = await withEngine(doc, () => engine.completeQuadrant(doc.engineSessionId, quadrant));
  await audit('anahat.quadrant.completed', user.id, { assessmentId: doc._id, quadrant });
  return r;
}

// Deep dive (engine): missing details, capped per evidence, stops on therapist stop / safety hold.
export async function deepDive(user, doc, stop) {
  assertTherapistOwner(user, doc); assertOpen(doc);
  return withEngine(doc, () => engine.deepDive(doc.engineSessionId, stop));
}

export async function answerDeepDive(user, doc, body) {
  assertTherapistOwner(user, doc); assertOpen(doc);
  const r = await withEngine(doc, () => engine.deepDiveAnswer(doc.engineSessionId, { evidence_id: body.evidence_id, field: body.field, value: body.value, raw_text: body.raw_text || null }));
  if (body.raw_text?.trim()) {
    doc.transcript.push({ requestId: null, question: `Deep dive: ${body.field}`, questionId: `DD-${body.field}`, quadrant: body.quadrant || null, text: body.raw_text.trim(), responseId: r.response_id || null, status: r.status || 'OK', at: new Date() });
  }
  if (r.evidence) { doc.evidence = doc.evidence.map((e) => (e.evidence_id === body.evidence_id ? { ...e, ...r.evidence } : e)); doc.markModified('evidence'); }
  if (body.raw_text?.trim() || r.evidence) await doc.save();
  await audit('anahat.deepdive.answered', user.id, { assessmentId: doc._id, evidenceId: body.evidence_id, field: body.field });
  return r;
}

export async function resolveContradiction(user, doc, body) {
  assertTherapistOwner(user, doc); assertOpen(doc);
  const r = await withEngine(doc, () => engine.resolveContradiction(doc.engineSessionId, { keep_evidence_id: body.keep_evidence_id, therapist_note: body.therapist_note || null }));
  await audit('anahat.contradiction.resolved', user.id, { assessmentId: doc._id, kept: body.keep_evidence_id });
  return r;
}

// Result window data: per-chakra status, scores, confidence, coverage, trace and open items.
export async function result(user, doc) {
  assertTherapistOwner(user, doc);
  const r = await withEngine(doc, () => engine.result(doc.engineSessionId));
  return r;
}

// Steps 18–26 — deterministic scoring (engine). POST: the engine mutates its stage.
export async function score(user, doc) {
  assertTherapistOwner(user, doc); assertOpen(doc);
  const r = await withEngine(doc, () => engine.chakraReport(doc.engineSessionId));
  doc.chakraReport = r; doc.stage = 'chakra_scoring'; await doc.save();
  return r;
}

// Steps 27–28 — sufficiency + continue / deep dive / stop.
export async function decide(user, doc, stop) {
  assertTherapistOwner(user, doc); assertOpen(doc);
  const r = await withEngine(doc, () => engine.decision(doc.engineSessionId, !!stop));
  doc.chakraReport = r.chakra_report; doc.stage = r.stage;
  doc.decisions.push({ kind: 'assessment', stop: !!stop, action: r.action, reason: r.reason, at: new Date() });
  await doc.save();
  await audit('anahat.assessment.decision', user.id, { assessmentId: doc._id, stop: !!stop, action: r.action });
  return r;
}

// Steps 29–32 — raga + activity candidates (engine).
export async function recommendations(user, doc) {
  assertTherapistOwner(user, doc); assertOpen(doc);
  const r = await withEngine(doc, () => engine.recommendations(doc.engineSessionId));
  doc.recommendations = r; doc.stage = 'raga_review'; await doc.save();
  return r;
}

// Explicit End Session command. The engine owns accumulated response/evidence
// state; this call asks it to evaluate the whole session once and persists that
// returned report instead of trusting any earlier cached chakra report.
export async function endSession(user, doc) {
  assertTherapistOwner(user, doc); assertOpen(doc);
  if (doc.finalChakraResult && doc.recommendations) {
    return { final_result: doc.finalChakraResult, chakra_report: doc.chakraReport,
      raga: doc.recommendations.raga, activities: doc.recommendations.activities,
      assessment_context_summary: doc.assessmentContextSummary };
  }
  const result = await withEngine(doc, () => engine.endSession(doc.engineSessionId));
  // A RED safety escalation pauses the assessment (including End Session) until cleared.
  if (result?.status === 'SAFETY_ESCALATION') {
    throw new AppError(result.detail || 'Assessment is paused for a safety escalation. Follow the safety protocol and clear it first.', 409);
  }
  // Older engines blocked End Session on open follow-ups; the fixed engine always scores.
  if (result?.status === 'CLARIFICATION_REQUIRED' || !result?.final_result) {
    throw new AppError('The AI engine did not return a final chakra evaluation. Update the engine (End Session must always score) and try again.', 409);
  }
  doc.finalChakraResult = result.final_result;
  doc.chakraReport = result.chakra_report;
  doc.recommendations = { raga: result.raga, activities: result.activities };
  doc.assessmentContextSummary = result.assessment_context_summary;
  doc.stage = 'raga_review';
  await doc.save();
  await audit('anahat.assessment.ended', user.id, {
    assessmentId: doc._id,
    responses: result.assessment_context_summary?.total_responses,
    evidence: result.assessment_context_summary?.total_evidence_items,
    quadrants: result.assessment_context_summary?.completed_quadrants,
  });
  return result;
}

// Step 33 — prescription draft (engine).
export async function draftPrescription(user, doc) {
  assertTherapistOwner(user, doc); assertOpen(doc);
  const r = await withEngine(doc, () => engine.prescription(doc.engineSessionId));
  doc.prescriptionDraft = r; doc.stage = 'prescription'; await doc.save();
  return r;
}

// Step 33/34 — therapist review. Records the decision in the engine and on
// the record. Does NOT persist prescriptions/reports — that is finalize().
export async function reviewPrescription(user, doc, { decision, edits = {}, note }) {
  assertTherapistOwner(user, doc); assertOpen(doc);
  const verdict = String(decision || '').toUpperCase();
  if (!['APPROVE', 'EDIT', 'REJECT', 'CLARIFY'].includes(verdict)) throw new AppError('decision must be APPROVE, EDIT, REJECT or CLARIFY.');
  if (!doc.prescriptionDraft) throw new AppError('Draft the prescription first.', 409);
  const r = await withEngine(doc, () => engine.prescriptionDecision(doc.engineSessionId, { decision: verdict, edits, therapist_id: user.id, note: note || null }));
  doc.prescriptionDecision = { decision: verdict, edits, note: note || '', engineResult: r, at: new Date() };
  doc.decisions.push({ kind: 'prescription', decision: verdict, note: note || '', at: new Date() });
  await doc.save();
  await audit('anahat.prescription.decision', user.id, { assessmentId: doc._id, decision: verdict });
  return { decision: doc.prescriptionDecision, assessment: toPublic(doc) };
}

// Steps 28–35 — FINALIZE. Idempotent command: creates exactly one
// Prescription (existing model), one ReportHistory entry (existing model),
// appends approved activities to the existing ActivityPlan, one patient
// notification and one audit entry. Calling it again returns the same
// result without writing anything.
export async function finalize(user, doc) {
  assertTherapistOwner(user, doc);
  if (doc.status === 'completed' && doc.finalReport) return { assessment: toPublic(doc), already: true };
  if (!doc.prescriptionDecision || !['APPROVE', 'EDIT'].includes(doc.prescriptionDecision.decision)) {
    throw new AppError('The prescription must be approved before finalising.', 409);
  }
  const draft = doc.prescriptionDraft || {};
  const edits = doc.prescriptionDecision.edits || {};
  const findings = doc.finalChakraResult?.chakras || doc.chakraReport?.results || draft.findings || [];
  const ragas = edits.raga_candidates || draft.raga_candidates || [];
  const activities = edits.activities || draft.activities || [];
  const nameOfRaga = (r) => r.raga || r.name || r.raga_name || r.id || '';
  const nameOfAct = (a) => a.activity || a.name || a.title || a.text || (typeof a === 'string' ? a : '');

  const [patient, therapist] = await Promise.all([
    User.findByPk(doc.patientId, { attributes: ['firstName', 'lastName'] }),
    User.findByPk(doc.therapistId, { attributes: ['firstName', 'lastName'] }),
  ]);
  const pName = `${patient?.firstName || ''} ${patient?.lastName || ''}`.trim();
  const tName = `${therapist?.firstName || ''} ${therapist?.lastName || ''}`.trim();

  // 1) Prescription — EXISTING model, once.
  if (!doc.prescriptionId) {
    const p = await Prescription.create({
      patientId: doc.patientId, therapistId: doc.therapistId, appointmentId: doc.appointmentId || undefined,
      title: `ANAHAT prescription — ${new Date().toLocaleDateString('en-IN')}`,
      notes: [
        doc.prescriptionDecision.note ? `Therapist note: ${doc.prescriptionDecision.note}` : null,
        `Chakra findings: ${summarise(findings)}`,
        ragas.length ? `Ragas: ${ragas.map(nameOfRaga).filter(Boolean).join(', ')}` : 'Ragas: none prescribed',
        activities.length ? `Activities: ${activities.map(nameOfAct).filter(Boolean).join('; ')}` : 'Activities: none prescribed',
        `Source: ANAHAT assessment ${doc._id} (decision support; not a clinical diagnosis).`,
      ].filter(Boolean).join('\n'),
      recommendedTrackIds: [],
    });
    doc.prescriptionId = String(p._id);
  }

  // 2) Final report → EXISTING ReportHistory, once.
  doc.finalReport = {
    assessmentId: String(doc._id),
    patient: { id: doc.patientId, name: pName },
    therapist: { id: doc.therapistId, name: tName },
    baseline: doc.baseline,
    therapistContext: doc.therapistContext,
    coverage: { scope: doc.scope, responses: doc.transcript.length, evidenceUnits: doc.evidence.length },
    chakraAnalysis: findings,
    evidence: doc.evidence,
    unresolved: (doc.finalChakraResult?.chakras || doc.chakraReport?.results || [])
      .filter((c) => /UNRESOLVED/i.test(c.status || '')),
    ragaRecommendations: ragas,
    activities,
    safetyEvents: doc.safetyEvents,
    safetyNotes: draft.safety_notes || [],
    therapistDecisions: doc.decisions,
    prescriptionId: doc.prescriptionId,
    generatedAt: new Date(),
    clinicalValidation: false,
  };
  if (!doc.reportHistoryId) {
    const row = await ReportHistory.create({
      patientId: doc.patientId,
      report: {
        title: 'ANAHAT assessment report', type: 'anahat_assessment',
        assessmentId: String(doc._id), appointmentId: doc.appointmentId, therapistId: doc.therapistId, therapistName: tName,
        summary: summarise(findings), notes: doc.prescriptionDecision.note || '',
        raga: ragas.map(nameOfRaga).filter(Boolean).join(', '),
        activities: activities.map(nameOfAct).filter(Boolean),
        chakraAnalysis: findings, prescriptionId: doc.prescriptionId,
        status: 'approved', approvedAt: new Date(),
      },
    });
    doc.reportHistoryId = String(row._id);
  }

  // 3) Activities → EXISTING ActivityPlan (append, dedupe by text).
  const items = activities.map((a, i) => ({ id: `anahat_${doc._id}_${i}`, text: nameOfAct(a), source: 'anahat' })).filter((a) => a.text);
  if (items.length) {
    const plan = await ActivityPlan.findOne({ patientId: doc.patientId });
    const existing = plan?.activities || [];
    const merged = [...existing, ...items.filter((n) => !existing.some((e) => e.text === n.text || e.id === n.id))];
    await ActivityPlan.findOneAndUpdate({ patientId: doc.patientId }, { $set: { activities: merged } }, { upsert: true });
  }

  // 4) Notification + audit — once, because status flips to completed here.
  await PatientNotification.create({ patientId: doc.patientId, message: 'Your therapist has approved your ANAHAT assessment. Your report, prescription and daily activities are ready.', detail: { kind: 'report', assessmentId: String(doc._id), prescriptionId: doc.prescriptionId } });
  doc.status = 'completed'; doc.stage = 'completed'; doc.finalizedAt = new Date();
  await doc.save();
  await audit('anahat.assessment.finalized', user.id, { assessmentId: doc._id, prescriptionId: doc.prescriptionId, reportHistoryId: doc.reportHistoryId });
  return { assessment: toPublic(doc), already: false };
}

function summarise(findings) {
  const list = Array.isArray(findings) ? findings : [];
  const imbalanced = list.filter((c) => c.status && /IMBALANCED/i.test(c.status));
  if (!imbalanced.length) return 'No chakra passed the imbalance gate; assessment recorded for therapist review.';
  return [...imbalanced]
    .sort((a, b) => Number(b.score || 0) - Number(a.score || 0))
    .map((c) => `${c.chakra}: ${c.status_label || c.status}${c.severity ? `, ${c.severity}` : ''}, confidence ${Math.round(c.confidence_pct || 0)}%`)
    .join('; ');
}


// ---- Nadika.ai chat log (offline session) -----------------------------------
// The chat is the therapist's working surface; keeping it on the record means
// a refresh or a resumed session shows exactly what was on screen.
export async function appendChat(user, doc, entries) {
  assertTherapistOwner(user, doc);
  const list = (Array.isArray(entries) ? entries : [entries]).filter((e) => e && e.role && (e.text || e.card)).map((e) => ({ ...e, at: e.at || new Date() }));
  const update = {};
  if (list.length) update.$push = { chatLog: { $each: list } };
  if (entries?.askedQuestionId) update.$addToSet = { askedQuestionIds: entries.askedQuestionId };
  if (Object.keys(update).length) await AnahatAssessment.updateOne({ _id: doc._id }, update);
  const fresh = await AnahatAssessment.findById(doc._id);
  return { chatLog: fresh?.chatLog || [], askedQuestionIds: fresh?.askedQuestionIds || [] };
}

export async function markAsked(user, doc, questionId) {
  assertTherapistOwner(user, doc);
  if (questionId && !doc.askedQuestionIds.includes(questionId)) { doc.askedQuestionIds.push(questionId); await doc.save(); }
  return doc.askedQuestionIds;
}

// When the AI engine is not configured, the therapist can still record the
// patient's answer against the question so nothing is lost. Recorded
// answers are part of the transcript but produce no engine evidence.
export async function recordOffline(user, doc, { text, questionId, question, quadrant, requestId }) {
  assertTherapistOwner(user, doc); assertOpen(doc);
  if (!text || !String(text).trim()) throw new AppError('Patient response text is required.');
  if (requestId && doc.transcript.some((t) => t.requestId === requestId)) return { replayed: true, assessment: toPublic(doc) };
  doc.transcript.push({ requestId: requestId || null, question: question || null, questionId: questionId || null, quadrant: quadrant || null, text, responseId: null, status: 'RECORDED_WITHOUT_ENGINE', safety: null, candidateCount: 0, at: new Date() });
  if (questionId && !doc.askedQuestionIds.includes(questionId)) doc.askedQuestionIds.push(questionId);
  await doc.save();
  return { status: 'RECORDED_WITHOUT_ENGINE', assessment: toPublic(doc) };
}

// Google Meet link for an ONLINE appointment — entered by the therapist.
export async function setMeetLink(user, appointmentId, meetLink) {
  const appt = await Appointment.findByPk(appointmentId);
  if (!appt) throw new AppError('Appointment not found.', 404);
  if (user.role !== 'admin' && appt.therapistId !== user.id) throw new AppError('Only the appointment therapist can set the link.', 403);
  if (appt.mode === 'offline') throw new AppError('Offline sessions do not use a meeting link.', 409);
  const link = String(meetLink || '').trim();
  if (link && !/^https:\/\/(meet\.google\.com|[\w.-]+\.(zoom\.us|teams\.microsoft\.com))\//.test(link)) throw new AppError('Enter a valid Google Meet (or Zoom / Teams) link.');
  await appt.update({ meetLink: link || null });
  if (link) await PatientNotification.create({ patientId: appt.patientId, message: `Your therapist added the meeting link for your session on ${appt.date} at ${appt.startTime}. Use "Join Session" in Appointments.`, detail: { appointmentId: appt.id, kind: 'meet_link' } });
  return appt;
}