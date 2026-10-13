# Finalized scoring rules round

Implements `ANAHAT_Finalized_Scoring_Rules_Final.docx`, orders the result window by how affected each
chakra is, and fixes indicator-matching recall. All numeric values are engineering baselines
(spec section 17), configurable, **not clinically validated**.

## Rule-by-rule status

| Spec | Rule | Where |
|---|---|---|
| 2, 18 | Overall bands: <0.40 Balanced (quadrants complete) / Not assessed properly (incomplete); 0.40 Mild; 0.55 Moderate; 0.75 Severe; 0.70 is not special | `scoring_engine.py` (`band`, `completion`), `config/scoring_rules.json` |
| 3 | `strength x intensity x reliability`; Confirmed/Resolved 1.0, Provisional 0.4, **Unresolved 0.1**, Historical 0.1; noisy-OR `new = old + (1-old)*c` | `scoring_engine.py`, `config/scoring_rules.json` |
| 4, 16 | Missing intensity never silently Moderate (counted Mild, flagged, asked); "often/usually/regularly/tend to" are no longer severity cues | `scoring_engine.py`, `intensity.py` |
| 5 | Same underlying problem = one group, grouped before diminishing returns (canonical term, same signal, **curated clusters** e.g. Fear+Anxiety, Fatigue+Chronic Fatigue) | `config/correlation_groups.json`, `indicator_repository.correlation_cluster`, `_build_groups` |
| 6 | Contradiction about the same problem: both statements kept, evidence held at the Unresolved weight (cannot set imbalance/direction), polite clarification question, resolved interpretation scored once. Covers frequency, duration, intensity (`attribute_conflict.py`), presence and current-vs-historical (`contradiction_service.py`) | `assessment_service._detect_attribute_conflicts / _resolve_attribute_conflict`, `deep-dive/answer` with `field="conflict"` |
| 7, 10 | Directional support = weighted sum; threshold 0.20; dominance ratio 1.20; **0.10 conflict margin removed**; non-directional states add presence only | `scoring_engine.py` |
| 8, 9 | Diminishing returns 1, .70, .49, .343, .24 ... (stepped curve selectable) | `scoring_engine.multiplier` |
| 11 | No extra gate (0.45 / 60% confidence / 2 units / "firm evidence") on top of the bands | removed; `require_firm_evidence_for_direction=False` |
| 12 | Strong + Severe + Confirmed flagged high-priority, never a gate | `scoring_engine.py` |
| 13 | Confidence 30/30/25/15 with the spec's resolution/completeness values; informational only | `scoring_engine._confidence` |
| - | **Ordering**: imbalanced chakras by overall score, highest first (`rank` 1..n), then not assessed, then balanced | scorer, `final_result`, `NadikaOfflineSession.jsx`, `anahat_result_window.html`, backend `summarise` |

## Decisions that need your confirmation

1. **Diminishing curve**: section 8 states a stepped 1/.75/.5/.25 curve, but its own formula and sections 17/18 use 0.70^(n-1). Default is 0.70^(n-1); set `diminishing_returns.curve = "stepped"` in `config/scoring_rules.json` to switch.
2. **Unresolved = 0.1 and ambiguity corroboration switched off.** Before, ambiguous indicators (84 of 168 in the KB) counted at 0.4, or 1.0 when corroborated. Now they count 0.1 until the KB clarification question is answered. Both old behaviours remain behind `score_unresolved_as_provisional` and `resolve_ambiguity_by_corroboration`.
3. **Aggregation**: overall = noisy-OR over discounted groups (bounded 0-1); directional = literal weighted sum (can exceed 1).
4. **Provisional + Strong + Severe = exactly 0.40 = Mild.** Per spec this is an imbalance. The old "provisional alone cannot establish imbalance" rule is available as `provisional_alone_can_establish_imbalance=False` (status `PROVISIONAL_ONLY`).
5. **"Suggested quadrants complete"** = every quadrant the engine suggested or the therapist selected is complete (`quadrant_completion_basis`). If the therapist ends early, low-score chakras show "Not assessed properly" with the pending quadrants listed.
6. **Historical evidence** stays unscored (the spec lists a 0.1 weight but also says it must not establish a current imbalance).
7. **Semantic grouping** uses the curated cluster file (draft, needs domain review); it does not use embeddings.
8. **Intensity conflicts** are raised only when both statements are explicit patient words.

## Indicator matching (recall up, precision gates unchanged)

* Similarity cliff -> ramp: validated "exact" with similarity 0.55-0.72 is now PROVISIONAL instead of rejected (`grounding_provisional_similarity` 0.65 -> 0.55; tune with `scripts/validate_indicator_paraphrases.py`).
* Cue vocabulary 31 -> 88 indicators (drafts, domain review required) and cues are also embedded in the index text.
* Fallback quote recovery (short span of the patient's own words) and the full sentence as an extra retrieval query.
* Unchanged: domain gate, explained-away rule, verbatim quote rule, validator must say exact/partial.
* **Re-run `scripts/build_indicator_qdrant.py`** so the cue words reach the vector index (`INDICATOR_EMBED_CUES=0` disables).

## Tests

New: `tests/unit/test_scoring_finalized_rules.py` (24, one per rule), `tests/scenarios/test_contradiction_clarification_and_ordering.py` (6), `tests/scenarios/test_matching_recall.py` (6).
Updated: `test_scoring.py` (dominance reason text), `test_engine_fixes.py` and `test_grounding_and_pipeline.py` (provisional guard now opt-in).
