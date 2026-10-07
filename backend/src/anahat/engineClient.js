// Thin HTTP client for the ANAHAT AI Engine (FastAPI). The engine is a
// separate service; the Node backend is the only thing allowed to talk to
// it — the browser never reaches it directly.
const ENGINE_URL = (process.env.AI_ENGINE_URL || 'http://localhost:8000').replace(/\/$/, '');
const TIMEOUT_MS = Number(process.env.AI_ENGINE_TIMEOUT_MS || 120000);

export class EngineError extends Error {
  constructor(message, status = 502, detail = null) {
    super(message);
    this.status = status;
    this.detail = detail;
  }
}

async function call(method, path, { body, query } = {}) {
  const url = new URL(ENGINE_URL + path);
  Object.entries(query || {}).forEach(([k, v]) => { if (v !== undefined && v !== null && v !== '') url.searchParams.set(k, String(v)); });
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  let res;
  try {
    res = await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: ctrl.signal,
    });
  } catch (err) {
    clearTimeout(timer);
    throw new EngineError(`AI engine unreachable at ${ENGINE_URL} (${err.name === 'AbortError' ? 'timeout' : err.message})`, 503);
  }
  clearTimeout(timer);
  const text = await res.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = { raw: text }; }
  if (!res.ok) {
    const detail = data?.detail ?? data;
    const msg = typeof detail === 'string' ? detail : `AI engine error (${res.status})`;
    const err = new EngineError(msg, res.status >= 500 ? 502 : res.status, detail);
    // The engine keeps sessions in memory: after an engine restart every
    // session id is unknown. Flag it so the service can mark the record.
    err.sessionLost = /session not found/i.test(msg);
    // Provider/infra not configured (no Gemini key, Qdrant down, model missing)
    err.infrastructure = /GEMINI_API_KEY|MISTRAL_API_KEY|qdrant|embedding|LLM provider|retriever|not configured/i.test(msg);
    throw err;
  }
  return data;
}

export const engine = {
  url: ENGINE_URL,
  health: () => call('GET', '/health'),
  reference: () => call('GET', '/chakra/reference'),
  createSession: (body) => call('POST', '/assessment/sessions', { body }),
  baseline: (sid, body) => call('POST', `/assessment/sessions/${sid}/baseline`, { body }),
  // Opening questions ALWAYS come from the engine (KB assessments folder). No style => the list of styles.
  openingStyles: () => call('GET', '/assessment/opening-styles'),
  opening: (sid, style) => call('GET', `/assessment/sessions/${sid}/opening-questions`, { query: { style } }),
  skipOpening: (sid) => call('POST', `/assessment/sessions/${sid}/opening-skip`),
  suggestQuestion: (body) => call('POST', '/assessment/kb/suggest-question', { body }),
  nextQuestions: (sid, quadrant, limit, deepDive = false) => call('GET', `/assessment/sessions/${sid}/questions/next`, { query: { quadrant, limit, deep_dive: deepDive } }),
  completeQuadrant: (sid, quadrant) => call('POST', `/assessment/sessions/${sid}/quadrants/complete`, { body: { quadrant } }),
  deepDive: (sid, stop) => call('GET', `/assessment/sessions/${sid}/deep-dive`, { query: { stop: stop ? 'true' : undefined } }),
  deepDiveAnswer: (sid, body) => call('POST', `/assessment/sessions/${sid}/deep-dive/answer`, { body }),
  resolveContradiction: (sid, body) => call('POST', `/assessment/sessions/${sid}/contradictions/resolve`, { body }),
  safetyAck: (sid, body) => call('POST', `/assessment/sessions/${sid}/safety/acknowledge`, { body }),
  result: (sid) => call('GET', `/assessment/sessions/${sid}/result`),
  endSession: (sid) => call('POST', `/assessment/sessions/${sid}/end`),
  openingResponse: (sid, text) => call('POST', `/assessment/sessions/${sid}/opening-response`, { body: { text } }),
  quadrants: (sid, current_issue) => call('GET', `/assessment/sessions/${sid}/quadrants`, { query: { current_issue } }),
  selectQuadrant: (sid, quadrant) => call('POST', `/assessment/sessions/${sid}/quadrants/select`, { body: { quadrant } }),
  respond: (sid, body) => call('POST', `/assessment/sessions/${sid}/responses`, { body }),
  confirm: (sid, candidateId, { response_id, selected_chakra, ...body }) =>
    call('POST', `/assessment/sessions/${sid}/candidates/${candidateId}/confirm`, { body: { candidate_id: candidateId, ...body }, query: { response_id, selected_chakra } }),
  resolveEvidence: (sid, evidenceId, { selected_chakra, therapist_note }) =>
    call('POST', `/evidence/sessions/${sid}/evidence/${evidenceId}/resolve`, { query: { selected_chakra, therapist_note } }),
  chakraReport: (sid) => call('GET', `/assessment/sessions/${sid}/chakra-report`),
  // Liveness probe for a session: the engine has no "get session" route, but
  // its quadrant recommendation is a cheap read that fails (500) when the
  // in-memory session is gone. Used only after another call has failed.
  sessionExists: async (sid) => { try { await call('GET', `/assessment/sessions/${sid}/quadrants`); return true; } catch (e) { return !(e instanceof EngineError && (e.status === 502 || e.sessionLost)); } },
  decision: (sid, stop) => call('POST', `/assessment/sessions/${sid}/decision`, { query: { stop: stop ? 'true' : 'false' } }),
  recommendations: (sid) => call('GET', `/recommendations/sessions/${sid}`),
  prescription: (sid) => call('GET', `/prescription/sessions/${sid}`),
  prescriptionDecision: (sid, body) => call('POST', `/prescription/sessions/${sid}/decision`, { body }),
};

// Canonical lists mirrored from the engine's immutable KB so the UI can
// render choices without a round-trip. Kept identical to the KB.
// Verified against knowledge_base/ANAHAT_KnowledgeBase_v3/structured/quadrant_question_bank.json
export const QUADRANTS = [
  'Nature', 'Family', 'Social Circle', 'Personal Interests', 'Profession',
  'Lifestyle', 'Diet', 'Physical Nature', 'Medical & Therapeutic Background', 'Music Therapy Profile',
];
export const BASELINE_FIELDS = [
  { key: 'stress', label: 'Stress', scale: '1-10' },
  { key: 'anxiety', label: 'Anxiety', scale: '1-10' },
  { key: 'mood', label: 'Mood', scale: '1-10' },
  { key: 'sleep_quality', label: 'Sleep quality', scale: 'categorical', options: ['Poor', 'Fair', 'Good', 'Excellent'] },
  { key: 'energy', label: 'Energy', scale: '1-10' },
];
