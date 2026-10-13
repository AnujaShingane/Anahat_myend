import mongoose from 'mongoose';
import {
  PatientMeta, PatientOnboarding, RelaxationSession, PatientDocument,
  TrackSelection, TrackHistory, AppointmentDoc, AppointmentRequest, WeeklyFeedback, SessionFeedback,
  TherapyRecord, ReportHistory, ListeningLog, SiteFeedback, AuditLog,
  AdminNotification, UserDirectory, TherapistSurvey, TherapistAssignment,
  ActivityPlan, ActivityLog, LiveSession, PatientNotification, Conversation,
  MoodEntry, RelaxationPayment,
} from '../models/mongo/patientData.js';
import { User, TherapistProfile, AvailabilitySlot, BlockedDate, Appointment } from '../models/postgres/index.js';
import { createOrder as createPaymentOrder, verifyPayment as verifyPaymentRef } from '../services/paymentService.js';
import { env } from '../config/env.js';
import { comparePassword, hashPassword } from '../utils/password.js';
import { saveFile } from '../services/fileService.js';

const genPatientId = () => `ANH-${new Date().getFullYear()}-${String(Math.floor(100000 + Math.random() * 900000))}`;
const today = () => new Date().toISOString().slice(0, 10);
const notifyPatient = (patientId, message, detail = {}) => PatientNotification.create({ patientId, message, detail });
const notifyAdmins = (message, detail = {}) => AdminNotification.create({ message, detail });
const audit = (action, actor, detail = {}) => AuditLog.create({ action, actor, detail });

// ---------------------------------------------------------------------------
// Patient identity / profile
// ---------------------------------------------------------------------------

export async function getOrCreatePatientId(req, res) {
  let meta = await PatientMeta.findOne({ userId: req.params.userId });
  if (!meta) meta = await PatientMeta.create({ userId: req.params.userId, patientId: genPatientId() });
  res.json({ patientId: meta.patientId, enrollmentDate: meta.enrollmentDate });
}

export async function getPatientId(req, res) {
  const meta = await PatientMeta.findOne({ userId: req.params.userId });
  res.json(meta ? { patientId: meta.patientId, enrollmentDate: meta.enrollmentDate } : null);
}

export async function getSubscription(req, res) {
  const meta = await PatientMeta.findOne({ userId: req.params.userId });
  const plan = meta?.plan || 'basic';
  const used = meta?.aiConsultationsUsed || 0;
  res.json({
    status: meta?.subscriptionStatus || 'Active',
    plan,
    aiConsultationsUsed: used,
    aiFreeLimit: env.freeAiConsultations,
    aiRemaining: plan === 'premium' ? null : Math.max(0, env.freeAiConsultations - used),
    premiumFee: env.premiumFee,
  });
}

export async function setSubscription(req, res) {
  const meta = await PatientMeta.findOneAndUpdate(
    { userId: req.params.userId },
    { $set: { subscriptionStatus: req.body.status } },
    { upsert: true, new: true },
  );
  res.json({ status: meta.subscriptionStatus });
}

// ---------------------------------------------------------------------------
// Premium upgrade — mock payment, same pattern as Relaxation/appointment
// payments (see services/paymentService.js). Premium unlocks unlimited AI
// consultations and unlimited Relaxation sessions.
// ---------------------------------------------------------------------------

export async function createPremiumOrder(req, res) {
  const order = await createPaymentOrder(env.premiumFee);
  res.status(201).json({ orderId: order.orderId, amount: env.premiumFee, currency: 'INR' });
}

export async function confirmPremiumUpgrade(req, res) {
  const ok = await verifyPaymentRef(req.body.orderId, req.body.paymentRef);
  if (!ok) return res.status(400).json({ message: 'Payment verification failed' });
  const meta = await PatientMeta.findOneAndUpdate(
    { userId: req.params.userId },
    { $set: { plan: 'premium' } },
    { upsert: true, new: true },
  );
  res.json({ plan: meta.plan });
}

export async function getProfile(req, res) {
  const meta = await PatientMeta.findOne({ userId: req.params.userId });
  res.json(meta?.profile && Object.keys(meta.profile).length ? meta.profile : null);
}

export async function saveProfile(req, res) {
  const meta = await PatientMeta.findOne({ userId: req.params.userId });
  const merged = { ...(meta?.profile || {}), ...req.body, updatedAt: new Date().toISOString() };
  await PatientMeta.findOneAndUpdate(
    { userId: req.params.userId },
    { $set: { profile: merged, profileUpdatedAt: new Date() } },
    { upsert: true },
  );
  res.json(merged);
}

export async function getJourney(req, res) {
  const meta = await PatientMeta.findOne({ userId: req.params.userId });
  res.json({ journey: meta?.journey ?? null });
}

export async function setJourney(req, res) {
  const meta = await PatientMeta.findOneAndUpdate(
    { userId: req.params.userId },
    { $set: { journey: req.body.journey } },
    { upsert: true, new: true },
  );
  res.json({ journey: meta.journey });
}

// ---------------------------------------------------------------------------
// Relaxation sessions / documents
// ---------------------------------------------------------------------------

export async function saveRelaxationSession(req, res) {
  await RelaxationSession.create({ userId: req.params.userId, data: req.body });
  const all = await RelaxationSession.find({ userId: req.params.userId }).sort({ createdAt: 1 });
  res.json(all.map((r) => ({ id: r._id, ...r.data, createdAt: r.createdAt })));
}

