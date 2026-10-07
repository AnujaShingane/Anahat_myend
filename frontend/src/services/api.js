// ---------------------------------------------------------------------------
// api.js
//
// Real backend API client. Replaces the old mockApi.js localStorage-backed
// fake store — every function below makes an actual HTTP call to the
// backend and returns a Promise. Nothing in this file touches localStorage
// except reading the auth token (the same pattern already used by
// usePatientSession.js / AuthContext.jsx for the logged-in user's session).
//
// BACKEND TEAM: this file *is* the API contract. Every function maps 1:1 to
// one REST call — method, path, request body, and expected response shape
// are documented in the JSDoc above each one. See API_CONTRACT.md at the
// project root for the same information laid out as a flat endpoint list,
// plus notes on side effects (e.g. "booking an appointment should also
// create an admin + patient notification") that used to be bundled into the
// old mock functions and now belong on the server.
//
// Configure the backend origin via VITE_API_BASE_URL (see .env.example) only
// if it's not same-origin / behind the Vite proxy — see BACKEND_URL below.
// ---------------------------------------------------------------------------

// Same-origin '/api' path — the Vite dev server proxies this to the Express
// backend (see vite.config.js), and in production this is served behind the
// same reverse proxy as the backend. Override with VITE_API_BASE_URL only if
// the backend is deployed on a different origin.
export const BACKEND_URL = import.meta.env.VITE_API_BASE_URL || '';

// Shared fetch wrapper: builds the URL, sends the session cookie, parses
// JSON, and throws a normal Error (with the backend's message, if any) on
// any non-2xx response so callers can use try/catch or .catch().
//
// Auth is cookie-based (express-session), the same mechanism frontend-1
// uses — there is no bearer token. `credentials: 'include'` sends the
// session cookie; `X-Requested-With` satisfies the backend's CSRF-style
// origin check on non-GET requests (see backend requireAppOrigin middleware).
async function request(path, { method = 'GET', body, isFormData = false, signal } = {}) {
  const res = await fetch(`${BACKEND_URL}${path}`, {
    method,
    credentials: 'include',
    signal,
    headers: {
      // Sent on EVERY request (GET too): the backend's app-origin gate
      // rejects any call without it, which is what keeps Postman/Hoppscotch
      // style requests out even if someone has a cookie.
      'X-Requested-With': 'XMLHttpRequest',
      ...(isFormData ? {} : { 'Content-Type': 'application/json' }),
    },
    body: body == null ? undefined : isFormData ? body : JSON.stringify(body),
  });

  if (res.status === 401 && !path.startsWith('/api/auth/')) {
    // Session gone (expired, logged out elsewhere, or used from another
    // device) — tell AuthContext so the app returns to the login screen.
    window.dispatchEvent(new CustomEvent('anahat:unauthorized'));
  }
  if (!res.ok) {
    let message = `Request failed (${res.status})`;
    try {
      const errBody = await res.json();
      message = errBody?.message || message;
    } catch {
      // response wasn't JSON — keep the generic message
    }
    const err = new Error(message);
    err.status = res.status;
    throw err;
  }

  if (res.status === 204) return null;
  return res.json();
}

// ---------------------------------------------------------------------------
// Auth — real cookie-session endpoints (see backend routes/authRoutes.js).
// Normalizes the backend's { firstName, lastName, ... } user into the shape
// the rest of the app reads (adds `name`, keeps every other field as-is).
// ---------------------------------------------------------------------------

function normalizeUser(u) {
  if (!u) return u;
  return { ...u, name: u.name || [u.firstName, u.lastName].filter(Boolean).join(' ') };
}

/** POST /api/auth/signup — Body: { firstName, lastName, email, password,
 * confirmPassword, role: 'patient' | 'therapist', accountType?: 'self' | 'caregiver' }.
 * Response: normalized user object. Throws on 409 (email taken) / 400 (validation). */
export function apiSignup(payload) {
  return request('/api/auth/signup', { method: 'POST', body: payload }).then((r) => normalizeUser(r.user));
}

/** POST /api/auth/login — Body: { email, password }. Response: normalized user. */
export function apiLogin(email, password) {
  return request('/api/auth/login', { method: 'POST', body: { email, password } }).then((r) => normalizeUser(r.user));
}

/** GET /api/auth/me — restores the session on page load from the cookie.
 * Response: normalized user, or throws (401) if not logged in. */
export function apiMe() {
  return request('/api/auth/me').then((r) => normalizeUser(r.user));
}

/** POST /api/auth/logout — clears the session cookie server-side. */
export function apiLogout() {
  return request('/api/auth/logout', { method: 'POST' });
}

/** PATCH /api/account/change-password — Body: { current_password, new_password }. */
export function changePassword(currentPassword, newPassword) {
  return request('/api/account/change-password', { method: 'PATCH', body: { current_password: currentPassword, new_password: newPassword } });
}

// ---------------------------------------------------------------------------
// Patient identity / profile
// ---------------------------------------------------------------------------

/** POST /api/patients/:userId/patient-id — creates the permanent ANH-YYYY-NNNNNN
 * patient ID on first call, returns the existing one on subsequent calls.
 * Response: { patientId: string, enrollmentDate: string (ISO) } */
export function getOrCreatePatientId(userId) {
  return request(`/api/patients/${userId}/patient-id`, { method: 'POST' })
    .then((r) => r.patientId);
}

/** GET /api/patients/:userId/patient-id — Response: { patientId, enrollmentDate } | null */
export function getEnrollmentDate(userId) {
  return request(`/api/patients/${userId}/patient-id`).then((r) => r?.enrollmentDate || null);
}

/** GET /api/patients/:userId/subscription — Response: { status, plan, aiConsultationsUsed, aiFreeLimit, aiRemaining, premiumFee } */
export function getSubscriptionStatus(userId) {
  return request(`/api/patients/${userId}/subscription`);
}

/** PUT /api/patients/:userId/subscription — Body: { status }. Response: { status } */
export function setSubscriptionStatus(userId, status) {
  return request(`/api/patients/${userId}/subscription`, { method: 'PUT', body: { status } })
    .then((r) => r.status);
}

/** POST /api/patients/:userId/subscription/premium/order — Response: { orderId, amount, currency } */
export function createPremiumOrder(userId) {
  return request(`/api/patients/${userId}/subscription/premium/order`, { method: 'POST' });
}

/** POST /api/patients/:userId/subscription/premium/confirm — Body: { orderId, paymentRef }. Response: { plan } */
export function confirmPremiumUpgrade(userId, orderId, paymentRef) {
  return request(`/api/patients/${userId}/subscription/premium/confirm`, { method: 'POST', body: { orderId, paymentRef } });
}

