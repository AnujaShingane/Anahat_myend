from __future__ import annotations

import sys
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(PROJECT_ROOT))

from app.core.config import settings
from app.retrieval.embeddings import BGE_M3_Embedder
from app.retrieval.qdrant_client import get_qdrant_client


COLLECTION_NAME = "anahat_indicator_validation_v1"
TOP_K = 5


TEST_QUERIES = [
    (
        "Q01",
        "I have been feeling very anxious lately and I keep worrying about everything.",
    ),
    (
        "Q02",
        "I cannot sleep properly at night and my mind keeps running.",
    ),
    (
        "Q03",
        "I often get abdominal cramps.",
    ),
    (
        "Q04",
        "I feel completely exhausted even though I am not doing much.",
    ),
    (
        "Q05",
        "I have trouble speaking clearly and sometimes I stutter.",
    ),
    (
        "Q06",
        "I get frequent headaches.",
    ),
    (
        "Q07",
        "I have difficulty maintaining relationships with people close to me.",
    ),
    (
        "Q08",
        "I feel stressed and overwhelmed at work.",
    ),
    (
        "Q09",
        "I enjoy spending time with my friends and talking with them.",
    ),
    (
        "Q10",
        "I have been feeling emotionally low and disconnected lately.",
    ),
]


def main():
    print("=" * 70)
    print("ANAHAT INDICATOR SEMANTIC RETRIEVAL VALIDATION")
    print("=" * 70)

    client = get_qdrant_client()
    embedder = BGE_M3_Embedder()

    collection = client.get_collection(
        COLLECTION_NAME
    )

    print(
        f"Collection: {COLLECTION_NAME}"
    )

    print(
        f"Points: {collection.points_count}"
    )

    print(
        f"Embedding model: {settings.embedding_model}"
    )

    print(
        f"Vector dimension: {settings.embedding_dimension}"
    )

    print()

    for query_id, query in TEST_QUERIES:

        print("-" * 70)
        print(query_id)
        print("PATIENT:", query)
        print("-" * 70)

        vector = embedder.encode_query(query)

        results = client.query_points(
            collection_name=COLLECTION_NAME,
            query=vector.tolist(),
            limit=TOP_K,
            with_payload=True,
            with_vectors=False,
        ).points

        for rank, result in enumerate(
            results,
            start=1,
        ):
            payload = result.payload

            print(
                f"{rank}. "
                f"{payload.get('ailment')} "
                f"| score={result.score:.4f} "
                f"| id={payload.get('indicator_id')} "
                f"| type={payload.get('diagnostic_type')} "
                f"| chakra_count={payload.get('chakra_count')}"
            )

        print()


if __name__ == "__main__":
    main()