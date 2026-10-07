from __future__ import annotations

import json
import re
import sys
import uuid
from pathlib import Path

import numpy as np
from qdrant_client.models import Distance, PointStruct, VectorParams

# ------------------------------------------------------------------
# Project root
# ------------------------------------------------------------------

PROJECT_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(PROJECT_ROOT))

from app.core.config import settings
from app.retrieval.embeddings import BGE_M3_Embedder
from app.retrieval.qdrant_client import get_qdrant_client


# ------------------------------------------------------------------
# Configuration
# ------------------------------------------------------------------

COLLECTION_NAME = "anahat_indicator_validation_v1"
STRUCTURED_PATH = PROJECT_ROOT / "knowledge_base" / "ANAHAT_KnowledgeBase_v3" / "structured"
INDICATOR_SOURCES = (
    ("symptom_to_chakra.json", "symptom", "ailment"),
    ("emotion_to_chakra.json", "emotion", "emotion"),
    ("behaviour_to_chakra.json", "behaviour", "behaviour"),
)


# ------------------------------------------------------------------
# Load canonical KB
# ------------------------------------------------------------------

def load_indicator_kb():
    entries, source_versions = [], {}
    for filename, domain, term_key in INDICATOR_SOURCES:
        path = STRUCTURED_PATH / filename
        if not path.exists():
            raise FileNotFoundError(f"Canonical indicator KB not found: {path}")
        with path.open("r", encoding="utf-8") as f:
            data = json.load(f)
        if not isinstance(data, dict) or not isinstance(data.get("entries"), list):
            raise ValueError(f"{filename} must contain an entries list.")
        source_versions[filename] = data.get("_schema_version")
        for raw in data["entries"]:
            entries.append({**raw, "_domain": domain, "_term_key": term_key, "_source_file": filename})
    return {"source_versions": source_versions}, entries


# ------------------------------------------------------------------
# Validate records
# ------------------------------------------------------------------

def validate_entries(entries):
    errors = []
    seen_ids = set()

    for index, entry in enumerate(entries):
        required = {entry.get("_term_key"), "id", "diagnostic_type"}
        if entry.get("_domain") == "symptom":
            required |= {"chakra", "state", "indicator_strength_by_chakra"}
        else:
            required.add("mappings")
        missing = required - set(entry.keys())

        if missing:
            errors.append(
                f"Entry {index}: missing fields {sorted(missing)}"
            )

        entry_id = entry.get("id")
        if entry_id in seen_ids:
            errors.append(
                f"Duplicate indicator ID: {entry_id}"
            )

        seen_ids.add(entry_id)
        if entry.get("_domain") == "symptom":
            if not isinstance(entry.get("chakra"), list) or not isinstance(entry.get("indicator_strength_by_chakra"), dict):
                errors.append(f"{entry_id}: symptom chakra mappings have an invalid shape")
        else:
            mappings = entry.get("mappings")
            if not isinstance(mappings, list) or not mappings or any(
                not all(m.get(k) for k in ("chakra", "state", "indicator_strength")) for m in mappings
            ):
                errors.append(f"{entry_id}: {entry.get('_domain')} mappings have an invalid shape")

    if errors:
        print("VALIDATION ERRORS:")
        for error in errors:
            print(f" - {error}")

        raise ValueError(
            f"Canonical KB validation failed with {len(errors)} error(s)."
        )

    print("Canonical indicator validation: PASS")


# ------------------------------------------------------------------
# Retrieval representation
# ------------------------------------------------------------------

def build_retrieval_text(entry):
    """
    Build semantic retrieval text.

    IMPORTANT:
    Chakra/state/strength are deliberately excluded from the
    embedding text. They remain authoritative structured metadata.
    """

    term = str(entry[entry["_term_key"]]).strip()
    context = str(entry.get("comment") or "").strip()
    if entry["_domain"] != "symptom":
        context = " ".join(m.get("meaning", "") for m in entry.get("mappings", []) if m.get("meaning"))
    context = re.sub(
        r"\b(?:root|sacral|solar plexus|heart|throat|third eye|crown|first|second|third|fourth|fifth|sixth|seventh)\s+chakra\b",
        "",
        context,
        flags=re.IGNORECASE,
    )
    context = re.sub(r"\bchakras?\b", "", context, flags=re.IGNORECASE)
    context = re.sub(r"\b(?:deficient|excess)\b", "", context, flags=re.IGNORECASE)
    context = re.sub(r"\s+", " ", context).strip()

    return f"Indicator: {term}\nDomain: {entry['_domain']}" + (f"\nContext: {context}" if context else "")


# ------------------------------------------------------------------
# Payload
# ------------------------------------------------------------------

def build_payload(entry, retrieval_text):
    if entry["_domain"] == "symptom":
        chakras = entry["chakra"]
        strength_by_chakra = entry["indicator_strength_by_chakra"]
        mapping_state = entry["state"]
        mapping_source = "symptom_to_chakra.json"
    else:
        mappings = entry["mappings"]
        chakras = [m["chakra"] for m in mappings]
        strength_by_chakra = {m["chakra"]: m["indicator_strength"] for m in mappings}
        mapping_state = None
        mapping_source = entry["_source_file"]
    term = entry[entry["_term_key"]]
    payload = {
        "indicator_id": entry["id"],
        "term": term,
        "domain": entry["_domain"],
        "chakra": chakras,
        "chakra_count": len(chakras),
        "diagnostic_type": entry["diagnostic_type"],
        "disambiguation_pattern_id": entry.get(
            "disambiguation_pattern_id"
        ),
        "indicator_strength_by_chakra": strength_by_chakra,
        "source": entry.get("source"),
        "original_reference": entry.get("original_reference"),
        "clinical_disclaimer": entry.get("clinical_disclaimer"),
        "retrieval_text": retrieval_text,

        # Provenance / governance
        "retrieval_layer": "canonical_indicator",
        "chakra_mapping_source": mapping_source,
        "embedding_model": settings.embedding_model,
        "vector_dimension": settings.embedding_dimension,
    }
    # Keep legacy symptom payload fields intact; non-symptom entries use their
    # own domain and structured mappings without inventing a shared state.
    if entry["_domain"] == "symptom":
        payload.update({"ailment": term, "state": mapping_state, "comment": entry.get("comment")})
    else:
        payload["comment"] = " ".join(m.get("meaning", "") for m in entry.get("mappings", []) if m.get("meaning"))
    return payload