/** GET /api/patients/:userId/profile — Response: profile object | null */
export function getProfile(userId) {
  return request(`/api/patients/${userId}/profile`);
}

/** PUT /api/patients/:userId/profile — Body: partial profile fields (merged server-side).
 * Response: the full updated profile, with updatedAt stamped by the server. */
export function saveProfile(userId, profile) {
  return request(`/api/patients/${userId}/profile`, { method: 'PUT', body: profile });
}

/** GET /api/patients/:userId/journey — Response: { journey: string } | null */
export function getJourney(userId) {
  return request(`/api/patients/${userId}/journey`).then((r) => r?.journey ?? null);
}

/** PUT /api/patients/:userId/journey — Body: { journey }. Response: { journey } */
export function setJourney(userId, journey) {
  return request(`/api/patients/${userId}/journey`, { method: 'PUT', body: { journey } })
    .then((r) => r.journey);
}

// ---------------------------------------------------------------------------
// Relaxation sessions / document uploads
// ---------------------------------------------------------------------------

/** POST /api/patients/:userId/relaxation-sessions — Body: session fields.
 * Response: updated array of the patient's relaxation sessions. */
export function saveRelaxationSession(userId, session) {
  return request(`/api/patients/${userId}/relaxation-sessions`, { method: 'POST', body: session });
}

/** GET /api/patients/:userId/documents — Response: array of documents */
export function getDocuments(userId) {
  return request(`/api/patients/${userId}/documents`);
}

/** POST /api/patients/:userId/documents — multipart/form-data with the file
 * under field "file" plus any metadata fields. Response: updated documents array. */
export function addDocument(userId, doc) {
  const formData = new FormData();
  Object.entries(doc).forEach(([key, value]) => formData.append(key, value));
  return request(`/api/patients/${userId}/documents`, { method: 'POST', body: formData, isFormData: true });
}

// ---------------------------------------------------------------------------
// Music library — track catalog + a patient's selection/history
// ---------------------------------------------------------------------------

/** GET /api/tracks — backed by the existing Postgres/Mongo track catalog
 * (`{ tracks, playedToday, dailyLimit }`), reshaped to the flat array frontend-2
 * expects: [{ id, index, name, colors: [hex, hex] }, ...]. A small fixed
 * palette is assigned by index since the existing schema has no color field. */
const TRACK_PALETTE = [
  ['#F87171', '#FCA5A5'], ['#FB923C', '#FDBA74'], ['#FACC15', '#FDE68A'],
  ['#4ADE80', '#86EFAC'], ['#38BDF8', '#7DD3FC'], ['#818CF8', '#A5B4FC'],
  ['#C084FC', '#D8B4FE'],
];
export function getTrackCatalog() {
  return request('/api/tracks').then((r) => {
    const list = Array.isArray(r) ? r : r?.tracks || [];
    return list.map((t, index) => ({
      id: t.id || t._id,
      index,
      name: t.title || t.name,
      colors: TRACK_PALETTE[index % TRACK_PALETTE.length],
      chakra: t.chakra,
      category: t.category,
      createdAt: t.createdAt,
    }));
  });
}

// ---------------------------------------------------------------------------
// Admin: Audio Tracks (add/remove) — accepts either an external URL or an
// uploaded audio file.
// ---------------------------------------------------------------------------

/** GET /api/tracks/admin/all — every track, any category. Admin only. */
export function adminListTracks() {
  return request('/api/tracks/admin/all').then((r) => r.tracks || []);
}

/** POST /api/tracks — Body (JSON): { title, artist, chakra, category, audioUrl }
 * OR (multipart via `file`): same fields + an audio file, field name "audio". */
export function adminCreateTrack({ title, artist, chakra, category, audioUrl, file }) {
  if (file) {
    const formData = new FormData();
    formData.append('title', title);
    if (artist) formData.append('artist', artist);
    if (chakra) formData.append('chakra', chakra);
    formData.append('category', category || 'therapy');
    formData.append('audio', file);
    return request('/api/tracks', { method: 'POST', body: formData, isFormData: true });
  }
  return request('/api/tracks', { method: 'POST', body: { title, artist, chakra, category: category || 'therapy', audioUrl } });
}

/** DELETE /api/tracks/:id — Admin only. */
export function adminDeleteTrack(id) {
  return request(`/api/tracks/${id}`, { method: 'DELETE' });
}

/** GET /api/patients/:userId/track-selection
 * Response: { trackIds: string[], selectedAt: string } | null
 * (the 24h lock window is computed client-side — see
 * src/utils/derived.js#getTrackSelectionMeta) */
export function getTrackSelection(userId) {
  return request(`/api/patients/${userId}/track-selection`);
}

/** POST /api/patients/:userId/track-selection — Body: { trackIds: string[] }.
 * Server should archive any previous selection into track history before overwriting.
 * Response: { trackIds, selectedAt } */
export function selectTracks(userId, trackIds) {
  return request(`/api/patients/${userId}/track-selection`, { method: 'POST', body: { trackIds } });
}

/** GET /api/patients/:userId/track-history — Response: array of past selections */
export function getTrackHistory(userId) {
  return request(`/api/patients/${userId}/track-history`);
}

// ---------------------------------------------------------------------------
// Therapists directory, availability, blocked dates
// ---------------------------------------------------------------------------

/** POST /api/profile/therapist — the existing (frontend-1) therapist
 * profile-completion endpoint: age/gender/experienceYears/experienceDetails/
 * profession/fee/address/bio in Postgres, flips `isProfileComplete`. This is
 * what actually makes a therapist bookable (fee) and listed (GET /api/therapists
 * only returns approved + profile-complete therapists). Response: { user }. */
export function completeTherapistProfile(fields, avatarFile) {
  const formData = new FormData();
  Object.entries(fields).forEach(([k, v]) => { if (v != null && v !== '') formData.append(k, v); });
  if (avatarFile) formData.append('avatar', avatarFile);
  return request('/api/profile/therapist', { method: 'POST', body: formData, isFormData: true }).then((r) => r.user);
}

/** PATCH /api/profile/contact — update the signed-in user's contact number. */
export function updateContact(phone) {
  return request('/api/profile/contact', { method: 'PATCH', body: { phone } }).then((r) => r.user);
}

/** PUT /api/profile/me/avatar — upload a profile photo (any role). */
export function uploadAvatar(file) {
  const fd = new FormData();
  fd.append('avatar', file);
  return request('/api/profile/me/avatar', { method: 'PUT', body: fd, isFormData: true }).then((r) => ({ avatarFileId: r.avatarFileId, avatarUrl: `/api/profile/files/${r.avatarFileId}` }));
}

