// ---------------------------------------------------------------------------
// Shared scheduling helpers for the Therapist Portal + patient booking flow.
//
// Appointment "slots" in this codebase come in two shapes depending on how
// they were booked (see api.bookAppointment / TherapistPortal availability
// picker):
//   "Mon 10:00"        — a recurring weekly availability slot
//   "2026-08-05 14:00"  — an explicit date + time (patient's preferred slot)
// Both need to resolve to a concrete upcoming Date so the dashboard can sort
// sessions chronologically and gate the "Join Session" button.
//
// Every wall-clock time here means IST (India Standard Time) — therapists
// are India-based, and patients can be booking from anywhere in the world —
// so these are resolved against IST, not the browser's own timezone. See
// src/utils/time.js for the underlying conversion + display formatting.
// ---------------------------------------------------------------------------

import { getISTParts, istWallTimeToDate, formatISTDate, formatISTTime } from '../../utils/time';

const WEEKDAY_INDEX = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };

export function slotToDate(slot) {
  if (!slot || typeof slot !== 'string') return null;
  const trimmed = slot.trim();

  if (/^\d{4}-\d{2}-\d{2}/.test(trimmed)) {
    const m = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})/);
    if (!m) return null;
    const [, y, mo, d, hh, mm] = m;
    return istWallTimeToDate(Number(y), Number(mo) - 1, Number(d), Number(hh), Number(mm));
  }

  const match = trimmed.match(/^(Mon|Tue|Wed|Thu|Fri|Sat|Sun)\s+(\d{1,2}):(\d{2})$/);
  if (!match) return null;
  const [, day, hh, mm] = match;

  // "Today" and "this weekday" are evaluated against the current date *in
  // IST*, not the viewer's own timezone — otherwise a patient far enough
  // west/east of India could see a session land on the wrong day.
  const nowIST = getISTParts(new Date());
  let diff = (WEEKDAY_INDEX[day] - WEEKDAY_INDEX[nowIST.weekday] + 7) % 7;
  const candidate = istWallTimeToDate(nowIST.year, nowIST.month - 1, nowIST.day + diff, Number(hh), Number(mm));
  if (diff === 0 && candidate.getTime() < Date.now()) {
    return istWallTimeToDate(nowIST.year, nowIST.month - 1, nowIST.day + 7, Number(hh), Number(mm));
  }
  return candidate;
}

export function minutesUntil(date) {
  if (!date) return Infinity;
  return (date.getTime() - Date.now()) / 60000;
}

// Opens 5 minutes before the scheduled time and stays open for 60 minutes
// after, so a therapist can still join a session already in progress.
export function isJoinable(date, { openBeforeMin = 5, staysOpenMin = 60 } = {}) {
  if (!date) return false;
  const mins = minutesUntil(date);
  return mins <= openBeforeMin && mins >= -staysOpenMin;
}

export function formatCountdown(date) {
  if (!date) return '';
  const mins = Math.round(minutesUntil(date));
  if (mins <= 0) return 'In progress';
  if (mins < 60) return `In ${mins} min`;
  const hrs = Math.floor(mins / 60);
  const rem = mins % 60;
  return rem === 0 ? `In ${hrs}h` : `In ${hrs}h ${rem}m`;
}

export function formatDateTime(date) {
  if (!date) return '';
  const nowIST = getISTParts(new Date());
  const dIST = getISTParts(date);
  const sameDay = nowIST.year === dIST.year && nowIST.month === dIST.month && nowIST.day === dIST.day;
  const time = formatISTTime(date);
  if (sameDay) return `Today, ${time}`;
  return `${formatISTDate(date).split(',')[0]}, ${time}`;
}

export function timeAgo(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  const diffMs = Date.now() - d.getTime();
  const mins = Math.round(diffMs / 60000);
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.round(hrs / 24);
  if (days < 7) return `${days}d ago`;
  return d.toLocaleDateString([], { month: 'short', day: 'numeric' });
}