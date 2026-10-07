from pathlib import Path
import json
import re
import hashlib
import math
import pandas as pd

from transformers import AutoTokenizer


# ============================================================
# CONFIGURATION
# ============================================================

PROJECT_ROOT = Path(__file__).resolve().parents[1]

MANIFEST_PATH = PROJECT_ROOT / "ANAHAT_Qdrant_Chunk_Manifest_v1.json"

MODEL_NAME = "BAAI/bge-m3"

MAX_TOKENS = 1000
TARGET_TOKENS = 700
OVERLAP_TOKENS = 80


# ============================================================
# LOAD
# ============================================================

print("=" * 70)
print("ANAHAT TOKENIZER-AWARE CHUNK REBUILD")
print("=" * 70)

if not MANIFEST_PATH.exists():
    raise FileNotFoundError(
        f"Manifest not found:\n{MANIFEST_PATH}"
    )

print(f"Manifest: {MANIFEST_PATH}")

with open(MANIFEST_PATH, "r", encoding="utf-8") as f:
    manifest = json.load(f)

records = manifest["records"]

print(f"Original chunks: {len(records)}")

print(f"Loading tokenizer: {MODEL_NAME}")

tokenizer = AutoTokenizer.from_pretrained(
    MODEL_NAME,
    use_fast=True,
)

print("Tokenizer loaded successfully.")


# ============================================================
# TOKEN COUNT
# ============================================================

def token_count(text: str) -> int:
    return len(
        tokenizer.encode(
            text,
            add_special_tokens=True
        )
    )


def approximate_tokens(text: str) -> int:
    return math.ceil(
        len(re.findall(r"\S+", text)) * 1.3
    )


# ============================================================
# SENTENCE SPLITTING
# ============================================================

def sentence_split(text: str):

    sentences = re.split(
        r'(?<=[.!?])\s+(?=[A-Z0-9\[])',
        text
    )

    return [
        s.strip()
        for s in sentences
        if s.strip()
    ]


# ============================================================
# HARD WORD SPLIT
# ============================================================

def hard_split(text: str):

    words = text.split()

    chunks = []

    current = []

    for word in words:

        candidate = " ".join(
            current + [word]
        )

        if current and token_count(candidate) > TARGET_TOKENS:

            chunks.append(
                " ".join(current)
            )

            current = [word]

        else:

            current.append(word)

    if current:
        chunks.append(
            " ".join(current)
        )

    return chunks


# ============================================================
# NORMAL TEXT SPLITTER
# ============================================================

def split_normal_text(text: str):

    paragraphs = [
        p.strip()
        for p in re.split(
            r'\n\s*\n+',
            text
        )
        if p.strip()
    ]

    units = []

    for paragraph in paragraphs:

        if token_count(paragraph) <= MAX_TOKENS:

            units.append(paragraph)

            continue

        sentences = sentence_split(paragraph)

        if not sentences:

            units.extend(
                hard_split(paragraph)
            )

            continue

        current = []
        current_tokens = 0

        for sentence in sentences:

            sentence_tokens = token_count(
                sentence
            )

            if (
                current
                and
                current_tokens + sentence_tokens
                > TARGET_TOKENS
            ):

                units.append(
                    " ".join(current)
                )

                overlap = []
                overlap_tokens = 0

                for old in reversed(current):

                    old_tokens = token_count(old)

                    if (
                        overlap_tokens
                        + old_tokens
                        > OVERLAP_TOKENS
                    ):
                        break

                    overlap.insert(
                        0,
                        old
                    )

                    overlap_tokens += old_tokens

                current = overlap + [sentence]

                current_tokens = (
                    overlap_tokens
                    + sentence_tokens
                )

            else:

                current.append(sentence)

                current_tokens += sentence_tokens

        if current:

            units.append(
                " ".join(current)
            )

    # Combine small adjacent units.
    output = []

    current = []
    current_tokens = 0

    for unit in units:

        unit_tokens = token_count(unit)

        if (
            current
            and
            current_tokens + unit_tokens
            > TARGET_TOKENS
        ):

            output.append(
                "\n\n".join(current)
            )

            current = [unit]
            current_tokens = unit_tokens

        else:

            current.append(unit)

            current_tokens += unit_tokens

    if current:

        output.append(
            "\n\n".join(current)
        )

    # Final safety pass.
    final_chunks = []

    for chunk in output:

        if token_count(chunk) <= MAX_TOKENS:

            final_chunks.append(chunk)

        else:

            final_chunks.extend(
                hard_split(chunk)
            )

    return final_chunks