/** GET /api/profile/me — the signed-in user with their Postgres
 * patientProfile / therapistProfile attached. */
export function getMyProfile() {
  return request('/api/profile/me').then((r) => r.user);
}

/** GET /api/therapists — the real (approved, profile-complete) Postgres
 * therapist list, reshaped into { id, name, experienceYears, expertise,
 * fee, location, bio, avatarUrl, profile }, enriched with the sign-up
 * survey's specializations (Postgres has no such column). This is the only
 * therapist listing used anywhere — patients see it exclusively when
 * booking (see BookSession.jsx), never during registration. */
function toTherapistShape(t, surveyByUserId = {}) {
  if (!t) return t;
  const survey = surveyByUserId[t.id] || {};
  const fullName = t.profile?.fullName || `${t.firstName || ''} ${t.lastName || ''}`.trim() || t.name;
  const tp = t.therapistProfile || {};
  return {
    id: t.id,
    name: fullName,
    email: t.email,
    role: 'therapist',
    isApproved: t.isApproved,
    experienceYears: tp.experienceYears ?? null,
    expertise: survey.specializations || [],
    fee: tp.fee ?? null,
    location: tp.address || '',
    bio: tp.bio || survey.bio || '',
    avatarUrl: t.avatarFileId ? `/api/profile/files/${t.avatarFileId}` : null,
    availability: t.slots || [],
    profile: {
      fullName,
      avatarUrl: t.avatarFileId ? `/api/profile/files/${t.avatarFileId}` : t.profile?.avatarUrl,
      sessionFee: tp.fee ?? t.profile?.sessionFee,
      bio: tp.bio ?? t.profile?.bio,
      experience: tp.experienceDetails ?? t.profile?.experience,
      profession: tp.profession,
      address: tp.address,
    },
  };
}
export function getTherapists() {
  return Promise.all([request('/api/therapists'), listTherapistSurveys().catch(() => [])])
    .then(([r, surveys]) => {
      const list = Array.isArray(r) ? r : r?.therapists || [];
      const surveyByUserId = Object.fromEntries(surveys.map((s) => [s.userId, s]));
      return list.map((t) => toTherapistShape(t, surveyByUserId));
    });
}

/** GET /api/therapists/:id — single therapist with full detail. */
export function getTherapistDetail(id) {
  return request(`/api/therapists/${id}`).then((r) => toTherapistShape(r.therapist || r));
}

// ---------------------------------------------------------------------------
// Real booking system — recurring weekly availability + blocked dates +
// live free-slot computation + double-booking prevention, all computed
// server-side against the actual Postgres Appointment table (see backend
// services/bookingService.js#freeSlotsOn). This is the ONLY booking system;
// there is no separate patient-therapist assignment anywhere in this flow —
// the patient picks a therapist and a slot directly.
// ---------------------------------------------------------------------------

/** GET /api/therapists/:id/free-slots?date=YYYY-MM-DD — Response: array of
 * { dayOfWeek, startTime, endTime } already excluding taken slots and
 * fully-blocked dates. */
export function getFreeSlots(therapistId, date) {
  return request(`/api/therapists/${therapistId}/free-slots?date=${date}`).then((r) => r.slots);
}

/** POST /api/appointments — Body: { therapistId, date, startTime }. Server
 * re-validates the slot is free (race-safe against double booking) and
 * creates a mock payment order. Response: { appointment, payment }. */
export function bookRealAppointment(therapistId, date, startTime, mode = 'online', details = {}) {
  return request('/api/appointments', { method: 'POST', body: { therapistId, date, startTime, mode, ...details } });
}

/** POST /api/appointments/payments/:paymentId/pay — confirms the mock
 * payment and flips the appointment to 'confirmed'. */
export function payForAppointment(paymentId, paymentRef, paymentMethod = 'online', termsAccepted = false) {
  return request(`/api/appointments/payments/${paymentId}/pay`, { method: 'POST', body: { paymentRef, paymentMethod, termsAccepted } });
}

/** GET /api/appointments — real bookings for the current user (patient sees
 * their own, therapist sees their own). Response: array of appointments,
 * each with .patient/.therapist { id, firstName, lastName, avatarFileId }. */
export function getMyAppointments() {
  return request('/api/appointments').then((r) => r.appointments);
}

/** Same data as getMyAppointments(), reshaped for the patient dashboard /
 * appointments pages: adds `scheduledAt` (ISO, IST) so the join window can
 * be computed, plus the therapist's display name and photo. */
export function getMyAppointmentsForPatient() {
  return getMyAppointments().then((list) => (list || []).map((a) => {
    const t = a.therapist || {};
    return {
      id: a.id,
      patientId: a.patient?.id || a.patientId,
      therapistId: t.id || a.therapistId,
      therapistName: [t.firstName, t.lastName].filter(Boolean).join(' ') || 'Your therapist',
      therapistAvatarUrl: t.avatarFileId ? `/api/profile/files/${t.avatarFileId}` : null,
      date: a.date,
      startTime: a.startTime,
      endTime: a.endTime,
      scheduledAt: a.date && a.startTime ? new Date(`${a.date}T${a.startTime}:00+05:30`).toISOString() : null,
      slot: `${a.date} ${a.startTime}`,
      status: a.status,
      mode: a.mode || 'online',
      meetLink: a.meetLink || null,
      createdAt: a.createdAt,
    };
  }));
}

/** GET /api/appointments/payments — the current patient's payment history. */
export function getMyPayments() {
  return request('/api/appointments/payments').then((r) => r.payments);
}

/** PATCH /api/appointments/:id — Body: { status } to cancel/complete, or
 * { date, startTime } to reschedule (re-validated against real availability).
 * Usable by either the booking's patient or therapist. */
export function updateAppointmentStatus(id, patch) {
  return request(`/api/appointments/${id}`, { method: 'PATCH', body: patch }).then((r) => r.appointment);
}

// ---------------------------------------------------------------------------
// Therapist's own recurring weekly availability + blocked dates
// ---------------------------------------------------------------------------

/** GET /api/therapists/me/slots — Response: array of
 * { id, dayOfWeek (0=Sun..6=Sat), startTime, endTime }. */
export function getMySlots() {
  return request('/api/therapists/me/slots').then((r) => r.slots);
}

/** PUT /api/therapists/me/slots — Body: { slots: [{dayOfWeek,startTime,endTime}] }
 * — full overwrite of the recurring weekly schedule. */
export function setMySlots(slots) {
  return request('/api/therapists/me/slots', { method: 'PUT', body: { slots } }).then((r) => r.slots);
}

