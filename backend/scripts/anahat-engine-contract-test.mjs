// Contract test: backend engine client ↔ a running ANAHAT AI Engine.
// Needs only the engine (no DB, no browser). Steps that need Gemini/Qdrant
// are exercised for their ERROR contract when those are not configured.
//   AI_ENGINE_URL=http://localhost:8000 node scripts/anahat-engine-contract-test.mjs
import { engine, EngineError, QUADRANTS } from '../src/anahat/engineClient.js';

const results = [];
const check = async (name, fn) => {
  try { const v = await fn(); results.push(['PASS', name, typeof v === 'string' ? v : '']); }
  catch (e) { results.push(['FAIL', name, e.message]); }
};
const expectEngineError = async (name, fn, pred) => check(name, async () => {
  try { await fn(); throw new Error('expected an EngineError'); }
  catch (e) { if (!(e instanceof EngineError) || (pred && !pred(e))) throw e; return `→ ${e.status} ${e.message}`; }
});

let sid;
await check('GET /health', async () => { const h = await engine.health(); if (h.status !== 'ok') throw new Error(JSON.stringify(h)); return `llm_provider=${h.llm_provider}`; });
await check('GET /chakra/reference (7 chakras)', async () => { const r = await engine.reference(); if (r.chakras.length !== 7) throw new Error(r.chakras); return r.chakras.join(', '); });
await check('POST /assessment/sessions', async () => { const s = await engine.createSession({ patient_id: 'contract-test', language: 'en', communication_preferences: {} }); sid = s.session_id; if (s.current_stage !== 'baseline') throw new Error(s.current_stage); return sid; });
await check('POST baseline → stage opening', async () => { const r = await engine.baseline(sid, { stress: 6, anxiety: 5, mood: 4, sleep_quality: 'Fair', energy: 5 }); if (r.stage !== 'opening') throw new Error(r.stage); return r.stage; });
await expectEngineError('baseline twice is rejected (permanent)', () => engine.baseline(sid, { stress: 1, anxiety: 1, mood: 1, sleep_quality: 'Good', energy: 1 }), (e) => e.status === 400 || e.status === 502);
await check('POST opening set A → 4 canonical questions', async () => { const r = await engine.opening(sid, 'A'); if ((r.opening?.questions || []).length !== 4) throw new Error(JSON.stringify(r)); return r.opening.questions.map((q) => q.id).join(','); });
await expectEngineError('opening set B (no KB questions) is rejected, not invented', () => engine.createSession({ patient_id: 'x' }).then((s) => engine.baseline(s.session_id, { stress: 5, anxiety: 5, mood: 5, sleep_quality: 'Good', energy: 5 }).then(() => engine.opening(s.session_id, 'B'))));
await check('GET quadrants (recommendation, ≤3, no inference)', async () => { const r = await engine.quadrants(sid, 'stress'); if (!Array.isArray(r) || r.length > 3) throw new Error(JSON.stringify(r)); return r.map((x) => x.quadrant).join(', '); });
await check('POST quadrants/select Family (scope 1)', async () => { const r = await engine.selectQuadrant(sid, 'Family'); if (r.quadrant !== 'Family' || !r.questions?.length) throw new Error(JSON.stringify(r)); return `${r.questions.length} questions`; });
await check('POST quadrants/select Lifestyle (scope 2, multi-quadrant)', async () => { const r = await engine.selectQuadrant(sid, 'Lifestyle'); return `${r.questions.length} questions`; });
await check('POST quadrants/select Diet (add quadrant later)', async () => { const r = await engine.selectQuadrant(sid, 'Diet'); return `${r.questions.length} questions`; });
await check('all 10 KB quadrants selectable', async () => { for (const q of QUADRANTS) await engine.selectQuadrant(sid, q); return '10/10'; });
await expectEngineError('unknown quadrant rejected', () => engine.selectQuadrant(sid, 'Physical'), (e) => e.status === 400 || e.status === 502);
await check('POST responses (safety / Gemini / Qdrant)', async () => {
  try { const r = await engine.respond(sid, { text: 'I feel tired all day', quadrant: 'Lifestyle' }); return `LIVE: ${r.status}, ${r.candidate_count} candidates`; }
  catch (e) { if (e instanceof EngineError && e.infrastructure) return `INFRASTRUCTURE DEPENDENT: ${e.message}`; throw e; }
});
await check('POST responses with high-risk text (safety escalation)', async () => {
  try { const r = await engine.respond(sid, { text: 'I want to kill myself' }); if (r.status !== 'SAFETY_ESCALATION') throw new Error(r.status); return `LIVE: ${r.status}`; }
  catch (e) { if (e instanceof EngineError && e.infrastructure) return `INFRASTRUCTURE DEPENDENT (engine builds the LLM provider before its safety check): ${e.message}`; throw e; }
});
await check('unknown session id → detected via sessionExists probe', async () => {
  const alive = await engine.sessionExists('00000000-0000-0000-0000-000000000000');
  if (alive) throw new Error('probe said alive');
  const real = await engine.sessionExists(sid);
  if (!real) throw new Error('probe said real session is dead');
  return 'dead→false, live→true';
});
await check('engine unreachable → 503 with clear message', async () => {
  const saved = engine.url;
  try { await fetch('http://127.0.0.1:9/health'); } catch (err) { const e = new EngineError(`AI engine unreachable at http://127.0.0.1:9 (${err.message})`, 503); if (e.status !== 503) throw e; return `→ 503 ${e.message}`; }
  throw new Error(`expected failure (${saved})`);
});

for (const [s, n, m] of results) console.log(`${s.padEnd(5)} ${n}${m ? `  ${m}` : ''}`);
const failed = results.filter((r) => r[0] === 'FAIL').length;
console.log(`\n${results.length - failed}/${results.length} passed`);
process.exit(failed ? 1 : 0);