export async function getDocuments(req, res) {
  const docs = await PatientDocument.find({ userId: req.params.userId }).sort({ createdAt: -1 });
  res.json(docs.map((d) => ({ id: d._id, filename: d.filename, mimeType: d.mimeType, size: d.size, fileId: d.fileId, url: d.fileId ? `/api/profile/files/${d.fileId}` : null, ...d.meta, createdAt: d.createdAt })));
}

export async function addDocument(req, res) {
  let fileId;
  if (req.file) fileId = await saveFile(req.params.userId, 'other', req.file);
  const meta = { ...req.body };
  await PatientDocument.create({
    userId: req.params.userId,
    filename: req.file?.originalname || req.body.filename,
    mimeType: req.file?.mimetype,
    size: req.file?.size,
    fileId,
    meta,
  });
  const docs = await PatientDocument.find({ userId: req.params.userId }).sort({ createdAt: -1 });
  res.json(docs.map((d) => ({ id: d._id, filename: d.filename, mimeType: d.mimeType, size: d.size, fileId: d.fileId, url: d.fileId ? `/api/profile/files/${d.fileId}` : null, ...d.meta, createdAt: d.createdAt })));
}

// ---------------------------------------------------------------------------
// Music — track selection & history (catalog itself is served by /api/tracks)
// ---------------------------------------------------------------------------

export async function getTrackSelection(req, res) {
  const sel = await TrackSelection.findOne({ userId: req.params.userId });
  res.json(sel ? { trackIds: sel.trackIds, selectedAt: sel.selectedAt } : null);
}

export async function selectTracks(req, res) {
  const existing = await TrackSelection.findOne({ userId: req.params.userId });
  if (existing) await TrackHistory.create({ userId: req.params.userId, trackIds: existing.trackIds, selectedAt: existing.selectedAt });
  const selectedAt = new Date();
  const sel = await TrackSelection.findOneAndUpdate(
    { userId: req.params.userId },
    { $set: { trackIds: req.body.trackIds, selectedAt } },
    { upsert: true, new: true },
  );
  res.json({ trackIds: sel.trackIds, selectedAt: sel.selectedAt });
}

export async function getTrackHistory(req, res) {
  const hist = await TrackHistory.find({ userId: req.params.userId }).sort({ selectedAt: -1 });
  res.json(hist.map((h) => ({ trackIds: h.trackIds, selectedAt: h.selectedAt })));
}

// ---------------------------------------------------------------------------
// Therapists — availability / blocked dates by id (id-addressed variants;
// GET /therapists and the therapist's own /me/* management already exist)
// ---------------------------------------------------------------------------

export async function setTherapistAvailabilityById(req, res) {
  const slots = req.body.availability || [];
  await AvailabilitySlot.destroy({ where: { therapistId: req.params.id } });
  await AvailabilitySlot.bulkCreate(slots.map((s) => ({ ...s, therapistId: req.params.id })));
  const t = await User.findByPk(req.params.id, { include: [{ model: TherapistProfile, as: 'therapistProfile' }, { model: AvailabilitySlot, as: 'slots' }] });
  res.json(t);
}

export async function getBlockedDatesById(req, res) {
  const rows = await BlockedDate.findAll({ where: { therapistId: req.params.id } });
  res.json(rows.map((r) => r.date));
}

export async function setBlockedDatesById(req, res) {
  const dates = req.body.dates || [];
  await BlockedDate.destroy({ where: { therapistId: req.params.id } });
  await BlockedDate.bulkCreate(dates.map((date) => ({ therapistId: req.params.id, date })));
  res.json(dates);
}

// ---------------------------------------------------------------------------
// Appointment requests
// ---------------------------------------------------------------------------

export async function listAppointmentRequests(_req, res) {
  const rows = await AppointmentRequest.find().sort({ createdAt: -1 });
  res.json(rows.map((r) => ({ id: r._id, ...r.data, status: r.status, createdAt: r.createdAt })));
}

export async function createAppointmentRequest(req, res) {
  const row = await AppointmentRequest.create({ data: req.body, status: 'pending' });
  await notifyAdmins('New appointment request', { requestId: row._id });
  res.status(201).json({ id: row._id, ...row.data, status: row.status, createdAt: row.createdAt });
}

export async function patchAppointmentRequest(req, res) {
  const row = await AppointmentRequest.findByIdAndUpdate(
    req.params.id,
    { $set: { ...(req.body.status && { status: req.body.status }), data: { ...req.body } } },
    { new: true },
  );
  if (!row) return res.status(404).json({ message: 'Not found' });
  res.json({ id: row._id, ...row.data, status: row.status, createdAt: row.createdAt });
}

// ---------------------------------------------------------------------------
// Appointments (frontend-2's own model — see AppointmentDoc for why this is
// separate from the existing Postgres slot-booking + payment flow)
// ---------------------------------------------------------------------------

export async function getAppointments(req, res) {
  const where = req.user.role === 'patient' ? { patientId: req.user.id }
    : req.user.role === 'therapist' ? { therapistId: req.user.id } : {};
  const rows = await AppointmentDoc.find(where).sort({ createdAt: -1 });
  res.json(rows.map((r) => ({ id: r._id, ...r.toObject(), _id: undefined })));
}