# ------------------------------------------------------------------
# Deterministic Qdrant point ID
# ------------------------------------------------------------------

def qdrant_point_id(indicator_id):
    return str(
        uuid.uuid5(
            uuid.NAMESPACE_URL,
            f"anahat:indicator:{indicator_id}",
        )
    )


# ------------------------------------------------------------------
# Create collection
# ------------------------------------------------------------------

def ensure_collection(client):
    collections = client.get_collections()

    existing = {
        collection.name
        for collection in collections.collections
    }

    if COLLECTION_NAME in existing:
        print(
            f"Collection already exists: {COLLECTION_NAME}"
        )
        return

    client.create_collection(
        collection_name=COLLECTION_NAME,
        vectors_config=VectorParams(
            size=settings.embedding_dimension,
            distance=Distance.COSINE,
        ),
    )

    print(
        f"Created collection: {COLLECTION_NAME}"
    )


# ------------------------------------------------------------------
# Vector validation
# ------------------------------------------------------------------

def validate_vectors(vectors, expected_count):
    vectors = np.asarray(vectors)

    if vectors.ndim != 2:
        raise ValueError(
            f"Expected 2D vectors, got shape {vectors.shape}"
        )

    if vectors.shape[0] != expected_count:
        raise ValueError(
            f"Expected {expected_count} vectors, "
            f"got {vectors.shape[0]}"
        )

    if vectors.shape[1] != settings.embedding_dimension:
        raise ValueError(
            f"Expected dimension {settings.embedding_dimension}, "
            f"got {vectors.shape[1]}"
        )

    if not np.isfinite(vectors).all():
        raise ValueError(
            "Vectors contain NaN or Inf values."
        )

    norms = np.linalg.norm(vectors, axis=1)

    if not np.allclose(norms, 1.0, atol=1e-4):
        raise ValueError(
            "Vectors are not L2 normalized."
        )

    print("Vector validation: PASS")


# ------------------------------------------------------------------
# Upsert
# ------------------------------------------------------------------

def main():
    print("=" * 60)
    print("ANAHAT Canonical Indicator Qdrant Validation")
    print("=" * 60)

    data, entries = load_indicator_kb()

    print(f"Schema version: {data.get('_schema_version')}")
    print(f"Canonical indicators: {len(entries)}")

    validate_entries(entries)

    retrieval_texts = [
        build_retrieval_text(entry)
        for entry in entries
    ]

    print("Loading BGE-M3...")
    embedder = BGE_M3_Embedder()

    print("Generating indicator embeddings...")

    vectors = embedder.encode_documents(
        retrieval_texts
    )

    validate_vectors(
        vectors,
        expected_count=len(entries),
    )

    client = get_qdrant_client()

    ensure_collection(client)

    points = []

    for entry, text, vector in zip(
        entries,
        retrieval_texts,
        vectors,
    ):
        points.append(
            PointStruct(
                id=qdrant_point_id(entry["id"]),
                vector=vector.tolist(),
                payload=build_payload(
                    entry,
                    text,
                ),
            )
        )

    print(
        f"Upserting {len(points)} indicator points..."
    )

    client.upsert(
        collection_name=COLLECTION_NAME,
        points=points,
        wait=True,
    )

    count = client.count(
        collection_name=COLLECTION_NAME,
        exact=True,
    ).count

    print(f"Points after upsert: {count}")

    if count != len(entries):
        raise RuntimeError(
            f"Expected {len(entries)} points, "
            f"found {count}"
        )

    # --------------------------------------------------------------
    # Payload verification
    # --------------------------------------------------------------

    stored_ids = [
        qdrant_point_id(entry["id"])
        for entry in entries
    ]

    retrieved = client.retrieve(
        collection_name=COLLECTION_NAME,
        ids=stored_ids,
        with_payload=True,
        with_vectors=False,
    )

    retrieved_ids = {
        point.payload["indicator_id"]
        for point in retrieved
    }

    expected_ids = {
        entry["id"]
        for entry in entries
    }

    if retrieved_ids != expected_ids:
        missing = expected_ids - retrieved_ids
        extra = retrieved_ids - expected_ids

        raise RuntimeError(
            f"Payload verification failed. "
            f"Missing={missing}, Extra={extra}"
        )

    print("Payload integrity: PASS")

    print("=" * 60)
    print("INDICATOR QDRANT VALIDATION: PASS")
    print("=" * 60)
    print(f"Collection: {COLLECTION_NAME}")
    print(f"Indicators: {count}")
    print(f"Dimension: {settings.embedding_dimension}")
    print("Embedding model:", settings.embedding_model)
    print("Payload integrity: PASS")


if __name__ == "__main__":
    main()
