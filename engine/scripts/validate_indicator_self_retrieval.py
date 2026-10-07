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

KB_PATH = (
    PROJECT_ROOT
    / "knowledge_base"
    / "ANAHAT_KnowledgeBase_v3"
    / "structured"
    / "symptom_to_chakra.json"
)

import json


def load_entries():
    with KB_PATH.open("r", encoding="utf-8") as f:
        data = json.load(f)

    return data["entries"]


def main():
    print("=" * 70)
    print("ANAHAT INDICATOR SELF-RETRIEVAL VALIDATION")
    print("=" * 70)

    entries = load_entries()

    print(f"Canonical indicators: {len(entries)}")
    print(f"Collection: {COLLECTION_NAME}")
    print(f"Model: {settings.embedding_model}")
    print(f"Dimension: {settings.embedding_dimension}")
    print()

    client = get_qdrant_client()
    embedder = BGE_M3_Embedder()

    top1_correct = 0
    top5_correct = 0

    failures = []

    for index, entry in enumerate(entries, start=1):

        indicator_id = entry["id"]
        ailment = entry["ailment"]

        vector = embedder.encode_query(ailment)

        results = client.query_points(
            collection_name=COLLECTION_NAME,
            query=vector.tolist(),
            limit=TOP_K,
            with_payload=True,
            with_vectors=False,
        ).points

        retrieved_ids = [
            result.payload["indicator_id"]
            for result in results
        ]

        top1 = (
            len(retrieved_ids) > 0
            and retrieved_ids[0] == indicator_id
        )

        top5 = indicator_id in retrieved_ids

        if top1:
            top1_correct += 1

        if top5:
            top5_correct += 1

        if not top1 or not top5:
            failures.append(
                {
                    "indicator_id": indicator_id,
                    "ailment": ailment,
                    "top1": (
                        retrieved_ids[0]
                        if retrieved_ids
                        else None
                    ),
                    "top5": retrieved_ids,
                    "top1_score": (
                        results[0].score
                        if results
                        else None
                    ),
                }
            )

        if index % 10 == 0:
            print(
                f"Processed {index}/{len(entries)}"
            )

    total = len(entries)

    top1_accuracy = (
        top1_correct / total * 100
        if total
        else 0
    )

    top5_accuracy = (
        top5_correct / total * 100
        if total
        else 0
    )

    print()
    print("=" * 70)
    print("SELF-RETRIEVAL RESULTS")
    print("=" * 70)

    print(
        f"Total indicators : {total}"
    )

    print(
        f"Top-1 correct    : {top1_correct}/{total}"
    )

    print(
        f"Top-1 accuracy   : {top1_accuracy:.2f}%"
    )

    print(
        f"Top-5 correct    : {top5_correct}/{total}"
    )

    print(
        f"Top-5 accuracy   : {top5_accuracy:.2f}%"
    )

    print()

    if failures:
        print(
            f"Failures requiring inspection: {len(failures)}"
        )

        print()

        for failure in failures:
            print(
                f"{failure['indicator_id']} | "
                f"{failure['ailment']}"
            )

            print(
                f"  Top-1: "
                f"{failure['top1']} "
                f"(score={failure['top1_score']})"
            )

            print(
                f"  Top-5: "
                f"{failure['top5']}"
            )

    else:
        print(
            "All 135 indicators passed Top-1 and Top-5."
        )

    print()
    print("=" * 70)

    if top1_accuracy >= 95 and top5_accuracy >= 99:
        print(
            "SELF-RETRIEVAL STATUS: PASS"
        )
    else:
        print(
            "SELF-RETRIEVAL STATUS: NEEDS INVESTIGATION"
        )

    print("=" * 70)


if __name__ == "__main__":
    main()