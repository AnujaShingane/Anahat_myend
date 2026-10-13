// ---------------------------------------------------------------------------
// phone.js
//
// Shared contact-number validation for patients and therapists.
//
// Historically this only accepted a bare 10-digit Indian mobile number
// (starting 6-9). Anahat now serves foreign clients and therapists too, so
// a number can be:
//   - a 10-digit Indian mobile (6-9 start), optionally prefixed +91/0, or
//   - an international number: optional leading "+", country code, and a
//     total of 8-15 digits (per the ITU E.164 max length), which is how
//     virtually every country's numbers fit.
// ---------------------------------------------------------------------------

const INDIA_MOBILE = /^[6-9]\d{9}$/;
const INTERNATIONAL = /^\+?\d{8,15}$/;

/**
 * Strips spaces, hyphens and parens for validation/storage purposes.
 */
export function normalizePhone(raw) {
  return String(raw || '').trim().replace(/[\s\-()]/g, '');
}

/**
 * Returns null if the phone number is valid, or a user-facing error string.
 */
export function validatePhone(raw) {
  const value = normalizePhone(raw);
  if (!value) return 'Phone number is required.';

  const indianCandidate = value.replace(/^\+91/, '').replace(/^0/, '');
  if (INDIA_MOBILE.test(indianCandidate)) return null;

  // Foreign client/therapist number: allow a leading + and 8-15 digits total,
  // which covers every country's number length without forcing a 10-digit
  // Indian-only format on them.
  if (INTERNATIONAL.test(value)) return null;

  return 'Enter a valid mobile number (10-digit Indian number, or an international number with country code).';
}

export function isValidPhone(raw) {
  return validatePhone(raw) === null;
}
