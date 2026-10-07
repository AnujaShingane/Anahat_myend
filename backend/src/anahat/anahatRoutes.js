import { Router } from 'express';
import { requireAuth, requireRole, requireApproved } from '../middleware/auth.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import * as c from './anahatController.js';

// /api/anahat/* — the only gateway to the ANAHAT AI Engine.
// Same auth model as the rest of the app: session cookie + app-origin gate
// (applied globally in app.js) + role checks; therapists must be approved.
// GET routes are pure reads. Every engine-mutating step is a POST.
const router = Router();
router.use(requireAuth);
const therapist = [requireRole('therapist', 'admin'), requireApproved];

router.get('/health', asyncHandler(c.health));
router.get('/reference', asyncHandler(c.reference));

// Step 2 — patient baseline
router.get('/patients/:patientId/baseline', asyncHandler(c.listBaselines));
router.post('/patients/:patientId/baseline', asyncHandler(c.recordBaseline));
router.get('/patients/:patientId/assessments', asyncHandler(c.listForPatient));

// Assessment lifecycle
router.get('/assessments', asyncHandler(c.listMine));
router.post('/assessments', ...therapist, asyncHandler(c.create));
router.get('/assessments/:id', asyncHandler(c.getOne));
router.post('/assessments/:id/baseline', ...therapist, asyncHandler(c.setBaseline));
router.post('/assessments/:id/context', ...therapist, asyncHandler(c.setContext));
router.post('/assessments/:id/opening', ...therapist, asyncHandler(c.selectOpening));
router.post('/assessments/:id/quadrants/analyse', ...therapist, asyncHandler(c.analyseQuadrants));
router.post('/assessments/:id/quadrants', ...therapist, asyncHandler(c.selectQuadrants));
router.post('/assessments/:id/responses', ...therapist, asyncHandler(c.submitResponse));
router.post('/assessments/:id/safety/acknowledge', ...therapist, asyncHandler(c.acknowledgeSafety));
router.post('/assessments/:id/candidates/:candidateId/confirm', ...therapist, asyncHandler(c.confirmCandidate));
router.post('/assessments/:id/evidence/:evidenceId/resolve', ...therapist, asyncHandler(c.resolveEvidence));
router.get('/assessments/:id/questions/next', ...therapist, asyncHandler(c.nextQuestions));
router.post('/assessments/:id/quadrants/complete', ...therapist, asyncHandler(c.completeQuadrant));
router.get('/assessments/:id/deep-dive', ...therapist, asyncHandler(c.deepDive));
router.post('/assessments/:id/deep-dive/answer', ...therapist, asyncHandler(c.answerDeepDive));
router.post('/assessments/:id/contradictions/resolve', ...therapist, asyncHandler(c.resolveContradiction));
router.get('/assessments/:id/result', ...therapist, asyncHandler(c.result));
router.post('/assessments/:id/score', ...therapist, asyncHandler(c.score));
router.post('/assessments/:id/decision', ...therapist, asyncHandler(c.decide));
router.post('/assessments/:id/recommendations', ...therapist, asyncHandler(c.recommendations));
router.post('/assessments/:id/end', ...therapist, asyncHandler(c.endSession));
router.post('/assessments/:id/prescription/draft', ...therapist, asyncHandler(c.draftPrescription));
router.post('/assessments/:id/prescription/review', ...therapist, asyncHandler(c.reviewPrescription));
router.post('/assessments/:id/finalize', ...therapist, asyncHandler(c.finalize));
router.get('/assessments/:id/report', asyncHandler(c.finalReport));
// Offline (in-person) session support — Nadika.ai chat persistence
router.post('/assessments/:id/chat', ...therapist, asyncHandler(c.appendChat));
router.post('/assessments/:id/asked', ...therapist, asyncHandler(c.markAsked));
router.post('/assessments/:id/responses/offline', ...therapist, asyncHandler(c.recordOffline));
// Online appointments — meeting link entered by the therapist
router.patch('/appointments/:id/meet-link', ...therapist, asyncHandler(c.setMeetLink));

// Nadika.AI — in-session question suggestions (KB-driven) and the
// therapist-only post-session chakra scan; report sending reuses ReportHistory.
router.post('/sessions/:sessionId/suggest', ...therapist, asyncHandler(c.suggestNext));
router.get('/sessions/:sessionId/chakra-scan', ...therapist, asyncHandler(c.getScan));
router.post('/sessions/:sessionId/chakra-scan', ...therapist, asyncHandler(c.chakraScan));
router.post('/reports/send', ...therapist, asyncHandler(c.sendReport));

export default router;
