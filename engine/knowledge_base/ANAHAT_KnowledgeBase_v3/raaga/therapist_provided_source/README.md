---
document_type: reference
knowledge_category: raaga
version: 1.0
---

# Therapist-Provided Raga Reference: RAGATABLE_.xlsx

Uploaded by the project's therapist as raga metadata. A 367-raga musicological
workbook (sheets: RAGATABLE, MERUKHAND, TETRACHORDS, 32 THAAT, Kaunsis, CHECKS)
with computed aroha/avaroha, thaat classification, Carnatic equivalents, and
a self-contained validation system (`Check?` column) flagging which
aroha/avaroha derivations the workbook's own formulas could resolve
confidently vs. not.

## What was integrated into `raaga/structured/raga_metadata.json` (v3.0)

- 72 of the 93 ragas matched by name (51 exact, 21 via explicit high-confidence
  spelling-variant mapping — see the `_note` field and each row's
  `ragatable_reconciliation_note` in raga_metadata.json for the full list).
- Of those 72, only 65 got Aroha/Avaroha actually filled in — the other 7
  matched on swara-set but had `Check? = "-"` (unresolved) in the source
  workbook itself, so were deliberately left blank rather than copied.
- Thaat number, thaat-family matches (against the 10 standard thaats), and
  Carnatic equivalent were added for all 72 matched ragas.
- A `documented_melodic_phrase_from_therapist_source` field was added from the
  workbook's separate CHECKS sheet where available — explicitly flagged as
  NOT assumed equivalent to the traditional Pakad field, since that
  equivalence hasn't been confirmed.

## What was NOT integrated (deliberately)

- 21 ragas from the original 93 could not be confidently matched to a name in
  this workbook — several are ambiguous (e.g. this workbook's single generic
  "Deepak"/"Durga"/"Gauri" entries vs. the 93-list's thaat-disambiguated
  variants), and a few appear genuinely absent (e.g. Darbari Kanada, Brindavani
  Sarang, Megh Malhar). Each has an explicit reconciliation note rather than a
  guessed match.
- Mood/Character and Therapeutic_Use are still blank for all 93 ragas — this
  workbook doesn't contain that information at all.
- Many analytical columns in the source workbook (Murchana sets, Cohe/CoCo/CCC
  scores, Gaps, Opt., Deg., Uniq., the `LEV?` column, the Merukhand/Tetrachord
  permutation sheets) were NOT interpreted or imported — their exact meaning
  wasn't documented by the therapist and this pass did not want to guess at
  technical musicological terminology it isn't certain of.

## Also surfaced

- The original 93-raga source spreadsheet (`Raga List.xlsx`) has a genuine
  duplicate "Purvi" row (same Vadi/Samvadi, different traditional performance
  time) — a pre-existing data-quality issue, not something this pass altered,
  but worth the therapist's attention.
