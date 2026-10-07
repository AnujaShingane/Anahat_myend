import mongoose from 'mongoose';

const { Schema, Mixed } = mongoose;

// One doc per patient user. Holds the ANH-YYYY-NNNNNN identifier, extended
// (dashboard-editable) profile fields, chosen "journey", subscription status.
const patientMetaSchema = new Schema({
  userId: { type: String, required: true, unique: true, index: true },
  patientId: { type: String, required: true, unique: true },
  enrollmentDate: { type: Date, default: Date.now },
  subscriptionStatus: { type: String, default: 'Active' },
  plan: { type: String, enum: ['basic', 'premium'], default: 'basic' }, // Basic Plan by default at signup
  aiConsultationsUsed: { type: Number, default: 0 }, // counts toward the 5 free AI consultations on the Basic plan
  journey: { type: String, default: null },
  profile: { type: Mixed, default: {} },
  profileUpdatedAt: Date,
}, { timestamps: true });
export const PatientMeta = mongoose.model('PatientMeta', patientMetaSchema);

// Patient onboarding (demographics + identity verification). Auto-approved —
// there is intentionally no admin gate blocking dashboard access.
const onboardingSchema = new Schema({
  patientId: { type: String, required: true, unique: true, index: true },
  patientName: String,
  status: { type: String, enum: ['not_submitted', 'approved'], default: 'approved' },
  fields: { type: Mixed, default: {} },
  identityProofFileName: String,
  identityProofUrl: String,
  submittedAt: Date,
}, { timestamps: true });
export const PatientOnboarding = mongoose.model('PatientOnboarding', onboardingSchema);

const relaxationSessionSchema = new Schema({
  userId: { type: String, required: true, index: true },
  data: { type: Mixed, default: {} },
}, { timestamps: true });
export const RelaxationSession = mongoose.model('RelaxationSession', relaxationSessionSchema);

const documentSchema = new Schema({
  userId: { type: String, required: true, index: true },
  filename: String,
  mimeType: String,
  size: Number,
  fileId: String, // points at existing Mongo `File` collection
  meta: { type: Mixed, default: {} },
}, { timestamps: true });
export const PatientDocument = mongoose.model('PatientDocument', documentSchema);

const trackSelectionSchema = new Schema({
  userId: { type: String, required: true, unique: true, index: true },
  trackIds: [String],
  selectedAt: Date,
}, { timestamps: true });
export const TrackSelection = mongoose.model('TrackSelection', trackSelectionSchema);

const trackHistorySchema = new Schema({
  userId: { type: String, required: true, index: true },
  trackIds: [String],
  selectedAt: Date,
}, { timestamps: true });
export const TrackHistory = mongoose.model('TrackHistory', trackHistorySchema);

// Frontend-2's own appointment/booking model — deliberately separate from
// the existing Postgres Appointment/Payment tables (used by frontend-1's
// slot-locking + Razorpay-order booking flow), because frontend-2's booking
// UI collects a different shape (slot/scheduledAt/mode/sessionFee/platformFee)
// and has no payment gateway wired yet (see BookSession.jsx's NOTE comment).
// The existing Postgres booking flow is untouched and still works for
// frontend-1 or any client that calls it directly.
const appointmentSchema = new Schema({
  patientId: { type: String, required: true, index: true },
  patientName: String,
  therapistId: { type: String, required: true, index: true },
  therapistName: String,
  slot: Mixed,
  scheduledAt: Date,
  mode: String, // 'online' | 'offline'
  reason: String,
  summary: String, // session summary — used by admin/therapist-logged offline sessions
  notes: String,
  sessionFee: Number,
  platformFee: Number,
  paymentMethod: String,
  status: { type: String, default: 'confirmed' },
  loggedBy: String, // admin/therapist userId, set only for manually-logged offline sessions
}, { timestamps: true });
export const AppointmentDoc = mongoose.model('AppointmentDoc', appointmentSchema);

const appointmentRequestSchema = new Schema({
  data: { type: Mixed, default: {} },
  status: { type: String, default: 'pending' },
}, { timestamps: true });
export const AppointmentRequest = mongoose.model('AppointmentRequest', appointmentRequestSchema);

const weeklyFeedbackSchema = new Schema({
  patientId: { type: String, required: true, index: true },
  entry: { type: Mixed, default: {} },
}, { timestamps: true });
export const WeeklyFeedback = mongoose.model('WeeklyFeedback', weeklyFeedbackSchema);

// "I feel ___" self-report feedback — used for Before-Session, After-Session
// (any appointment type, including Relaxation) and stored the same shape as
// weekly feedback: { statement, value(1-4) } pairs under `entry.answers`.
const sessionFeedbackSchema = new Schema({
  patientId: { type: String, required: true, index: true },
  appointmentId: { type: String, default: null, index: true },
  stage: { type: String, enum: ['before', 'after'], required: true },
  entry: { type: Mixed, default: {} }, // { answers: [{ statement, value }], sessionType }
}, { timestamps: true });
export const SessionFeedback = mongoose.model('SessionFeedback', sessionFeedbackSchema);