/** GET /api/therapists/me/blocked-dates — Response: array of { id, date, reason } */
export function getMyBlockedDates() {
  return request('/api/therapists/me/blocked-dates').then((r) => r.blockedDates);
}

/** POST /api/therapists/me/blocked-dates — Body: { date, reason? } */
export function blockMyDate(date, reason) {
  return request('/api/therapists/me/blocked-dates', { method: 'POST', body: { date, reason } }).then((r) => r.blockedDate);
}

/** DELETE /api/therapists/me/blocked-dates/:id */
export function unblockMyDate(id) {
  return request(`/api/therapists/me/blocked-dates/${id}`, { method: 'DELETE' });
}

/** GET /api/therapists/me/patients — patients who've booked this therapist,
 * with full profiles. Response: array of appointments incl. .patient. */
export function getMyTherapistPatients() {
  return request('/api/therapists/me/patients').then((r) => r.appointments);
}

/** GET /api/therapists/me/payments — this therapist's payment history. */
export function getMyTherapistPayments() {
  return request('/api/therapists/me/payments').then((r) => r.payments);
}

// ---------------------------------------------------------------------------
// Appointment requests (no open slot — patient proposes a time)
// ---------------------------------------------------------------------------

/** GET /api/appointment-requests — Response: array of requests */
export function getAppointmentRequests() {
  return request('/api/appointment-requests');
}

/** POST /api/appointment-requests — Body: request fields.
 * Server should also create an admin notification (see API_CONTRACT.md).
 * Response: the created request, with id/status/createdAt stamped. */
export function submitAppointmentRequest(req) {
  return request('/api/appointment-requests', { method: 'POST', body: req });
}

/** PATCH /api/appointment-requests/:id — Body: partial patch. Response: updated request */
export function updateAppointmentRequest(id, patch) {
  return request(`/api/appointment-requests/${id}`, { method: 'PATCH', body: patch });
}

// ---------------------------------------------------------------------------
// Appointments
//
// NOTE: these hit /api/bookings, not /api/appointments. Frontend-1 and the
// existing backend already have a working, payment-gateway-integrated
// /api/appointments flow built around fixed Postgres availability slots;
// frontend-2's booking UI collects a different shape (slot/scheduledAt/mode/
// sessionFee/platformFee/paymentMethod) and has no payment gateway wired up
// (see BookSession.jsx), so it's backed by its own endpoint instead of
// reusing/altering the existing one. Both booking flows work against the
// same backend without interfering with each other.
// ---------------------------------------------------------------------------

/** GET /api/bookings — Response: array of appointments */
export function getAppointments() {
  return request('/api/bookings');
}

/** POST /api/bookings — Body: appointment fields.
 * Server also writes an audit log entry, notifies admins, and notifies the
 * patient ("Session requested"). Response: the created appointment. */
export function bookAppointment(appt) {
  return request('/api/bookings', { method: 'POST', body: appt });
}

/** POST /api/bookings/offline — admin/therapist only. Body: { patientId,
 * patientName, therapistId, therapistName, date, time, summary, notes,
 * sessionType, status }. Logs a session that happened outside the app
 * (in-person, phone, etc) so it appears in the patient's history like any
 * other session. Response: the created appointment. */
export function createOfflineSession(payload) {
  return request('/api/bookings/offline', { method: 'POST', body: payload });
}

/** PATCH /api/bookings/:id — Body: partial patch (e.g. { status }).
 * Server notifies the patient when status changes (cancelled/confirmed/
 * rescheduled/completed). Response: the updated appointment. */
export function updateAppointment(id, patch) {
  return request(`/api/bookings/${id}`, { method: 'PATCH', body: patch });
}

// ---------------------------------------------------------------------------
// Weekly feedback
// ---------------------------------------------------------------------------

/** GET /api/patients/:patientId/weekly-feedback — Response: array, most recent last */
export function getWeeklyFeedback(patientId) {
  return request(`/api/patients/${patientId}/weekly-feedback`);
}

/** POST /api/patients/:patientId/weekly-feedback — Body: feedback entry fields.
 * Response: updated array of the patient's weekly feedback entries. */
export function submitWeeklyFeedback(patientId, entry) {
  return request(`/api/patients/${patientId}/weekly-feedback`, { method: 'POST', body: entry });
}

// ---------------------------------------------------------------------------
// Before/After-session "I feel ___" feedback (also used for Relaxation)
// ---------------------------------------------------------------------------

/** GET /api/patients/:patientId/session-feedback?appointmentId&stage */
export function getSessionFeedback(patientId, { appointmentId, stage } = {}) {
  const params = new URLSearchParams();
  if (appointmentId) params.set('appointmentId', appointmentId);
  if (stage) params.set('stage', stage);
  const qs = params.toString();
  return request(`/api/patients/${patientId}/session-feedback${qs ? `?${qs}` : ''}`);
}

/** POST /api/patients/:patientId/session-feedback — Body: { stage: 'before'|'after', appointmentId, answers, sessionType } */
export function submitSessionFeedback(patientId, body) {
  return request(`/api/patients/${patientId}/session-feedback`, { method: 'POST', body });
}

// ---------------------------------------------------------------------------
// Relaxation payment
// ---------------------------------------------------------------------------

/** GET /api/patients/:patientId/relaxation-payment — Response: { paid, fee, currency } */
export function getRelaxationPaymentStatus(patientId, sessionId) {
  const query = sessionId ? `?sessionId=${encodeURIComponent(sessionId)}` : '';
  return request(`/api/patients/${patientId}/relaxation-payment${query}`);
}

/** POST /api/patients/:patientId/relaxation-payment/order — Response: { paymentId, orderId, amount, currency } */
export function createRelaxationOrder(patientId, sessionId) {
  return request(`/api/patients/${patientId}/relaxation-payment/order`, { method: 'POST', body: { sessionId } });
}

/** POST /api/patients/:patientId/relaxation-payment/:paymentId/pay — Body: { paymentRef } (mock gateway — any value confirms it) */
export function payRelaxationOrder(patientId, paymentId, paymentRef, sessionId) {
  return request(`/api/patients/${patientId}/relaxation-payment/${paymentId}/pay`, { method: 'POST', body: { paymentRef, sessionId } });
}

// ---------------------------------------------------------------------------
// Clinical / therapy records + report history
// ---------------------------------------------------------------------------

/** GET /api/patients/:patientId/therapy-record — Response: record object | null */
export function getTherapyRecord(patientId) {
  return request(`/api/patients/${patientId}/therapy-record`);
}

