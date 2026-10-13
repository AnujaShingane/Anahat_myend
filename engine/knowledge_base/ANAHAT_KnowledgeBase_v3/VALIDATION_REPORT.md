# Validation Report — v2 Additions Only

(v1's structured/config/rag content was not modified, so it is not re-validated
here — see v1's own architecture report for its validation history.)

## Structured data checks

| Check | Result |
|---|---|
| Valid JSON (all 4 new raaga/structured/ files + 4 new governance/config files) | Pass — all 8 parse cleanly |
| No duplicate raga entries in raga_metadata.json | Pass — 93 rows, 93 distinct raga_name values from source spreadsheet's 95 (2 rows had no name, dropped) |
| No invented field values | Pass by construction — every null field (aroha, avaroha, pakad, mood_character, therapeutic_goal, etc.) was left null rather than guessed; see file `_note` fields |
| chakra_raga_bridge.json does not silently claim a chakra mapping | Pass — `chakra_bridge_status.candidate_ragas` is an empty list; `can_influence_chakra_score`/`can_influence_raga_recommendation` both `false` |

## Document checks

| Check | Result |
|---|---|
| No corrupted files among the 10 ingested | Pass — all extracted with pdftotext or openpyxl without errors |
| Duplicate upload detected | Pass — Music_Therapy.zip confirmed (md5) identical to DATA/DATA/Music Therapy/, excluded from double-counting |
| Metadata attached to every ingested doc | Pass — all 8 new markdown files carry YAML frontmatter matching v1's schema |
| Source traceability | Pass — every structured entry and markdown file names its source PDF/XLSX |

## Retrieval test (manual walk-through, no live vector DB in this environment)

| Query | Would retrieve from | Domain | Evidence level | Appropriate? |
|---|---|---|---|---|
| "raga for insomnia" | `raaga/rag/raga_therapeutic_indications_practitioner/senior_citizen_issues_raga_correlation.md` | raga_therapeutic_evidence | LEVEL_5 | Yes, WITH the file's safety framing surfaced alongside it (not condition_flag'd, so lower risk, but still practitioner-tradition, not clinical) |
| "raga for Parkinson's" | same source, `emotional_issues_raga_correlation.md` | raga_therapeutic_evidence | LEVEL_5 | Retrieval itself is fine for a therapist researching context; the SAFETY WARNING banner in the doc is what stops it from becoming an auto-recommendation. `can_influence_raga_recommendation: false` blocks the automated path. |
| "raga time of day" | `raaga/structured/raga_time_of_day.json` + `reference_images/rag_samay_chakra.png` | raga_time | LEVEL_4 | Yes — appropriate, non-clinical |
| "Hindustani Carnatic equivalent of Kalyan" | `raaga/structured/raga_hindustani_carnatic_equivalents.json` | raga | LEVEL_4 | Yes, but flag `usage_review_required` (source unattributed) should surface to the therapist too |
| "chakra specific evidence for Heart Chakra" | existing v1 `rag/chakra_reasoning/heart_chakra_reasoning.md` (unchanged) + `raaga/rag/chakra_raga_reasoning/chakras_and_singing_style_association.md` (new) | chakra | traditional/energetic | Yes |
| "neurological condition" | Would currently retrieve **nothing** — the neurology/medical_context domains are registry-only this pass, not chunked | medical_context | n/a | **Gap** — flagged as an open item; nothing was ingested for general neurology yet, only the 3 small ANAHAT brain-basics docs |
| "anxiety" | Same gap — `music-as-medicine...` (sleep/anxiety/pain) is registry-only, not ingested | music_therapy | n/a | **Gap** |

---

## Gap-fill pass (2026-08-11) — additional validation

### Retrieval test walk-through

| Query | Would retrieve | Domain | Source | Evidence level | Appropriate? |
|---|---|---|---|---|---|
| "patient has difficulty expressing emotions" | `rag/assessment_technique/chakra_specific_questioning_throat.md` (CQ-THR-01, CQ-THR-06) | assessment_technique | ANAHAT design, authored | general_reference | Yes |
| "patient struggles to communicate needs" | `chakra_specific_questioning_throat.md` (CQ-THR-03) | assessment_technique | ANAHAT design | general_reference | Yes |
| "patient reports difficulty concentrating" | `chakra_specific_questioning_third_eye.md` (CQ-AJN-01/02) | assessment_technique | ANAHAT design | general_reference | Yes, with the file's own safety note (must not diagnose ADHD) surfaced alongside |
| "patient is experiencing excessive overthinking" | `chakra_specific_questioning_third_eye.md` (CQ-AJN-04) | assessment_technique | ANAHAT design | general_reference | Yes |
| "patient is questioning their sense of purpose" | `chakra_specific_questioning_crown.md` (CQ-CRN-01/02/03) | assessment_technique | ANAHAT design | general_reference | Yes -- retrieval should also surface the opt-in gate (CQ-CRN-05) reminder |
| "raga information for therapeutic emotional regulation" | `raaga/structured/chakra_raga_bridge.json` -> `research_supported_raga_therapeutic_goals` (Darbari Kanada, Bilahari, Bhairavi) FIRST, practitioner-tradition list SECOND | raga_therapeutic_evidence | mixed (3 peer-reviewed + ANAHAT practitioner tradition) | moderate / traditional | Yes, but ranking matters -- the 3 research-supported entries should outrank the LEVEL_5 practitioner list for this query, not the reverse |
| "Indian mental health support" | `structured/emergency_contacts.json` -> India -> Tele MANAS, KIRAN | indian_mental_health_resources | MoHFW, DEPwD (official) | high | Yes -- this is exact-match structured data, never semantic-searched, so ranking risk doesn't apply here |
| "patient wants a calming music intervention" | `raaga/structured/chakra_raga_bridge.json` research-supported entries (all 3 target stress/anxiety) + `raaga/structured/raga_metadata.json` time-of-day fields | raga_therapeutic_evidence + raga | mixed | moderate | Yes |

### Check: low-quality sources do not outrank authoritative sources

Confirmed by construction, not just by retrieval-time ranking logic: the
excluded low-credibility source (IJARIIT V10I4-1179) was never ingested into
any structured or RAG file in this knowledge base, so it cannot be retrieved
at all, regardless of semantic similarity. This is a stronger guarantee than
a ranking rule that could fail — it was filtered at ingestion, not left to
compete at retrieval time.

### JSON validation

| File | Check | Result |
|---|---|---|
| `structured/chakra_specific_questions.json` | Valid JSON, 17 unique question_ids, all required fields present | Pass |
| `raaga/structured/chakra_raga_bridge.json` | Valid JSON, every referenced raga cross-checked against `raga_metadata.json` | Pass (2/3 resolved directly, 1/3 resolved via equivalents table, 0 invented) |
| `structured/emergency_contacts.json` | Valid JSON, restructured by country, US data preserved | Pass |
| All other files touched this pass | Re-validated after edits | Pass |
