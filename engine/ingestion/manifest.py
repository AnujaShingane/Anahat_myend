from __future__ import annotations

import csv
import json
from dataclasses import asdict, dataclass
from pathlib import Path
from typing import Dict, List, Optional


# ============================================================
# PATHS
# ============================================================

PROJECT_ROOT = Path(__file__).resolve().parents[1]

KB_ROOT = PROJECT_ROOT / "knowledge_base" / "ANAHAT_KnowledgeBase_v3"

INGESTION_MATRIX = KB_ROOT / "knowledge_base_ingestion_matrix.csv"

OUTPUT_MANIFEST = KB_ROOT / "final_ingestion_manifest.json"


# ============================================================
# ALLOWED POLICIES
# ============================================================

INDEX = "INDEX"
STRUCTURED_ONLY = "STRUCTURED_ONLY"
DO_NOT_INDEX = "DO_NOT_INDEX"


ALLOWED_POLICIES = {
    INDEX,
    STRUCTURED_ONLY,
    DO_NOT_INDEX,
}


# ============================================================
# DATA MODEL
# ============================================================

@dataclass
class IngestionRecord:
    source_file: str
    source_path: str

    ingestion_policy: str

    source_type: str = ""
    domain: str = ""
    knowledge_type: str = ""

    evidence_level: str = ""
    review_status: str = ""

    author: str = ""
    publication: str = ""
    license_status: str = ""
    source_verification: str = ""

    notes: str = ""

    reason: str = ""


# ============================================================
# CSV HELPERS
# ============================================================

def normalize_column_name(value: str) -> str:
    """
    Normalize CSV column names so small naming differences
    don't break the ingestion process.
    """

    value = str(value).strip().lower()

    replacements = {
        " ": "_",
        "-": "_",
        "/": "_",
        "\\": "_",
        "(": "",
        ")": "",
        ".": "",
    }

    for old, new in replacements.items():
        value = value.replace(old, new)

    return value


def normalize_value(value: Optional[str]) -> str:
    if value is None:
        return ""

    return str(value).strip()


def load_ingestion_matrix(path: Path) -> List[Dict[str, str]]:
    """
    Load the existing KB ingestion matrix.

    We deliberately do not invent source classifications here.
    """

    if not path.exists():
        raise FileNotFoundError(
            f"Ingestion matrix not found:\n{path}"
        )

    with path.open(
        "r",
        encoding="utf-8-sig",
        newline=""
    ) as f:

        reader = csv.DictReader(f)

        if not reader.fieldnames:
            raise ValueError(
                "Ingestion matrix has no CSV headers."
            )

        normalized_headers = [
            normalize_column_name(h)
            for h in reader.fieldnames
        ]

        records = []

        for row in reader:

            normalized_row = {}

            for original, normalized in zip(
                reader.fieldnames,
                normalized_headers
            ):
                normalized_row[normalized] = normalize_value(
                    row.get(original)
                )

            records.append(normalized_row)

        return records


# ============================================================
# FIND VALUES FROM MATRIX
# ============================================================

def first_value(
    row: Dict[str, str],
    possible_columns: List[str]
) -> str:

    for column in possible_columns:

        column = normalize_column_name(column)

        value = row.get(column, "")

        if value:
            return value

    return ""


def get_source_file(row: Dict[str, str]) -> str:

    return first_value(
        row,
        [
            "source_file",
            "file",
            "filename",
            "file_name",
            "document",
            "document_name",
            "source",
        ]
    )


# ============================================================
# POLICY EXTRACTION
# ============================================================

def extract_explicit_policy(row: Dict[str, str]) -> str:

    value = first_value(
        row,
        [
            "ingestion_policy",
            "ingestion_status",
            "ingestion",
            "qdrant_policy",
            "index_policy",
            "recommended_ingestion",
        ]
    )

    value_upper = value.upper().replace("-", "_").replace(" ", "_")

    if value_upper in ALLOWED_POLICIES:
        return value_upper

    return ""


# ============================================================
# SAFETY / GOVERNANCE CHECKS
# ============================================================

def is_blocked_source(row: Dict[str, str]) -> Optional[str]:

    license_status = first_value(
        row,
        [
            "license_status",
            "licensing_status",
            "license",
        ]
    ).lower()

    source_verification = first_value(
        row,
        [
            "source_verification",
            "source_verification_status",
            "verification_status",
        ]
    ).lower()

    review_status = first_value(
        row,
        [
            "review_status",
            "review",
        ]
    ).lower()

    # --------------------------------------------------------
    # Unauthorized / rejected sources
    # --------------------------------------------------------

    blocked_terms = [
        "rejected",
        "unauthorized",
        "copyright violation",
        "copyright_issue",
        "not verified",
        "failed verification",
    ]

    combined = " ".join(
        [
            license_status,
            source_verification,
            review_status,
        ]
    )

    for term in blocked_terms:
        if term in combined:
            return (
                f"Blocked by source/license/review status: {term}"
            )

    return None


# ============================================================
# CLASSIFICATION
# ============================================================

