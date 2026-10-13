# API Contract

This is the backend the frontend expects. It replaces `src/services/mockApi.js`
(deleted), which faked all of this in `localStorage` during frontend
development. `src/services/api.js` is now the single source of truth — every
function in that file calls exactly one of the endpoints below. If anything
here and the code in `api.js` ever disagree, trust `api.js` (it's the code
that actually runs) and treat this file as out of date.

**Auth is already real.** Login/register/`GET /auth/me` are already
implemented and wired up (see `src/hooks/usePatientSession.js`,
`src/context/AuthContext.jsx`, `src/pages/auth/Login.jsx`,
`src/pages/auth/Register.jsx`). This document only covers the *data*
endpoints — patients, appointments, sessions, messages, etc. — that used to
be faked.

**Auth header:** every request below is sent with `Authorization: Bearer <token>`
where `<token>` is whatever `POST /auth/login` returned, read from
`localStorage.getItem('token')`. This is the one legitimate use of
localStorage left in the app — it's the session token, not application data.

**Base URL:** `VITE_API_BASE_URL` env var, defaults to `http://localhost:3000`.

**Errors:** any non-2xx response is treated as a failure. If the body is JSON
with a `message` field, that message is surfaced to the UI — return
`{ "message": "human readable reason" }` on errors where you can.

---

## Side effects that used to be bundled into mock functions

These are called out here because they were previously silent side effects
inside a single JS function (e.g. booking an appointment also wrote a
notification and an audit log entry, all in the same call). Now that each
concern is a separate endpoint, **the server is responsible for orchestrating
these**, not the frontend:

- Booking an appointment (`POST /api/appointments`) should also: write an
  audit log entry, notify admins, and notify the patient.
- Updating an appointment's status (`PATCH /api/appointments/:id`) should
  notify the patient when status changes.
- Submitting an appointment request (`POST /api/appointment-requests`) should
  notify admins.
- Approving a therapy report (`POST /api/patients/:id/therapy-record/approve`)
  should snapshot the record into report history and notify the patient.
- A therapist survey submission (`POST /api/therapists/:id/survey`) should
  upsert the user directory entry and notify admins.
- Auto-assigning a therapist (`POST /api/patients/:id/auto-assign-therapist`)
  should match against approved therapists' specializations and write an
  audit log entry.
- Sending a conversation message as a therapist (`POST /api/conversations/:id/messages`)
  should notify the patient.
- Approving/rejecting patient onboarding should notify the patient.

## What's intentionally *not* here

A handful of things that lived in the old mock file are **not** endpoints,
because they're pure computation over data the frontend already has, or
static config that doesn't need a database table:

- **Derived stats** (streaks, weekly/monthly progress %, appointment
  join-window math, display-name fallback) — see `src/utils/derived.js`.
  These take already-fetched data as arguments; no network call needed.
- **Static option lists** (concern list, gender options, onboarding
  dropdowns, mood scale) — see `src/constants/options.js`. Fine to leave as
  shipped frontend constants; can be moved behind a `GET /api/config`
  endpoint later with no other frontend changes if you'd rather manage them
  centrally.
- The old rule-based `generateAISuggestion()` — kept only as a labeled demo
  fallback in `derived.js`. The real path is `POST /api/sessions/:id/ai-copilot`
  below, which should call an actual model.

---

## Patients — identity & profile

| Method | Path | Body | Response |
|---|---|---|---|
| POST | `/api/patients/:userId/patient-id` | — | `{ patientId, enrollmentDate }` (creates on first call, idempotent after) |
| GET | `/api/patients/:userId/patient-id` | — | `{ patientId, enrollmentDate }` \| `null` |
| GET | `/api/patients/:userId/subscription` | — | `{ status }` |
| PUT | `/api/patients/:userId/subscription` | `{ status }` | `{ status }` |
| GET | `/api/patients/:userId/profile` | — | profile object \| `null` |
| PUT | `/api/patients/:userId/profile` | partial profile (merged server-side) | full updated profile, `updatedAt` stamped |
| GET | `/api/patients/:userId/journey` | — | `{ journey }` \| `null` |
| PUT | `/api/patients/:userId/journey` | `{ journey }` | `{ journey }` |

## Relaxation sessions & documents

| Method | Path | Body | Response |
|---|---|---|---|
| POST | `/api/patients/:userId/relaxation-sessions` | session fields | updated sessions array |
| GET | `/api/patients/:userId/documents` | — | documents array |
| POST | `/api/patients/:userId/documents` | multipart: file + metadata | updated documents array |