/** PUT /api/patients/:patientId/therapy-record — Body: partial record (merged server-side,
 * server stamps updatedAt). Response: the full updated record. */
export function saveTherapyRecord(patientId, record) {
  return request(`/api/patients/${patientId}/therapy-record`, { method: 'PUT', body: record });
}

/** POST /api/patients/:patientId/therapy-record/approve — Body: { approvedBy }.
 * Server should: mark the record approved, snapshot it into report history
 * (pulling in the latest appointment + track selection for context), and
 * notify the patient ("New report available"). Response: the updated record. */
export function approveReport(patientId, approvedBy) {
  return request(`/api/patients/${patientId}/therapy-record/approve`, { method: 'POST', body: { approvedBy } });
}

/** GET /api/patients/:patientId/report-history — Response: array of report snapshots */
export function getReportHistory(patientId) {
  return request(`/api/patients/${patientId}/report-history`);
}

/** POST /api/patients/:patientId/report-history — Body: report fields.
 * Response: updated report history array. */
export function addReportToHistory(patientId, report) {
  return request(`/api/patients/${patientId}/report-history`, { method: 'POST', body: report });
}

/** PATCH /api/patients/:patientId/report-history/:reportId — Body: partial updates
 * (server stamps updatedAt). Response: updated report history array. */
export function updateReportInHistory(patientId, reportId, updates) {
  return request(`/api/patients/${patientId}/report-history/${reportId}`, { method: 'PATCH', body: updates });
}

// ---------------------------------------------------------------------------
// Listening log (music therapy progress tracking)
// ---------------------------------------------------------------------------

/** GET /api/patients/:userId/listening-log — Response: array of logged sessions */
export function getListeningLog(userId) {
  return request(`/api/patients/${userId}/listening-log`);
}

/** POST /api/patients/:userId/listening-log — Body: { trackName, durationSeconds, qualified }.
 * Response: updated listening log array.
 * Note: streak/weekly/monthly progress stats are now computed client-side —
 * see src/utils/derived.js#getProgressSummary(log) — from this log, so no
 * separate "progress summary" endpoint is required. */
export function logListeningSession(userId, { trackName, durationSeconds, qualified }) {
  return request(`/api/patients/${userId}/listening-log`, {
    method: 'POST',
    body: { trackName, durationSeconds, qualified },
  });
}

// ---------------------------------------------------------------------------
// Site feedback (patient / therapist / bug / feature — separate from the
// clinical "weekly feedback" check-in above)
// ---------------------------------------------------------------------------

/** GET /api/feedback — Response: array, newest first */
export function getFeedbackList() {
  return request('/api/feedback');
}

/** POST /api/feedback — Body: feedback entry fields. Response: updated array */
export function submitFeedback(entry) {
  return request('/api/feedback', { method: 'POST', body: entry });
}

/** PATCH /api/feedback/:id — Body: { response }. Server should also set status
 * to "resolved". Response: updated array. */
export function respondToFeedback(id, response) {
  return request(`/api/feedback/${id}`, { method: 'PATCH', body: { response } });
}

// ---------------------------------------------------------------------------
// Audit log + admin notifications
// ---------------------------------------------------------------------------

/** GET /api/audit-log — Response: array, newest first (server should cap length, e.g. 300) */
export function getAuditLog() {
  return request('/api/audit-log');
}

/** POST /api/audit-log — Body: { action, actor, detail }. Response: updated array.
 * Most audit entries should be written by the server itself as a side effect
 * of the action they describe (booking, approvals, etc) rather than the
 * frontend calling this directly — kept here for the few admin-initiated ones. */
export function addAudit({ action, actor, detail }) {
  return request('/api/audit-log', { method: 'POST', body: { action, actor, detail } });
}

/** GET /api/admin/notifications — Response: array, newest first (server should cap, e.g. 100) */
export function getAdminNotifications() {
  return request('/api/admin/notifications');
}

/** PATCH /api/admin/notifications/:id/read — Response: updated array */
export function markNotificationRead(id) {
  return request(`/api/admin/notifications/${id}/read`, { method: 'PATCH' });
}

// ---------------------------------------------------------------------------
// User directory (Admin "User Management")
// ---------------------------------------------------------------------------

/** GET /api/users — Response: array of users */
export function getUserDirectory() {
  return request('/api/users');
}

/** POST /api/users — Body: user fields; server upserts by id. Response: updated array. */
export function upsertUser(user) {
  return request('/api/users', { method: 'POST', body: user });
}

/** PATCH /api/users/:id/status — Body: { status }. Server should also write an
 * audit log entry. Response: updated array. */
export function setUserStatus(id, status) {
  return request(`/api/users/${id}/status`, { method: 'PATCH', body: { status } });
}

/** DELETE /api/users/:id — Server should also write an audit log entry. Response: updated array. */
export function deleteUser(id) {
  return request(`/api/users/${id}`, { method: 'DELETE' });
}

// ---------------------------------------------------------------------------
// Therapist onboarding survey + admin approval gate
// ---------------------------------------------------------------------------

/** POST /api/therapists/:userId/survey — Body: survey fields.
 * Server should: upsert the therapist record with approvalStatus "pending",
 * upsert the user directory entry (role: therapist), notify admins, and
 * write an audit log entry. Response: the created/updated therapist record. */
export function submitTherapistSurvey(userId, survey) {
  return request(`/api/therapists/${userId}/survey`, { method: 'POST', body: survey });
}

/** GET /api/therapists/:userId/survey — the therapist's own sign-up survey
 * (age, gender, address, qualification, specialization, fee, bio). */
export function getTherapistSurvey(userId) {
  return request(`/api/therapists/${userId}/survey`);
}

/** GET /api/therapists/:userId/approval-status
 * Response: { status: 'not_submitted' | 'pending' | 'approved' | 'rejected' } */
export function getTherapistApprovalStatus(userId) {
  return request(`/api/therapists/${userId}/approval-status`).then((r) => r?.status || 'not_submitted');
}

/** PATCH /api/therapists/:id/approval — Body: { status }. Server should also
 * write an audit log entry and notify relevant admins. Response: updated therapist list. */
export function setTherapistApproval(id, status) {
  return request(`/api/therapists/${id}/approval`, { method: 'PATCH', body: { status } });
}

/** GET /api/therapist-surveys — admin only. Response: array of
 * { userId, ...surveyFields } — used to enrich the real therapist list with
 * qualification/experience/specializations they gave at sign-up. */
export function listTherapistSurveys() {
  return request('/api/therapist-surveys');
}

