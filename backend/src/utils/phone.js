// ---------------------------------------------------------------------------
// phone.js
//
// Contact-number validation shared across controllers. Accepts a 10-digit
// Indian mobile number (6-9 start, optionally prefixed +91/0) OR an
// international number: optional leading "+", 8-15 digits total (E.164 max
// length), so foreign clients and therapists aren't forced into the Indian
// 10-digit format.
// ---------------------------------------------------------------------------

const INDIA_MOBILE = /^[6-9]\d{9}$/;
const INTERNATIONAL = /^\+?\d{8,15}$/;

export function isValidPhone(raw) {
  const value = String(raw || '').trim().replace(/[\s\-()]/g, '');
  if (!value) return false;

  const indianCandidate = value.replace(/^\+91/, '').replace(/^0/, '');
  if (INDIA_MOBILE.test(indianCandidate)) return true;

  return INTERNATIONAL.test(value);
}
