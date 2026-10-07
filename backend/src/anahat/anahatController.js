import * as svc from './anahatService.js';
import * as nadika from './nadikaService.js';
import { EngineError } from './engineClient.js';

// Thin HTTP layer: parse → authorise (via service) → respond. Engine and
// application errors are mapped to therapist-friendly messages here.
const wrap = (fn) => async (req, res) => {
  try {
    const out = await fn(req, res);
    if (out !== undefined && !res.headersSent) res.json(out);
  } catch (err) {
    if (err instanceof svc.AppError || err instanceof nadika.NadikaError) return res.status(err.status).json({ message: err.message, code: err.code });
    if (err instanceof EngineError) {
      const message = err.infrastructure
        ? `The AI engine is not fully configured (${err.message}). Check the LLM provider key (e.g. MISTRAL_API_KEY), Qdrant and the embedding model on the engine.`
        : err.status === 503 ? 'The AI engine is not reachable right now. Your assessment is saved — try again once it is back.'
        : err.message;
      return res.status(err.status === 503 ? 503 : 502).json({ message, code: err.infrastructure ? 'ENGINE_NOT_CONFIGURED' : 'ENGINE_ERROR', detail: err.detail });
    }
    throw err;
  }
};

const withDoc = (fn) => wrap(async (req, res) => fn(req, res, await svc.loadAssessment(req.user, req.params.id)));

export const health = wrap(() => svc.health());
export const reference = wrap(() => svc.reference());

export const listBaselines = wrap(async (req) => { await svc.assertPatientAccess(req.user, req.params.patientId); return svc.listBaselines(req.params.patientId); });
export const recordBaseline = wrap(async (req, res) => { await svc.assertPatientAccess(req.user, req.params.patientId); res.status(201); return svc.recordBaseline(req.user, req.params.patientId, req.body); });
export const listForPatient = wrap(async (req) => { await svc.assertPatientAccess(req.user, req.params.patientId); return svc.listForPatient(req.params.patientId); });
export const listMine = wrap((req) => svc.listMine(req.user));

export const create = wrap(async (req, res) => { const r = await svc.createOrResume(req.user, req.body); res.status(r.resumed ? 200 : 201); return r; });
export const getOne = withDoc((_req, _res, doc) => svc.toPublic(doc));
export const setBaseline = withDoc((req, _res, doc) => svc.setBaseline(req.user, doc, req.body));
export const setContext = withDoc((req, _res, doc) => svc.setContext(req.user, doc, req.body.context));
export const selectOpening = withDoc((req, _res, doc) => svc.selectOpening(req.user, doc, req.body.set_id));
export const analyseQuadrants = withDoc((req, _res, doc) => svc.analyseQuadrants(req.user, doc, req.body.current_issue));
export const selectQuadrants = withDoc((req, _res, doc) => svc.selectQuadrants(req.user, doc, req.body.quadrants));
export const submitResponse = withDoc((req, _res, doc) => svc.submitResponse(req.user, doc, req.body));
export const acknowledgeSafety = withDoc((req, _res, doc) => svc.acknowledgeSafety(req.user, doc, req.body));
export const confirmCandidate = withDoc((req, _res, doc) => svc.confirmCandidate(req.user, doc, req.params.candidateId, req.body));
export const resolveEvidence = withDoc((req, _res, doc) => svc.resolveEvidence(req.user, doc, req.params.evidenceId, req.body));
export const nextQuestions = withDoc((req, _res, doc) => svc.nextQuestions(req.user, doc, req.query.quadrant, req.query.limit));
export const completeQuadrant = withDoc((req, _res, doc) => svc.completeQuadrant(req.user, doc, req.body.quadrant));
export const deepDive = withDoc((req, _res, doc) => svc.deepDive(req.user, doc, req.query.stop === 'true'));
export const answerDeepDive = withDoc((req, _res, doc) => svc.answerDeepDive(req.user, doc, req.body));
export const resolveContradiction = withDoc((req, _res, doc) => svc.resolveContradiction(req.user, doc, req.body));
export const result = withDoc((req, _res, doc) => svc.result(req.user, doc));
export const score = withDoc((req, _res, doc) => svc.score(req.user, doc));
export const decide = withDoc((req, _res, doc) => svc.decide(req.user, doc, req.body.stop));
export const recommendations = withDoc((req, _res, doc) => svc.recommendations(req.user, doc));
export const endSession = withDoc((req, _res, doc) => svc.endSession(req.user, doc));
export const draftPrescription = withDoc((req, _res, doc) => svc.draftPrescription(req.user, doc));
export const reviewPrescription = withDoc((req, _res, doc) => svc.reviewPrescription(req.user, doc, req.body));
export const finalize = withDoc((req, _res, doc) => svc.finalize(req.user, doc));
export const finalReport = withDoc((_req, _res, doc) => {
  if (!doc.finalReport) throw new svc.AppError('This assessment has not been finalised yet.', 404);
  return doc.finalReport;
});

// ---- Nadika.AI (live session assistant + post-session scan) ---------------
export const suggestNext = wrap((req) => nadika.suggestNext(req.user, req.params.sessionId, req.body || {}));
export const getScan = wrap((req) => nadika.getScan(req.user, req.params.sessionId));
export const chakraScan = wrap((req) => nadika.chakraScan(req.user, req.params.sessionId, req.body || {}));
export const sendReport = wrap(async (req, res) => { res.status(201); return nadika.sendReport(req.user, req.body); });

export const appendChat = withDoc((req, _res, doc) => svc.appendChat(req.user, doc, req.body.entries || req.body.entry));
export const markAsked = withDoc((req, _res, doc) => svc.markAsked(req.user, doc, req.body.questionId));
export const recordOffline = withDoc((req, _res, doc) => svc.recordOffline(req.user, doc, req.body));
export const setMeetLink = wrap(async (req) => ({ appointment: await svc.setMeetLink(req.user, req.params.id, req.body.meetLink) }));
