import csv
from pathlib import Path

p = Path(
    "knowledge_base/ANAHAT_KnowledgeBase_v3/"
    "knowledge_base_ingestion_matrix.csv"
)

with p.open(
    encoding="utf-8-sig",
    newline=""
) as f:

    rows = list(csv.DictReader(f))

print(f"ROWS: {len(rows)}")
print("=" * 100)

for i, r in enumerate(rows, start=1):

    print(
        f"{i}. {r['file_name']}"
    )

    print(
        f"   QDRANT   : {r['ingest_to_qdrant']}"
    )

    print(
        f"   REFERENCE: {r['reference_only']}"
    )

    print(
        f"   REVIEW   : {r['requires_review']}"
    )

    print(
        f"   STATUS   : {r['ingestion_status']}"
    )

    print("-" * 100)