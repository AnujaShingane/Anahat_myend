from pathlib import Path
import sys
import uuid

PROJECT_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(PROJECT_ROOT))

from qdrant_client.models import PointStruct
from app.core.config import settings
from app.retrieval.embeddings import BGE_M3_Embedder
from app.retrieval.qdrant_client import get_qdrant_client

KB_ROOT = PROJECT_ROOT / "knowledge_base" / "ANAHAT_KnowledgeBase_v3" / "rag" / "question_bank"
COLLECTION = "anahat_knowledge"

CANONICAL_FILES = [
    "beliefs.md",
    "career.md",
    "diet.md",
    "emotions.md",
    "family.md",
    "future_plans.md",
    "healthy_habits.md",
    "medical_therapeutic_background.md",
    "music_therapy_profile.md",
    "nature.md",
    "past.md",
    "personal_interests.md",
    "physical_nature.md",
    "profession.md",
    "relationships.md",
    "social_circle.md",
    "thoughts.md",
]

QUADRANT_BY_FILE = {
    "beliefs.md": "beliefs",
    "career.md": "career",
    "diet.md": "lifestyle",
    "emotions.md": "emotions",
    "family.md": "family",
    "future_plans.md": "future_plans",
    "healthy_habits.md": "lifestyle",
    "medical_therapeutic_background.md": "physical_nature",
    "music_therapy_profile.md": "music_therapy_profile",
    "nature.md": "nature",
    "past.md": "past",
    "personal_interests.md": "personal_interests",
    "physical_nature.md": "physical_nature",
    "profession.md": "profession",
    "relationships.md": "relationships",
    "social_circle.md": "social_circle",
    "thoughts.md": "thoughts",
}

def parse_frontmatter(text):
    lines = text.splitlines()
    if not lines or lines[0].strip() != "---":
        raise ValueError("Missing YAML frontmatter")

    end = next((i for i in range(1, len(lines)) if lines[i].strip() == "---"), None)
    if end is None:
        raise ValueError("Unclosed YAML frontmatter")

    metadata = {}
    for line in lines[1:end]:
        if ":" not in line:
            continue
        key, value = line.split(":", 1)
        value = value.strip()
        if value.lower() == "true":
            value = True
        elif value.lower() == "false":
            value = False
        metadata[key.strip()] = value

    body = "\n".join(lines[end + 1:]).strip()
    return metadata, body

def extract_questions(body):
    questions = []
    for line in body.splitlines():
        line = line.strip()
        if line.startswith("- "):
            question = line[2:].strip()
            if question:
                questions.append(question)
    return questions

def main():
    print("=== ANAHAT Canonical Question Bank Ingestion ===")
    client = get_qdrant_client()
    embedder = BGE_M3_Embedder()

    records = []

    for filename in CANONICAL_FILES:
        path = KB_ROOT / filename
        if not path.exists():
            raise FileNotFoundError(path)

        metadata, body = parse_frontmatter(path.read_text(encoding="utf-8"))
        questions = extract_questions(body)

        quadrant = metadata.get("quadrant_alignment") or QUADRANT_BY_FILE[filename]

        for index, question in enumerate(questions, start=1):
            question_id = f"Q-{list(CANONICAL_FILES).index(filename) + 1}-{index}"

            records.append({
                "question_id": question_id,
                "question": question,
                "text": question,
                "source": "question_bank",
                "source_file": filename,
                "source_path": str(path.relative_to(PROJECT_ROOT)),
                "source_document": metadata.get("source_document", "Questions.txt"),
                "document_type": metadata.get("document_type", "question_bank"),
                "knowledge_category": metadata.get("knowledge_category", "assessment_question"),
                "quadrant_alignment": quadrant,
                "canonical_version": metadata.get("canonical_version", True),
                "evidence_level": metadata.get("evidence_level", "general_reference"),
                "version": metadata.get("version", "1.0"),
            })

    print(f"Canonical question records: {len(records)}")

    if len(records) == 0:
        raise RuntimeError("No question-bank records found")

    vectors = embedder.encode_documents([r["text"] for r in records])

    points = []
    for record, vector in zip(records, vectors):
        point_id = str(uuid.uuid5(
            uuid.NAMESPACE_URL,
            "anahat:question:" + record["question_id"]
        ))
        points.append(
            PointStruct(
                id=point_id,
                vector=vector.tolist(),
                payload=record,
            )
        )

    client.upsert(
        collection_name=COLLECTION,
        points=points,
        wait=True,
    )

    info = client.get_collection(COLLECTION)

    print(f"Collection: {COLLECTION}")
    print(f"Total points: {info.points_count}")
    print(f"Inserted question-bank points: {len(points)}")

    if info.points_count < 54:
        raise RuntimeError(
            f"Expected at least 54 total points after ingestion, got {info.points_count}"
        )

    print("QUESTION BANK INGESTION: PASS")

if __name__ == "__main__":
    main()