## Music — tracks, selection, history

| Method | Path | Body | Response |
|---|---|---|---|
| GET | `/api/tracks` | — | `[{ id, index, name, colors: [hex, hex] }, ...]` |
| GET | `/api/patients/:userId/track-selection` | — | `{ trackIds, selectedAt }` \| `null` (24h lock computed client-side) |
| POST | `/api/patients/:userId/track-selection` | `{ trackIds }` | `{ trackIds, selectedAt }` (archive previous selection into history first) |
| GET | `/api/patients/:userId/track-history` | — | array of past selections |

## Therapists — directory, availability, blocked dates

| Method | Path | Body | Response |
|---|---|---|---|
| GET | `/api/therapists` | — | array of therapist objects |
| PUT | `/api/therapists` | `{ therapists: [...] }` | full array — transitional bulk endpoint, prefer PATCH below for new work |
| PUT | `/api/therapists/:id/availability` | `{ availability: [...] }` | updated therapist object |
| GET | `/api/therapists/:id/blocked-dates` | — | `string[]` (YYYY-MM-DD) |
| PUT | `/api/therapists/:id/blocked-dates` | `{ dates: string[] }` | `string[]` |

## Appointment requests

| Method | Path | Body | Response |
|---|---|---|---|
| GET | `/api/appointment-requests` | — | array of requests |
| POST | `/api/appointment-requests` | request fields | created request |
| PATCH | `/api/appointment-requests/:id` | partial patch | updated request |

## Appointments

| Method | Path | Body | Response |
|---|---|---|---|
| GET | `/api/appointments` | — | array of appointments |
| POST | `/api/appointments` | appointment fields | created appointment |
| PATCH | `/api/appointments/:id` | partial patch (e.g. `{ status }`) | updated appointment |
| POST | `/api/appointments/:appointmentId/session` | `{ patientName }` | session object (creates or returns existing active session for this appointment) |

## Weekly feedback

| Method | Path | Body | Response |
|---|---|---|---|
| GET | `/api/patients/:patientId/weekly-feedback` | — | array, most recent last |
| POST | `/api/patients/:patientId/weekly-feedback` | feedback entry | updated array |

## Clinical records & report history

| Method | Path | Body | Response |
|---|---|---|---|
| GET | `/api/patients/:patientId/therapy-record` | — | record \| `null` |
| PUT | `/api/patients/:patientId/therapy-record` | partial record | full updated record |
| POST | `/api/patients/:patientId/therapy-record/approve` | `{ approvedBy }` | updated record |
| GET | `/api/patients/:patientId/report-history` | — | array of report snapshots |
| POST | `/api/patients/:patientId/report-history` | report fields | updated array |
| PATCH | `/api/patients/:patientId/report-history/:reportId` | partial updates | updated array |

## Listening log (music therapy progress)

| Method | Path | Body | Response |
|---|---|---|---|
| GET | `/api/patients/:userId/listening-log` | — | array of logged sessions |
| POST | `/api/patients/:userId/listening-log` | `{ trackName, durationSeconds, qualified }` | updated array |

## Site feedback (bug/feature reports — separate from weekly clinical feedback above)

| Method | Path | Body | Response |
|---|---|---|---|
| GET | `/api/feedback` | — | array, newest first |
| POST | `/api/feedback` | feedback entry | updated array |
| PATCH | `/api/feedback/:id` | `{ response }` | updated array (also set status to "resolved") |

## Audit log & admin notifications

| Method | Path | Body | Response |
|---|---|---|---|
| GET | `/api/audit-log` | — | array, newest first (cap ~300) |
| POST | `/api/audit-log` | `{ action, actor, detail }` | updated array |
| GET | `/api/admin/notifications` | — | array, newest first (cap ~100) |
| PATCH | `/api/admin/notifications/:id/read` | — | updated array |

## User directory (admin "User Management")

| Method | Path | Body | Response |
|---|---|---|---|
| GET | `/api/users` | — | array of users |
| POST | `/api/users` | user fields | updated array (upsert by id) |
| PATCH | `/api/users/:id/status` | `{ status }` | updated array |
| DELETE | `/api/users/:id` | — | updated array |

## Therapist onboarding survey & approval

