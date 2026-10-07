# ANAHAT fix pass: report

## Test result
Engine: **207 passed, 2 skipped, 0 failed** (baseline was 164 passed / 2 skipped).
43 tests added (`tests/scenarios/`): the 20 spec scenarios (plus extra cases) and the specific bug fixes.
The 2 skipped are the live-provider tests that need real API keys.
The validated KB is byte-identical to the one you sent (checked with `diff -r`).

## Bugs fixed
1. Balanced was the default. Now: no evidence in an area that was not assessed = "Not assessed" (Unresolved), never Balanced. Balanced only after enough quadrants were really answered, and it shows Low confidence.
2. Selecting a quadrant counted as "assessed". Now only answered questions or a therapist "complete" count.
3. Repeated mentions and KB twin entries (SYM-009 = EMO-008 Anxiety) were double counted. Now one observation = one unit.
4. A weak opposite mention could flip a chakra's direction. Now the gap / gray-zone rules leave it "direction unresolved".
5. Missing severity was silently scored. Now it is listed as a missing detail and scores 0 until asked.
6. "Possible indicators" with percentages were shown mid-assessment. Now the therapist sees at most 3 candidates per concept, with no score and no chakra.
7. Candidate is not evidence: only a confirmation creates evidence. A chakra chosen at confirmation time is ignored; it counts only after the KB disambiguation step.
8. LLM concepts without a verbatim quote from the patient's words are dropped (and listed as "unverified").
9. Closed-set LLM validation: the model only sees ids and names and can only accept or reject them. Invented ids are ignored.
10. "Out of questions": every attribute is tracked. When a quadrant is finished the engine recommends the next one or says everything is covered. The duplicate KB attribute (Stress Management Techniques) is asked once at runtime; the KB is untouched.
11. Opening questions come from KB `assessment/fixed_opening_questions_v3.json`, styles A-J, therapist picks or skips. No "exactly 4" rule. Node no longer reads KB files.
12. Real KB question wording is used where it maps 1:1 (Nature, Family, Social Circle, Diet, Physical Nature).
13. Safety: RED stops everything until a therapist explicitly clears it. New AMBER tier alerts the therapist and pauses auto deep-dive. The LLM can only raise the level. Emergency contacts come only from the KB, with its "verify before use" flags.
14. Deep dive: capped at 4 questions per evidence; stops on therapist stop, safety hold, or all details known. Answers are entered by the therapist; raw patient words are saved; nothing is guessed.
15. Contradictions: the therapist keeps one side, the other is marked superseded (kept for audit).
16. The whole session (evidence, candidates, audit log) was being sent to the LLM. Now only a minimal context goes out, for every provider.
17. Mistral provider added (`MISTRAL_API_KEY`, `MISTRAL_MODEL`, JSON-schema output with json_object fallback). Set `LLM_PROVIDER=mistral`.

## Files changed
Engine: `app/core/config.py`, `models/{chakra,evidence}.py`, `knowledge/{loader,indicator_repository}.py`, `engine/{scoring_engine,evidence_engine,patient_context}.py`, `services/{assessment,question,safety,contradiction}_service.py`, new `services/deep_dive_service.py`, `llm/{schemas,prompts,base,resilient}.py`, new `llm/mistral_provider.py`, `api/assessment_routes.py`, `.env.example`.
Tests: new `tests/scenarios/*`; updated `tests/helpers.py`, `tests/integration/test_assessment_flow.py`, `tests/test_json_and_schema.py` (the prompt and schema were changed on purpose).
Backend: `src/anahat/{engineClient,anahatService,anahatController,anahatRoutes,nadikaService}.js`, `.env.example`.
New: `anahat_result_window.html` (result window; `sample_result.json` is real engine output).

## New API
Engine: `GET /assessment/opening-styles`, `POST /assessment/kb/suggest-question`, `GET .../opening-questions?style=`, `POST .../opening-skip`, `GET .../questions/next`, `POST .../quadrants/complete`, `GET .../deep-dive`, `POST .../deep-dive/answer`, `POST .../evidence/{id}/resolve-ambiguity`, `POST .../contradictions/resolve`, `POST .../safety/acknowledge`, `GET .../result`.
Backend: `/api/anahat/assessments/:id/{questions/next, quadrants/complete, deep-dive, deep-dive/answer, contradictions/resolve, result}`.

## REQUIRES DOMAIN / THERAPIST VALIDATION (I did not decide these)
- `balanced_min_assessed_quadrants = 10` (how many quadrants before "Balanced" may be shown). Placeholder, deliberately strict.
- Confidence "completeness" definition. The 0.45 / 0.10 / 0.15 / 0.20 / 0.70 thresholds are the spec/KB values carried over, not clinically validated.
- AMBER and RED phrase lists (illustrative only).
- Deep-dive question wording (neutral templates; I did not have the PDF's Part 52 templates as text).
- Question text for Personal Interests, Profession, Medical & Therapeutic, Music Therapy Profile (question-bank files do not match the attribute counts; not auto-mapped).
- Top-two chakras (KB design) vs all seven (spec): all seven are evaluated.
- KB duplicates: SYM-009/EMO-008 (handled as twins), SYM-069/SYM-070 (Hemmorhoids/Hemorrhoids, not merged).
- KB states "Either", "Varies", "Excess to Deficient", "Usually Excess" stay non-directional; not reinterpreted.
- Default opening style "A" for live suggestions; three conflicting opening-question files in the KB.
- Weights (current issue 0.65 / opening 0.2 / baseline 0.15) are in the KB design but are not applied to scoring; responses are only labelled with their source.
- Emergency numbers in the KB are flagged "requires live verification before production".

## Assumptions
- Therapist confirmation is required for every piece of evidence.
- The baseline is context only; it no longer steers quadrant recommendations (that mapping was not in the KB).
- Quadrant routing uses BGE-M3 when the retriever's embedder is available, otherwise a weaker keyword fallback. The response says which was used.

## Remaining risks
1. **Sessions are in memory.** An engine restart loses them (Node marks the record "engine_session_lost"). I did not add persistence because sessions hold patient mental-health text.
2. **Frontend not updated** (I did not have it). It must: choose an opening style via `?style=`, handle the new candidate shape (`term`, `quote`, no `score`/`payload`), handle AMBER, use `questions/next`, and render `/result` (see `anahat_result_window.html`).
3. **Nadika live-session scan** auto-records candidates as PROVISIONAL evidence without a therapist click, and has no assessed quadrants, so the engine (correctly) shows low coverage and will not call anything Balanced or Imbalanced from a transcript alone. Consider requiring therapist confirmation there.
4. **Qdrant collection**: 33 emotion/behaviour indicators may be missing from the validation collection. I could not test against a live Qdrant, BGE-M3 or a live Mistral key (all provider tests use mock transports).
5. The Mistral model id is yours to choose (`MISTRAL_MODEL`); I did not pick one.
6. Deep dive answers are therapist-entered; the LLM does not extract severity from free text (kept out to avoid invented values).
7. Nothing here is clinically validated; every result carries `clinically_validated: false` and needs therapist approval.
