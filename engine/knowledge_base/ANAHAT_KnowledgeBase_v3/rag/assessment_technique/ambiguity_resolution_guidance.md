---
document_type: clinical_technique
knowledge_category: assessment_technique
source_document: ANAHAT assessment design (gap-fill pass, 2026-08-11)
canonical_version: true
evidence_level: general_reference
review_status: therapist_review_required
version: 1.0
---

# Ambiguity Resolution Guidance

When a patient's response is ambiguous, the AI must NOT immediately assign it
as chakra evidence. This applies to all chakras, not only the newly-added
Throat/Third-Eye/Crown questions, but is documented here since it was
authored alongside them.

## Pattern

```
Initial question
      |
      v
Ambiguous answer
      |
      v
Follow-up / ambiguity-resolution question (never assumes an interpretation)
      |
      v
Clarified evidence
      |
      v
Structured mapping (symptom_to_chakra.json / emotion_to_chakra.json /
behaviour_to_chakra.json)
      |
      v
Score
```

## Worked example (from the gap-filling brief)

> Patient: "I don't speak much."
>
> AI: "Do you generally prefer listening, or do you find it difficult to
> express yourself?"

The first statement alone is compatible with several different underlying
experiences (introversion, a Throat-domain expression difficulty, low mood,
cultural communication style, or simply a factual preference) — the follow-up
question disambiguates before anything is logged as evidence.

## Application

Every question in `structured/chakra_specific_questions.json` that has a
non-empty `follow_up_if_ambiguous` list is expected to use this pattern:
ask the primary question, and if the answer doesn't clearly indicate a
direction, ask the paired follow-up before treating the response as
structured evidence for any chakra mapping file.
