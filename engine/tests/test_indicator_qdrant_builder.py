from collections import Counter

from app.knowledge.indicator_repository import IndicatorRepository
from app.knowledge.loader import KnowledgeBase
from scripts.build_indicator_qdrant import build_payload, build_retrieval_text, load_indicator_kb


def test_indicator_qdrant_builder_includes_symptoms_emotions_and_behaviours():
    _, entries = load_indicator_kb()
    assert Counter(entry["_domain"] for entry in entries) == {
        "symptom": 135,
        "emotion": 15,
        "behaviour": 18,
    }

    kb = KnowledgeBase().load_directory("knowledge_base/ANAHAT_KnowledgeBase_v3")
    repo = IndicatorRepository(kb)
    for entry in entries:
        retrieval_text = build_retrieval_text(entry)
        payload = build_payload(entry, retrieval_text)
        assert repo.validate_candidate(entry["id"], payload)
        assert payload["domain"] == entry["_domain"]
        assert payload["retrieval_layer"] == "canonical_indicator"
        assert "chakra" not in retrieval_text.lower()
        assert "state" not in retrieval_text.lower()