# ============================================================
# STRUCTURED RAGA SPLITTER
# ============================================================

def split_raga_json(text: str):

    try:

        obj = json.loads(text)

    except Exception:

        return split_normal_text(text)

    records = []

    if isinstance(obj, list):

        for item in obj:

            records.append(
                json.dumps(
                    item,
                    ensure_ascii=False,
                    indent=2
                )
            )

    elif isinstance(obj, dict):

        for key, value in obj.items():

            records.append(
                json.dumps(
                    {key: value},
                    ensure_ascii=False,
                    indent=2
                )
            )

    else:

        return split_normal_text(text)

    chunks = []

    current = []
    current_tokens = 0

    for record in records:

        record_tokens = token_count(record)

        if record_tokens > MAX_TOKENS:

            # A single oversized record must itself
            # be split safely.
            chunks.extend(
                split_normal_text(record)
            )

            continue

        if (
            current
            and
            current_tokens + record_tokens
            > TARGET_TOKENS
        ):

            chunks.append(
                "\n\n".join(current)
            )

            current = [record]

            current_tokens = record_tokens

        else:

            current.append(record)

            current_tokens += record_tokens

    if current:

        chunks.append(
            "\n\n".join(current)
        )

    return chunks


# ============================================================
# REBUILD
# ============================================================

new_records = []

rebuild_log = []

for record in records:

    source = record["source_file"]

    original_text = record["text"]

    original_tokens = token_count(
        original_text
    )

    if (
        source
        == "Equivalent Ragas in Hindustani and Carnatic Music.pdf"
    ):

        pieces = split_raga_json(
            original_text
        )

    elif original_tokens > MAX_TOKENS:

        pieces = split_normal_text(
            original_text
        )

    else:

        pieces = [original_text]

    rebuild_log.append({
        "source_file": source,
        "original_bge_tokens": original_tokens,
        "new_chunks": len(pieces),
    })

    for index, piece in enumerate(pieces):

        measured_tokens = token_count(
            piece
        )

        content_hash = hashlib.sha256(
            piece.encode("utf-8")
        ).hexdigest()

        new_record = dict(record)

        new_record["text"] = piece

        new_record["estimated_tokens"] = (
            approximate_tokens(piece)
        )

        new_record["bge_m3_token_count"] = (
            measured_tokens
        )

        new_record["content_sha256"] = (
            content_hash
        )

        new_record["chunk_index"] = index

        new_record["chunk_id"] = (
            f"{record['source_document_id']}"
            f"_chunk_{index:04d}_"
            f"{content_hash[:12]}"
        )

        new_records.append(
            new_record
        )


# ============================================================
# COMPLETE VALIDATION
# ============================================================

df = pd.DataFrame(
    new_records
)

duplicate_counts = (
    df["content_sha256"]
    .value_counts()
)

df["duplicate_content"] = (
    df["content_sha256"]
    .map(
        lambda x:
        duplicate_counts.get(x, 0) > 1
    )
)

df["oversized"] = (
    df["bge_m3_token_count"]
    > MAX_TOKENS
)

required_fields = [
    "source_document_id",
    "source_file",
    "source_path",
    "representation",
    "domain",
    "subdomain",
    "knowledge_type",
    "evidence_level",
    "priority",
    "ingestion_policy",
    "can_influence_chakra_score",
    "can_influence_raga_recommendation",
    "requires_review",
    "bge_m3_token_count",
    "content_sha256",
    "text",
]

df["missing_required_metadata"] = (
    df[required_fields]
    .apply(
        lambda row:
        any(
            str(value).strip() == ""
            for value in row
        ),
        axis=1
    )
)

cross_source_duplicates = (
    df.groupby(
        "content_sha256"
    )["source_file"]
    .nunique()
)