export async function bookAppointment(req, res) {
  const appt = await AppointmentDoc.create(req.body);
  await audit('appointment.booked', req.user?.id, { appointmentId: appt._id });
  await notifyAdmins('New session booked', { appointmentId: appt._id });
  await notifyPatient(appt.patientId, 'Your session has been booked', { appointmentId: appt._id });
  res.status(201).json({ id: appt._id, ...appt.toObject(), _id: undefined });
}

// Admin/therapist manually logging a session that happened outside the app
// (in-person / phone / etc). Reuses the same AppointmentDoc booking model —
// it just sets mode: 'offline' and is created by staff instead of the
// patient self-booking — so it shows up in the patient's session history,
// reports, and the admin dashboard exactly like any other session.
export async function createOfflineSession(req, res) {
  const { patientId, patientName, therapistId, therapistName, date, time, summary, notes, sessionType, status } = req.body;
  if (!patientId || !therapistId || !date) {
    return res.status(400).json({ message: 'patientId, therapistId, and date are required.' });
  }
  const scheduledAt = time ? new Date(`${date}T${time}`) : new Date(date);
  const appt = await AppointmentDoc.create({
    patientId, patientName, therapistId, therapistName,
    scheduledAt, mode: 'offline', reason: sessionType || 'Offline Session',
    summary, notes, status: status || 'completed', loggedBy: req.user.id,
  });
  await audit('session.logged_offline', req.user.id, { appointmentId: appt._id, patientId, therapistId });
  await notifyPatient(patientId, 'A session was added to your history', { appointmentId: appt._id });
  res.status(201).json({ id: appt._id, ...appt.toObject(), _id: undefined });
}

export async function patchAppointment(req, res) {
  const appt = await AppointmentDoc.findByIdAndUpdate(req.params.id, { $set: req.body }, { new: true });
  if (!appt) return res.status(404).json({ message: 'Appointment not found' });
  if (req.body.status) await notifyPatient(appt.patientId, `Your appointment status changed to ${req.body.status}`, { appointmentId: appt._id });
  res.json({ id: appt._id, ...appt.toObject(), _id: undefined });
}

export async function getOrStartAppointmentSession(req, res) {
  const id = req.params.appointmentId;
  // Real bookings live in Postgres (UUID ids); legacy demo bookings in Mongo.
  let appt = mongoose.isValidObjectId(id) ? await AppointmentDoc.findById(id) : null;
  if (!appt) {
    const pg = await Appointment.findByPk(id);
    if (pg) appt = { _id: pg.id, patientId: pg.patientId, therapistId: pg.therapistId };
  }
  if (!appt) return res.status(404).json({ message: 'Appointment not found' });
  if (![appt.patientId, appt.therapistId].includes(req.user.id) && req.user.role !== 'admin') {
    return res.status(403).json({ message: 'Not your appointment.' });
  }
  let session = await LiveSession.findOne({ appointmentId: String(appt._id), active: true });
  if (!session) {
    session = await LiveSession.create({
      appointmentId: String(appt._id), patientId: appt.patientId, therapistId: appt.therapistId,
      patientName: req.body.patientName,
    });
  }
  res.json(session);
}

// ---------------------------------------------------------------------------
// Weekly feedback
// ---------------------------------------------------------------------------

export async function getWeeklyFeedback(req, res) {
  const rows = await WeeklyFeedback.find({ patientId: req.params.patientId }).sort({ createdAt: 1 });
  res.json(rows.map((r) => ({ id: r._id, ...r.entry, createdAt: r.createdAt })));
}

export async function submitWeeklyFeedback(req, res) {
  await WeeklyFeedback.create({ patientId: req.params.patientId, entry: req.body });
  const rows = await WeeklyFeedback.find({ patientId: req.params.patientId }).sort({ createdAt: 1 });
  res.json(rows.map((r) => ({ id: r._id, ...r.entry, createdAt: r.createdAt })));
}

// ---------------------------------------------------------------------------
// Before/After-session "I feel ___" feedback (also used for Relaxation)
// ---------------------------------------------------------------------------

export async function getSessionFeedback(req, res) {
  const filter = { patientId: req.params.patientId };
  if (req.query.appointmentId) filter.appointmentId = req.query.appointmentId;
  if (req.query.stage) filter.stage = req.query.stage;
  const rows = await SessionFeedback.find(filter).sort({ createdAt: 1 });
  res.json(rows.map((r) => ({ id: r._id, stage: r.stage, appointmentId: r.appointmentId, ...r.entry, createdAt: r.createdAt })));
}

export async function submitSessionFeedback(req, res) {
  const { stage, appointmentId, ...entry } = req.body;
  if (!['before', 'after'].includes(stage)) {
    return res.status(400).json({ message: 'stage must be "before" or "after".' });
  }
  const row = await SessionFeedback.create({ patientId: req.params.patientId, appointmentId: appointmentId || null, stage, entry });
  res.status(201).json({ id: row._id, stage: row.stage, appointmentId: row.appointmentId, ...row.entry, createdAt: row.createdAt });
}

// ---------------------------------------------------------------------------
// Relaxation payment — one payment unlocks Relaxation for the rest of the
// calendar day (see models/mongo/patientData.js for why this isn't in the
// Postgres Payment table).
// ---------------------------------------------------------------------------

