// ---------------------------------------------------------------------------
// time.js
//
// All therapy sessions run on India Standard Time (IST, UTC+5:30) — the
// therapists are India-based — but patients can be booking from anywhere in
// the world. Two rules follow from that:
//
// 1. Any wall-clock time a therapist sets as availability ("Mon 10:00") or a
//    patient books ("2026-08-05 14:00") means that time IN IST, not in
//    whichever timezone the browser that typed it happens to be in.
// 2. Any time shown back to a user — patient or therapist, wherever they
//    are — must always be *displayed* in IST too, so "4:00 PM" always means
//    the same real moment to everyone looking at it.
//
// slotToDate() (src/pages/therapist/scheduleUtils.js) uses istWallTimeToDate
// below to build the underlying Date correctly; the formatIST* helpers here
// are for turning that Date back into a display string.
// ---------------------------------------------------------------------------

export const IST_OFFSET_MINUTES = 5 * 60 + 30;

/** Build the real Date (UTC instant) for a wall-clock time expressed in IST. */
export function istWallTimeToDate(year, monthIndex, day, hours, minutes) {
  return new Date(Date.UTC(year, monthIndex, day, hours, minutes) - IST_OFFSET_MINUTES * 60000);
}

/** Read a Date's wall-clock date/time AS SEEN in IST (independent of the
 * viewer's own system timezone). */
export function getISTParts(date) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Kolkata',
    year: 'numeric', month: 'numeric', day: 'numeric',
    hour: 'numeric', minute: 'numeric', second: 'numeric',
    weekday: 'short', hour12: false,
  }).formatToParts(date);
  const get = (type) => parts.find((p) => p.type === type)?.value;
  return {
    year: Number(get('year')),
    month: Number(get('month')), // 1-12
    day: Number(get('day')),
    hour: Number(get('hour')) % 24,
    minute: Number(get('minute')),
    weekday: get('weekday'), // "Mon", "Tue", ...
  };
}

/** "22 May 2025, Thursday" */
export function formatISTDate(date) {
  if (!date) return '';
  return new Intl.DateTimeFormat('en-IN', {
    timeZone: 'Asia/Kolkata', day: 'numeric', month: 'long', year: 'numeric', weekday: 'long',
  }).format(date);
}

/** "04:00 PM IST" */
export function formatISTTime(date) {
  if (!date) return '';
  const time = new Intl.DateTimeFormat('en-IN', {
    timeZone: 'Asia/Kolkata', hour: 'numeric', minute: '2-digit', hour12: true,
  }).format(date);
  return `${time} IST`;
}

/** "22 May 2025, Thursday · 04:00 PM IST" */
export function formatISTDateTime(date) {
  if (!date) return '';
  return `${formatISTDate(date)} \u00B7 ${formatISTTime(date)}`;
}

/** "04:00 PM" (no IST suffix, no date) — for compact list rows where the
 * "IST" label is shown once for the whole list instead of per-row. */
export function formatISTTimeShort(date) {
  if (!date) return '';
  return new Intl.DateTimeFormat('en-IN', {
    timeZone: 'Asia/Kolkata', hour: 'numeric', minute: '2-digit', hour12: true,
  }).format(date);
}
