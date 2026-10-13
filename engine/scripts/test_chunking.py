from pathlib import Path

from ingestion.document_loader import discover_documents, load_document
from ingestion.chunker import build_chunks, estimate_tokens


KB_PATH = Path(
    "knowledge_base/ANAHAT_KnowledgeBase_v3"
)


def main():

    documents = discover_documents(
        str(KB_PATH)
    )

    print()
    print("=" * 70)
    print("ANAHAT CHUNKING TEST")
    print("=" * 70)

    print(
        f"Documents discovered: {len(documents)}"
    )

    total_chunks = 0

    for path in documents:

        document = load_document(path)

        chunks = build_chunks(document)

        total_chunks += len(chunks)

        print()
        print("-" * 70)
        print(path)
        print(
            f"Characters : {len(document.text):,}"
        )
        print(
            f"Chunks     : {len(chunks)}"
        )

        if chunks:

            sizes = [
                estimate_tokens(chunk.text)
                for chunk in chunks
            ]

            print(
                f"Min tokens: {min(sizes)}"
            )

            print(
                f"Max tokens: {max(sizes)}"
            )

            print(
                f"Avg tokens: "
                f"{sum(sizes) / len(sizes):.1f}"
            )

    print()
    print("=" * 70)
    print(
        f"TOTAL CHUNKS: {total_chunks}"
    )
    print("=" * 70)


if __name__ == "__main__":
    main()