summary = {

    "status":
        "PASS"
        if (
            df["oversized"].sum() == 0
            and
            df["duplicate_content"].sum() == 0
            and
            df["missing_required_metadata"].sum() == 0
        )
        else
        "FAIL",

    "source_count":
        int(df["source_file"].nunique()),

    "chunk_count":
        len(df),

    "max_bge_m3_tokens":
        int(
            df["bge_m3_token_count"].max()
        ),

    "average_bge_m3_tokens":
        round(
            df["bge_m3_token_count"].mean(),
            2
        ),

    "chunks_over_1000":
        int(
            df["oversized"].sum()
        ),

    "chunks_over_800":
        int(
            (
                df["bge_m3_token_count"]
                > 800
            ).sum()
        ),

    "duplicate_chunks":
        int(
            df["duplicate_content"].sum()
        ),

    "cross_source_duplicate_hashes":
        int(
            (
                cross_source_duplicates
                > 1
            ).sum()
        ),

    "missing_metadata_chunks":
        int(
            df["missing_required_metadata"].sum()
        ),

    "empty_chunks":
        int(
            (
                df["text"]
                .str.strip()
                == ""
            ).sum()
        ),
}


# ============================================================
# UPDATE MANIFEST
# ============================================================

manifest["records"] = (
    new_records
)

manifest["chunk_count"] = (
    len(new_records)
)

manifest["status"] = (
    summary["status"]
)

manifest["tokenizer_validation"] = {

    "status":
        summary["status"],

    "model":
        MODEL_NAME,

    "tokenizer_backend":
        "transformers.AutoTokenizer",

    "max_tokens":
        summary[
            "max_bge_m3_tokens"
        ],

    "oversized_chunks":
        summary[
            "chunks_over_1000"
        ],
}

manifest["chunking"] = {

    **manifest.get(
        "chunking",
        {}
    ),

    "target_bge_m3_tokens":
        TARGET_TOKENS,

    "maximum_bge_m3_tokens":
        MAX_TOKENS,

    "overlap_bge_m3_tokens":
        OVERLAP_TOKENS,

    "method":
        "Tokenizer-aware, "
        "paragraph/sentence-aware, "
        "structured-record-aware "
        "for raga JSON.",
}

with open(
    MANIFEST_PATH,
    "w",
    encoding="utf-8"
) as f:

    json.dump(
        manifest,
        f,
        ensure_ascii=False,
        indent=2
    )


# ============================================================
# OUTPUT REPORTS
# ============================================================

manifest_xlsx = (
    PROJECT_ROOT
    / "ANAHAT_Qdrant_Chunk_Manifest_v2_TokenizerAware.xlsx"
)

audit_xlsx = (
    PROJECT_ROOT
    / "ANAHAT_Qdrant_Chunk_Audit_v2_TokenizerAware.xlsx"
)

df.to_excel(
    manifest_xlsx,
    index=False
)

source_audit = []

for source, group in df.groupby(
    "source_file"
):

    source_audit.append({

        "source_file":
            source,

        "representation":
            group[
                "representation"
            ].iloc[0],

        "chunks":
            len(group),

        "max_bge_m3_tokens":
            int(
                group[
                    "bge_m3_token_count"
                ].max()
            ),

        "chunks_over_1000":
            int(
                group[
                    "oversized"
                ].sum()
            ),
    })


with pd.ExcelWriter(
    audit_xlsx,
    engine="openpyxl"
) as writer:

    pd.DataFrame(
        [summary]
    ).to_excel(
        writer,
        sheet_name="Summary",
        index=False
    )

    pd.DataFrame(
        source_audit
    ).to_excel(
        writer,
        sheet_name="Source_Audit",
        index=False
    )

    df[
        df["oversized"]
        |
        df["duplicate_content"]
        |
        df["missing_required_metadata"]
    ].to_excel(
        writer,
        sheet_name="Exceptions",
        index=False
    )


# ============================================================
# FINAL CONSOLE REPORT
# ============================================================

print()
print("=" * 70)
print("FINAL TOKENIZER-AWARE VALIDATION")
print("=" * 70)

for key, value in summary.items():

    print(
        f"{key}: {value}"
    )

print()
print("Rebuild log:")

for item in rebuild_log:

    if (
        item["original_bge_tokens"]
        > MAX_TOKENS
    ):

        print(
            f"  {item['source_file']}: "
            f"{item['original_bge_tokens']} tokens "
            f"-> "
            f"{item['new_chunks']} chunks"
        )

print()
print("Manifest updated:")
print(MANIFEST_PATH)

print()
print("XLSX:")
print(manifest_xlsx)

print()
print("Audit:")
print(audit_xlsx)

print()

if summary["status"] == "PASS":

    print(
        ">>> CHUNKING GATE: PASS"
    )

    print(
        ">>> Safe to proceed to embedding validation."
    )

else:

    print(
        ">>> CHUNKING GATE: FAIL"
    )

    print(
        ">>> DO NOT upload to Qdrant."
    )