// ---------------------------------------------------------------------------
// Real admin endpoints — backed directly by Postgres (existing backend), the
// actual source of truth for isApproved/isProfileComplete. Anahat Admin uses
// these (not the public /api/therapists directory, which only ever returns
// *already-approved* therapists and so can never surface a pending one —
// that mismatch was the root cause of therapists not appearing for approval).
// ---------------------------------------------------------------------------

/** GET /api/admin/overview — Response: { stats: { patients, therapists,
 * pendingTherapists, appointments, revenue } } */
export function adminGetOverview() {
  return request('/api/admin/overview').then((r) => r.stats);
}

/** GET /api/admin/users?role=therapist|patient — ALL matching users
 * regardless of approval/profile-completion status, with their full
 * patientProfile/therapistProfile included. Response: array of users. */
export function adminListUsers(role) {
  return request(`/api/admin/users${role ? `?role=${role}` : ''}`).then((r) => r.users);
}

/** PATCH /api/admin/therapists/:id/approve — Body: { approved: boolean }.
 * Flips the therapist's real `isApproved` flag — the single source of truth
 * checked everywhere else (GET /api/auth/me, the public therapist directory,
 * booking eligibility). Response: { message }. */
export function adminApproveTherapist(id, approved) {
  return request(`/api/admin/therapists/${id}/approve`, { method: 'PATCH', body: { approved } });
}

/** PATCH /api/admin/users/:id/suspend — Body: { suspended: boolean }. Real,
 * enforced suspension (checked at login and on every authenticated request),
 * not a cosmetic flag. Response: { message }. */
export function adminSuspendUser(id, suspended) {
  return request(`/api/admin/users/${id}/suspend`, { method: 'PATCH', body: { suspended } });
}

/** DELETE /api/admin/users/:id */
export function adminDeleteUser(id) {
  return request(`/api/admin/users/${id}`, { method: 'DELETE' });
}

/** GET /api/admin/payments — Response: array of payments with patient/therapist names */
export function adminListPayments() {
  return request('/api/admin/payments').then((r) => r.payments);
}

/** GET /api/admin/system-info — live backend/system status: environment,
 * uptime, DB connection health, OAuth config presence, and account counts
 * by role. All values are checked in real time, nothing hardcoded. */
export function adminGetSystemInfo() {
  return request('/api/admin/system-info');
}

/** GET /api/admin/appointments — the real Postgres-backed appointments
 * (frontend-1's booking flow), distinct from getAppointments() which reads
 * frontend-2's own /api/bookings. Response: array of appointments. */
export function adminListAppointments() {
  return request('/api/admin/appointments').then((r) => r.appointments);
}

// ---------------------------------------------------------------------------
// Concern-based therapist assignment
// ---------------------------------------------------------------------------

/** GET /api/patients/:patientId/assigned-therapist — Response: therapist object | null */
export function getAssignedTherapist(patientId) {
  return request(`/api/patients/${patientId}/assigned-therapist`);
}

/** GET /api/patients/:patientId/current-therapist-id
 * Response: { therapistId: string } | null — derived from the patient's most
 * recent non-cancelled appointment. */
export function getCurrentTherapistId(patientId) {
  return request(`/api/patients/${patientId}/current-therapist-id`).then((r) => r?.therapistId || null);
}

/** POST /api/patients/:patientId/assign-therapist — Body: { therapistId }.
 * No-op if the patient is already assigned. Response: the assigned therapist object. */
export function assignTherapistDirect(patientId, therapistId) {
  return request(`/api/patients/${patientId}/assign-therapist`, { method: 'POST', body: { therapistId } });
}

/** POST /api/patients/:patientId/auto-assign-therapist — Body: { concern }.
 * Server should match against approved therapists' specializations, balance
 * caseload across ties, and write an audit log entry. No-op if the patient
 * is already assigned. Response: the assigned therapist object. */
export function assignTherapistForConcern(patientId, concern) {
  return request(`/api/patients/${patientId}/auto-assign-therapist`, { method: 'POST', body: { concern } });
}

/** PUT /api/patients/:patientId/reassign-therapist — Body: { therapistId }.
 * Unlike assignTherapistDirect, this overwrites an existing assignment.
 * Response: the newly assigned therapist object. */
export function reassignTherapist(patientId, therapistId) {
  return request(`/api/patients/${patientId}/reassign-therapist`, { method: 'PUT', body: { therapistId } });
}

// ---------------------------------------------------------------------------
// Daily activity check-ins
// ---------------------------------------------------------------------------

/** GET /api/patients/:patientId/activity-plan — Response: [{ id, text }, ...] */
export function getActivityPlan(patientId) {
  return request(`/api/patients/${patientId}/activity-plan`);
}

/** PUT /api/patients/:patientId/activity-plan — Body: { activities: [{id, text}] }.
 * Server should also write an audit log entry. Response: the saved activities array. */
export function setActivityPlan(patientId, activities) {
  return request(`/api/patients/${patientId}/activity-plan`, { method: 'PUT', body: { activities } });
}

/** GET /api/patients/:patientId/activity-log — Response: array of daily check-ins */
export function getActivityLog(patientId) {
  return request(`/api/patients/${patientId}/activity-log`);
}

/** POST /api/patients/:patientId/activity-log — Body: { responses }. Server should
 * upsert today's entry (one per day). Response: updated activity log array. */
export function submitActivityCheckIn(patientId, responses) {
  return request(`/api/patients/${patientId}/activity-log`, { method: 'POST', body: { responses } })
    .then((rows) => (rows || []).map((r) => ({ ...r, date: r.date || r.day })));
}

// ---------------------------------------------------------------------------
// Live session workspace
// ---------------------------------------------------------------------------

/** POST /api/sessions — Body: { therapistId, therapistName, patientId, patientName }.
 * Returns the patient's existing active session if one already exists.
 * Server should also write an audit log entry and notify admins.
 * Response: the session object. */
export function startSession(therapistId, therapistName, patientId, patientName) {
  return request('/api/sessions', { method: 'POST', body: { therapistId, therapistName, patientId, patientName } }).then(adaptSession);
}

// The LiveSession document stores `_id` and a boolean `active`; every page
// reads `id` and `status` ('active' | 'ended'). Normalise here, once, so
// joining / chatting / the admin "Live now" list all see the same shape.
export function adaptSession(s) {
  if (!s) return s;
  return { ...s, id: s.id || s._id, status: s.status || (s.active ? 'active' : 'ended') };
}

/** GET /api/sessions/:sessionId — Response: session object | null */
export function getSession(sessionId) {
  return request(`/api/sessions/${sessionId}`).then(adaptSession);
}

/** GET /api/sessions/active?patientId=... — Response: active session for that patient | null */
export function getActiveSessionForPatient(patientId) {
  return request(`/api/sessions/active?patientId=${encodeURIComponent(patientId)}`).then(adaptSession);
}

