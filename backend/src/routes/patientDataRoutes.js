import { Router } from 'express';
import { requireAuth, requireRole, requireSelfOrStaff, requireSelfOrAdmin } from '../middleware/auth.js';
import { upload } from '../middleware/upload.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import * as pd from '../controllers/patientDataController.js';

const router = Router();
router.use(requireAuth);

// Ownership gates: a patient can only reach their own /patients/:id/* data;
// therapists (approved) and admins can read patient records for care.
router.use('/patients/:ownerId', requireSelfOrStaff('ownerId'));
// A therapist's own settings / conversations: self or admin only.
router.use('/therapists/:ownerId/availability', requireSelfOrAdmin('ownerId'));
router.use('/therapists/:ownerId/blocked-dates', requireSelfOrAdmin('ownerId'));
router.use('/therapists/:ownerId/survey', (req, res, next) => (req.method === 'GET' ? next() : requireSelfOrAdmin('ownerId')(req, res, next)));
router.use('/therapists/:ownerId/conversations', requireSelfOrAdmin('ownerId'));

// Patient identity / profile
router.post('/patients/:userId/patient-id', asyncHandler(pd.getOrCreatePatientId));
router.get('/patients/:userId/patient-id', asyncHandler(pd.getPatientId));
router.get('/patients/:userId/subscription', asyncHandler(pd.getSubscription));
router.put('/patients/:userId/subscription', asyncHandler(pd.setSubscription));
router.post('/patients/:userId/subscription/premium/order', asyncHandler(pd.createPremiumOrder));
router.post('/patients/:userId/subscription/premium/confirm', asyncHandler(pd.confirmPremiumUpgrade));
router.get('/patients/:userId/profile', asyncHandler(pd.getProfile));
router.put('/patients/:userId/profile', asyncHandler(pd.saveProfile));
router.get('/patients/:userId/journey', asyncHandler(pd.getJourney));
router.put('/patients/:userId/journey', asyncHandler(pd.setJourney));

// Relaxation sessions / documents
router.post('/patients/:userId/relaxation-sessions', asyncHandler(pd.saveRelaxationSession));
router.get('/patients/:userId/documents', asyncHandler(pd.getDocuments));
router.post('/patients/:userId/documents', upload.single('file'), asyncHandler(pd.addDocument));

// Music — selection/history (catalog is GET /api/tracks, already exists)
router.get('/patients/:userId/track-selection', asyncHandler(pd.getTrackSelection));
router.post('/patients/:userId/track-selection', asyncHandler(pd.selectTracks));
router.get('/patients/:userId/track-history', asyncHandler(pd.getTrackHistory));

// Therapists — id-addressed availability / blocked dates
router.put('/therapists/:id/availability', asyncHandler(pd.setTherapistAvailabilityById));
router.get('/therapists/:id/blocked-dates', asyncHandler(pd.getBlockedDatesById));
router.put('/therapists/:id/blocked-dates', asyncHandler(pd.setBlockedDatesById));
router.post('/therapists/:userId/survey', asyncHandler(pd.submitTherapistSurvey));
router.get('/therapists/:userId/approval-status', asyncHandler(pd.getTherapistApprovalStatus));
router.get('/therapists/:userId/survey', asyncHandler(pd.getTherapistSurvey));
// Readable by any signed-in user: patients need specializations to show on
// therapist booking cards (the list only ever contains professional details).
router.get('/therapist-surveys', asyncHandler(pd.listTherapistSurveys));
router.patch('/therapists/:id/approval', requireRole('admin'), asyncHandler(pd.setTherapistApproval));

// Appointment requests
router.get('/appointment-requests', asyncHandler(pd.listAppointmentRequests));
router.post('/appointment-requests', asyncHandler(pd.createAppointmentRequest));
router.patch('/appointment-requests/:id', asyncHandler(pd.patchAppointmentRequest));

// Frontend-2's own booking model — deliberately on a separate path
// (/bookings, not /appointments) from the existing Postgres-backed
// /api/appointments flow, so frontend-1's booking/payment flow through the
// existing backend is completely untouched.
router.get('/bookings', asyncHandler(pd.getAppointments));
router.post('/bookings', requireRole('patient'), asyncHandler(pd.bookAppointment));
router.post('/bookings/offline', requireRole('admin', 'therapist'), asyncHandler(pd.createOfflineSession));
router.patch('/bookings/:id', asyncHandler(pd.patchAppointment));
router.post('/bookings/:appointmentId/session', asyncHandler(pd.getOrStartAppointmentSession));

// Weekly feedback
router.get('/patients/:patientId/weekly-feedback', asyncHandler(pd.getWeeklyFeedback));
router.post('/patients/:patientId/weekly-feedback', asyncHandler(pd.submitWeeklyFeedback));

// Before/After-session "I feel ___" feedback (used for consultations and Relaxation)
router.get('/patients/:patientId/session-feedback', asyncHandler(pd.getSessionFeedback));
router.post('/patients/:patientId/session-feedback', asyncHandler(pd.submitSessionFeedback));

// Relaxation payment (one payment unlocks Relaxation for the rest of the day)
router.get('/patients/:patientId/relaxation-payment', asyncHandler(pd.getRelaxationPaymentStatus));
router.post('/patients/:patientId/relaxation-payment/order', asyncHandler(pd.createRelaxationOrder));
router.post('/patients/:patientId/relaxation-payment/:paymentId/pay', asyncHandler(pd.payRelaxationOrder));

