from __future__ import annotations

import json
from pathlib import Path


MANIFEST = Path(
    "knowledge_base/chunk_manifest.json"
)


MIN_TOKENS = 30
MAX_TOKENS = 1000


def main():

    data = json.loads(
        MANIFEST.read_text(
            encoding="utf-8"
        )
    )

    errors = []
    warnings = []

    seen_ids = set()
    seen_text = set()

    for chunk in data:

        chunk_id = chunk["chunk_id"]
        text = chunk["text"].strip()
        tokens = chunk["estimated_tokens"]

        # --------------------------------------------------
        # Empty chunk
        # --------------------------------------------------

        if not text:

            errors.append(
                f"EMPTY: {chunk_id}"
            )

        # --------------------------------------------------
        # Too small
        # --------------------------------------------------

        if tokens < MIN_TOKENS:

            warnings.append(
                f"VERY SMALL ({tokens}): "
                f"{chunk['source_file']} "
                f"chunk {chunk['chunk_index']}"
            )

        # --------------------------------------------------
        # Too large
        # --------------------------------------------------

        if tokens > MAX_TOKENS:

            errors.append(
                f"TOO LARGE ({tokens}): "
                f"{chunk['source_file']} "
                f"chunk {chunk['chunk_index']}"
            )

        # --------------------------------------------------
        # Duplicate ID
        # --------------------------------------------------

        if chunk_id in seen_ids:

            errors.append(
                f"DUPLICATE ID: {chunk_id}"
            )

        seen_ids.add(chunk_id)

        # --------------------------------------------------
        # Duplicate content
        # --------------------------------------------------

        normalized = " ".join(
            text.split()
        )

        if normalized in seen_text:

            warnings.append(
                f"DUPLICATE CONTENT: "
                f"{chunk['source_file']} "
                f"chunk {chunk['chunk_index']}"
            )

        seen_text.add(normalized)

    print()
    print("=" * 70)
    print("ANAHAT CHUNK VALIDATION")
    print("=" * 70)

    print(
        f"Total chunks : {len(data)}"
    )

    print(
        f"Errors       : {len(errors)}"
    )

    print(
        f"Warnings     : {len(warnings)}"
    )

    if errors:

        print()
        print("ERRORS")

        for error in errors:
            print("  ❌", error)

    if warnings:

        print()
        print("WARNINGS")

        for warning in warnings:
            print("  ⚠️", warning)

    if not errors:

        print()
        print("✅ No structural chunk errors found.")

    print("=" * 70)


if __name__ == "__main__":
    main()