import mongoose from 'mongoose';

const { Schema } = mongoose;
const Mixed = Schema.Types.Mixed;

// Application-level assessment record. The AI engine owns the reasoning and
// keeps its session in memory; this document is the durable, application-
// owned identity that ties patient, therapist, engine session and every
// therapist decision together, and it is what survives a refresh, a backend
// restart or an engine restart.
const anahatAssessmentSchema = new Schema({
  patientId: { type: String, required: true, index: true },
  therapistId: { type: String, required: true, index: true },
  appointmentId: { type: String, default: null },
  engineSessionId: { type: String, required: true, index: true },
  engineAlive: { type: Boolean, default: true },            // false once the engine reports "session not found"
  stage: { type: String, default: 'baseline' },              // mirrors engine AssessmentStage
  status: { type: String, default: 'in_progress', index: true }, // in_progress | escalated | completed | abandoned | engine_session_lost
  baseline: { type: Mixed, default: null },
  therapistContext: { type: String, default: '' },
  openingSetId: { type: String, default: null },
  openingQuestions: { type: [Mixed], default: [] },
  currentIssue: { type: String, default: '' },
  scope: { type: [String], default: [] },                    // therapist-selected quadrant(s) — assessment SCOPE, never a diagnosis
  quadrantQuestions: { type: Mixed, default: {} },           // quadrant -> canonical questions returned by the engine
  transcript: { type: [Mixed], default: [] },                // raw responses, preserved exactly
  chatLog: { type: [Mixed], default: [] },                   // Nadika.ai chat as shown to the therapist (for resume)
  askedQuestionIds: { type: [String], default: [] },         // questions already covered (shown in green)
  liveSessionId: { type: String, default: null },
  candidatesByResponse: { type: Mixed, default: {} },        // responseId -> last engine candidate payload (for refresh/resume)
  evidence: { type: [Mixed], default: [] },
  safetyEvents: { type: [Mixed], default: [] },
  chakraReport: { type: Mixed, default: null },
  finalChakraResult: { type: Mixed, default: null },
  assessmentContextSummary: { type: Mixed, default: null },
  decisions: { type: [Mixed], default: [] },
  recommendations: { type: Mixed, default: null },
  prescriptionDraft: { type: Mixed, default: null },
  prescriptionDecision: { type: Mixed, default: null },
  // Links into EXISTING collections (set exactly once by finalize):
  prescriptionId: { type: String, default: null },           // models/mongo/Prescription
  reportHistoryId: { type: String, default: null },          // ReportHistory in patientData
  finalReport: { type: Mixed, default: null },
  finalizedAt: { type: Date, default: null },
}, { timestamps: true });

anahatAssessmentSchema.index({ patientId: 1, therapistId: 1, status: 1 });

export const AnahatAssessment = mongoose.model('AnahatAssessment', anahatAssessmentSchema);

// Patient-entered baseline (step 2), collected on the patient dashboard so it
// is ready when the therapist starts the session. Consumed once.
const anahatBaselineSchema = new Schema({
  patientId: { type: String, required: true, index: true },
  stress: { type: Number, min: 1, max: 10, required: true },
  anxiety: { type: Number, min: 1, max: 10, required: true },
  mood: { type: Number, min: 1, max: 10, required: true },
  sleep_quality: { type: String, enum: ['Poor', 'Fair', 'Good', 'Excellent'], required: true },
  energy: { type: Number, min: 1, max: 10, required: true },
  note: { type: String, default: '' },
  usedInAssessmentId: { type: String, default: null },
}, { timestamps: true });

export const AnahatBaseline = mongoose.model('AnahatBaseline', anahatBaselineSchema);