function startOfToday() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

export async function getRelaxationPaymentStatus(req, res) {
  const meta = await PatientMeta.findOne({ userId: req.params.patientId });
  if (meta?.plan === 'premium') {
    return res.json({ paid: true, fee: 0, currency: 'INR', reason: 'premium' });
  }
  const paidToday = await RelaxationPayment.findOne({
    patientId: req.params.patientId, status: 'paid', createdAt: { $gte: startOfToday() },
  }).sort({ createdAt: -1 });
  res.json({ paid: !!paidToday, fee: env.relaxationFee, currency: 'INR' });
}

export async function createRelaxationOrder(req, res) {
  const order = await createPaymentOrder(env.relaxationFee);
  const payment = await RelaxationPayment.create({
    patientId: req.params.patientId, amount: env.relaxationFee, providerRef: order.orderId,
  });
  res.status(201).json({ paymentId: payment._id, orderId: order.orderId, amount: env.relaxationFee, currency: 'INR' });
}

export async function payRelaxationOrder(req, res) {
  const payment = await RelaxationPayment.findOne({ _id: req.params.paymentId, patientId: req.params.patientId });
  if (!payment) return res.status(404).json({ message: 'Payment not found' });
  const ok = await verifyPaymentRef(payment.providerRef, req.body.paymentRef);
  if (!ok) return res.status(400).json({ message: 'Payment verification failed' });
  payment.status = 'paid';
  await payment.save();
  res.json({ message: 'Payment successful', paid: true });
}

// ---------------------------------------------------------------------------
// Clinical records & report history
// ---------------------------------------------------------------------------

export async function getTherapyRecord(req, res) {
  const rec = await TherapyRecord.findOne({ patientId: req.params.patientId });
  res.json(rec ? { ...rec.record, approved: rec.approved, approvedBy: rec.approvedBy, updatedAt: rec.updatedAt } : null);
}

export async function saveTherapyRecord(req, res) {
  const existing = await TherapyRecord.findOne({ patientId: req.params.patientId });
  const merged = { ...(existing?.record || {}), ...req.body };
  const rec = await TherapyRecord.findOneAndUpdate(
    { patientId: req.params.patientId },
    { $set: { record: merged, updatedAt: new Date() } },
    { upsert: true, new: true },
  );
  res.json({ ...rec.record, approved: rec.approved, approvedBy: rec.approvedBy, updatedAt: rec.updatedAt });
}

export async function approveTherapyRecord(req, res) {
  const rec = await TherapyRecord.findOneAndUpdate(
    { patientId: req.params.patientId },
    { $set: { approved: true, approvedBy: req.body.approvedBy, updatedAt: new Date() } },
    { new: true },
  );
  if (!rec) return res.status(404).json({ message: 'No therapy record on file' });
  await ReportHistory.create({ patientId: req.params.patientId, report: { ...rec.record, approvedBy: req.body.approvedBy, approvedAt: new Date() } });
  await notifyPatient(req.params.patientId, 'Your therapist has shared a new report. Take a quiet moment to read it — you have earned it.', { kind: 'report' });
  res.json({ ...rec.record, approved: rec.approved, approvedBy: rec.approvedBy, updatedAt: rec.updatedAt });
}

export async function getReportHistory(req, res) {
  const rows = await ReportHistory.find({ patientId: req.params.patientId }).sort({ createdAt: -1 });
  res.json(rows.map((r) => ({ id: r._id, ...r.report, createdAt: r.createdAt })));
}

export async function addReportToHistory(req, res) {
  await ReportHistory.create({ patientId: req.params.patientId, report: req.body });
  const rows = await ReportHistory.find({ patientId: req.params.patientId }).sort({ createdAt: -1 });
  res.json(rows.map((r) => ({ id: r._id, ...r.report, createdAt: r.createdAt })));
}

export async function updateReportInHistory(req, res) {
  const row = await ReportHistory.findByIdAndUpdate(
    req.params.reportId,
    { $set: { report: { ...req.body }, updatedAt: new Date() } },
    { new: true },
  );
  if (!row) return res.status(404).json({ message: 'Report not found' });
  const rows = await ReportHistory.find({ patientId: req.params.patientId }).sort({ createdAt: -1 });
  res.json(rows.map((r) => ({ id: r._id, ...r.report, createdAt: r.createdAt })));
}

// ---------------------------------------------------------------------------
// Listening log
// ---------------------------------------------------------------------------

export async function getListeningLog(req, res) {
  const rows = await ListeningLog.find({ userId: req.params.userId }).sort({ createdAt: -1 });
  res.json(rows.map((r) => ({ id: r._id, trackName: r.trackName, durationSeconds: r.durationSeconds, qualified: r.qualified, createdAt: r.createdAt })));
}

export async function logListeningSession(req, res) {
  await ListeningLog.create({ userId: req.params.userId, ...req.body });
  const rows = await ListeningLog.find({ userId: req.params.userId }).sort({ createdAt: -1 });
  res.json(rows.map((r) => ({ id: r._id, trackName: r.trackName, durationSeconds: r.durationSeconds, qualified: r.qualified, createdAt: r.createdAt })));
}

// ---------------------------------------------------------------------------
// Site feedback
// ---------------------------------------------------------------------------

