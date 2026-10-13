# Evidence grounding, quadrant triggers and question context — implementation report

## 1. Root causes found in the code
1. **Interpretation text was used as the indicator's definition.** The KB `comment`/`meaning` fields are chakra
   interpretations ("Stroke: Overwhelm to consciousness…", "Vaginitis: Overwhelmed and need to shut out…",
   "Hives: Intolerance, anger, excess irritation"). `scripts/build_indicator_qdrant.py` embedded that text, and
   `AssessmentService._describe()` handed the same text to the LLM matching checker as the indicator's "meaning".
   Emotions such as "overwhelmed" / "irritated" therefore retrieved and "matched" physical illnesses.
2. **A lenient verdict was enough.** `partial` (or "validator unavailable + similarity >= 0.70") was recorded as a
   PROVISIONAL evidence record, so related-looking KB rows reached the therapist and the scorer at reduced weight.
3. **No independent check.** Nothing verified that the patient's own words point at the indicator, or that a general
   emotion/stressor may establish a physical symptom.
4. **Quadrant recommender was embedding-only** (nearest KB attribute list, with a margin rule). Blood pressure,
   medication, sleep, fatigue had no explicit route, so Medical & Therapeutic Background could be omitted; only 3 areas
   were ever returned and nothing explained why.
5. **Missing intensity**: the UI's "Patient can't say → Mild" stored Mild as a recorded value.
6. Question generator had no demographic/form, baseline, or session-memory input and no plain-language check.

## 2. Changes
| Area | File(s) | Purpose |
|---|---|---|
| Grounding gate | `engine/app/engine/grounding.py` (new), `engine/config/indicator_vocabulary.json` (new), `assessment_service.py` (`_apply_grounding`, `_describe`) | Deterministic verdict CONFIRMED / PROVISIONAL / REJECTED per candidate from: word-level link to the KB term (+ cue words), domain compatibility, validator verdict, similarity as support only. An emotion/behaviour/stressor can never establish a physical symptom. "Explained-away" rule drops unlinked neighbours. |
| Validator prompt | `engine/app/llm/prompts.py` | Defines exact / partial / none with the Stroke and Migraine examples; judge only from the patient's words and the candidate NAME. |
| Retrieval index | `engine/scripts/build_indicator_qdrant.py` | Embeds `Indicator + Domain` only (set `INDICATOR_EMBED_INTERPRETATION=1` to restore). **Re-run it to take effect.** |
| Quadrant triggers | `engine/config/quadrant_triggers.json`, `engine/app/services/quadrant_triggers.py` (new), `question_service.py` | Configurable rules over form concerns/notes, conditions, answers, concepts and baseline; negations don't fire; combined with semantic score and coverage; every item carries priority, triggers and reasons; Medical is `must_include`; default cap 7. |
| Session memory / questions | `engine/app/services/session_memory.py` (new), `dynamic_question_service.py`, `question_prompts.py`, `question_validators.py`, `config/dynamic_question_guidance.json` | Generator now receives patient background, baseline, session memory (facts, disclosed causes, known vs unknown details, areas explored / not yet asked, goals). A reason/fear the patient states becomes the next focus ("explore_patient_reason"). Jargon blocklist and extra leading-cause patterns. |
| Intensity | `assessment_service.py`, `assessment_routes.py`, backend service, `NadikaOfflineSession.jsx` | "Patient can't say" is stored as `intensity_source=assumed_default` with `intensity=None`; scoring keeps flagging it `intensity_assumed`. |
| Explainability | `assessment_service.explain_trace`, `GET /assessment/sessions/{id}/trace` | Per response: extracted concepts, candidates with retrieval score, validator and grounding verdicts, rejections with reasons, evidence status and intensity source, quadrant reasons. No raw patient text. Logger `anahat.evidence` prints one `GROUNDING |` line per candidate. |
| UI | `NadikaOfflineSession.jsx` | Suggested areas show priority and reasons. |

## 3. What was already sound and left alone
Negation / history statuses, PROVISIONAL-only chakra gate (`PROVISIONAL_ONLY`), independent-unit collapsing,
`intensity_assumed` flag in scoring, safety escalation.

## 4. Tests
`tests/scenarios/test_grounding_and_pipeline.py` (18), `tests/scenarios/test_case_46_year_old.py` (5),
`tests/unit/test_question_context_and_quality.py` (10), plus earlier feedback tests. Result: **344 passed, 1 failed**
(`test_exact_sleep_anxiety_recovery_case…` needs the real BGE-M3 model, `sentence_transformers`, not installed here).
Changed expectations: two routing tests asserted that nothing is recommended for sleep / low-energy / family text
(the defect itself); two tests asserted every repeat creates a new record.

## 5. Limitations / decisions needing therapist or domain approval
* The Qdrant index was **not rebuilt** here (no Qdrant / BGE-M3). The runtime gate works with the old index; rebuild for the full benefit.
* Thresholds (`grounding_confirm_similarity` 0.72, `grounding_provisional_similarity` 0.65) are engineering defaults,
  not calibrated on real BGE-M3 scores. Check with `scripts/validate_indicator_retrieval.py`.
* `indicator_vocabulary.json` (everyday cue words) and `quadrant_triggers.json` (trigger patterns, priorities) are
  reviewable vocabulary, not KB entries; they need domain review. Words missing from the vocabulary make a valid
  paraphrase fall back to PROVISIONAL or REJECTED (safe direction), never to CONFIRMED.
* Behaviour change: with the validator unavailable, a candidate without a word-level link is no longer kept as provisional.
* Question wording quality ultimately depends on the LLM; the code enforces structure (context, focus, jargon, leading,
  duplicates, topic) but was not exercised against a live model.
* Whether the KB interpretation comments should keep influencing anything beyond the therapist-facing report is a KB owner decision.

## Final clarification loop (2026-10-12)

- End Session now pauses final scoring when blocking evidence clarification remains and returns one pending question at a time from the existing KB/deep-dive pipeline.
- The existing therapist chat renders the clarification in its current clarification card, records the patient's selected answer and optional words through the existing `/deep-dive/answer` endpoint, and retries finalization to ask the next pending question.
- Disambiguation answers are mapped by `AmbiguityService` against authoritative KB answer options; no LLM-created chakra mapping or scoring is introduced.
- Finalization proceeds only after blocking clarification items are resolved. Non-blocking optional details do not prevent completion.
