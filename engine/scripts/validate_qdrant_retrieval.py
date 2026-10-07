import sys
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(PROJECT_ROOT))

from app.retrieval.embeddings import BGE_M3_Embedder
from app.retrieval.qdrant_client import get_qdrant_client


COLLECTION = "anahat_knowledge"
TOP_K = 5

QUERIES = [
    "I have been feeling very anxious lately and I keep worrying about everything.",
    "I cannot sleep properly at night and my mind keeps running.",
    "I often get abdominal cramps.",
    "I feel completely exhausted even though I am not doing much.",
    "I have trouble speaking clearly and sometimes I stutter.",
    "I get frequent headaches.",
    "I have difficulty maintaining relationships with people close to me.",
    "I feel stressed and overwhelmed at work.",
    "I enjoy spending time with my friends and talking with them.",
    "I have been feeling emotionally low and disconnected lately.",
]


def main():
    print("=== ANAHAT Semantic Retrieval Validation ===")

    client = get_qdrant_client()
    embedder = BGE_M3_Embedder()

    info = client.get_collection(COLLECTION)

    print(f"Collection: {COLLECTION}")
    print(f"Points: {info.points_count}")
    print(f"Vector dimension: {info.config.params.vectors.size}")
    print()

    if info.points_count != 240:
        raise RuntimeError(
            f"Expected 240 points, found {info.points_count}"
        )

    for number, query in enumerate(QUERIES, start=1):

        print("=" * 80)
        print(f"QUERY {number}")
        print(query)
        print("-" * 80)

        vector = embedder.encode_query(query)

        results = client.query_points(
            collection_name=COLLECTION,
            query=vector.tolist(),
            limit=TOP_K,
            with_payload=True,
            with_vectors=False,
        ).points

        for rank, result in enumerate(results, start=1):

            payload = result.payload or {}

            print(f"\nRank {rank}")
            print(f"Score: {result.score:.4f}")
            print(f"Chunk ID: {payload.get('chunk_id')}")
            print(f"Source: {payload.get('source_file')}")
            print(f"Domain: {payload.get('domain')}")
            print(f"Evidence: {payload.get('evidence_level')}")
            print(f"Policy: {payload.get('ingestion_policy')}")

            text = payload.get("text", "")
            text = " ".join(text.split())

            if len(text) > 300:
                text = text[:300] + "..."

            print(f"Text: {text}")

        print()


if __name__ == "__main__":
    main()
