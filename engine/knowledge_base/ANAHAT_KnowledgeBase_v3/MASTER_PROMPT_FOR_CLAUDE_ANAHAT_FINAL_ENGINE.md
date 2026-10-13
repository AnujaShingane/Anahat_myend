You are taking over the ANAHAT AI Engine project. Your job is to finish the engine end-to-end, validate what already exists, and return a production-integration-ready implementation plus documentation.

IMPORTANT: Do not blindly change the knowledge base. Treat the supplied ANAHAT_KnowledgeBase_v3_FINAL.zip as the source-of-truth package. First inspect it and compare it with the assessment design documents, therapist rating workbook, question bank, raga data, governance rules, and existing engine code. If something is unsupported, say so and do not invent a clinical rule.

==================================================
A. CURRENT SOURCE-OF-TRUTH STATUS
==================================================

The KB already contains:
- therapist-rated symptom/emotion/behaviour mappings
- multi-chakra associations
- raw Deficient/Excess/ambiguous/conflicted state information
- chakra master
- 10-quadrant question bank
- fixed opening / baseline / clinical context questions
- disambiguation question data
- assessment design v3
- chakra scoring config v2
- raga metadata
- raga safety metadata
- raga time/prahar metadata
- chakra/raga bridge
- Hindustani/Carnatic equivalents
- governance rules
- evidence policy
- Qdrant ingestion manifest
- BAAI/bge-m3, 1024 dimensions, cosine configuration
- assessment change log and chunking guide

Important source semantics:
- therapist Strong/Medium/Weak is association strength, not clinical certainty.
- Qdrant similarity is a candidate retrieval score, not confirmation.
- patient confirmation is separate from KB mapping.
- multiple chakras can be valid simultaneously.
- never suppress a supported chakra because another has a higher score.
- `any` chakra is unspecified, not all 7.
- `varies`, `depends on area`, `Conflict in area` require context.
- `Either`, `Deficient or Excess`, `Excess or Deficient`, `Conflicted` must not be forced into a direction.
- `Excess to Deficient` and `Usually Excess` remain unresolved until therapist/domain lead clarifies them.
- do not invent a chakra→raga relationship that is absent from the approved KB.
- therapist is always final decision-maker.

==================================================
B. EMBEDDING MODEL
==================================================

Use exactly:
BAAI/bge-m3

Purpose:
- multilingual patient-language semantic retrieval
- multilingual query ↔ knowledge matching

Expected:
- vector dimension 1024
- cosine distance/similarity
- same model for indexing and querying
- no mixing embedding models inside one Qdrant collection

The embedding model is not the clinical decision-maker.

==================================================
C. ASSESSMENT FLOW TO IMPLEMENT
==================================================

Implement this complete runtime:

1. Create session.
2. Collect demographics.
3. Capture communication/disability information where applicable.
4. Collect fixed baseline ratings:
   - Stress
   - Anxiety
   - Mood
   - Sleep Quality
   - Energy
5. Therapist records patient-state summary.
6. Therapist selects one fixed opening style from the KB.
7. Ask fixed opening questions; do not have the LLM invent opening questions.
8. Use current issue + opening answers + baseline as inputs for initial quadrant recommendation.
9. Return top candidate quadrants with reason/confidence/missing information.
10. Therapist chooses the quadrant.
11. Generate 2–3 personalized questions within the selected quadrant.
12. Avoid asking questions already answered.
13. Explore direct problem, ambiguity, missing high-value attributes, trigger/timing/intensity/impact/coping.
14. Store every raw patient/therapist response; never overwrite.
15. Extract candidate symptoms, emotions, behaviours and context.
16. Retrieve semantic candidates with BGE-M3 + Qdrant.
17. Apply metadata filters and candidate validation.
18. Candidate retrieval is NOT confirmation.
19. Confirm the underlying patient indicator.
20. If ambiguous, ask targeted clarification.
21. Preserve all clarification IDs and resolution state.
22. Detect meaningful contradictions across responses; distinguish contradiction from added context.
23. Resolve or mark unresolved.
24. Expand confirmed indicator into every authoritative KB chakra association.
25. Normalize state semantics.
26. Correlate repeated descriptions of the same underlying issue.
27. Score all 7 chakras independently.
28. Keep presence separate from direction.
29. Use the agreed baseline:
   Strong=1.0, Medium=0.6, Weak=0.3
   Mild=0.4, Moderate=0.7, Severe=1.0
   Confirmed=1.0, Resolved After Clarification=1.0,
   Provisional=0.4, Unresolved=0, Historical=0
   diminishing returns within independent correlation groups.
30. Initial imbalance gate:
   directional score >= 0.45
   confidence >= 60%
   >=2 independent supporting evidence units
31. A Strong + Severe + Confirmed unit >=0.70 may be shown as a high-priority candidate but seek corroboration before final confirmation.
32. If both directions are meaningful/conflicted, do not force a direction.
33. Balanced requires adequate assessment and no meaningful validated imbalance evidence.
34. Unresolved means inadequate assessment or unresolved ambiguity/conflict/insufficient evidence.
35. Do not call a chakra balanced merely because nothing was found if that chakra was not adequately assessed.
36. Recommend deeper exploration/next quadrant.
37. Therapist decides whether to continue or stop.
38. Do not force exactly two chakras. Report only supported findings.
39. Provide an explainability trace for every significant chakra result.

==================================================
D. QUADRANT COVERAGE
==================================================

Implement all 10:
Nature
Family
Social Circle
Personal Interests
Profession
Lifestyle
Diet
Physical Nature
Medical & Therapeutic Background
Music Therapy Profile

