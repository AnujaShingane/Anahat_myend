// ---------------------------------------------------------------------------
// feelingScale.js
//
// The "I feel ___" self-report scale used across Before-Session Feedback,
// After-Session Feedback, Relaxation-session feedback, and the Weekly
// Feedback form. Modeled on a standard state-anxiety style checklist: a
// bank of 20 statements, of which any 5 are shown per submission, each
// rated on the same 4-point scale.
// ---------------------------------------------------------------------------

export const FEELING_STATEMENTS = [
  'I feel calm',
  'I feel secure',
  'I feel tense',
  'I feel strained',
  'I feel at ease',
  'I feel upset',
  'I am presently worrying over possible misfortunes',
  'I feel satisfied',
  'I feel frightened',
  'I feel uncomfortable',
  'I feel self-confident',
  'I feel nervous',
  'I feel jittery',
  'I feel indecisive',
  'I am relaxed',
  'I feel content',
  'I am worried',
  'I feel confused',
  'I feel steady',
  'I feel pleasant',
];

export const FEELING_SCALE = [
  { value: 1, label: 'Not at all' },
  { value: 2, label: 'A little' },
  { value: 3, label: 'Somewhat' },
  { value: 4, label: 'Very Much So' },
];

/**
 * Deterministically picks 5 statements for a given session/patient so the
 * same instance of a form always shows the same 5 statements (e.g. if the
 * patient reloads mid-form), while still varying across sessions/patients.
 * Falls back to the first 5 statements when no seed is given.
 */
export function pickFiveStatements(seed) {
  if (!seed) return FEELING_STATEMENTS.slice(0, 5);
  let h = 0;
  const str = String(seed);
  for (let i = 0; i < str.length; i += 1) {
    h = (h * 31 + str.charCodeAt(i)) >>> 0;
  }
  const pool = [...FEELING_STATEMENTS];
  const picked = [];
  for (let i = 0; i < 5 && pool.length; i += 1) {
    h = (h * 1103515245 + 12345) >>> 0;
    const idx = h % pool.length;
    picked.push(pool.splice(idx, 1)[0]);
  }
  return picked;
}
