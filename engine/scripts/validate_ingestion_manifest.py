from __future__ import annotations

import json
from pathlib import Path


PROJECT_ROOT = Path(__file__).resolve().parents[1]

MANIFEST = (
    PROJECT_ROOT
    / "knowledge_base"
    / "ANAHAT_KnowledgeBase_v3"
    / "final_ingestion_manifest.json"
)


ALLOWED_POLICIES = {
    "INDEX",
    "STRUCTURED_ONLY",
    "DO_NOT_INDEX",
}


def main():

    print("=" * 70)
    print("ANAHAT INGESTION MANIFEST VALIDATION")
    print("=" * 70)

    if not MANIFEST.exists():

        print(
            f"\nERROR: Manifest does not exist:\n{MANIFEST}"
        )

        raise SystemExit(1)

    with MANIFEST.open(
        "r",
        encoding="utf-8"
    ) as f:

        data = json.load(f)

    records = data.get("records", [])

    errors = []
    warnings = []

    seen_files = set()

    for index, record in enumerate(records):

        source_file = record.get(
            "source_file",
            ""
        ).strip()

        source_path = record.get(
            "source_path",
            ""
        ).strip()

        policy = record.get(
            "ingestion_policy",
            ""
        ).strip()

        # ----------------------------------------------------
        # Required fields
        # ----------------------------------------------------

        if not source_file:
            errors.append(
                f"Record {index}: missing source_file"
            )

        if not policy:
            errors.append(
                f"Record {index}: missing ingestion_policy"
            )

        # ----------------------------------------------------
        # Policy validity
        # ----------------------------------------------------

        if policy not in ALLOWED_POLICIES:

            errors.append(
                f"Record {index}: invalid policy "
                f"'{policy}'"
            )

        # ----------------------------------------------------
        # Duplicate source
        # ----------------------------------------------------

        source_key = source_file.lower()

        if source_key in seen_files:

            errors.append(
                f"Duplicate source file: {source_file}"
            )

        seen_files.add(source_key)

        # ----------------------------------------------------
        # Missing physical file
        # ----------------------------------------------------

        if (
            source_file
            and not source_path
        ):

            warnings.append(
                f"Source not found inside KB: "
                f"{source_file}"
            )

    # --------------------------------------------------------
    # Recalculate policy counts
    # --------------------------------------------------------

    counts = {
        "INDEX": 0,
        "STRUCTURED_ONLY": 0,
        "DO_NOT_INDEX": 0,
    }

    for record in records:

        policy = record.get(
            "ingestion_policy",
            ""
        )

        if policy in counts:
            counts[policy] += 1

    # --------------------------------------------------------
    # Print report
    # --------------------------------------------------------

    print(
        f"\nTotal records : {len(records)}"
    )

    print(
        f"INDEX          : {counts['INDEX']}"
    )

    print(
        f"STRUCTURED_ONLY: {counts['STRUCTURED_ONLY']}"
    )

    print(
        f"DO_NOT_INDEX   : {counts['DO_NOT_INDEX']}"
    )

    print(
        f"\nErrors         : {len(errors)}"
    )

    print(
        f"Warnings       : {len(warnings)}"
    )

    if errors:

        print("\nERRORS")

        for error in errors:
            print(f"  ❌ {error}")

    if warnings:

        print("\nWARNINGS")

        for warning in warnings:
            print(f"  ⚠️ {warning}")

    print()

    if errors:

        print(
            "❌ MANIFEST VALIDATION FAILED"
        )

        raise SystemExit(1)

    print(
        "✅ MANIFEST STRUCTURE VALID"
    )

    print(
        "\nImportant:"
    )

    print(
        "This validation does NOT approve clinical, "
        "musicological, licensing, or safety content."
    )

    print(
        "It only validates the manifest structure and "
        "policy values."
    )


if __name__ == "__main__":
    main()