Coverage must mean meaningful assessment, not simply "a question was displayed."
Positive relevant information or meaningful negative information after appropriate exploration can count.
Refusal/silence does not count as evidence.
Generic "fine" should not automatically mark a quadrant adequately assessed.

==================================================
E. SAFETY
==================================================

Load and enforce governance/safety_rules.json and evidence_policy.json.

High-risk content:
- stop normal probing
- route to therapist/safety workflow
- preserve audit event
- do not provide diagnosis or unsafe medical advice

Do not invent emergency contacts; use the supplied structured data where applicable.

==================================================
F. RAGA + PRAHAR
==================================================

Implement the raga subsystem, but respect the KB governance boundary.

Allowed:
- retrieve raga candidates from approved KB records
- match patient-supported indications to raga evidence
- use raga metadata
- apply safety restrictions
- apply approved time-of-day/prahar metadata
- show provenance/evidence
- let therapist approve/edit/reject

Forbidden:
- inventing a chakra→raga mapping
- silently chaining symptom→chakra→raga and calling it clinically validated
- automatically prescribing an unreviewed raga
- ignoring contraindications/safety flags
- inventing a prahar

The output should clearly distinguish:
Candidate
Therapist approved
Therapist rejected
Not enough evidence

==================================================
G. ACTIVITIES
==================================================

The user will provide a separate Activities document.

When it is provided:
1. inspect it completely;
2. identify activity IDs/names, purpose, target population, contraindications, chakra/condition links, intensity, duration, frequency, source/provenance, and review status;
3. never invent an activity;
4. recommend activities only from that supplied document;
5. match activities to confirmed patient needs and therapist-approved findings;
6. apply contraindications/safety;
7. keep therapist approval;
8. preserve activity provenance in the prescription.

The final prescription should support:
- approved raga/music plan
- approved activities
- duration
- frequency
- instructions
- safety/clinical notes
- therapist decision

==================================================
H. API / BACKEND INTEGRATION
==================================================

Implement clean APIs for:
- create session
- demographics
- baseline
- patient-state
- opening questions
- quadrant recommendation
- quadrant selection
- next personalized questions
- submit response
- clarification
- evidence review
- chakra evaluation
- evidence trace
- next-step recommendation
- raga candidates
- raga approval/rejection/edit
- activity candidates
- activity approval/rejection/edit
- prescription generation
- therapist override
- assessment completion

Do not let frontend talk directly to Qdrant.

Use durable persistence abstraction, not only in-memory state.

==================================================
I. VALIDATION REQUIREMENT
==================================================

Before changing code:
- inventory every existing module
- identify what is correct
- identify duplicate/conflicting implementations
- compare implementation against:
  assessment_engine_design_v3.json
  chakra_scoring_config_v2.json
  governance_rules.json
  evidence_policy.json
  question bank
  therapist rating workbook if available
  qdrant ingestion manifest
  raga structured files
- produce a gap matrix.

Then implement.

After implementation run:
1. unit tests
2. retrieval tests
3. evidence extraction tests
4. ambiguity tests
5. contradiction tests
6. scoring tests
7. 7-chakra tests
8. 10-quadrant flow tests
9. safety tests
10. raga safety/time tests
11. therapist override tests
12. prescription tests
13. API tests
14. end-to-end tests
15. 30 supplied sample patient-response cases

Do not claim success if a test is skipped, mocked, or cannot run.
Separate:
PASS
FAIL
BLOCKED
SOURCE DISCREPANCY
CLINICAL REVIEW REQUIRED

The 30 sample reference chakras are comparison/reference data, not unquestionable ground truth. If they disagree with the authoritative KB, report SOURCE DISCREPANCY rather than modifying the KB just to match.

==================================================
J. CHUNKING — DO NOT IMPLEMENT BLINDLY
==================================================

Use the KB's QDRANT_CHUNKING_GUIDE_BGE_M3.md as the baseline.

Recommended:
- target 800 tokens
- max 1000 tokens
- overlap 120 tokens
- heading-aware splitting
- preserve tables/questions/rules as semantic units
- one logical structured record per chunk
- BGE-M3, 1024 dimensions, cosine
- metadata-rich payloads

Do not vectorize governance_rules.json as normal RAG knowledge.

You must provide:
- complete chunking code
- ingestion code
- manifest generation
- duplicate/content hash detection
- dry-run mode
- validation report
- Qdrant collection creation
- upsert
- payload metadata
- re-index/update strategy
- exact command-line steps
- simple explanation for a beginner

==================================================
K. DELIVERABLES
==================================================

Return a complete project containing:
1. final AI engine source code
2. Qdrant ingestion/chunking code
3. BGE-M3 embedding adapter
4. retrieval adapter
5. complete assessment pipeline
6. evidence engine
7. ambiguity/clarification engine
8. consistency engine
9. chakra scoring
10. explainability
11. safety
12. raga recommendation
13. activity recommendation using the provided Activities document
14. therapist workflow
15. prescription generation
16. API layer
17. configuration
18. tests
19. migration/installation instructions
20. architecture documentation
21. beginner-friendly assessment flow explanation
22. beginner-friendly Qdrant/chunking explanation
23. validation report
24. known limitations / therapist review list

Do not remove source provenance.
Do not silently change clinical mappings.
Do not label engineering thresholds as clinically validated.

At the end give a table:
DONE BEFORE YOUR WORK
CHANGED BY YOU
REMAINING AFTER YOUR WORK
CLINICAL/THERAPIST REVIEW REQUIRED
BLOCKED BY MISSING INPUT

Then explain in simple language how the final system works from:
patient opening → questions → response → semantic retrieval → evidence → chakra result → raga/activity candidate → therapist approval → prescription.
