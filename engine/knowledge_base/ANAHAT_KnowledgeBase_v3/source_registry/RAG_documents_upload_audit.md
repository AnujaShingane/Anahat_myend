---
document_type: source_audit
version: 1.0
---

# Audit: `RAG_documents-20260811T042928Z-1-001.zip`

**Finding: this upload is the original 25-document source set that v1 of this
knowledge base was already built from** (matches v1's own
`ANAHAT_Knowledge_Architecture_Report.md` file inventory by name, one-for-one).
Per your instruction — no redundancy — almost none of it was re-ingested.

## Disposition of all 22 files

### Used to fill a genuine, previously-flagged gap (2 files)

| File | What it filled |
|---|---|
| `Chakra_Mapping.xlsx` | v1's report called this file's PDF-extracted version "unrecoverable" and left the `swara_note_for_raaga_mapping` field in `chakra_master.json` flagged "needs domain check, derived positionally." This spreadsheet's `Swar` column gives the identical Root→Crown Sa/Re/Ga/Ma/Pa/Dha/Ni sequence, from an independent extraction. **Applied:** `structured/chakra_master.json` bumped to v1.2, review note updated from "needs domain check" to "corroborated by a second independent source" — not blindly upgraded to "confirmed," since both sources may share the same original lineage. |
| `Music Therapy Case - Question Quadrants.xlsx` | v1's `quadrant_question_bank.json` had `needs_source_reexport: true` and only bare attribute names, no response options. This spreadsheet is the clean re-export, with a `Possible Categories/Responses` column per attribute the old file never captured. **Applied:** `structured/quadrant_question_bank.json` bumped to v1.1, added `attributes_with_responses` per quadrant (all 10 quadrants, 77 attributes, 0 mismatches on verification), `needs_source_reexport` set to `false`. |

### Confirmed fully redundant — already consolidated in v1, NOT re-ingested (20 files)

Spot-checked 5 of the 20 line-by-line against their existing v1 counterparts
(`Fix_Questions.txt` vs `opening_questions.json`/`fixed_opening_questions.json`,
`mental_health_resources.txt` vs `emergency_contacts.json`,
`symptom_detection_guide.txt` vs `rag/symptom_detection/`,
`advanced_questioning_techniques.txt` vs the Throat/Third-Eye/Crown gap file —
confirmed the same unfinished placeholder text, no new content —
`Chakra and common-ailments.txt` vs `symptom_to_chakra.json`'s own source
citation) — all five matched byte-for-byte or near-identical in substance. The
remaining 15 share filenames with v1's documented source list and its explicit
merge/discard log, so were not re-ingested on the same basis:

- `CHAKRA & COMMON AILMENTS REFERENCE GUIDE.pdf`, `Chakra and common-ailments.pdf`, `Chakra and common-ailments.txt`, `physical_ailment_chakra_mapping.txt` → all merged into `structured/symptom_to_chakra.json` in v1
- `COMPREHENSIVE CHAKRA GUIDE.pdf`, `RAG/root_chakra.txt`, `RAG/sacral_chakra.txt`, `RAG/solar_plexus_chakra.txt`, `RAG/heart_chakra.txt`, `RAG/throat_chakra.txt`, `RAG/third_eye_chakra.txt`, `RAG/crown_chakra.txt` → all merged into `structured/chakra_master.json` in v1
- `emotional_pattern_chakra_mapping.txt` → `structured/emotion_to_chakra.json`
- `RAG/behavioural_pattern_chakra_mapping.txt` → `structured/behaviour_to_chakra.json`
- `advanced_questioning_techniques.txt` → `rag/assessment_technique/` (confirmed: still ends mid-sentence at Throat/Third-Eye/Crown, same unresolved gap, no new content)
- `advanced_chakra_therapy.txt` → `rag/protocol_and_safety/` + `rag/wellness_strategies/`
- `symptom_detection_guide.txt` → `rag/symptom_detection/`
- `therapy_techniques.txt` → `rag/clinical_frameworks/cbt_core_techniques.md`
- `wellness_strategies.txt` → `rag/wellness_strategies/holistic_wellness_strategies.md`
- `Questions.txt` → `rag/question_bank/` incl. `clinical_conditions_pending_review/`
- `Fix_Questions.txt` → `structured/fixed_opening_questions.json` (superseded by `opening_questions.json`)
- `mental_health_resources.txt` → `structured/emergency_contacts.json` (still US-only numbers — this upload did not contain Indian crisis resources either; that gap remains open)

## What this means for the "no redundancy" goal

Two structured files were updated in place (not duplicated). Zero new files
were created for the other 20 — they would have added no new information and
only risked the retriever pulling two differently-worded versions of the same
fact, which is exactly the failure mode v1's original dedup pass was designed
to prevent.