// Clinical records & report history
router.get('/patients/:patientId/therapy-record', asyncHandler(pd.getTherapyRecord));
router.put('/patients/:patientId/therapy-record', asyncHandler(pd.saveTherapyRecord));
router.post('/patients/:patientId/therapy-record/approve', asyncHandler(pd.approveTherapyRecord));
router.get('/patients/:patientId/report-history', asyncHandler(pd.getReportHistory));
router.post('/patients/:patientId/report-history', asyncHandler(pd.addReportToHistory));
router.patch('/patients/:patientId/report-history/:reportId', asyncHandler(pd.updateReportInHistory));

// Listening log
router.get('/patients/:userId/listening-log', asyncHandler(pd.getListeningLog));
router.post('/patients/:userId/listening-log', asyncHandler(pd.logListeningSession));

// Site feedback
router.get('/feedback', asyncHandler(pd.getFeedbackList));
router.post('/feedback', asyncHandler(pd.submitFeedback));
router.patch('/feedback/:id', asyncHandler(pd.respondToFeedback));

// Audit log & admin notifications
router.get('/audit-log', requireRole('admin'), asyncHandler(pd.getAuditLog));
router.post('/audit-log', requireRole('admin'), asyncHandler(pd.addAudit));
router.get('/admin/notifications', requireRole('admin'), asyncHandler(pd.getAdminNotifications));
router.patch('/admin/notifications/:id/read', requireRole('admin'), asyncHandler(pd.markNotificationRead));

// User directory
router.get('/users', requireRole('admin'), asyncHandler(pd.getUserDirectory));
router.post('/users', asyncHandler(pd.upsertUserDirectory));
router.patch('/users/:id/status', requireRole('admin'), asyncHandler(pd.setUserStatus));
router.delete('/users/:id', requireRole('admin'), asyncHandler(pd.deleteUserDirectory));

// Concern-based assignment
router.get('/patients/:patientId/assigned-therapist', asyncHandler(pd.getAssignedTherapist));
router.get('/patients/:patientId/current-therapist-id', asyncHandler(pd.getCurrentTherapistId));
router.post('/patients/:patientId/assign-therapist', asyncHandler(pd.assignTherapistDirect));
router.post('/patients/:patientId/auto-assign-therapist', asyncHandler(pd.assignTherapistForConcern));
router.put('/patients/:patientId/reassign-therapist', asyncHandler(pd.reassignTherapist));

// Daily activity check-ins
router.get('/patients/:patientId/activity-plan', asyncHandler(pd.getActivityPlan));
router.put('/patients/:patientId/activity-plan', asyncHandler(pd.setActivityPlan));
router.get('/patients/:patientId/activity-log', asyncHandler(pd.getActivityLog));
router.post('/patients/:patientId/activity-log', asyncHandler(pd.submitActivityCheckIn));

// Live session workspace
router.post('/sessions', asyncHandler(pd.startSession));
router.get('/sessions/active', asyncHandler(pd.getActiveSession));
router.get('/sessions', asyncHandler(pd.getAllSessions));
router.get('/sessions/:sessionId', asyncHandler(pd.getSession));
router.post('/sessions/:sessionId/messages', asyncHandler(pd.sendSessionMessage));
router.post('/sessions/:sessionId/end', asyncHandler(pd.endSession));
router.post('/sessions/:sessionId/ai-copilot', asyncHandler(pd.askAICopilot));
router.get('/patients/:patientId/session-history', asyncHandler(pd.getSessionHistory));

// Patient notifications
router.get('/patients/:patientId/notifications', asyncHandler(pd.getPatientNotifications));
router.patch('/patients/:patientId/notifications/:id/read', asyncHandler(pd.markPatientNotificationRead));
router.patch('/patients/:patientId/notifications/read-all', asyncHandler(pd.markAllPatientNotificationsRead));

// Messages / conversations
router.post('/conversations', asyncHandler(pd.getOrCreateConversation));
router.get('/patients/:patientId/conversations', asyncHandler(pd.getConversationsForPatient));
router.get('/therapists/:therapistId/conversations', asyncHandler(pd.getConversationsForTherapist));
router.get('/conversations/:id', asyncHandler(pd.getConversation));
router.post('/conversations/:id/messages', asyncHandler(pd.sendConversationMessage));
router.patch('/conversations/:id/read', asyncHandler(pd.markConversationRead));

// Mood tracking
router.get('/patients/:patientId/mood-entries', asyncHandler(pd.getMoodEntries));
router.post('/patients/:patientId/mood-entries', asyncHandler(pd.addMoodEntry));

// Account settings
router.patch('/account/change-password', asyncHandler(pd.changePassword));

// Patient onboarding (auto-approved — no admin gate)
router.get('/patients/:patientId/onboarding', asyncHandler(pd.getPatientOnboarding));
router.post('/patients/:patientId/onboarding', upload.single('identityProof'), asyncHandler(pd.submitPatientOnboarding));
router.get('/onboarding/pending', requireRole('admin'), asyncHandler(pd.getPendingOnboarding));
router.post('/patients/:patientId/onboarding/approve', requireRole('admin'), asyncHandler(pd.approvePatientOnboarding));
router.post('/patients/:patientId/onboarding/reject', requireRole('admin'), asyncHandler(pd.rejectPatientOnboarding));

export default router;
