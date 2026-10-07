---
document_type: integration_report
knowledge_category: governance
version: 1.0
---

# Indicator Strength Rating Integration — Conflict & Missing-Data Report

**Source file:** `ANAHAT_Chakra_Indicator_Strength_Rating_Filled.xlsx`
**MD5:** `093ccd3bf82daa95f137396cb86b4fd7`
**Status:** Re-uploaded 2026-09-02. Verified byte-identical in substance to the
version integrated in the prior pass — this report covers both the original
integration and this re-verification, since the findings are the same.

## Method

For each of the three sheets (Symptoms, Emotions, Behaviours), every row's
`(ID, Linked Chakra)` pair was matched exactly against the corresponding
entry in `symptom_to_chakra.json` / `emotion_to_chakra.json` /
`behaviour_to_chakra.json`. No fuzzy matching, no name-based matching, no
inference — a pair either matched exactly or it didn't.

## Results

| Sheet | KB entry-chakra pairs | Xlsx rated rows (excl. example) | Matched | Conflicts | Missing in xlsx | Unused in xlsx |
|---|---|---|---|---|---|---|
| Symptoms | 171 | 171 | 171 | 0 | 0 | 0 |
| Emotions | 20 | 20 | 20 | 0 | 0 | 0 |
| Behaviours | 24 | 24 | 24 | 0 | 0 | 0 |
| **Total** | **215** | **215** | **215** | **0** | **0** | **0** |

**Conflicts:** none. No rating in the xlsx contradicted a rating already
present from a prior integration pass — because this is the same underlying
data, not an update.

**Missing data:** none at the rating level — every symptom/emotion/behaviour-
chakra pair already in the KB has a therapist rating, and every rated row in
the xlsx corresponds to a real KB entry.

**Genuinely still missing (not a conflict, a gap):** the workbook's fourth
sheet, **Disambiguation Qs Review**, is **0/38 filled** — the "Is this a good
question?" and "Your Better Version" columns are empty for all 38 draft
questions. This is real, unstarted therapist work, tracked separately in
`structured/pending_therapist_input/disambiguation_questions_pending_review.json`.
Nothing was inferred or filled in to close this gap.

## What was NOT touched

Per explicit instruction: no raga or chakra *mapping* data (which ailment/
emotion/behaviour belongs to which chakra) was modified — only the
*strength* of already-existing mappings was annotated. The original Excel
file was not modified and is archived unchanged at
`source_registry/therapist_provided_files/` (checksum-verified identical to
the upload). This workbook was not, and should not be, ingested into Qdrant —
it's a one-time source for a structured-data field, not RAG content.