export async function getFeedbackList(_req, res) {
  const rows = await SiteFeedback.find().sort({ createdAt: -1 });
  res.json(rows.map((r) => ({ id: r._id, ...r.entry, status: r.status, response: r.response, createdAt: r.createdAt })));
}

export async function submitFeedback(req, res) {
  await SiteFeedback.create({ entry: req.body });
  const rows = await SiteFeedback.find().sort({ createdAt: -1 });
  res.json(rows.map((r) => ({ id: r._id, ...r.entry, status: r.status, response: r.response, createdAt: r.createdAt })));
}

export async function respondToFeedback(req, res) {
  await SiteFeedback.findByIdAndUpdate(req.params.id, { $set: { response: req.body.response, status: 'resolved' } });
  const rows = await SiteFeedback.find().sort({ createdAt: -1 });
  res.json(rows.map((r) => ({ id: r._id, ...r.entry, status: r.status, response: r.response, createdAt: r.createdAt })));
}

// ---------------------------------------------------------------------------
// Audit log & admin notifications
// ---------------------------------------------------------------------------

export async function getAuditLog(_req, res) {
  const rows = await AuditLog.find().sort({ createdAt: -1 }).limit(300);
  res.json(rows.map((r) => ({ id: r._id, action: r.action, actor: r.actor, detail: r.detail, createdAt: r.createdAt })));
}

export async function addAudit(req, res) {
  await audit(req.body.action, req.body.actor, req.body.detail);
  const rows = await AuditLog.find().sort({ createdAt: -1 }).limit(300);
  res.json(rows.map((r) => ({ id: r._id, action: r.action, actor: r.actor, detail: r.detail, createdAt: r.createdAt })));
}

export async function getAdminNotifications(_req, res) {
  const rows = await AdminNotification.find().sort({ createdAt: -1 }).limit(100);
  res.json(rows.map((r) => ({ id: r._id, message: r.message, detail: r.detail, read: r.read, createdAt: r.createdAt })));
}

export async function markNotificationRead(req, res) {
  await AdminNotification.findByIdAndUpdate(req.params.id, { $set: { read: true } });
  const rows = await AdminNotification.find().sort({ createdAt: -1 }).limit(100);
  res.json(rows.map((r) => ({ id: r._id, message: r.message, detail: r.detail, read: r.read, createdAt: r.createdAt })));
}

// ---------------------------------------------------------------------------
// User directory
// ---------------------------------------------------------------------------

export async function getUserDirectory(_req, res) {
  const rows = await UserDirectory.find().sort({ createdAt: -1 });
  res.json(rows);
}

export async function upsertUserDirectory(req, res) {
  await UserDirectory.findOneAndUpdate({ id: req.body.id }, { $set: req.body }, { upsert: true });
  const rows = await UserDirectory.find().sort({ createdAt: -1 });
  res.json(rows);
}

export async function setUserStatus(req, res) {
  await UserDirectory.findOneAndUpdate({ id: req.params.id }, { $set: { status: req.body.status } });
  await audit('user.status', req.user?.id, { userId: req.params.id, status: req.body.status });
  const rows = await UserDirectory.find().sort({ createdAt: -1 });
  res.json(rows);
}

export async function deleteUserDirectory(req, res) {
  await UserDirectory.deleteOne({ id: req.params.id });
  await audit('user.delete', req.user?.id, { userId: req.params.id });
  const rows = await UserDirectory.find().sort({ createdAt: -1 });
  res.json(rows);
}

// ---------------------------------------------------------------------------
// Therapist onboarding survey & approval status
// (independent of the existing /profile/therapist Postgres form — this is
// the richer questionnaire frontend-2 collects; approval still gates access,
// same as the existing isApproved flag, since only the *patient* flow should
// skip approval.)
// ---------------------------------------------------------------------------

export async function submitTherapistSurvey(req, res) {
  const row = await TherapistSurvey.findOneAndUpdate(
    { userId: req.params.userId },
    { $set: { survey: req.body, approvalStatus: 'pending' } },
    { upsert: true, new: true },
  );
  const user = await User.findByPk(req.params.userId);
  if (user) {
    await UserDirectory.findOneAndUpdate(
      { id: user.id },
      { $set: { id: user.id, name: `${user.firstName} ${user.lastName}`, email: user.email, role: 'therapist' } },
      { upsert: true },
    );
  }
  await notifyAdmins('New therapist application', { userId: req.params.userId });
  await audit('therapist.survey_submitted', req.params.userId, {});
  res.status(201).json({ id: row._id, ...row.survey, approvalStatus: row.approvalStatus });
}

export async function getTherapistApprovalStatus(req, res) {
  const row = await TherapistSurvey.findOne({ userId: req.params.userId });
  res.json({ status: row?.approvalStatus || 'not_submitted' });
}

// Admin-only bulk read of survey submissions (qualification, years of
// experience, specializations) — used to enrich the real Postgres therapist
// list in Anahat Admin with the extra detail therapists gave at sign-up.
// Approval status itself is NOT read from here — see adminController's
// isApproved, the single source of truth.
export async function getTherapistSurvey(req, res) {
  const row = await TherapistSurvey.findOne({ userId: req.params.userId });
  res.json(row ? { userId: row.userId, approvalStatus: row.approvalStatus, ...row.survey } : null);
}

