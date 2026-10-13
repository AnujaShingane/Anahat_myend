from __future__ import annotations

import json
import sys
from pathlib import Path


MANIFEST = Path(
    "knowledge_base/chunk_manifest.json"
)


def main():

    # Force UTF-8 output on Windows
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(
            encoding="utf-8",
            errors="replace",
        )

    if hasattr(sys.stderr, "reconfigure"):
        sys.stderr.reconfigure(
            encoding="utf-8",
            errors="replace",
        )

    chunks = json.loads(
        MANIFEST.read_text(
            encoding="utf-8"
        )
    )

    print()
    print("=" * 90)
    print("ANAHAT CHUNK INSPECTION")
    print("=" * 90)

    print(
        f"Total chunks: {len(chunks)}"
    )

    for chunk in chunks:

        print()
        print("-" * 90)

        print(
            f"ID       : {chunk['chunk_id']}"
        )

        print(
            f"Document : {chunk['source_file']}"
        )

        print(
            f"Path     : {chunk['source_path']}"
        )

        print(
            f"Domain   : {chunk['domain']}"
        )

        print(
            f"Index    : {chunk['chunk_index']}"
        )

        print(
            f"Tokens   : {chunk['estimated_tokens']}"
        )

        print()

        print(chunk["text"])

        print("-" * 90)


if __name__ == "__main__":
    main()