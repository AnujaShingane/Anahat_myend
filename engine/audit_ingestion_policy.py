import json
from pathlib import Path
from collections import Counter, defaultdict

p = Path("knowledge_base/ANAHAT_KnowledgeBase_v3")
f = p / "final_ingestion_manifest.json"

data = json.loads(f.read_text(encoding="utf-8"))
records = data["records"]

print("\n=== CURRENT MANIFEST POLICY ===")
print(Counter(r["ingestion_policy"] for r in records))

print("\n=== MATRIX-STYLE STATUS ===")
print()

groups = defaultdict(list)

for r in records:
    key = (
        r.get("ingestion_policy"),
        r.get("license_status"),
        r.get("source_verification"),
        r.get("source_type"),
        r.get("knowledge_type"),
    )
    groups[key].append(r["source_file"])

for key, files in groups.items():
    print("-" * 100)
    print("POLICY:", key[0])
    print("LICENSE:", key[1])
    print("SOURCE VERIFICATION:", key[2])
    print("SOURCE TYPE:", key[3])
    print("KNOWLEDGE TYPE:", key[4])
    print("FILES:", len(files))

    for name in files:
        print("  ", name)

print("\n=== CURRENTLY APPROVED RECORDS ===")

for r in records:
    if r.get("license_status") == "approved":
        print(r["source_file"])

print("\n=== ALL SOURCE FILES WITH QDRANT=YES IN ORIGINAL MATRIX ===")

matrix = p / "knowledge_base_ingestion_matrix.csv"

import csv

with matrix.open("r", encoding="utf-8-sig", newline="") as fh:
    rows = list(csv.DictReader(fh))

for r in rows:
    if r.get("ingest_to_qdrant", "").strip().lower() == "yes":
        print(
            r["file_name"],
            "|",
            r["ingestion_status"],
            "|",
            r["license_status"],
            "|",
            r["source_verification_status"],
        )
