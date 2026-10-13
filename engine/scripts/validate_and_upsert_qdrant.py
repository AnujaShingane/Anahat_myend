import json
import hashlib
import uuid
from pathlib import Path
import sys

PROJECT_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(PROJECT_ROOT))

from qdrant_client.models import PointStruct

from app.core.config import settings
from app.retrieval.embeddings import BGE_M3_Embedder
from app.retrieval.qdrant_client import get_qdrant_client


MANIFEST = Path("ANAHAT_Qdrant_Chunk_Manifest_v1.json")
COLLECTION = "anahat_kb_validation_v1"
EXPECTED_COUNT = 37
EXPECTED_DIMENSION = 1024
MAX_BGE_TOKENS = 1000


def fail(message):
    raise RuntimeError(f"VALIDATION FAILED: {message}")


def main():
    print("=== ANAHAT Qdrant Validation Ingestion ===")

    # ------------------------------------------------------------
    # 1. Load manifest
    # ------------------------------------------------------------
    if not MANIFEST.exists():
        fail(f"Manifest not found: {MANIFEST}")

    with MANIFEST.open("r", encoding="utf-8") as f:
        manifest = json.load(f)

    records = manifest.get("records")

    if not isinstance(records, list):
        fail("'records' must be a list")

    print(f"Manifest records: {len(records)}")

    if len(records) != EXPECTED_COUNT:
        fail(
            f"Expected {EXPECTED_COUNT} records, "
            f"found {len(records)}"
        )

    # ------------------------------------------------------------
    # 2. Validate records before generating embeddings
    # ------------------------------------------------------------
    ids = set()

    for i, record in enumerate(records):
        required = [
            "chunk_id",
            "source_document_id",
            "source_file",
            "text",
            "evidence_level",
            "ingestion_policy",
            "bge_m3_token_count",
        ]

        for field in required:
            if field not in record:
                fail(f"Record {i} missing field: {field}")

        chunk_id = record["chunk_id"]

        if not chunk_id:
            fail(f"Record {i} has empty chunk_id")

        if chunk_id in ids:
            fail(f"Duplicate chunk_id: {chunk_id}")

        ids.add(chunk_id)

        text = record["text"]

        if not isinstance(text, str) or not text.strip():
            fail(f"Record {i} has empty text")

        token_count = record["bge_m3_token_count"]

        if not isinstance(token_count, int):
            fail(
                f"Record {i} has invalid "
                f"bge_m3_token_count: {token_count!r}"
            )

        if token_count > MAX_BGE_TOKENS:
            fail(
                f"Record {i} exceeds BGE-M3 limit: "
                f"{token_count}"
            )

    print(f"Unique chunk IDs: {len(ids)}")
    print("Manifest validation: PASS")

    # ------------------------------------------------------------
    # 3. Verify Qdrant collection
    # ------------------------------------------------------------
    client = get_qdrant_client()

    collection = client.get_collection(COLLECTION)

    vector_config = collection.config.params.vectors

    if vector_config.size != EXPECTED_DIMENSION:
        fail(
            f"Collection dimension is {vector_config.size}, "
            f"expected {EXPECTED_DIMENSION}"
        )

    print(f"Qdrant collection: {COLLECTION}")
    print(f"Vector dimension: {vector_config.size}")
    print(f"Distance: {vector_config.distance}")
    print(f"Collection status: {collection.status}")

    # ------------------------------------------------------------
    # 4. Generate embeddings
    # ------------------------------------------------------------
    texts = [record["text"] for record in records]

    print("Loading BGE-M3...")
    embedder = BGE_M3_Embedder()

    if embedder.dimension != EXPECTED_DIMENSION:
        fail(
            f"Embedder dimension is {embedder.dimension}, "
            f"expected {EXPECTED_DIMENSION}"
        )

    print("Generating embeddings...")
    vectors = embedder.encode_documents(texts)

    if len(vectors) != EXPECTED_COUNT:
        fail(
            f"Expected {EXPECTED_COUNT} vectors, "
            f"found {len(vectors)}"
        )

    print(f"Generated vectors: {len(vectors)}")

    # ------------------------------------------------------------
    # 5. Validate vectors
    # ------------------------------------------------------------
    for i, vector in enumerate(vectors):
        if len(vector) != EXPECTED_DIMENSION:
            fail(
                f"Vector {i} dimension is {len(vector)}, "
                f"expected {EXPECTED_DIMENSION}"
            )

        if not all(float(x) == float(x) for x in vector):
            fail(f"Vector {i} contains NaN")

        if not all(abs(float(x)) != float("inf") for x in vector):
            fail(f"Vector {i} contains infinity")

    print("Vector validation: PASS")

    # ------------------------------------------------------------
    # 6. Build Qdrant points
    # ------------------------------------------------------------
    points = []

    for record, vector in zip(records, vectors):

        payload = dict(record)

        # Ensure text remains directly searchable/retrievable.
        payload["text"] = record["text"]

        # Record ingestion provenance.
        payload["embedding_model"] = settings.embedding_model
        payload["vector_dimension"] = EXPECTED_DIMENSION

        points.append(
            PointStruct(
                id=str(uuid.uuid5(uuid.NAMESPACE_URL, "anahat:chunk:" + record["chunk_id"])),
                vector=vector.tolist(),
                payload=payload,
            )
        )

    if len(points) != EXPECTED_COUNT:
        fail(
            f"Expected {EXPECTED_COUNT} Qdrant points, "
            f"built {len(points)}"
        )

    # ------------------------------------------------------------
    # 7. Upsert
    # ------------------------------------------------------------
    print(f"Upserting {len(points)} points...")

    client.upsert(
        collection_name=COLLECTION,
        points=points,
        wait=True,
    )

    print("Qdrant upsert: COMPLETE")

    # ------------------------------------------------------------
    # 8. Verify point count
    # ------------------------------------------------------------
    info = client.get_collection(COLLECTION)

    print(f"Points after upsert: {info.points_count}")

    if info.points_count != EXPECTED_COUNT:
        fail(
            f"Expected {EXPECTED_COUNT} points in Qdrant, "
            f"found {info.points_count}"
        )

    # ------------------------------------------------------------
    # 9. Retrieve every inserted point and verify payload
    # ------------------------------------------------------------
    stored_ids = [
    str(uuid.uuid5(uuid.NAMESPACE_URL, "anahat:chunk:" + chunk_id))
    for chunk_id in ids]

    retrieved = client.retrieve(
        collection_name=COLLECTION,
        ids=stored_ids,
        with_payload=True,
        with_vectors=False,
    )

    if len(retrieved) != EXPECTED_COUNT:
        fail(
            f"Expected to retrieve {EXPECTED_COUNT} points, "
            f"retrieved {len(retrieved)}"
        )

    retrieved_by_id = {
    point.payload["chunk_id"]: point
    for point in retrieved
    }
    for record in records:
        chunk_id = record["chunk_id"]

        if chunk_id not in retrieved_by_id:
            fail(f"Missing point after upsert: {chunk_id}")

        stored = retrieved_by_id[chunk_id]

        if stored.payload.get("source_file") != record["source_file"]:
            fail(f"source_file mismatch for {chunk_id}")

        if stored.payload.get("source_document_id") != record["source_document_id"]:
            fail(f"source_document_id mismatch for {chunk_id}")

        if stored.payload.get("evidence_level") != record["evidence_level"]:
            fail(f"evidence_level mismatch for {chunk_id}")

        if stored.payload.get("text") != record["text"]:
            fail(f"text mismatch for {chunk_id}")

    print("Payload integrity: PASS")

    # ------------------------------------------------------------
    # 10. Final result
    # ------------------------------------------------------------
    print()
    print("========================================")
    print("QDRANT VALIDATION INGESTION: PASS")
    print("========================================")
    print(f"Collection: {COLLECTION}")
    print(f"Points: {info.points_count}")
    print(f"Dimension: {EXPECTED_DIMENSION}")
    print(f"Expected chunks: {EXPECTED_COUNT}")
    print("Payload integrity: PASS")


if __name__ == "__main__":
    main()


