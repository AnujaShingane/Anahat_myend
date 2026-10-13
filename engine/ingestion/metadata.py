from __future__ import annotations

from dataclasses import asdict

from ingestion.chunker import Chunk


def build_metadata(
    chunk: Chunk,
    *,
    domain: str,
    knowledge_type: str,
    evidence_level: str = "unknown",
    review_status: str = "unknown",
    canonical_version: str = "unknown",
    section: str | None = None,
    parent_heading: str | None = None,
    chakra: str | None = None,
    indicator_id: str | None = None,
    state_raw: str | None = None,
    association_rating: str | None = None,
    can_influence_chakra_score: bool = False,
    can_influence_raga_recommendation: bool = False,
) -> dict:

    data = asdict(chunk)

    return {
        "chunk_id": data["chunk_id"],
        "document_id": data["document_id"],
        "source_file": data["source_file"],
        "source_path": data["source_path"],
        "chunk_index": data["chunk_index"],

        "domain": domain,
        "knowledge_type": knowledge_type,
        "evidence_level": evidence_level,
        "review_status": review_status,
        "canonical_version": canonical_version,

        "section": section,
        "parent_heading": parent_heading,

        "chakra": chakra,
        "indicator_id": indicator_id,
        "state_raw": state_raw,
        "association_rating": association_rating,

        "can_influence_chakra_score":
            can_influence_chakra_score,

        "can_influence_raga_recommendation":
            can_influence_raga_recommendation,
    }