// ---------------------------------------------------------------------------
// derived.js
//
// Pure functions — no localStorage, no network calls. These compute derived
// values (streaks, progress percentages, appointment join windows, display
// name fallback) from data the caller already has in memory, usually
// because it just fetched that data from src/services/api.js.
//
// These were bundled inside mockApi.js before; they're pulled out here
// because they were never actually part of the fake backend — they're
// ordinary client-side logic that stays exactly the same after a real
// backend is connected. The only thing that changes is where the raw data
// (listening log, activity log, etc) comes from: api.js instead of
// localStorage.
// ---------------------------------------------------------------------------

function toDateStr(d) {
  return d.toISOString().slice(0, 10);
}

// --- Music-listening progress -----------------------------------------

/** Pass the array returned by api.getListeningLog(userId). */
export function getProgressSummary(log) {
  const qualified = (log || []).filter((s) => s.qualified);
  const qualifyingDates = [...new Set(qualified.map((s) => s.date))].sort();

  const today = new Date();
  let streak = 0;
  let cursor = new Date(today);
  const dateSet = new Set(qualifyingDates);
  if (!dateSet.has(toDateStr(cursor))) cursor.setDate(cursor.getDate() - 1);
  while (dateSet.has(toDateStr(cursor))) {
    streak += 1;
    cursor.setDate(cursor.getDate() - 1);
  }

  const last7 = [...Array(7)].map((_, i) => {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    return toDateStr(d);
  });
  const weeklyCompleted = last7.filter((d) => dateSet.has(d)).length;

  const monthPrefix = toDateStr(today).slice(0, 7);
  const daysElapsedThisMonth = today.getDate();
  const monthlyCompleted = qualifyingDates.filter((d) => d.startsWith(monthPrefix)).length;

  return {
    totalSessionsCompleted: (log || []).length,
    streak,
    weeklyCompleted,
    weeklyTarget: 7,
    monthlyCompleted,
    daysElapsedThisMonth,
    percentComplete: Math.round((weeklyCompleted / 7) * 100),
    qualifyingDates,
    todayQualified: dateSet.has(toDateStr(today)),
  };
}

// --- Display identity ---------------------------------------------------

/** Pass the user object from AuthContext and the profile from api.getProfile(user.id). */
export function getDisplayName(user, profile) {
  if (!user) return '';
  return profile?.fullName || user.name || (user.email ? user.email.split('@')[0] : 'Member');
}

/** Pass the user object from AuthContext and the profile from api.getProfile(user.id). */
export function getAvatarUrl(user, profile) {
  if (!user) return null;
  return profile?.avatarUrl || user.picture || null;
}

// --- Weekly feedback due date --------------------------------------------

/** Pass the array from api.getWeeklyFeedback(patientId). */
export function isWeeklyFeedbackDue(list) {
  if (!list || list.length === 0) return true;
  const last = new Date(list[list.length - 1].createdAt || list[list.length - 1].submittedAt);
  return Date.now() - last.getTime() >= 7 * 24 * 60 * 60 * 1000;
}

// --- Daily activity check-ins --------------------------------------------

/** Pass the array from api.getActivityLog(patientId). */
export function isActivityCheckInDoneToday(log) {
  const today = toDateStr(new Date());
  return (log || []).some((e) => e.date === today);
}

/** Pass the array from api.getActivityLog(patientId). */
export function getActivityProgressSummary(log) {
  const qualifies = (entry) => {
    const vals = Object.values(entry.responses || {});
    return vals.length > 0 && vals.every(Boolean);
  };
  const dateSet = new Set((log || []).filter(qualifies).map((e) => e.date));

  let streak = 0;
  let cursor = new Date();
  if (!dateSet.has(toDateStr(cursor))) cursor.setDate(cursor.getDate() - 1);
  while (dateSet.has(toDateStr(cursor))) {
    streak += 1;
    cursor.setDate(cursor.getDate() - 1);
  }

  const last7 = [...Array(7)].map((_, i) => {
    const d = new Date();
    d.setDate(d.getDate() - i);
    return toDateStr(d);
  });

  return {
    streak,
    weeklyCompleted: last7.filter((d) => dateSet.has(d)).length,
    weeklyTarget: 7,
    totalCheckIns: (log || []).length,
  };
}

// --- Mood tracking ---------------------------------------------------------

/** Pass the array from api.getMoodEntries(patientId). */
export function hasLoggedMoodToday(entries) {
  const today = toDateStr(new Date());
  return (entries || []).some((e) => (e.loggedAt || '').slice(0, 10) === today);
}

// --- Appointment join window ----------------------------------------------

export function parseAppointmentDateTime(appointment) {
  if (appointment?.scheduledAt) {
    const d = new Date(appointment.scheduledAt);
    return isNaN(d.getTime()) ? null : d;
  }
  if (appointment?.date && appointment?.startTime) {
    const d = new Date(`${appointment.date}T${appointment.startTime}:00+05:30`);
    return isNaN(d.getTime()) ? null : d;
  }
  // Legacy slots stored as free text (e.g. "Mon 10:00") carry no absolute
  // date, so a join window can't be computed for them.
  return null;
}

