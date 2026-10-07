# ANAHAT Knowledge Base — Gap-Closure & Final Hardening Report (2026-08-11, Pass 2)

## COMPLETED

- `structured/clinical_context_questions.json` created — safety/personalization
  context questions across 10 categories, explicitly distinct in purpose from
  `clinical_conditions_pending_review/`.
- `raaga/structured/raga_samay_chakra_time_wheel.json` created — exact 12-segment
  clock boundaries transcribed from a 300dpi re-render of the source image,
  which this pass found clearly legible.
- `raaga/structured/carnatic_raga_metadata.json` created — Bilahari resolved as
  a Carnatic-tradition entity with its (internally-inconsistent, flagged)
  Hindustani equivalents, not forced into a fabricated single mapping.
- `raaga/structured/raga_safety_metadata.json` created — 7 condition-flagged
  ragas routed to clinical review; explicit "empty ≠ safe" usage constraint for
  the remaining ~85.
- `chakra_raga_bridge.json` re-reviewed and confirmed compliant with the
  raga-research vs. chakra-mapping separation requirement.
- QA review of all 17 Throat/Third-Eye/Crown questions completed; 1 leading
  question found and fixed (CQ-AJN-02).
- `knowledge_base_ingestion_matrix.csv` extended with
  author/publication_title/license_status/source_verification_status/
  ingestion_status for all 64 rows.

## PARTIALLY COMPLETED

- **Svara → Chakra assignments**: new canonical `structured/svara_chakra_mapping.json`
  built with full source/evidence-level detail per svara, but only one
  tradition/lineage was ever found — not independently cross-validated. Still
  needs a musicology domain expert.
- **93-raga metadata**: `thaat` filled for 19/92 ragas via a legitimate
  cross-reference join against data already in the KB (not new research).
  aroha/avaroha/pakad/mood_character/therapeutic_goal remain null for all 92 —
  **this pass has no musicological reference source or web access to fill
  these**, and did not fabricate them.
- **Raga contraindications**: framework built and correctly populated with
  "insufficient evidence" for nearly every raga — this is very likely the
  correct long-term state of this file, not a temporary gap, absent real
  clinical/musicological input.
- **Throat/Third-Eye/Crown questions**: reviewed and one issue fixed, but this
  was an AI QA pass, not a clinical validation — `therapist_review_required`
  remains on every question.
- **47 registry-only files**: classified with the new licensing vocabulary,
  but zero additional files were newly ingested this pass (see "Files Not
  Ingested" below) — classification is not the same as resolution.

## REQUIRES HUMAN REVIEW

- Svara-to-chakra mapping (musicological/domain expert).
- All 93 raga metadata gaps (aroha/avaroha/pakad/mood) — needs a musicologist
  or a citable reference text.
- The 7 condition-flagged ragas in `raga_safety_metadata.json` — needs
  clinical lead sign-off before any is shown to a user who has disclosed the
  associated condition.
- All 17 Throat/Third-Eye/Crown questions — needs an actual therapist/
  psychologist review, not just this pass's structural QA.
- Bilahari's two conflicting Hindustani equivalents (Alaiya Bilawal vs.
  Desakshi) in the existing equivalents table — needs a musicologist to
  confirm whether this is a genuine one-to-many relationship or a source error.
- `clinical_conditions_pending_review/` folder — still needs a product/
  clinical decision on whether it ships at all (recommendation logged: no).

## REQUIRES SOURCE VERIFICATION

- **KIRAN helpline number** (1800-599-0019) — see capability note below.
- **108/102 ambulance, state-by-state status** — same.
- **US crisis resources (988, Crisis Text Line, 911)** — never re-verified by
  any pass of this KB.
- 21 files in the ingestion matrix flagged `source_verification_required`
  (no author/publisher identifiable from the document text).

**Capability note, stated plainly:** this pass — like every prior pass of this
knowledge base — has no live web/browsing tool available in this environment.
"Verification" of the emergency contact numbers in earlier passes meant
matching training-data recall to a named official source, not a live check.
This pass relabeled those fields to say that accurately
(`training_data_recall_matches_named_official_source_not_live_checked`)
rather than continue using the more confident-sounding but inaccurate
`verified_via_official_source` label. **None of the phone numbers or URLs in
this knowledge base should be trusted for production use until a human
actually calls the number or opens the URL.**

## REQUIRES LICENSING REVIEW