| Method | Path | Body | Response |
|---|---|---|---|
| POST | `/api/therapists/:userId/survey` | survey fields | created/updated therapist record (approvalStatus: "pending") |
| GET | `/api/therapists/:userId/approval-status` | — | `{ status: 'not_submitted'\|'pending'\|'approved'\|'rejected' }` |
| PATCH | `/api/therapists/:id/approval` | `{ status }` | updated therapist list |

## Concern-based therapist assignment

| Method | Path | Body | Response |
|---|---|---|---|
| GET | `/api/patients/:patientId/assigned-therapist` | — | therapist \| `null` |
| GET | `/api/patients/:patientId/current-therapist-id` | — | `{ therapistId }` \| `null` |
| POST | `/api/patients/:patientId/assign-therapist` | `{ therapistId }` | assigned therapist (no-op if already assigned) |
| POST | `/api/patients/:patientId/auto-assign-therapist` | `{ concern }` | assigned therapist (no-op if already assigned) |
| PUT | `/api/patients/:patientId/reassign-therapist` | `{ therapistId }` | newly assigned therapist (overwrites existing) |

## Daily activity check-ins

| Method | Path | Body | Response |
|---|---|---|---|
| GET | `/api/patients/:patientId/activity-plan` | — | `[{ id, text }, ...]` |
| PUT | `/api/patients/:patientId/activity-plan` | `{ activities: [...] }` | saved activities array |
| GET | `/api/patients/:patientId/activity-log` | — | array of daily check-ins |
| POST | `/api/patients/:patientId/activity-log` | `{ responses }` | updated array (upsert today's entry) |

## Live session workspace

| Method | Path | Body | Response |
|---|---|---|---|
| POST | `/api/sessions` | `{ therapistId, therapistName, patientId, patientName }` | session (returns existing active session if one exists) |
| GET | `/api/sessions/:sessionId` | — | session \| `null` |
| GET | `/api/sessions/active?patientId=` | — | active session for that patient \| `null` |
| GET | `/api/sessions/active?therapistId=` | — | active session for that therapist \| `null` |
| POST | `/api/sessions/:sessionId/messages` | `{ from, text }` | updated session |
| POST | `/api/sessions/:sessionId/end` | — | updated (ended) session |
| GET | `/api/patients/:patientId/session-history` | — | array of ended sessions |
| GET | `/api/sessions` | — | all sessions, admin use |
| POST | `/api/sessions/:sessionId/ai-copilot` | `{ concern, question }` | `{ answer }` — **calls a real model**, replaces the old rule-based stand-in |

## Patient notifications

| Method | Path | Body | Response |
|---|---|---|---|
| GET | `/api/patients/:patientId/notifications` | — | array, newest first |
| PATCH | `/api/patients/:patientId/notifications/:id/read` | — | updated array |
| PATCH | `/api/patients/:patientId/notifications/read-all` | — | updated array |

## Messages (persistent patient ↔ therapist conversation)

| Method | Path | Body | Response |
|---|---|---|---|
| POST | `/api/conversations` | `{ patientId, patientName, therapistId, therapistName }` | conversation (returns existing if one exists for that pair) |
| GET | `/api/patients/:patientId/conversations` | — | array, most recently updated first |
| GET | `/api/conversations/:id` | — | conversation \| `null` |
| POST | `/api/conversations/:id/messages` | `{ from, text }` | updated conversation |
| PATCH | `/api/conversations/:id/read` | `{ reader }` | updated conversation (marks messages not from `reader` as read) |

## Mood tracking

| Method | Path | Body | Response |
|---|---|---|---|
| GET | `/api/patients/:patientId/mood-entries` | — | array, newest first |
| POST | `/api/patients/:patientId/mood-entries` | `{ mood, note }` | updated array |

## Patient onboarding (demographics + identity verification)

| Method | Path | Body | Response |
|---|---|---|---|
| GET | `/api/patients/:patientId/onboarding` | — | `{ status, fields, identityProofFileName, identityProofUrl, rejectionReason, submittedAt }` |
| POST | `/api/patients/:patientId/onboarding` | multipart: `patientName`, `fields` (JSON string), optional `identityProof` file | created/updated onboarding record — store the file (S3 or equivalent) and return its URL |
| GET | `/api/onboarding/pending` | — | array, oldest first |
| POST | `/api/patients/:patientId/onboarding/approve` | — | updated record |
| POST | `/api/patients/:patientId/onboarding/reject` | `{ reason }` | updated record |
