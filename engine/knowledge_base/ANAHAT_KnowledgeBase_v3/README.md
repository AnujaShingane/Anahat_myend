---
document_type: reference
knowledge_category: raaga
version: 2.0
---

# Raaga Knowledge Base — Partially Populated (v2)

The v1 knowledge base flagged this folder as an empty data gap. This pass closes
part of that gap using real, extracted data from the DATA upload — **not**
invented content. What follows is honest about what's solid and what's still
missing.

## What's now here

```
raaga/
├── structured/
│   ├── raga_metadata.json                    93 ragas: vadi, samvadi, traditional
│   │                                          performance time. Verbatim from
│   │                                          Raga List.xlsx.
│   ├── raga_time_of_day.json                 19 time-period groupings using the
│   │                                          traditional 8-prahara system,
│   │                                          re-aggregated from raga_metadata.
│   ├── raga_hindustani_carnatic_equivalents.json   132 rows: Thaat, Melakarta
│   │                                          number, Hindustani <-> Carnatic
│   │                                          raga names.
│   └── chakra_raga_bridge.json                Schema for a future reviewed
│                                               chakra->raga mapping, PLUS ANAHAT's
│                                               own practitioner-tradition
│                                               therapeutic-goal->raga list.
│                                               can_influence_raga_recommendation
│                                               is FALSE — see file's own _note.
│
├── rag/
│   ├── raga_theory/                           Musicological/traditional context
│   │                                          (Indian classical music fundamentals,
│   │                                          therapeutic-approach framing, Nada
│   │                                          Yoga). Several source PDFs have no
│   │                                          attributable author — flagged
│   │                                          usage_review_required.
│   ├── chakra_raga_reasoning/                  Chakra <-> singing-style/vocal-
│   │                                          technique associations (ANAHAT's
│   │                                          own material).
│   └── raga_therapeutic_indications_practitioner/   The two ANAHAT practitioner-
│                                               tradition documents (Emotional
│                                               Issues, Senior Citizen Issues) --
│                                               SAFETY FLAGGED, see below.
│
└── reference_images/
    └── rag_samay_chakra.png                   The raga time-of-day wheel
                                                (24hr, 12 segments) -- image only,
                                                not yet digitized into structured
                                                data (see raga_time_of_day.json note).
```

## Critical safety note

Two of the ingested documents (`Emotional Issues & co-relation of Raga.pdf`,
`Senior Citizen Issues & co-relation of Raga.pdf`) list raga associations for
serious conditions — dementia, schizophrenia, Parkinson's disease, personality
disorders, cardiac issues, arthritis, migraine. These are ANAHAT's own training
material, not peer-reviewed evidence. `chakra_raga_bridge.json` and both markdown
files are explicitly flagged `can_influence_raga_recommendation: false` and
`review_status: clinical_review_required` for exactly this reason. **Do not wire
these into the recommendation engine without clinical lead sign-off and an
explicit non-treatment framing** (see `governance/safety_rules.json` S1, and the
proposed Rule 15 in `config/governance_addendum_proposed.json`).

## Still missing (do not guess these)

1. **A clinically validated chakra → raga mapping.** Nothing in either upload
   directly maps a chakra to specific ragas. `chakra_master.json`'s existing
   `swara_note_for_raaga_mapping` field (Sa/Re/Ga/Ma/Pa/Dha/Ni per chakra) is
   still the only chakra-adjacent field, and it was already flagged "needs
   domain check" in v1 — restated, not resolved, here.
2. **Aroha, avaroha, pakad, and mood/character** for all 93 ragas in
   `raga_metadata.json` — not present in the source spreadsheet, left `null`.
3. **Exact time-of-day wheel segment boundaries** from `Rag Samay Chakra.pdf` —
   it's an image, and the rotated small text couldn't be read with full
   confidence. The prahara-based grouping in `raga_time_of_day.json` is a
   reasonable stand-in but should be cross-checked against the wheel by someone
   who can zoom the source PDF directly.
4. **Contraindication data** — no source in either upload states which ragas
   are contraindicated for which patients/conditions. This must be sourced
   separately before the safety-filtering stage of the raga pipeline can be
   built out.
5. **Authorship/licensing confirmation** for several raga_theory sources
   (`Therapeutic Approach Of Indian Classical Music.pdf`, `Nada Yoga...pdf`,
   `The Selection Of Music For Therapeutic Purposes.pdf`, `Equivalent Ragas in
   Hindustani and Carnatic Music.pdf`) — none carry a visible author/publisher
   line in the extracted text.
