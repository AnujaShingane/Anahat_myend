from pathlib import Path

from ingestion.document_loader import load_document
from ingestion.chunker import chunk_text
from ingestion.qdrant_upsert import upsert_chunks


def build_index(kb_path: str):

    kb = Path(kb_path)

    all_chunks = []

    for path in kb.rglob("*"):

        if not path.is_file():
            continue

        # Governance/config files should not
        # automatically become normal RAG chunks.
        if "governance" in path.parts:
            continue

        if path.suffix.lower() not in {
            ".txt",
            ".md",
        }:
            continue

        text = load_document(path)

        metadata = {
            "source_file": path.name,
            "source_path": str(path),
            "domain": (
                path.parent.name
            ),
            "review_status": "unknown",
        }

        chunks = chunk_text(
            text=text,
            document_id = make_document_id(path),
            metadata=metadata,
            target_tokens=800,
            max_tokens=1000,
        )

        all_chunks.extend(chunks)

    print(
        f"Prepared {len(all_chunks)} chunks"
    )

    upsert_chunks(all_chunks)


if __name__ == "__main__":

    build_index(
        "./knowledge_base/"
        "ANAHAT_KnowledgeBase_v3"
    )