from __future__ import annotations

import sys
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(PROJECT_ROOT))

from app.retrieval.embeddings import BGE_M3_Embedder
from app.retrieval.qdrant_client import get_qdrant_client


COLLECTION_NAME = "anahat_indicator_validation_v1"
TOP_K = 5


# ------------------------------------------------------------------
# Controlled evaluation set
#
# expected_id=None means:
# no clinical indicator should be expected from this statement.
# ------------------------------------------------------------------

TEST_CASES = [

    # --------------------------------------------------------------
    # Anxiety
    # --------------------------------------------------------------

    {
        "id": "P01",
        "text": "I keep worrying about everything and feel anxious most of the time.",
        "expected": ["SYM-009"],
    },

    {
        "id": "P02",
        "text": "My mind is constantly filled with worries and I find it hard to relax.",
        "expected": ["SYM-009"],
    },

    # --------------------------------------------------------------
    # Insomnia
    # --------------------------------------------------------------

    {
        "id": "P03",
        "text": "I struggle to fall asleep at night and keep thinking for hours.",
        "expected": ["SYM-086"],
    },

    {
        "id": "P04",
        "text": "I wake up repeatedly and don't feel like I get proper sleep.",
        "expected": ["SYM-086"],
    },

    # --------------------------------------------------------------
    # Abdominal cramps
    # --------------------------------------------------------------

    {
        "id": "P05",
        "text": "I frequently experience painful cramping in my stomach area.",
        "expected": ["SYM-001"],
    },

    {
        "id": "P06",
        "text": "My abdomen sometimes tightens up and becomes very painful.",
        "expected": ["SYM-001"],
    },

    # --------------------------------------------------------------
    # Fatigue / exhaustion
    # --------------------------------------------------------------

    {
        "id": "P07",
        "text": "I feel exhausted even after doing very little during the day.",
        "expected": ["SYM-043", "SYM-028"],
    },

    {
        "id": "P08",
        "text": "I have very little energy and feel tired almost all the time.",
        "expected": ["SYM-043", "SYM-028"],
    },

    # --------------------------------------------------------------
    # Stuttering
    # --------------------------------------------------------------

    {
        "id": "P09",
        "text": "Sometimes I repeat sounds or words when I try to speak.",
        "expected": ["SYM-120"],
    },

    {
        "id": "P10",
        "text": "I sometimes struggle to get my words out and I stutter.",
        "expected": ["SYM-120"],
    },

    # --------------------------------------------------------------
    # Headaches
    # --------------------------------------------------------------

    {
        "id": "P11",
        "text": "I often have painful headaches.",
        "expected": ["SYM-065"],
    },

    {
        "id": "P12",
        "text": "My head starts hurting frequently throughout the week.",
        "expected": ["SYM-065"],
    },

    # --------------------------------------------------------------
    # Apathy
    # --------------------------------------------------------------

    {
        "id": "P13",
        "text": "I don't feel interested in doing anything lately.",
        "expected": ["SYM-010"],
    },

    {
        "id": "P14",
        "text": "I have been feeling emotionally flat and have little motivation.",
        "expected": ["SYM-010"],
    },

    # --------------------------------------------------------------
    # Context / non-symptom
    # --------------------------------------------------------------

    {
        "id": "N01",
        "text": "I really enjoy spending time with my friends.",
        "expected": [],
    },

    {
        "id": "N02",
        "text": "I have a very close and supportive family.",
        "expected": [],
    },

    {
        "id": "N03",
        "text": "I enjoy listening to music while relaxing in the evening.",
        "expected": [],
    },

    {
        "id": "N04",
        "text": "I am happy with my current job and enjoy working with my colleagues.",
        "expected": [],
    },
]


def main():

    print("=" * 70)
    print("ANAHAT INDICATOR PARAPHRASE VALIDATION")
    print("=" * 70)

    client = get_qdrant_client()
    embedder = BGE_M3_Embedder()

    total_positive = 0
    top1_correct = 0
    top5_correct = 0

    negative_total = 0
    negative_clean = 0

    for case in TEST_CASES:

        case_id = case["id"]
        text = case["text"]
        expected = case["expected"]

        print()
        print("-" * 70)
        print(case_id)
        print("PATIENT:", text)
        print("EXPECTED:", expected if expected else "NO INDICATOR")

        vector = embedder.encode_query(text)

        results = client.query_points(
            collection_name=COLLECTION_NAME,
            query=vector.tolist(),
            limit=TOP_K,
            with_payload=True,
            with_vectors=False,
        ).points

        retrieved = []

        for rank, result in enumerate(
            results,
            start=1,
        ):

            payload = result.payload

            indicator_id = payload["indicator_id"]
            ailment = payload["ailment"]

            retrieved.append(indicator_id)

            print(
                f"{rank}. "
                f"{ailment} "
                f"| {indicator_id} "
                f"| score={result.score:.4f}"
            )

        # ----------------------------------------------------------
        # Positive case
        # ----------------------------------------------------------

        if expected:

            total_positive += 1

            if retrieved and retrieved[0] in expected:
                top1_correct += 1

            if any(
                indicator_id in expected
                for indicator_id in retrieved
            ):
                top5_correct += 1

        # ----------------------------------------------------------
        # Negative/context case
        # ----------------------------------------------------------

        else:

            negative_total += 1

            # We don't call the top result "wrong" yet.
            # This measures whether the result looks obviously
            # irrelevant to the context statement.
            #
            # Candidate validation will later decide whether
            # a real candidate exists.

            if retrieved:
                negative_clean += 1

    # ------------------------------------------------------------------
    # Results
    # ------------------------------------------------------------------

    print()
    print("=" * 70)
    print("RESULTS")
    print("=" * 70)

    if total_positive:

        print(
            f"Positive cases       : {total_positive}"
        )

        print(
            f"Top-1 correct        : "
            f"{top1_correct}/{total_positive}"
        )

        print(
            f"Top-5 correct        : "
            f"{top5_correct}/{total_positive}"
        )

        print(
            f"Top-1 accuracy       : "
            f"{top1_correct / total_positive * 100:.2f}%"
        )

        print(
            f"Top-5 accuracy       : "
            f"{top5_correct / total_positive * 100:.2f}%"
        )

    print()

    print(
        f"Negative/context cases: {negative_total}"
    )

    print(
        "Note: Qdrant always returns nearest neighbours. "
        "Therefore a non-empty Top-5 result does NOT mean "
        "a clinical indicator was detected."
    )

    print()
    print("=" * 70)
    print("PARAPHRASE RETRIEVAL TEST COMPLETE")
    print("=" * 70)


if __name__ == "__main__":
    main()