def classify_record(row: Dict[str, str]) -> tuple[str, str]:

    # --------------------------------------------------------
    # 1. Explicit policy always wins
    # --------------------------------------------------------

    explicit_policy = extract_explicit_policy(row)

    if explicit_policy:
        return (
            explicit_policy,
            "Explicit policy from ingestion matrix"
        )

    # --------------------------------------------------------
    # 2. Blocked sources must not enter Qdrant
    # --------------------------------------------------------

    blocked_reason = is_blocked_source(row)

    if blocked_reason:
        return (
            DO_NOT_INDEX,
            blocked_reason
        )

    # --------------------------------------------------------
    # 3. Structured authoritative knowledge
    # --------------------------------------------------------

    knowledge_type = first_value(
        row,
        [
            "knowledge_type",
            "data_type",
            "content_type",
            "source_type",
        ]
    ).lower()

    source_file = get_source_file(row).lower()

    structured_terms = [
        "structured",
        "json",
        "authoritative",
        "canonical",
        "mapping",
        "master",
    ]

    if (
        any(term in knowledge_type for term in structured_terms)
        or source_file.endswith(".json")
    ):
        return (
            STRUCTURED_ONLY,
            "Structured/canonical source"
        )

    # --------------------------------------------------------
    # 4. Default
    #
    # IMPORTANT:
    # We do NOT automatically classify unknown material as
    # INDEX. Unknown material must be reviewed.
    # --------------------------------------------------------

    return (
        DO_NOT_INDEX,
        "No approved ingestion policy found"
    )


# ============================================================
# BUILD MANIFEST
# ============================================================

def build_manifest() -> Dict:

    matrix_rows = load_ingestion_matrix(
        INGESTION_MATRIX
    )

    records: List[IngestionRecord] = []

    seen_files = set()

    for row in matrix_rows:

        source_file = get_source_file(row)

        if not source_file:
            continue

        source_file_key = source_file.lower()

        # Prevent accidental duplicate rows from creating
        # duplicate manifest entries.
        if source_file_key in seen_files:
            continue

        seen_files.add(source_file_key)

        source_path = ""

        # Try to locate the source file inside KB.
        matches = list(KB_ROOT.rglob(source_file))

        if matches:
            source_path = str(
                matches[0].relative_to(KB_ROOT)
            ).replace("\\", "/")

        policy, reason = classify_record(row)

        record = IngestionRecord(
            source_file=source_file,
            source_path=source_path,

            ingestion_policy=policy,

            source_type=first_value(
                row,
                ["source_type", "type"]
            ),

            domain=first_value(
                row,
                ["domain"]
            ),

            knowledge_type=first_value(
                row,
                ["knowledge_type", "data_type"]
            ),

            evidence_level=first_value(
                row,
                ["evidence_level", "evidence"]
            ),

            review_status=first_value(
                row,
                ["review_status", "review"]
            ),

            author=first_value(
                row,
                ["author"]
            ),

            publication=first_value(
                row,
                ["publication", "publisher"]
            ),

            license_status=first_value(
                row,
                ["license_status", "licensing_status", "license"]
            ),

            source_verification=first_value(
                row,
                [
                    "source_verification",
                    "source_verification_status",
                    "verification_status",
                ]
            ),

            notes=first_value(
                row,
                ["notes", "comments", "remarks"]
            ),

            reason=reason,
        )

        records.append(record)

    # --------------------------------------------------------
    # Manifest statistics
    # --------------------------------------------------------

    counts = {
        INDEX: 0,
        STRUCTURED_ONLY: 0,
        DO_NOT_INDEX: 0,
    }

    for record in records:
        counts[record.ingestion_policy] += 1

    manifest = {
        "manifest_version": "1.0",
        "project": "ANAHAT",
        "knowledge_base": "ANAHAT_KnowledgeBase_v3",

        "source_matrix": str(
            INGESTION_MATRIX.relative_to(PROJECT_ROOT)
        ).replace("\\", "/"),

        "total_records": len(records),

        "policy_counts": counts,

        "rules": {
            "index": (
                "Approved material eligible for semantic retrieval."
            ),
            "structured_only": (
                "Authoritative structured knowledge. "
                "Must be validated by deterministic repositories."
            ),
            "do_not_index": (
                "Excluded from semantic retrieval."
            ),
        },

        "records": [
            asdict(record)
            for record in records
        ],
    }

    return manifest


# ============================================================
# WRITE MANIFEST
# ============================================================

def save_manifest(manifest: Dict):

    OUTPUT_MANIFEST.parent.mkdir(
        parents=True,
        exist_ok=True
    )

    with OUTPUT_MANIFEST.open(
        "w",
        encoding="utf-8"
    ) as f:

        json.dump(
            manifest,
            f,
            indent=2,
            ensure_ascii=False,
        )

    print(
        f"\nManifest written to:\n{OUTPUT_MANIFEST}"
    )


# ============================================================
# MAIN
# ============================================================

def main():

    print("=" * 70)
    print("ANAHAT INGESTION MANIFEST BUILDER")
    print("=" * 70)

    print(f"\nKB root:")
    print(KB_ROOT)

    print(f"\nIngestion matrix:")
    print(INGESTION_MATRIX)

    manifest = build_manifest()

    print("\nPolicy counts:")

    for policy, count in manifest["policy_counts"].items():
        print(f"  {policy:<18} {count}")

    print(
        f"\nTotal manifest records: "
        f"{manifest['total_records']}"
    )

    save_manifest(manifest)

    print("\nDone.")


if __name__ == "__main__":
    main()