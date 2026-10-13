"""Print what the quadrant topic guard does to every KB question line.

Run from the engine folder:   python scripts/audit_question_mapping.py
Shows, per quadrant, which question-bank lines are accepted and which are rejected as belonging
to another quadrant. Use it after editing the KB or app/services/question_topics.py.
"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from app.services.assessment_service import QUESTION_BANK_ALIGNMENT_BY_QUADRANT  # noqa: E402
from app.services.question_topics import audit_question_bank  # noqa: E402

BANK = Path(__file__).resolve().parents[1] / "knowledge_base/ANAHAT_KnowledgeBase_v3/rag/question_bank"

if __name__ == "__main__":
    report = audit_question_bank(BANK, QUESTION_BANK_ALIGNMENT_BY_QUADRANT)
    for quadrant, parts in report.items():
        print(f"\n=== {quadrant}: {len(parts['accepted'])} accepted, {len(parts['rejected'])} rejected")
        for x in parts["rejected"]:
            print(f"  REJECTED [{x['bank']}] {x['question'][:90]}  ->  {x['reason']}")