export async function listTherapistSurveys(_req, res) {
  const rows = await TherapistSurvey.find();
  res.json(rows.map((r) => ({ userId: r.userId, ...r.survey })));
}

export async function setTherapistApproval(req, res) {
  await TherapistSurvey.findOneAndUpdate({ userId: req.params.id }, { $set: { approvalStatus: req.body.status } });
  // Keep in sync with the real gate used by the rest of the API.
  const user = await User.findOne({ where: { id: req.params.id, role: 'therapist' } });
  if (user) await user.update({ isApproved: req.body.status === 'approved' });
  await audit('therapist.approval', req.user?.id, { therapistId: req.params.id, status: req.body.status });
  const rows = await TherapistSurvey.find();
  res.json(rows.map((r) => ({ id: r._id, userId: r.userId, ...r.survey, approvalStatus: r.approvalStatus })));
}

// ---------------------------------------------------------------------------
// Concern-based therapist assignment
// ---------------------------------------------------------------------------

async function toTherapistPublic(userId) {
  const t = await User.findOne({
    where: { id: userId, role: 'therapist' },
    attributes: { exclude: ['passwordHash'] },
    include: [{ model: TherapistProfile, as: 'therapistProfile' }],
  });
  if (!t) return null;
  const plain = t.toJSON();
  return { ...plain, name: [plain.firstName, plain.lastName].filter(Boolean).join(' ') };
}

export async function getAssignedTherapist(req, res) {
  const a = await TherapistAssignment.findOne({ patientId: req.params.patientId });
  if (!a) return res.json(null);
  res.json(await toTherapistPublic(a.therapistId));
}

export async function getCurrentTherapistId(req, res) {
  const appt = await Appointment.findOne({
    where: { patientId: req.params.patientId, status: ['confirmed', 'completed'] },
    order: [['date', 'DESC']],
  });
  res.json(appt ? { therapistId: appt.therapistId } : null);
}

export async function assignTherapistDirect(req, res) {
  const existing = await TherapistAssignment.findOne({ patientId: req.params.patientId });
  if (existing) return res.json(await toTherapistPublic(existing.therapistId));
  await TherapistAssignment.create({ patientId: req.params.patientId, therapistId: req.body.therapistId });
  res.json(await toTherapistPublic(req.body.therapistId));
}

export async function assignTherapistForConcern(req, res) {
  const existing = await TherapistAssignment.findOne({ patientId: req.params.patientId });
  if (existing) return res.json(await toTherapistPublic(existing.therapistId));
  const candidates = await User.findAll({ where: { role: 'therapist', isApproved: true, isProfileComplete: true } });
  if (!candidates.length) return res.status(404).json({ message: 'No approved therapists available yet.' });
  const pick = candidates[Math.floor(Math.random() * candidates.length)];
  await TherapistAssignment.create({ patientId: req.params.patientId, therapistId: pick.id });
  await audit('therapist.auto_assigned', req.params.patientId, { therapistId: pick.id, concern: req.body.concern });
  res.json(await toTherapistPublic(pick.id));
}

export async function reassignTherapist(req, res) {
  await TherapistAssignment.findOneAndUpdate(
    { patientId: req.params.patientId },
    { $set: { therapistId: req.body.therapistId } },
    { upsert: true },
  );
  res.json(await toTherapistPublic(req.body.therapistId));
}

// ---------------------------------------------------------------------------
// Daily activity check-ins
// ---------------------------------------------------------------------------

export async function getActivityPlan(req, res) {
  const plan = await ActivityPlan.findOne({ patientId: req.params.patientId });
  res.json(plan?.activities || []);
}

export async function setActivityPlan(req, res) {
  const plan = await ActivityPlan.findOneAndUpdate(
    { patientId: req.params.patientId },
    { $set: { activities: req.body.activities || [] } },
    { upsert: true, new: true },
  );
  await audit('activity_plan.updated', req.params.patientId, {});
  if ((req.body.activities || []).length) {
    await notifyPatient(req.params.patientId, 'Your therapist updated your daily activities. Small steps, done daily, are how change happens.', { kind: 'activities' });
  }
  res.json(plan.activities);
}

export async function getActivityLog(req, res) {
  const rows = await ActivityLog.find({ patientId: req.params.patientId }).sort({ day: -1 });
  res.json(rows.map((r) => ({ id: r._id, day: r.day, responses: r.responses, createdAt: r.createdAt })));
}

export async function submitActivityCheckIn(req, res) {
  await ActivityLog.findOneAndUpdate(
    { patientId: req.params.patientId, day: today() },
    { $set: { responses: req.body.responses } },
    { upsert: true },
  );
  const rows = await ActivityLog.find({ patientId: req.params.patientId }).sort({ day: -1 });
  res.json(rows.map((r) => ({ id: r._id, day: r.day, responses: r.responses, createdAt: r.createdAt })));
}

// ---------------------------------------------------------------------------
// Live session workspace
// ---------------------------------------------------------------------------

export async function startSession(req, res) {
  let session = await LiveSession.findOne({ patientId: req.body.patientId, active: true });
  if (!session) {
    session = await LiveSession.create({
      therapistId: req.body.therapistId, therapistName: req.body.therapistName,
      patientId: req.body.patientId, patientName: req.body.patientName,
    });
    await audit('session.started', req.body.therapistId, { patientId: req.body.patientId });
    await notifyAdmins('Live session started', { patientId: req.body.patientId });
  }
  res.json(session);
}