/** GET /api/sessions/active?therapistId=... — Response: active session for that therapist | null */
export function getActiveSessionForTherapist(therapistId) {
  return request(`/api/sessions/active?therapistId=${encodeURIComponent(therapistId)}`).then(adaptSession);
}

/** POST /api/sessions/:sessionId/messages — Body: { from, text }. Response: updated session. */
export function sendSessionMessage(sessionId, from, text) {
  return request(`/api/sessions/${sessionId}/messages`, { method: 'POST', body: { from, text } }).then(adaptSession);
}

/** POST /api/sessions/:sessionId/end — Server should also write an audit log entry.
 * Response: the updated (ended) session. */
export function endSession(sessionId) {
  return request(`/api/sessions/${sessionId}/end`, { method: 'POST' }).then(adaptSession);
}

/** GET /api/patients/:patientId/session-history — Response: array of ended sessions */
export function getSessionHistory(patientId) {
  return request(`/api/patients/${patientId}/session-history`).then((list) => (list || []).map(adaptSession));
}

/** GET /api/sessions — all sessions across every therapist/patient pair (admin use).
 * Response: array of session objects. */
export function getAllSessions() {
  return request('/api/sessions').then((list) => (list || []).map(adaptSession));
}

/** POST /api/sessions/:sessionId/ai-copilot — Body: { concern, question }.
 * This is the real AI copilot call — it replaces the old rule-based
 * generateAISuggestion() stand-in. The backend should call an actual model
 * here. Response: { answer: string } (also appended server-side to the
 * session's aiMessages, so the caller can just re-fetch the session, or use
 * the returned session if the endpoint echoes it back). */
export function askAICopilot(sessionId, concern, question) {
  return request(`/api/sessions/${sessionId}/ai-copilot`, { method: 'POST', body: { concern, question } });
}

// ---------------------------------------------------------------------------
// Patient notifications
// ---------------------------------------------------------------------------

/** GET /api/patients/:patientId/notifications — Response: array, newest first.
 * Notifications are created server-side as a side effect of other actions
 * (appointment booked/updated, message received, report approved, etc) —
 * there's intentionally no addPatientNotification() call here; the frontend
 * never creates these directly. */
export function getPatientNotifications(patientId) {
  return request(`/api/patients/${patientId}/notifications`);
}

/** PATCH /api/patients/:patientId/notifications/:id/read — Response: updated array */
export function markPatientNotificationRead(patientId, id) {
  return request(`/api/patients/${patientId}/notifications/${id}/read`, { method: 'PATCH' });
}

/** PATCH /api/patients/:patientId/notifications/read-all — Response: updated array */
export function markAllPatientNotificationsRead(patientId) {
  return request(`/api/patients/${patientId}/notifications/read-all`, { method: 'PATCH' });
}

// ---------------------------------------------------------------------------
// Messages (persistent patient <-> therapist conversation)
// ---------------------------------------------------------------------------

/** POST /api/conversations — Body: { patientId, patientName, therapistId, therapistName }.
 * Returns the existing conversation for that pair if one already exists.
 * Response: the conversation object. */
export function getOrCreateConversation(patientId, patientName, therapistId, therapistName) {
  return request('/api/conversations', { method: 'POST', body: { patientId, patientName, therapistId, therapistName } });
}

/** GET /api/patients/:patientId/conversations — Response: array, most recently updated first */
export function getConversationsForPatient(patientId) {
  return request(`/api/patients/${patientId}/conversations`);
}

/** GET /api/therapists/:therapistId/conversations — Response: array, most recently updated first */
export function getConversationsForTherapist(therapistId) {
  return request(`/api/therapists/${therapistId}/conversations`);
}

/** GET /api/conversations/:id — Response: conversation object | null */
export function getConversation(id) {
  return request(`/api/conversations/${id}`);
}

/** POST /api/conversations/:id/messages — Body: { from, text }. Server should
 * also notify the patient when `from === 'therapist'`. Response: updated conversation. */
export function sendConversationMessage(conversationId, from, text) {
  return request(`/api/conversations/${conversationId}/messages`, { method: 'POST', body: { from, text } });
}

/** PATCH /api/conversations/:id/read — Body: { reader }. Marks every message not
 * sent by `reader` as read. Response: updated conversation. */
export function markConversationRead(conversationId, reader) {
  return request(`/api/conversations/${conversationId}/read`, { method: 'PATCH', body: { reader } });
}

// ---------------------------------------------------------------------------
// Mood tracking
// ---------------------------------------------------------------------------

/** GET /api/patients/:patientId/mood-entries — Response: array, newest first */
export function getMoodEntries(patientId) {
  return request(`/api/patients/${patientId}/mood-entries`);
}

/** POST /api/patients/:patientId/mood-entries — Body: { mood, note }. Response: updated array */
export function addMoodEntry(patientId, { mood, note }) {
  return request(`/api/patients/${patientId}/mood-entries`, { method: 'POST', body: { mood, note: note || '' } });
}

// ---------------------------------------------------------------------------
// Appointment join window + session linkage
// ---------------------------------------------------------------------------

/** POST /api/appointments/:appointmentId/session — Body: { patientName }.
 * Returns the existing active session linked to this appointment if one
 * already exists, otherwise creates it. Response: the session object.
 * Note: the join-window math itself (getAppointmentSessionWindow,
 * parseAppointmentDateTime, canJoinAppointment) is pure client-side logic —
 * see src/utils/derived.js — and doesn't need a network call. */
export function getOrStartAppointmentSession(appointment, patientName) {
  return request(`/api/bookings/${appointment.id}/session`, { method: 'POST', body: { patientName } }).then(adaptSession);
}

// ---------------------------------------------------------------------------
// Patient onboarding (demographic + identity verification)
// ---------------------------------------------------------------------------

/** GET /api/patients/:patientId/onboarding
 * Response: { status, fields, identityProofFileName, identityProofUrl, rejectionReason, submittedAt } */
export function getPatientOnboarding(patientId) {
  return request(`/api/patients/${patientId}/onboarding`);
}

/** POST /api/patients/:patientId/onboarding — multipart/form-data: `fields` (JSON string)
 * plus the identity proof file under field "identityProof" (only present when
 * the patient is uploading/replacing it). Server stores the file (e.g. S3 or
 * equivalent) and returns its URL — no more data-URL-in-localStorage.
 * Server should also notify admins ("New patient verification request").
 * Response: the created/updated onboarding record. */
