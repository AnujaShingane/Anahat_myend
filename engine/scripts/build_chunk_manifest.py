from __future__ import annotations

import json
from pathlib import Path

from ingestion.document_loader import (
    discover_documents,
    load_document,
)

from ingestion.chunker import (
    build_chunks,
    estimate_tokens,
)


KB_PATH = Path(
    "knowledge_base/ANAHAT_KnowledgeBase_v3"
)

OUTPUT_PATH = Path(
    "knowledge_base/chunk_manifest.json"
)


def detect_domain(path: Path) -> str:

    parts = [p.lower() for p in path.parts]

    known_domains = {
        "rag",
        "raaga",
        "chakra",
        "psychology",
        "medical",
        "music",
        "music_therapy",
        "traditional",
        "governance",
        "structured",
    }

    for part in parts:
        if part in known_domains:
            return part

    return "unknown"


def build_manifest():

    documents = discover_documents(
        str(KB_PATH)
    )

    manifest = []

    for path in documents:

        document = load_document(path)

        chunks = build_chunks(document)

        domain = detect_domain(path)

        for chunk in chunks:

            manifest.append(
                {
                    "chunk_id": chunk.chunk_id,

                    "document_id":
                        chunk.document_id,

                    "source_file":
                        chunk.source_file,

                    "source_path":
                        chunk.source_path,

                    "domain":
                        domain,

                    "chunk_index":
                        chunk.chunk_index,

                    "estimated_tokens":
                        estimate_tokens(chunk.text),

                    "text":
                        chunk.text,
                }
            )

    return manifest


def main():

    manifest = build_manifest()

    OUTPUT_PATH.parent.mkdir(
        parents=True,
        exist_ok=True,
    )

    OUTPUT_PATH.write_text(
        json.dumps(
            manifest,
            indent=2,
            ensure_ascii=False,
        ),
        encoding="utf-8",
    )

    print()
    print("=" * 70)
    print("ANAHAT CHUNK MANIFEST")
    print("=" * 70)

    document_count = len({x['document_id'] for x in manifest})
    print(f"Documents: {document_count}")

    print(
        f"Chunks: {len(manifest)}"
    )

    print(
        f"Output: {OUTPUT_PATH}"
    )

    print("=" * 70)


if __name__ == "__main__":
    main()