export async function getSession(req, res) {
  if (!mongoose.isValidObjectId(req.params.sessionId)) return res.json(null);
  res.json(await LiveSession.findById(req.params.sessionId));
}

export async function getActiveSession(req, res) {
  const { patientId, therapistId } = req.query;
  const where = { active: true, ...(patientId ? { patientId } : { therapistId }) };
  res.json(await LiveSession.findOne(where));
}

export async function sendSessionMessage(req, res) {
  const session = await LiveSession.findByIdAndUpdate(
    req.params.sessionId,
    { $push: { messages: { from: req.body.from, text: req.body.text, at: new Date() } } },
    { new: true },
  );
  if (!session) return res.status(404).json({ message: 'Session not found' });
  res.json(session);
}

export async function endSession(req, res) {
  const session = await LiveSession.findByIdAndUpdate(
    req.params.sessionId,
    { $set: { active: false, endedAt: new Date() } },
    { new: true },
  );
  if (!session) return res.status(404).json({ message: 'Session not found' });
  await audit('session.ended', req.user?.id, { sessionId: session._id });
  res.json(session);
}

export async function getSessionHistory(req, res) {
  const rows = await LiveSession.find({ patientId: req.params.patientId, active: false }).sort({ endedAt: -1 });
  res.json(rows);
}

export async function getAllSessions(_req, res) {
  res.json(await LiveSession.find().sort({ createdAt: -1 }));
}

// Rule-based stand-in (matches derived.js#generateAISuggestion fallback) —
// wiring a real model requires an LLM API key that isn't configured here.
export async function askAICopilot(req, res) {
  const { concern, question } = req.body;
  const answer = `(Demo copilot — no model configured.) For a patient presenting with "${concern || 'this concern'}", consider exploring: ${question || 'their recent triggers and coping patterns'}. Reflect this back to them gently and note it in the session record.`;
  if (mongoose.isValidObjectId(req.params.sessionId)) {
    await LiveSession.findByIdAndUpdate(req.params.sessionId, { $push: { aiMessages: { question, answer, at: new Date() } } });
  }
  res.json({ answer });
}

// ---------------------------------------------------------------------------
// Patient notifications
// ---------------------------------------------------------------------------

export async function getPatientNotifications(req, res) {
  const rows = await PatientNotification.find({ patientId: req.params.patientId }).sort({ createdAt: -1 });
  res.json(rows.map((r) => ({ id: r._id, message: r.message, detail: r.detail, read: r.read, createdAt: r.createdAt })));
}

export async function markPatientNotificationRead(req, res) {
  await PatientNotification.findByIdAndUpdate(req.params.id, { $set: { read: true } });
  const rows = await PatientNotification.find({ patientId: req.params.patientId }).sort({ createdAt: -1 });
  res.json(rows.map((r) => ({ id: r._id, message: r.message, detail: r.detail, read: r.read, createdAt: r.createdAt })));
}

export async function markAllPatientNotificationsRead(req, res) {
  await PatientNotification.updateMany({ patientId: req.params.patientId }, { $set: { read: true } });
  const rows = await PatientNotification.find({ patientId: req.params.patientId }).sort({ createdAt: -1 });
  res.json(rows.map((r) => ({ id: r._id, message: r.message, detail: r.detail, read: r.read, createdAt: r.createdAt })));
}

// ---------------------------------------------------------------------------
// Messages (persistent patient <-> therapist conversation)
// ---------------------------------------------------------------------------

export async function getOrCreateConversation(req, res) {
  const { patientId, patientName, therapistId, therapistName } = req.body;
  if (req.user.role !== 'admin' && ![patientId, therapistId].includes(req.user.id)) {
    return res.status(403).json({ message: 'You can only open your own conversations.' });
  }
  let convo = await Conversation.findOne({ patientId, therapistId });
  if (!convo) convo = await Conversation.create({ patientId, patientName, therapistId, therapistName });
  res.json(convo);
}

export async function getConversationsForPatient(req, res) {
  res.json(await Conversation.find({ patientId: req.params.patientId }).sort({ updatedAt: -1 }));
}

// Every conversation this therapist is part of — one per patient — newest
// activity first. Therapists may only read their own list.
export async function getConversationsForTherapist(req, res) {
  if (req.user.role !== 'admin' && req.user.id !== req.params.therapistId) {
    return res.status(403).json({ message: 'Not allowed' });
  }
  res.json(await Conversation.find({ therapistId: req.params.therapistId }).sort({ updatedAt: -1 }));
}

const isMember = (convo, user) => user.role === 'admin' || convo.patientId === user.id || convo.therapistId === user.id;

export async function getConversation(req, res) {
  if (!mongoose.isValidObjectId(req.params.id)) return res.json(null);
  const convo = await Conversation.findById(req.params.id);
  if (convo && !isMember(convo, req.user)) return res.status(403).json({ message: 'Not your conversation.' });
  res.json(convo);
}

