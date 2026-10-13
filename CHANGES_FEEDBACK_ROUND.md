# Feedback round — what changed and why

Source: `Claude_changes_for_anahat_.pdf` (items 1-8). Engine tests: 311 passed, 1 failed
(`test_exact_sleep_anxiety_recovery_case...` needs the real BGE-M3 model, `sentence_transformers`, which is not installed in the build sandbox).
The frontend was compile-checked (esbuild) but NOT run in a browser; please click through it once.

| PDF item | Cause | Fix (file) |
|---|---|---|
| 1, 3, 4, 5 intensity asked although patient described it | Prompt told the model to leave intensity empty unless explicit; small local models then return null | `engine/app/engine/intensity.py` reads degree words, numbers, frequency, duration and behaviour/impact from the full answer; never invents (no cue -> still asks). Prompt updated (`llm/prompts.py`). Source is stored (`intensity_source`: patient_words / inferred / therapist) and shown to the therapist. |
| 1 asks everything at once, twice for one sentence | all pending items shown together; Hives and Anger had the same quote | Items grouped by quote; frontend shows ONE intensity question at a time (`IntensityCard`); answer applies to every indicator from that statement. |
| 4 Hives counted again | each later mention created a new evidence record (scoring already collapsed it, counts/prompts did not) | `_prior_observation` / `_merge_repeat`: a repeated indicator is merged into the first record (fills gaps, adds mention) — no new count, no new intensity question. Chat says "already recorded earlier, so not counted again". |
| 3 unclear question ("If so, how has it changed...") | KB lines that are follow-up fragments of the line before | `question_topics.merge_follow_up_fragments` joins them to their parent question; orphans are dropped. Generated questions must be 6+ words, self-contained, and the prompt asks for descriptive wording. Fallback prompts reworded. |
| 3 move-on / deep-dive suggestions | engine auto-moved after 3 questions | `quadrant_guidance()`: no issue after 2-3 questions -> suggest moving on; issue -> follow-ups, then after 3 questions suggest deep dive; related quadrants suggested. `auto_advance_quadrants=False` default (set True for the old behaviour). New `GuidanceCard`, route `GET /quadrants/guidance`, early "move on". |
| 7 Profession asking diet/sleep | `future_plans.md` (served under Profession) holds a general intake list; `profession.md` holds lifestyle questions | `question_topics.question_fits` topic guard on every RAG question and generated question (KB files untouched). `python scripts/audit_question_mapping.py` shows the result for all 10 quadrants. |
| 6, 7 screen frozen / question not clickable | (a) question ids were hash of text only, so a line shared by two banks (relationships.md: Family + Social Circle) looked "already asked" in the second quadrant; (b) no request timeout; (c) intensity gate could stay locked | ids scoped per quadrant + session-wide text dedupe; 150 s request timeout; busy state with "Stop and try again" after 20 s; self-unlock if the intensity gate loses its state; clear message if the engine session was lost. |
| 8 result window | grid showed only imbalanced chakras | `ChakraColumn`: one vertical box, all 7 chakras, green balanced / red severe / orange moderate / yellow mild / grey unresolved. |

Tests: `engine/tests/scenarios/test_feedback_fixes.py` (11 tests). Two older tests that asserted
"every repeat creates a new record" were updated to the new one-indicator-one-count rule; the stale
`FakeIndicators` test double was completed.
