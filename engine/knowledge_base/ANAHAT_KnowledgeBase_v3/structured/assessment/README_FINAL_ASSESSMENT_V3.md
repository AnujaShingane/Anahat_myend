# ANAHAT Assessment V3 — Change Log / Source of Truth

This folder contains the assessment changes agreed for the ANAHAT AI engine.

## Required runtime order

1. Create session.
2. Collect demographics and communication/disability context.
3. Collect fixed baseline ratings: Stress, Anxiety, Mood, Sleep Quality, Energy.
4. Therapist records patient-state summary.
5. Run the fixed opening conversation selected by therapist.
6. Generate initial quadrant candidates; therapist chooses the quadrant.
7. Ask personalized questions from the selected quadrant.
8. Store every raw response without overwriting earlier responses.
9. Extract candidate symptoms/emotions/behaviours and contextual facts.
10. Retrieve semantic candidates from Qdrant.
11. Validate candidates against authoritative structured mappings.
12. Confirm the underlying patient indicator; semantic similarity alone is not confirmation.
13. Ask clarification when an answer can change chakra interpretation.
14. Normalize state: Deficient / Excess / Ambiguous / Conflicted / Context-dependent / Unspecified.
15. Correlate repeated descriptions of the same underlying issue so they do not become independent evidence units.
16. Score all seven chakras independently.
17. Separate presence from directional scoring.
18. Mark Balanced only after adequate assessment and absence of meaningful validated imbalance evidence.
19. Mark Unresolved when assessment/evidence/direction is insufficient or contradictory.
20. Recommend deeper exploration or next quadrant; therapist decides whether to continue/stop.
21. Generate explainable chakra findings.
22. Generate only KB-supported raga candidates; never invent chakra→raga mappings.
23. Apply raga safety and time-of-day constraints.
24. Therapist approves/edits/rejects raga and activity recommendations.
25. Generate editable therapist prescription.
26. Produce only therapist-approved patient-facing prescription.

## Non-negotiable rules

- Therapist is the final decision-maker.
- Demographics never directly score chakra/quadrant.
- Gender must never be used as a scoring feature.
- `any` chakra does not mean all seven chakras.
- `varies` / `depends on area` requires context.
- `Excess to Deficient` and `Usually Excess` remain unresolved until therapist-approved semantics are supplied.
- Do not diagnose medical or psychiatric disease.
- Do not turn a retrieval score into clinical certainty.
- Do not force exactly one or exactly two chakras if fewer pass the gate.
- Multiple chakras can be imbalanced simultaneously.
- Preserve raw source fields and provenance.
- Preserve all patient responses for auditability.