export function isAppointmentPast(appointment, now = new Date()) {
  const startsAt = parseAppointmentDateTime(appointment);
  return Boolean(startsAt && startsAt <= now);
}

export function getAppointmentSessionWindow(appointment) {
  const dt = parseAppointmentDateTime(appointment);
  if (!dt) return { opensAt: null, closesAt: null };
  // Joinable from 5 minutes before the slot until the slot's end time
  // (e.g. a 12:00–13:00 booking can be joined any time until 13:00).
  const opensAt = new Date(dt.getTime() - 5 * 60 * 1000);
  let closesAt = new Date(dt.getTime() + 60 * 60 * 1000);
  if (appointment.endTime && appointment.date) {
    const end = new Date(`${appointment.date}T${appointment.endTime}:00+05:30`);
    if (!Number.isNaN(end.getTime())) closesAt = end;
  }
  return { opensAt, closesAt, startsAt: dt };
}

export function canJoinAppointment(appointment, now = new Date()) {
  if (!appointment || appointment.status === 'cancelled') return false;
  const { opensAt, closesAt } = getAppointmentSessionWindow(appointment);
  if (!opensAt || !closesAt) return false;
  return now >= opensAt && now <= closesAt;
}

// --- Music track selection lock window --------------------------------

/** Pass the object returned by api.getTrackSelection(userId). Adds the
 * derived `locked`/`unlockAt` fields (24h after selectedAt) that used to be
 * computed inside the mock store. */
export function getTrackSelectionMeta(selection) {
  if (!selection) return null;
  const unlockAt = new Date(selection.selectedAt).getTime() + 24 * 60 * 60 * 1000;
  return { ...selection, locked: Date.now() < unlockAt, unlockAt };
}

// --- AI copilot demo fallback ----------------------------------------------
//
// NOTE: this rule-based question bank is a DEMO fallback only. The real
// path is api.askAICopilot(sessionId, concern, question), which calls a
// real model on the backend. This function is kept only so the therapist
// live-session UI has something to show if that endpoint isn't wired up
// yet — it should be deleted once askAICopilot is live.

const AI_QUESTION_BANK = {
  Anxiety: [
    'Ask what specific situations trigger their anxiety most.',
    'Explore their current coping strategies - what has helped before?',
    "Check on this week's sleep and caffeine intake.",
  ],
  Depression: [
    'Ask about changes in appetite or energy over the past two weeks.',
    'Gently explore their support system - who do they talk to?',
    'Screen for hopelessness carefully and kindly.',
  ],
  'Stress & Burnout': [
    'Ask what their workload has looked like recently.',
    'Explore boundaries - are they able to switch off after work?',
    'Ask what recovery activities they still enjoy.',
  ],
  'Sleep Issues': [
    'Ask about their bedtime routine and screen use before sleep.',
    'Explore whether racing thoughts keep them awake.',
    'Check caffeine and alcohol timing relative to bedtime.',
  ],
  'Relationship & Family': [
    'Ask them to describe a recent disagreement, in their own words.',
    'Explore communication patterns at home.',
    'Ask what support they wish they had from family right now.',
  ],
  'Trauma & PTSD': [
    'Move gently - ask only what they feel ready to share.',
    'Check for flashbacks, avoidance, or hypervigilance this week.',
    'Reinforce grounding techniques before going deeper.',
  ],
  'Grief & Loss': [
    'Ask them to share a memory of the person or thing they lost.',
    'Explore how grief is showing up physically this week.',
    'Check who is supporting them through this.',
  ],
  'Addiction Recovery': [
    'Ask about triggers encountered since the last session.',
    'Explore what is working in their support network.',
    'Check in on any recent cravings or close calls, without judgment.',
  ],
  'Anger Management': [
    'Ask about the last moment they felt anger rising - what preceded it?',
    'Explore physical warning signs they notice before losing control.',
    'Discuss one grounding technique to try before reacting next time.',
  ],
  'General Wellness': [
    'Ask what a good day currently looks like for them.',
    'Explore what small habit they want to build this week.',
    'Check how they are feeling about their progress so far.',
  ],
};

export function generateAISuggestion(concern, lastPatientMessage) {
  const bank = AI_QUESTION_BANK[concern] || AI_QUESTION_BANK['General Wellness'];
  const pick = bank[Math.floor(Math.random() * bank.length)];
  if (lastPatientMessage) {
    const trimmed = lastPatientMessage.length > 60 ? `${lastPatientMessage.slice(0, 60)}...` : lastPatientMessage;
    return `Based on what the patient just said ("${trimmed}"), consider: ${pick}`;
  }
  return `To start: ${pick}`;
}