// Relaxation is a paid feature (see General Updates: "Relaxation should be
// paid."). One payment unlocks Relaxation for the rest of that calendar day
// — simplest model that doesn't require an Appointment/therapist the way
// the Postgres Payment table does. Swap `provider`/`providerRef` for a real
// gateway (Razorpay/Stripe) the same way paymentService.js is designed to.
const relaxationPaymentSchema = new Schema({
  patientId: { type: String, required: true, index: true },
  amount: { type: Number, required: true },
  currency: { type: String, default: 'INR' },
  provider: { type: String, default: 'mock' },
  providerRef: { type: String, default: null },
  status: { type: String, enum: ['created', 'paid', 'failed'], default: 'created' },
}, { timestamps: true });
export const RelaxationPayment = mongoose.model('RelaxationPayment', relaxationPaymentSchema);

const therapyRecordSchema = new Schema({
  patientId: { type: String, required: true, unique: true, index: true },
  record: { type: Mixed, default: {} },
  approved: { type: Boolean, default: false },
  approvedBy: String,
  updatedAt: Date,
}, { timestamps: true });
export const TherapyRecord = mongoose.model('TherapyRecord', therapyRecordSchema);

const reportHistorySchema = new Schema({
  patientId: { type: String, required: true, index: true },
  report: { type: Mixed, default: {} },
}, { timestamps: true });
export const ReportHistory = mongoose.model('ReportHistory', reportHistorySchema);

const listeningLogSchema = new Schema({
  userId: { type: String, required: true, index: true },
  trackName: String,
  durationSeconds: Number,
  qualified: Boolean,
}, { timestamps: true });
export const ListeningLog = mongoose.model('ListeningLog', listeningLogSchema);

const siteFeedbackSchema = new Schema({
  entry: { type: Mixed, default: {} },
  status: { type: String, default: 'open' },
  response: String,
}, { timestamps: true });
export const SiteFeedback = mongoose.model('SiteFeedback', siteFeedbackSchema);

const auditLogSchema = new Schema({
  action: String,
  actor: Mixed,
  detail: Mixed,
}, { timestamps: true });
export const AuditLog = mongoose.model('AuditLog', auditLogSchema);

const adminNotificationSchema = new Schema({
  message: String,
  detail: Mixed,
  read: { type: Boolean, default: false },
}, { timestamps: true });
export const AdminNotification = mongoose.model('AdminNotification', adminNotificationSchema);

// Lightweight directory row kept in sync from the real Postgres User table on
// login (see AuthContext.login -> upsertUser) so admin consoles have one
// place to read from; not a source of truth for auth.
const userDirectorySchema = new Schema({
  id: { type: String, required: true, unique: true, index: true },
  name: String,
  email: String,
  role: String,
  patientId: String,
  picture: String,
  status: { type: String, default: 'active' },
}, { timestamps: true });
export const UserDirectory = mongoose.model('UserDirectory', userDirectorySchema);

const therapistSurveySchema = new Schema({
  userId: { type: String, required: true, unique: true, index: true },
  survey: { type: Mixed, default: {} },
  approvalStatus: { type: String, default: 'pending' }, // pending | approved | rejected
}, { timestamps: true });
export const TherapistSurvey = mongoose.model('TherapistSurvey', therapistSurveySchema);

const assignmentSchema = new Schema({
  patientId: { type: String, required: true, unique: true, index: true },
  therapistId: { type: String, required: true },
}, { timestamps: true });
export const TherapistAssignment = mongoose.model('TherapistAssignment', assignmentSchema);

const activityPlanSchema = new Schema({
  patientId: { type: String, required: true, unique: true, index: true },
  activities: { type: [Mixed], default: [] },
}, { timestamps: true });
export const ActivityPlan = mongoose.model('ActivityPlan', activityPlanSchema);

const activityLogSchema = new Schema({
  patientId: { type: String, required: true, index: true },
  day: { type: String, required: true }, // YYYY-MM-DD, one entry per day
  responses: { type: Mixed, default: {} },
}, { timestamps: true });
activityLogSchema.index({ patientId: 1, day: 1 }, { unique: true });
export const ActivityLog = mongoose.model('ActivityLog', activityLogSchema);

const liveSessionSchema = new Schema({
  therapistId: String,
  therapistName: String,
  patientId: { type: String, index: true },
  patientName: String,
  appointmentId: String,
  messages: { type: [Mixed], default: [] },
  aiMessages: { type: [Mixed], default: [] },
  active: { type: Boolean, default: true },
  startedAt: { type: Date, default: Date.now },
  endedAt: Date,
}, { timestamps: true });
export const LiveSession = mongoose.model('LiveSession', liveSessionSchema);

const patientNotificationSchema = new Schema({
  patientId: { type: String, required: true, index: true },
  message: String,
  detail: Mixed,
  read: { type: Boolean, default: false },
}, { timestamps: true });
export const PatientNotification = mongoose.model('PatientNotification', patientNotificationSchema);

const conversationSchema = new Schema({
  patientId: { type: String, required: true, index: true },
  patientName: String,
  therapistId: { type: String, required: true, index: true },
  therapistName: String,
  messages: { type: [Mixed], default: [] },
}, { timestamps: true });
export const Conversation = mongoose.model('Conversation', conversationSchema);

const moodEntrySchema = new Schema({
  patientId: { type: String, required: true, index: true },
  mood: String,
  note: String,
}, { timestamps: true });
export const MoodEntry = mongoose.model('MoodEntry', moodEntrySchema);
