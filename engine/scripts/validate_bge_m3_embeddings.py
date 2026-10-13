from pathlib import Path
import json
import numpy as np

from sentence_transformers import SentenceTransformer


# ============================================================
# CONFIG
# ============================================================

PROJECT_ROOT = Path(__file__).resolve().parents[1]

MANIFEST_PATH = (
    PROJECT_ROOT
    / "ANAHAT_Qdrant_Chunk_Manifest_v1.json"
)

MODEL_NAME = "BAAI/bge-m3"

EXPECTED_DIMENSION = 1024


# ============================================================
# LOAD MANIFEST
# ============================================================

print("=" * 70)
print("ANAHAT BGE-M3 EMBEDDING VALIDATION")
print("=" * 70)

if not MANIFEST_PATH.exists():
    raise FileNotFoundError(
        f"Manifest not found: {MANIFEST_PATH}"
    )

with open(
    MANIFEST_PATH,
    "r",
    encoding="utf-8"
) as f:
    manifest = json.load(f)

records = manifest["records"]

print(f"Manifest: {MANIFEST_PATH}")
print(f"Chunks: {len(records)}")


# ============================================================
# LOAD MODEL
# ============================================================

print()
print(f"Loading model: {MODEL_NAME}")

model = SentenceTransformer(
    MODEL_NAME
)

print("Model loaded successfully.")


# ============================================================
# PREPARE TEXT
# ============================================================

texts = [
    record["text"]
    for record in records
]

chunk_ids = [
    record["chunk_id"]
    for record in records
]


# ============================================================
# GENERATE EMBEDDINGS
# ============================================================

print()
print("Generating embeddings...")

embeddings = model.encode(
    texts,
    normalize_embeddings=True,
    convert_to_numpy=True,
    show_progress_bar=True,
)

embeddings = np.asarray(
    embeddings,
    dtype=np.float32
)


# ============================================================
# VALIDATION
# ============================================================

print()
print("=" * 70)
print("EMBEDDING VALIDATION")
print("=" * 70)

num_vectors = embeddings.shape[0]
dimension = embeddings.shape[1]

finite_values = np.isfinite(
    embeddings
).all()

nan_values = np.isnan(
    embeddings
).any()

inf_values = np.isinf(
    embeddings
).any()

norms = np.linalg.norm(
    embeddings,
    axis=1
)

normalized_ok = np.allclose(
    norms,
    1.0,
    atol=1e-4
)

unique_vectors = len(
    np.unique(
        embeddings,
        axis=0
    )
)

unique_ratio = (
    unique_vectors
    / num_vectors
)

print(f"Vectors generated: {num_vectors}")
print(f"Expected vectors: {len(records)}")
print(f"Dimension: {dimension}")
print(f"Expected dimension: {EXPECTED_DIMENSION}")
print(f"Finite values: {finite_values}")
print(f"NaN values: {nan_values}")
print(f"Inf values: {inf_values}")
print(
    f"Min vector norm: "
    f"{norms.min():.6f}"
)
print(
    f"Max vector norm: "
    f"{norms.max():.6f}"
)
print(
    f"Mean vector norm: "
    f"{norms.mean():.6f}"
)
print(
    f"L2 normalized: "
    f"{normalized_ok}"
)
print(
    f"Unique vectors: "
    f"{unique_vectors}/{num_vectors}"
)
print(
    f"Unique ratio: "
    f"{unique_ratio:.3f}"
)


# ============================================================
# PER-CHUNK VALIDATION
# ============================================================

issues = []

for i, chunk_id in enumerate(chunk_ids):

    vector = embeddings[i]

    if vector.shape[0] != EXPECTED_DIMENSION:

        issues.append({
            "chunk_id": chunk_id,
            "issue": "wrong_dimension",
            "value": int(vector.shape[0]),
        })

    if not np.isfinite(vector).all():

        issues.append({
            "chunk_id": chunk_id,
            "issue": "non_finite_values",
        })

    norm = np.linalg.norm(vector)

    if not np.isclose(
        norm,
        1.0,
        atol=1e-4
    ):

        issues.append({
            "chunk_id": chunk_id,
            "issue": "not_normalized",
            "value": float(norm),
        })


# ============================================================
# FINAL GATE
# ============================================================

gate_pass = (
    num_vectors == len(records)
    and dimension == EXPECTED_DIMENSION
    and finite_values
    and not nan_values
    and not inf_values
    and normalized_ok
    and unique_vectors == num_vectors
    and len(issues) == 0
)

print()
print("=" * 70)

if gate_pass:

    print("STATUS: PASS")
    print(">>> BGE-M3 EMBEDDING GATE: PASS")
    print(">>> Safe to proceed to Qdrant validation.")

else:

    print("STATUS: FAIL")
    print(">>> BGE-M3 EMBEDDING GATE: FAIL")
    print(">>> DO NOT upload embeddings to Qdrant.")

    if issues:

        print()
        print("Issues:")

        for issue in issues[:20]:

            print(issue)


# ============================================================
# SAVE VALIDATION REPORT
# ============================================================

report = {

    "status":
        "PASS"
        if gate_pass
        else
        "FAIL",

    "model":
        MODEL_NAME,

    "manifest":
        str(MANIFEST_PATH),

    "chunks":
        len(records),

    "vectors_generated":
        num_vectors,

    "expected_dimension":
        EXPECTED_DIMENSION,

    "actual_dimension":
        dimension,

    "finite_values":
        bool(finite_values),

    "nan_values":
        bool(nan_values),

    "inf_values":
        bool(inf_values),

    "normalized":
        bool(normalized_ok),

    "min_norm":
        float(norms.min()),

    "max_norm":
        float(norms.max()),

    "mean_norm":
        float(norms.mean()),

    "unique_vectors":
        unique_vectors,

    "unique_ratio":
        float(unique_ratio),

    "issues":
        issues,
}

report_path = (
    PROJECT_ROOT
    / "ANAHAT_BGE_M3_Embedding_Validation_v1.json"
)

with open(
    report_path,
    "w",
    encoding="utf-8"
) as f:

    json.dump(
        report,
        f,
        indent=2
    )

print()
print(f"Validation report: {report_path}")