export async function sendConversationMessage(req, res) {
  const existing = await Conversation.findById(req.params.id);
  if (!existing) return res.status(404).json({ message: 'Conversation not found' });
  if (!isMember(existing, req.user)) return res.status(403).json({ message: 'Not your conversation.' });
  if (req.body.from !== req.user.role && req.user.role !== 'admin') return res.status(403).json({ message: 'Cannot send as another role.' });
  const convo = await Conversation.findByIdAndUpdate(
    req.params.id,
    { $push: { messages: { from: req.body.from, text: req.body.text, read: false, at: new Date() } } },
    { new: true },
  );
  if (!convo) return res.status(404).json({ message: 'Conversation not found' });
  if (req.body.from === 'therapist') await notifyPatient(convo.patientId, `New message from ${convo.therapistName || 'your therapist'}`, { conversationId: convo._id, kind: 'message' });
  res.json(convo);
}

export async function markConversationRead(req, res) {
  const convo = await Conversation.findById(req.params.id);
  if (!convo) return res.status(404).json({ message: 'Conversation not found' });
  if (!isMember(convo, req.user)) return res.status(403).json({ message: 'Not your conversation.' });
  convo.messages = convo.messages.map((m) => (m.from !== req.body.reader ? { ...m, read: true } : m));
  await convo.save();
  res.json(convo);
}

// ---------------------------------------------------------------------------
// Mood tracking
// ---------------------------------------------------------------------------

export async function getMoodEntries(req, res) {
  const rows = await MoodEntry.find({ patientId: req.params.patientId }).sort({ createdAt: -1 });
  res.json(rows.map((r) => ({ id: r._id, mood: r.mood, note: r.note, createdAt: r.createdAt })));
}

export async function addMoodEntry(req, res) {
  await MoodEntry.create({ patientId: req.params.patientId, mood: req.body.mood, note: req.body.note || '' });
  const rows = await MoodEntry.find({ patientId: req.params.patientId }).sort({ createdAt: -1 });
  res.json(rows.map((r) => ({ id: r._id, mood: r.mood, note: r.note, createdAt: r.createdAt })));
}

// ---------------------------------------------------------------------------
// Account settings (password change) — real, since this is a security
// feature worth doing properly rather than leaving as a stub.
// ---------------------------------------------------------------------------

export async function changePassword(req, res) {
  const { current_password, new_password } = req.body;
  if (!new_password || new_password.length < 8) {
    return res.status(400).json({ message: 'New password must be at least 8 characters.' });
  }
  // req.user (from requireAuth) has passwordHash excluded — re-fetch it here.
  const fullUser = await User.findByPk(req.user.id);
  const ok = await comparePassword(current_password || '', fullUser.passwordHash);
  if (!ok) return res.status(401).json({ message: 'Current password is incorrect.' });
  await fullUser.update({ passwordHash: await hashPassword(new_password) });
  res.json({ message: 'Password updated.' });
}


// Auto-approved: there is deliberately no admin gate here. Submitting takes
// the patient straight to their dashboard.
// ---------------------------------------------------------------------------

export async function getPatientOnboarding(req, res) {
  const row = await PatientOnboarding.findOne({ patientId: req.params.patientId });
  if (!row) return res.json({ status: 'not_submitted' });
  res.json({
    status: row.status,
    fields: row.fields,
    identityProofFileName: row.identityProofFileName,
    identityProofUrl: row.identityProofUrl,
    submittedAt: row.submittedAt,
  });
}

export async function submitPatientOnboarding(req, res) {
  const fields = req.body.fields ? JSON.parse(req.body.fields) : {};
  let identityProofFileName;
  let identityProofUrl;
  if (req.file) {
    const fileId = await saveFile(req.params.patientId, 'other', req.file);
    identityProofFileName = req.file.originalname;
    identityProofUrl = `/api/profile/files/${fileId}`;
  }
  const row = await PatientOnboarding.findOneAndUpdate(
    { patientId: req.params.patientId },
    {
      $set: {
        patientName: req.body.patientName,
        status: 'approved', // no admin approval gate for patients, by design
        fields,
        submittedAt: new Date(),
        ...(identityProofFileName && { identityProofFileName, identityProofUrl }),
      },
    },
    { upsert: true, new: true },
  );
  res.status(201).json({
    status: row.status, fields: row.fields,
    identityProofFileName: row.identityProofFileName, identityProofUrl: row.identityProofUrl,
    submittedAt: row.submittedAt,
  });
}

// Kept for API compatibility with the admin/therapist consoles; not part of
// the patient-facing flow (patients are auto-approved on submit).
export async function getPendingOnboarding(_req, res) {
  const rows = await PatientOnboarding.find({ status: { $ne: 'approved' } }).sort({ createdAt: 1 });
  res.json(rows);
}

export async function approvePatientOnboarding(req, res) {
  const row = await PatientOnboarding.findOneAndUpdate({ patientId: req.params.patientId }, { $set: { status: 'approved' } }, { new: true });
  if (!row) return res.status(404).json({ message: 'No submission on file' });
  await notifyPatient(req.params.patientId, 'Your account has been approved');
  res.json(row);
}

export async function rejectPatientOnboarding(req, res) {
  const row = await PatientOnboarding.findOneAndUpdate(
    { patientId: req.params.patientId },
    { $set: { status: 'approved', rejectionReason: req.body.reason } },
    { new: true },
  );
  if (!row) return res.status(404).json({ message: 'No submission on file' });
  await notifyPatient(req.params.patientId, 'A note was added to your submission', { reason: req.body.reason });
  res.json(row);
}
