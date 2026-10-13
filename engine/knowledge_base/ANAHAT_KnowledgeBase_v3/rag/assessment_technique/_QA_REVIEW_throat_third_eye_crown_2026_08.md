---
document_type: qa_review_record
knowledge_category: assessment_technique
version: 1.0
---

# QA Review: Throat / Third-Eye / Crown Chakra Questions (Gap-Closure Pass)

Scope: `structured/chakra_specific_questions.json` (17 questions) and
`rag/assessment_technique/chakra_specific_questioning_{throat,third_eye,crown}.md`.

## Review criteria and results

| Criterion | Result |
|---|---|
| Questions are neutral (don't assume an answer) | 16/17 pass as-is. 1 fixed this pass: CQ-AJN-02 presupposed focus difficulty existed ("What usually makes it difficult for you to focus?") — reworded to be conditional rather than asserted. |
| Questions are not leading | Same finding as above — CQ-AJN-02 was the only leading item found. |
| Questions do not diagnose | Pass — no question names a clinical condition or asks the patient to self-rate against diagnostic criteria. |
| Questions do not assume chakra beliefs | Pass — no question mentions "chakra," "energy," or any esoteric framing; all are plain-language psychological/behavioral questions (e.g. about focus, purpose, expression) that happen to map to a chakra domain internally. |
| Crown/spiritual questions remain optional | Pass — all 5 Crown questions are marked `optional: true` in `sensitivity`, and CQ-CRN-05 explicitly asks consent before spirituality is considered at all. |
| Questions have appropriate follow-ups | Partial — Throat questions have `follow_up_if_ambiguous` populated; several Third Eye and Crown questions have an empty array. Not fixed this pass (would require new question authoring, out of scope for a review pass) — flagged below. |
| Ambiguous answers can be clarified | Same as above — mechanism exists (`follow_up_if_ambiguous` field) but isn't populated for every question yet. |
| Therapist review explicitly marked | Pass — every question carries `review_status: therapist_review_required` or the narrative files carry `canonical_version: true` with an explicit clinical-lead-review note. |

## Outcome

**Not clinically validated by this review.** This was a wording/structure QA
pass by an AI system, not a review by a qualified therapist or psychologist.
`review_status: therapist_review_required` remains on every question and is
NOT downgraded by this pass — a genuine clinical review still needs to happen
before these questions are treated as validated.

## Open item (not fixed this pass)

`follow_up_if_ambiguous` is empty for CQ-AJN-01, CQ-AJN-03 through 06, and all
5 CQ-CRN questions. Recommend a therapist or the product team author these
before the questions go into active use, so ambiguous patient answers have a
defined clarification path rather than an empty list.
