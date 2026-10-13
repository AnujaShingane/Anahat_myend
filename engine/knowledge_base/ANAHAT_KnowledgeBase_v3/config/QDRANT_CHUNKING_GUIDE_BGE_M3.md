# ANAHAT Qdrant Chunking Guide — BAAI/bge-m3

## Goal

Qdrant is the semantic retrieval layer. It should contain retrievable knowledge, not the engine's control logic.

## Do NOT chunk/index as ordinary RAG knowledge

Do not put these into the normal semantic collection as free-form control instructions:
- `config/governance_rules.json`
- credentials, secrets, API keys, environment files
- generated logs
- test outputs
- patient records
- temporary files
- duplicate OCR files already superseded by clean sources
- unresolved therapist-review drafts when the engine is not allowed to use them

Governance rules must remain application control logic.

## High-value content to index

Index these knowledge domains:
- `rag/chakra_reasoning/**`
- `rag/symptom_detection/**`
- `rag/assessment_technique/**`
- `rag/question_bank/**` only when used as retrievable assessment knowledge
- `rag/clinical_frameworks/**`
- `rag/medical_context/**` and medical reference folders that are approved for retrieval
- `rag/psychology/**` approved material
- `rag/music_therapy/**`
- `raaga/rag/**`
- approved raga structured records
- approved clinical/traditional reference documents
- therapist-provided raga source only when its review status permits use
- other files listed as approved/canonical in `config/qdrant_ingestion_manifest_final.json`

Keep authoritative structured mappings separately available to the deterministic engine:
- `structured/symptom_to_chakra.json`
- `structured/emotion_to_chakra.json`
- `structured/behaviour_to_chakra.json`
- `structured/chakra_master.json`
- assessment JSON files
- approved raga metadata / safety / time data

They may also have searchable representations, but the engine must validate retrieved candidates against the structured source of truth before scoring.

## Recommended chunking settings

For Markdown/TXT/PDF extracted text:
- target chunk size: 700–900 tokens
- hard maximum: 1100 tokens
- overlap: 100–150 tokens
- split first by headings/sections, then paragraphs, then sentences
- never split a table row, numbered rule, or question-answer pair across chunks
- keep a complete local context around each clinical statement
- preserve document title and heading path in metadata

Recommended default:
`target=800 tokens, max=1000, overlap=120`

For short structured JSON records:
- one logical record per chunk
- do NOT combine unrelated indicators
- preserve `indicator_id`, domain, chakra, state, rating, meaning, provenance

For long tables:
- one semantic row/group per chunk
- preserve row identifiers and all linked fields
- never merge different indicators merely to reach the target token size

For raga records:
- one raga record per chunk where possible
- keep raga name, aliases, tradition, therapeutic indication, time-of-day/prahar, safety flags, provenance together

## Why these settings

BGE-M3 is a multilingual semantic embedding model. Chunks need enough context to represent the meaning of a clinical/therapeutic statement, but not so much unrelated text that retrieval becomes noisy.

~800 tokens gives useful context for paragraphs and sections.
~120 tokens overlap prevents important context at boundaries from being lost.
A ~1000-token ceiling limits unrelated concepts being embedded together.
Heading-aware splitting keeps the semantic unit coherent.

## Metadata to store in Qdrant

Minimum:
- `chunk_id`
- `document_id`
- `source_path`
- `source_file`
- `domain`
- `knowledge_type`
- `evidence_level`
- `review_status`
- `canonical_version`
- `section`
- `parent_heading`
- `content_hash`
- `language`
- `embedding_model`
- `vector_dim`
- `can_influence_chakra_score`
- `can_influence_raga_recommendation`
- `chakra` when explicitly present
- `indicator_id` when applicable
- `state_raw` when applicable
- `association_rating` when applicable
- `therapist_review_required`

## Retrieval recommendation

Use BGE-M3 for:
- patient natural-language query → candidate knowledge
- multilingual question/knowledge matching
- paraphrase retrieval

Do NOT use vector similarity as the final evidence decision.

Pipeline:
patient text → BGE-M3 embedding → Qdrant top-k → metadata filters → reranking/threshold → authoritative structured validation → patient confirmation → evidence → scoring.

Start with `top_k=8–12` for candidate generation and validate empirically. Do not choose a clinical threshold from similarity alone; calibrate on therapist-labelled test data.

## Images

Do not put raw images into a text vector collection just because they exist. If an image contains authoritative text, first extract/curate the text and retain the image as source evidence. If image embeddings are later required, use a separate compatible multimodal design rather than mixing vector types blindly.
