import json
from pathlib import Path
import uuid
from qdrant_client.models import PointStruct

from app.core.config import settings
from app.retrieval.embeddings import BGE_M3_Embedder
from app.retrieval.qdrant_client import get_qdrant_client


MANIFEST_PATH = (
    Path(__file__).resolve().parents[1]
    / "ANAHAT_Qdrant_Chunk_Manifest_v1.json"
)

BATCH_SIZE = 3


def main():
    print("Loading verified manifest...")

    with open(MANIFEST_PATH, "r", encoding="utf-8") as f:
        manifest = json.load(f)

    if manifest.get("status") != "PASS":
        raise RuntimeError("Manifest status is not PASS")

    records = manifest.get("records", [])

    if len(records) != 37:
        raise RuntimeError(f"Expected 37 records, found {len(records)}")

    print(f"Verified records: {len(records)}")

    client = get_qdrant_client()

    collection_info = client.get_collection(settings.qdrant_collection)
    vector_size = collection_info.config.params.vectors.size

    print(f"Qdrant collection: {settings.qdrant_collection}")
    print(f"Qdrant vector dimension: {vector_size}")

    if vector_size != 1024:
        raise RuntimeError(
            f"Expected Qdrant dimension 1024, found {vector_size}"
        )

    embedder = BGE_M3_Embedder()

    total_uploaded = 0

    for start in range(0, len(records), BATCH_SIZE):
        batch = records[start:start + BATCH_SIZE]

        print(
            f"Embedding batch "
            f"{start + 1}-{start + len(batch)} "
            f"of {len(records)}..."
        )

        texts = [record["text"] for record in batch]

        vectors = embedder.encode_documents(texts)

        if len(vectors) != len(batch):
            raise RuntimeError(
                f"Embedding count mismatch: "
                f"{len(vectors)} vs {len(batch)}"
            )

        if vectors.shape[1] != 1024:
            raise RuntimeError(
                f"Embedding dimension mismatch: "
                f"{vectors.shape[1]} vs 1024"
            )

        points = []

        for record, vector in zip(batch, vectors):
            payload = dict(record)

            points.append(
                PointStruct(
                    id=uuid.uuid5(
                        uuid.NAMESPACE_URL,
                        record["chunk_id"]
                    ),
                    vector=vector.tolist(),
                    payload=payload,
                )
            )

        client.upsert(
            collection_name=settings.qdrant_collection,
            points=points,
            wait=True,
        )

        total_uploaded += len(points)

        print(f"Uploaded: {total_uploaded}/{len(records)}")

    final_info = client.get_collection(settings.qdrant_collection)

    print()
    print("========================================")
    print("QDRANT INGESTION COMPLETE")
    print("========================================")
    print(f"Collection: {settings.qdrant_collection}")
    print(f"Points: {final_info.points_count}")
    print(f"Expected: {len(records)}")

    if final_info.points_count != len(records):
        raise RuntimeError(
            f"Point count mismatch: "
            f"{final_info.points_count} vs {len(records)}"
        )

    print("Verification: PASS")


if __name__ == "__main__":
    main()