export function submitPatientOnboarding(patientId, patientName, fields, identityProofFile) {
  const formData = new FormData();
  formData.append('patientName', patientName || '');
  formData.append('fields', JSON.stringify(fields));
  if (identityProofFile) formData.append('identityProof', identityProofFile);
  return request(`/api/patients/${patientId}/onboarding`, { method: 'POST', body: formData, isFormData: true });
}

/** POST /api/profile/patient — the existing (frontend-1) demographic-completion
 * endpoint: stores age/gender/occupation/maritalStatus/disease/problemDescription
 * in Postgres, plus an optional profile photo and health report file, and flips
 * the account's `isProfileComplete` flag (which is what routes a returning
 * patient straight to their dashboard instead of back through onboarding).
 * Response: { user }. */
export function completePatientProfile(fields, avatarFile, healthReportFile) {
  const formData = new FormData();
  Object.entries(fields).forEach(([k, v]) => { if (v != null && v !== '') formData.append(k, v); });
  if (avatarFile) formData.append('avatar', avatarFile);
  if (healthReportFile) formData.append('healthReport', healthReportFile);
  return request('/api/profile/patient', { method: 'POST', body: formData, isFormData: true }).then((r) => r.user);
}

/** GET /api/onboarding/pending — Response: array, oldest first */
export function getPendingOnboardingRequests() {
  return request('/api/onboarding/pending');
}

/** POST /api/patients/:patientId/onboarding/approve — Server should also notify
 * the patient ("Account approved"). Response: the updated onboarding record. */
export function approvePatientOnboarding(patientId) {
  return request(`/api/patients/${patientId}/onboarding/approve`, { method: 'POST' });
}

/** POST /api/patients/:patientId/onboarding/reject — Body: { reason }. Server should
 * also notify the patient. Response: the updated onboarding record. */
export function rejectPatientOnboarding(patientId, reason) {
  return request(`/api/patients/${patientId}/onboarding/reject`, { method: 'POST', body: { reason } });
}

// ---------------------------------------------------------------------------
// ANAHAT assessment gateway (/api/anahat/*). Application-level contract only:
// the browser never sees engine sessions, Qdrant, embeddings or LLM details.
// ---------------------------------------------------------------------------
export const anahat = {
  health: () => request('/api/anahat/health'),
  reference: () => request('/api/anahat/reference'),
  getBaselines: (patientId) => request(`/api/anahat/patients/${patientId}/baseline`),
  recordBaseline: (patientId, body) => request(`/api/anahat/patients/${patientId}/baseline`, { method: 'POST', body }),
  listForPatient: (patientId) => request(`/api/anahat/patients/${patientId}/assessments`),
  listMine: () => request('/api/anahat/assessments'),
  create: (body) => request('/api/anahat/assessments', { method: 'POST', body }),
  get: (id) => request(`/api/anahat/assessments/${id}`),
  setBaseline: (id, body) => request(`/api/anahat/assessments/${id}/baseline`, { method: 'POST', body }),
  setContext: (id, context) => request(`/api/anahat/assessments/${id}/context`, { method: 'POST', body: { context } }),
  selectOpening: (id, set_id) => request(`/api/anahat/assessments/${id}/opening`, { method: 'POST', body: { set_id } }),
  analyseQuadrants: (id, current_issue) => request(`/api/anahat/assessments/${id}/quadrants/analyse`, { method: 'POST', body: { current_issue } }),
  selectQuadrants: (id, quadrants) => request(`/api/anahat/assessments/${id}/quadrants`, { method: 'POST', body: { quadrants } }),
  nextQuestions: (id, quadrant, limit = 1, deepDive = false) => request(`/api/anahat/assessments/${id}/questions/next?quadrant=${encodeURIComponent(quadrant)}&limit=${limit}&deep_dive=${deepDive}`),
  completeQuadrant: (id, quadrant) => request(`/api/anahat/assessments/${id}/quadrants/complete`, { method: 'POST', body: { quadrant } }),
  submitResponse: (id, body, signal) => request(`/api/anahat/assessments/${id}/responses`, { method: 'POST', body, signal }),
  acknowledgeSafety: (id, body) => request(`/api/anahat/assessments/${id}/safety/acknowledge`, { method: 'POST', body }),
  confirmCandidate: (id, candidateId, body) => request(`/api/anahat/assessments/${id}/candidates/${candidateId}/confirm`, { method: 'POST', body }),
  resolveEvidence: (id, evidenceId, body) => request(`/api/anahat/assessments/${id}/evidence/${evidenceId}/resolve`, { method: 'POST', body }),
  score: (id) => request(`/api/anahat/assessments/${id}/score`, { method: 'POST', body: {} }),
  decide: (id, stop) => request(`/api/anahat/assessments/${id}/decision`, { method: 'POST', body: { stop } }),
  recommendations: (id) => request(`/api/anahat/assessments/${id}/recommendations`, { method: 'POST', body: {} }),
  endSession: (id) => request(`/api/anahat/assessments/${id}/end`, { method: 'POST', body: {} }),
  draftPrescription: (id) => request(`/api/anahat/assessments/${id}/prescription/draft`, { method: 'POST', body: {} }),
  reviewPrescription: (id, body) => request(`/api/anahat/assessments/${id}/prescription/review`, { method: 'POST', body }),
  finalize: (id) => request(`/api/anahat/assessments/${id}/finalize`, { method: 'POST', body: {} }),
  finalReport: (id) => request(`/api/anahat/assessments/${id}/report`),
  // Nadika.AI — live-session assistant + post-session chakra scan
  suggestNext: (sessionId) => request(`/api/anahat/sessions/${sessionId}/suggest`, { method: 'POST', body: {} }),
  getScan: (sessionId) => request(`/api/anahat/sessions/${sessionId}/chakra-scan`),
  chakraScan: (sessionId, force = false) => request(`/api/anahat/sessions/${sessionId}/chakra-scan`, { method: 'POST', body: { force } }),
  sendReport: (body) => request('/api/anahat/reports/send', { method: 'POST', body }),
  // Offline session (Nadika.ai chat) persistence + online meeting links
  appendChat: (id, entries) => request(`/api/anahat/assessments/${id}/chat`, { method: 'POST', body: { entries } }),
  markAsked: (id, questionId) => request(`/api/anahat/assessments/${id}/asked`, { method: 'POST', body: { questionId } }),
  recordOffline: (id, body) => request(`/api/anahat/assessments/${id}/responses/offline`, { method: 'POST', body }),
  setMeetLink: (appointmentId, meetLink) => request(`/api/anahat/appointments/${appointmentId}/meet-link`, { method: 'PATCH', body: { meetLink } }).then((r) => r.appointment),
};