- 23 files: commercially-published books/textbooks/manuals with no ingestion
  license confirmed (DSM-5-TR, Grant's Atlas of Anatomy, The Body Keeps the
  Score, Cognitive Psychology 6e, the Handbook of Music Therapy 2nd ed.,
  Complete Book of Chakras, and 17 others) — `license_review_required` in the
  matrix.
- 7 files sourced from filenames indicating an unauthorized-sharing aggregator
  (PDFDrive, pdfcoffee.com) — flagged `do_not_ingest_sourced_from_
  unauthorized_sharing_aggregator`, a stricter category than ordinary
  license-review, since the distribution channel itself is questionable
  regardless of the underlying work's copyright status.
- 9 "ANAHAT own IP" files — the relationship between "Anahat Music Therapy
  Training" (the named source organization) and this project is still
  unconfirmed from a prior pass; not re-resolved this pass.

## NOT SAFE TO INFER / NOT FOUND

- Aroha, avaroha, pakad, and mood_character for all 93 ragas.
- Any raga contraindication beyond the 7 condition-flagged associations
  already present in traditional-indication source material (which are
  *indications*, not contraindications, and are explicitly not the same
  thing).
- Any conflicting or alternative svara-to-chakra tradition (none was found,
  which is different from confirming none exists).
- Any independently-corroborated live value for KIRAN, 108, 102, 988, or
  Crisis Text Line.

## FILES CREATED

```
structured/svara_chakra_mapping.json
structured/clinical_context_questions.json
raaga/structured/raga_samay_chakra_time_wheel.json
raaga/structured/carnatic_raga_metadata.json
raaga/structured/raga_safety_metadata.json
rag/assessment_technique/_QA_REVIEW_throat_third_eye_crown_2026_08.md
raaga/reference_images/rag_samay_chakra_hires-1.png
GAP_CLOSURE_VALIDATION_REPORT.md (this file)
```

## FILES MODIFIED

```
structured/chakra_master.json          (v1.2 -> v1.3, note updated, points to new canonical svara file)
structured/emergency_contacts.json     (v2.0 -> v2.1, verification_status vocabulary corrected)
structured/chakra_specific_questions.json  (CQ-AJN-02 reworded)
raaga/structured/raga_metadata.json    (v1.0 -> v2.0, thaat cross-referenced, not_found status fields added)
raaga/structured/chakra_raga_bridge.json   (confirmation note appended, no structural change)
knowledge_base_ingestion_matrix.csv    (5 new columns)
knowledge_base_manifest.json           (v3.0 -> v4.0, full gap-closure status table added)
```

## FILES NOT INGESTED

Every file already marked `do_not_ingest_full_text`, `license_review_required`,
or `source_verification_required` in the ingestion matrix from the prior pass
remains not-ingested. This pass added classification detail but performed
**zero new document ingestion** — it was a structured-data and governance
hardening pass, per the instruction to prioritize accuracy/traceability over
closing every gap.

## QDRANT INGESTION READINESS

**NOT READY.**

Reason: the structured/governance/safety layer is now meaningfully stronger
(explicit evidence separation, honest verification-status labeling, a proper
safety-metadata framework), but three blocking items remain:

1. **No live source verification has ever occurred** for the emergency
   contact numbers in this KB — these are safety-critical and must be
   confirmed before any deployment, not just before "production."
2. **Licensing status is unresolved** for 23+7 = 30 files, and the
   "Anahat Music Therapy Training" IP relationship is still unconfirmed for
   9 more — ingesting any of these without resolution is a real legal
   exposure, not a formality.
3. **No environment in any pass of this project has had live Qdrant/embedding
   API access** — everything delivered is a design artifact (schema,
   structured JSON, classified registry, chunked-and-tagged markdown for the
   already-ingested files) ready to run through a real ingestion pipeline
   once one is available, not a live collection.

## Summary counts

| Category | Count |
|---|---|
| Total files across all uploads (post-dedup) | 57 new + 25 from v1 = 82 unique source documents |
| Approved for ingestion (structured data + small attributed docs) | 15 |
| Pending licensing review | 30 |
| Pending source verification (unattributed) | 21 |
| Pending clinical review (raga safety, question sets, clinical_context) | 3 structured frameworks, all entries |
| Pending musicological review (svara mapping, 93-raga metadata, Bilahari) | 3 structured items |
| Rejected outright (unauthorized-aggregator sourcing) | 7 |
