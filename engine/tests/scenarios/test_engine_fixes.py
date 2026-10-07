"""Tests for the specific bugs fixed in this pass."""
import json

import httpx
import pytest

from app.core.exceptions import LLMConfigurationError
from app.llm.mistral_provider import MistralProvider
from app.services.assessment_service import _is_canonical_question_bank, quote_is_verbatim
from app.services.question_service import QuestionService
from tests.scenarios.harness import THROAT, card, concept, cover_all_quadrants, kb, make_session, say
from tests.helpers import positive_payload, as_json, POSITIVE_TEXT


# ---- Balanced must never be the default -------------------------------------------------------
def test_nothing_assessed_is_not_assessed_never_balanced():
    svc, sid = make_session({}, {})
    res = svc.final_result(sid)
    assert all(c["status"] == "UNRESOLVED" and c["status_code"] == "NOT_ASSESSED" for c in res["chakras"])
    assert res["summary"]["balanced"] == []


def test_balanced_after_therapist_assesses_all_relevant_quadrants_and_shows_low_confidence():
    svc, sid = make_session({}, {})
    cover_all_quadrants(svc, sid)
    res = svc.final_result(sid)
    assert all(c["status"] == "BALANCED" and c["confidence_label"] == "Low" for c in res["chakras"])


def test_balance_does_not_require_all_ten_quadrants():
    svc, sid = make_session({}, {})
    # Therapist decides Nature is the relevant area and marks its normal pass complete.
    svc._q_state(svc._ctx(sid), "Nature")["normal_question_count"] = 3
    svc.complete_quadrant(sid, "Nature")
    res = svc.final_result(sid)
    assert all(c["status"] == "BALANCED" for c in res["chakras"])
    assert res["coverage"]["assessed_quadrants"] == ["Nature"]


def test_selecting_a_quadrant_alone_does_not_count_as_assessed():
    svc, sid = make_session({}, {})
    for q in kb().quadrant_names:
        svc.select_quadrant(sid, q)
    ctx = svc.get(sid)
    assert svc.assessed_quadrants(ctx) == set()
    assert ctx.patient_state["assessment_complete"] is False


# ---- quote verification --------------------------------------------------------------------------
@pytest.mark.parametrize("text,quote,ok", [
    ("I can't sleep at night", "can't sleep", True),
    ("I can’t sleep at night", "can't sleep", True),
    ("I can't sleep at night", "cannot sleep", False),
    ("I can't sleep", "", False),
    ("I have a headache", "head", False),         # not word-aligned
])
def test_quote_must_be_verbatim(text, quote, ok):
    assert quote_is_verbatim(text, quote) is ok


# ---- questions: KB only, never "out of questions" ---------------------------------------------------
def test_kb_question_text_is_used_where_it_maps_and_flagged_where_it_does_not():
    qs = QuestionService(kb())
    nature = qs.attribute_queue("Nature")
    assert nature[0]["source"] == "KB question bank"
    prof = qs.attribute_queue("Profession")
    assert all("REQUIRES DOMAIN VALIDATION" in q["source"] for q in prof)


def test_duplicate_kb_attribute_is_asked_once_without_touching_the_kb():
    qs = QuestionService(kb())
    q = next(x for x in kb().quadrants if x["name"] == "Lifestyle")
    names = [a.lower() for a in q["attributes"]]
    asked = [x["attribute"].lower() for x in qs.attribute_queue("Lifestyle")]
    assert len(asked) == len(set(asked)) and len(asked) <= len(names)


def test_quadrant_without_rag_hits_uses_exact_category_question_bank_fallback():
    svc, sid = make_session({}, {})
    page = svc.select_quadrant(sid, "Nature")
    assert page["exhausted"] is False
    assert page["questions"]
    assert page["questions"][0]["quadrant"] == "Nature"
    assert page["retrieval_status"] == "FALLBACK_RETRIEVED"


def test_question_bank_rag_alignment_must_match_the_requested_quadrant():
    svc, sid = make_session({}, {})

    class QuestionRetriever:
        def search(self, query, top_k=None):
            return [{"payload": {
                "source": "rag/question_bank/family.md",
                "document_type": "question_bank",
                "knowledge_category": "assessment_question",
                "canonical_version": True,
                "text": "quadrant_alignment: family\n- What family question should not be asked in Nature?"
            }}]

    svc.question_retriever = QuestionRetriever()
    page = svc.select_quadrant(sid, "Nature")
    assert page["questions"][0]["quadrant"] == "Nature"
    assert page["retrieval_status"] == "FALLBACK_RETRIEVED"
    assert page["retrieval_failure_reason"].startswith("all_retrieved_chunks_rejected:")
    assert "wrong_quadrant=1" in page["retrieval_failure_reason"]
    assert "family" not in page["questions"][0]["question"].lower()


def test_ingested_healthy_habits_metadata_matches_lifestyle_quadrant():
    svc, sid = make_session({}, {})

    class QuestionRetriever:
        def search(self, query, top_k=None):
            return [{"payload": {
                "question_id": "Q-7-1",
                "source": "question_bank",
                "source_file": "healthy_habits.md",
                "document_type": "question_bank",
                "knowledge_category": "assessment_question",
                "quadrant_alignment": "healthy_habits",
                "canonical_version": True,
                "text": "How regular is your daily activity?",
            }}]

    svc.question_retriever = QuestionRetriever()
    page = svc.select_quadrant(sid, "Lifestyle")

    assert page["retrieval_status"] == "RETRIEVED"
    assert page["questions"][0]["question"] == "How regular is your daily activity?"


def test_rag_keeps_valid_question_beyond_initial_similarity_window():
    svc, sid = make_session({}, {})
    calls = []
    valid = {
        "source": "question_bank",
        "document_type": "question_bank",
        "knowledge_category": "assessment_question",
        "quadrant_alignment": "nature",
        "canonical_version": True,
        "text": "What do you notice when you spend time in nature?",
    }

    class QuestionRetriever:
        def search(self, query, top_k=None):
            calls.append(top_k)
            return [{"payload": {"source": "general_reference", "text": "Reference text."}}] * 19 + [
                {"payload": valid}
            ]

    svc.question_retriever = QuestionRetriever()
    page = svc.select_quadrant(sid, "Nature")

    assert calls == [100]
    assert page["retrieval_status"] == "RETRIEVED"
    assert page["questions"][0]["question"] == valid["text"]


def test_canonical_question_bank_metadata_is_eligible_without_source_field():
    payload = {
        "document_type": "question_bank",
        "knowledge_category": "assessment_question",
        "canonical_version": True,
        "source_path": "rag/question_bank/nature.md",
    }
    assert _is_canonical_question_bank(payload, "- What supports your connection with nature?")
    assert not _is_canonical_question_bank(
        {"document_type": "reference", "knowledge_category": "general_knowledge"},
        "- What supports your connection with nature?",
    )


def test_general_reference_metadata_is_rejected_as_question_bank():
    assert not _is_canonical_question_bank({
        "source": "general_reference",
        "document_type": "reference",
        "knowledge_category": "general_knowledge",
        "canonical_version": True,
    })


def test_question_bank_already_asked_is_rejected():
    svc, sid = make_session({}, {})
    question = "What helps you feel connected to nature?"

    class QuestionRetriever:
        def search(self, query, top_k=None):
            return [{"payload": {
                "source": "question_bank",
                "document_type": "question_bank",
                "knowledge_category": "assessment_question",
                "quadrant_alignment": "nature",
                "canonical_version": True,
                "text": question,
            }}]

    svc.question_retriever = QuestionRetriever()
    svc.select_quadrant(sid, "Nature")
    state = svc._q_state(svc.get(sid), "Nature")
    question_id = svc.get(sid).patient_state["current_question"]["id"]
    state["answered_question_ids"].append(question_id)
    svc.get(sid).patient_state["question_text_by_id"][question_id] = question
    page = svc.next_questions(sid, "Nature")
    assert page["retrieval_failure_reason"].startswith("all_retrieved_chunks_rejected:")
    assert "already_asked=1" in page["retrieval_failure_reason"]


def test_zero_question_retrieval_never_completes_the_quadrant():
    svc, sid = make_session({}, {})
    svc.questions.next_questions = lambda quadrant, answered_ids=(), limit=3: {
        "quadrant": quadrant, "questions": [], "remaining": 0, "total": 0, "exhausted": True
    }
    page = svc.select_quadrant(sid, "Nature")
    assert page["questions"] == []
    assert page["quadrant_status"] == "NO_RELEVANT_QUESTION_FOUND"
    assert svc.get(sid).quadrants["Nature"]["completed"] is False
    with pytest.raises(ValueError, match="retrieval failed"):
        svc.complete_quadrant(sid, "Nature")


def test_quadrant_recommendation_waits_for_and_receives_all_session_context():
    svc, sid = make_session({}, {})
    svc.get(sid).demographics["communication_preferences"] = {"age": 34, "occupation": "Teacher"}
    with pytest.raises(ValueError, match="opening responses"):
        svc.recommend_quadrants(sid)

    answer = "My family and friends support me when I feel stressed."
    svc.submit_opening_response(sid, answer)
    captured = {}
    svc.questions.recommend_quadrants = lambda **kwargs: captured.update(kwargs) or []
    assert svc.recommend_quadrants(sid) == []
    assert captured["opening_answers"] == [answer]
    assert captured["baseline"] == svc.get(sid).baseline
    assert captured["demographics"] == svc.get(sid).demographics
    evidence = QuestionService._recommendation_evidence(
        captured["current_issue"], captured["opening_answers"], captured["baseline"], captured["demographics"], [])
    assert any(item["label"] == "opening response" and answer in item["text"] for item in evidence)
    assert any(item["label"] == "demographic context age" for item in evidence)
    assert all(not item["vote"] for item in evidence if item["label"].startswith("demographic context"))


def test_demographics_are_available_as_context_but_do_not_recommend_a_quadrant_alone():
    qs = QuestionService(kb())
    evidence = qs._recommendation_evidence(
        "Occupation: Engineer\nAge: 34", None, None, {"occupation": "Engineer", "age": 34}, []
    )
    assert evidence
    assert all(item["vote"] is False for item in evidence)
    assert qs.recommend_quadrants(
        current_issue="Occupation: Engineer\nAge: 34", demographics={"occupation": "Engineer", "age": 34}
    ) == []


def test_fallback_question_ranking_uses_session_relevance_within_requested_quadrant():
    qs = QuestionService(kb())
    eligible = qs.attribute_queue("Lifestyle")
    ranked, method = qs.rank_fallback_questions(
        "Patient reports irregular sleep patterns and daytime sleepiness", eligible
    )
    assert method == "keyword_overlap"
    assert ranked[0][0]["quadrant"] == "Lifestyle"
    assert ranked[0][0]["attribute"] == "Sleep Patterns"
    assert ranked[0][1] > ranked[-1][1]


def test_normal_passes_wait_for_therapist_even_when_all_quadrants_are_covered():
    svc, sid = make_session({}, {})
    cover_all_quadrants(svc, sid)
    page = svc.next_questions(sid, "Nature")
    assert page["normal_limit_reached"] is True
    assert page["assessment_status"] == "awaiting_therapist_decision"


def test_routing_uses_embeddings_when_available_and_labels_fallback():
    class Emb:
        def encode_documents(self, texts):
            import numpy as np
            return np.array([[1.0, 0.0] if t.startswith("Family:") or t.lower().startswith("family family")
                             else [0.0, 1.0] for t in texts])
    qs = QuestionService(kb(), embedder=Emb())
    rec = qs.recommend_quadrants(concepts=["family family"], limit=2)
    assert rec[0]["quadrant"] == "Family" and rec[0]["method"] == "bge_m3_semantic"
    fb = QuestionService(kb()).recommend_quadrants(current_issue="my friends provide social support", limit=1)
    assert fb[0]["quadrant"] == "Social Circle" and "KB attributes" in fb[0]["method"]


def test_routing_does_not_recommend_unmatched_quadrants_and_combines_patient_signals():
    qs = QuestionService(kb())
    assert qs.recommend_quadrants(current_issue="nothing specific to report") == []
    rec = qs.recommend_quadrants(concepts=["family conflict"], current_issue="I have irregular sleep and low energy",
                                 baseline={"anxiety": 8})
    names = {item["quadrant"] for item in rec}
    assert names == set()


def test_exact_sleep_anxiety_recovery_case_routes_only_clear_kb_matches_and_keeps_gates():
    from app.models.assessment import AssessmentCreate, BaselineCreate
    from app.retrieval.embeddings import BGE_M3_Embedder
    from app.services.assessment_service import AssessmentService

    issue = """PATIENT ASSESSMENT INFORMATION
MAIN CONCERNS: Anxiety, Sleep Issues, Addiction Recovery
PATIENT FORM NOTES: I have sleep issues not able to feel well throughout the day, feels very low energetic and sleepy throughout the day.
Baseline stress: 6/10
Baseline anxiety: 6/10
Baseline mood: 3/10
Baseline energy: 3/10
Baseline sleep quality: Fair
RECENT ASSESSMENT CONVERSATION:
PATIENT RESPONSE to opening: It makes it difficult for me to stay focused and productive during the day because I feel tired and sleepy most of the time. I don't have much energy to do my usual activities, and sometimes I feel less motivated to interact with others. My anxiety also makes me overthink things and affects my ability to relax. Overall, I feel like my sleep, mood, and energy are affecting my work and daily routine."""

    svc = AssessmentService(kb=kb(), embedder=BGE_M3_Embedder())
    sid = svc.create_session(AssessmentCreate(patient_id="quadrant-regression-case")).session_id
    svc.set_baseline(sid, BaselineCreate(stress=6, anxiety=6, mood=3, energy=3, sleep_quality="Fair"))
    from types import SimpleNamespace
    extracted = ["Fatigue", "Lack of Energy", "Decreased Motivation", "Anxiety",
                 "Impact on Work and Daily Routine"]
    evidence_input = QuestionService._recommendation_evidence(
        issue, None, {"stress": 6, "anxiety": 6, "mood": 3, "energy": 3, "sleep_quality": "Fair"},
        {"occupation": "not supplied"}, extracted)
    input_text = " ".join(item["text"] for item in evidence_input)
    for signal in ("Anxiety", "Sleep Issues", "Addiction Recovery", "sleepy", "low energetic",
                   "stress: 6", "focused and productive", "daily routine", "Fatigue"):
        assert signal.lower() in input_text.lower()
    svc._ctx(sid).demographics["communication_preferences"] = {"occupation": "Software Engineer"}
    svc._ctx(sid).responses.append(SimpleNamespace(
        response_id="quadrant-regression-response",
        raw_text="I feel tired and sleepy most of the time.",
        extraction={"concepts": [{"concept": name, "domain": "symptom", "polarity": "positive"}
                                for name in extracted]}))
    svc.skip_opening(sid)
    rec = svc.recommend_quadrants(sid, current_issue=issue)
    names = {item["quadrant"] for item in rec}
    assert names == {"Lifestyle", "Nature", "Medical & Therapeutic Background"}
    assert "Music Therapy Profile" not in names
    assert "Profession" not in names
    assert len(rec) <= 3

    debug = {item["quadrant"]: item for item in svc.questions.last_recommendation_debug}
    assert len(debug) == len(kb().quadrant_names)
    assert debug["Lifestyle"]["score"] > 0.42
    assert debug["Lifestyle"]["matched_signals"]
    assert debug["Music Therapy Profile"]["matched_signals"] == []
    assert debug["Profession"]["matched_signals"] == []
    assert debug["Medical & Therapeutic Background"]["matched_signals"]
    assert any("extracted patient concept" in label for label in debug["Lifestyle"]["matched_signals"])

    # A single supported concern can yield fewer than three suggestions.
    sleep_only = svc.questions.recommend_quadrants(
        current_issue="MAIN CONCERNS: Sleep Issues\nPATIENT FORM NOTES: Irregular sleep and daytime sleepiness")
    assert [item["quadrant"] for item in sleep_only] == ["Lifestyle"]
    fallback = QuestionService(kb()).recommend_quadrants(
        current_issue=issue, baseline={"stress": 6, "anxiety": 6, "mood": 3, "energy": 3,
                                       "sleep_quality": "Fair"}, concepts=extracted)
    fallback_names = {item["quadrant"] for item in fallback}
    assert "Music Therapy Profile" not in fallback_names and "Profession" not in fallback_names

    # A high-score but unconfirmed candidate cannot produce imbalance evidence.
    from app.core.enums import EvidenceStatus
    candidate = {"candidate_id": "unconfirmed-fatigue", "score": 0.99,
                 "payload": {"indicator_id": "SYM-043"},
                 "concept": {"concept": "Fatigue", "polarity": "positive", "currentness": "current",
                             "certainty": "certain", "domain": "symptom", "intensity": "Severe", "context": "test"},
                 "quote": "I feel tired most of the time"}
    provisional = svc.evidence_engine.build_evidence(
        response_id="opening-response", candidate=candidate, extraction={}, status=EvidenceStatus.PROVISIONAL)
    svc._ctx(sid).evidence.append(provisional)
    result = svc.final_result(sid)
    assert result["summary"]["imbalanced"] == []
    assert all(not item["status"].startswith("IMBALANCED") for item in result["chakras"])
    assert all(item["status_code"] in {"NOT_ASSESSED", "INSUFFICIENT_EVIDENCE"}
               for item in result["chakras"])
    recs = svc.recommendations(sid)
    assert recs["raga"]["candidates"] == []


def test_engine_health_distinguishes_process_health_from_llm_readiness(monkeypatch):
    from app.api.health_routes import health
    from app.core.config import settings

    class Response:
        def raise_for_status(self):
            return None

        @staticmethod
        def json():
            return {"models": [{"name": "mistral:latest"}]}

    monkeypatch.setattr(settings, "llm_provider", "local")
    monkeypatch.setattr(settings, "llm_fallback_providers", "")
    monkeypatch.setattr(settings, "local_llm_url", "http://ollama.test")
    monkeypatch.setattr(settings, "local_llm_model", "mistral:latest")
    monkeypatch.setattr("app.api.health_routes.httpx.get", lambda *args, **kwargs: Response())
    assert health()["status"] == "ok" and health()["ai_ready"] is True

    monkeypatch.setattr(settings, "local_llm_model", "missing-model:latest")
    result = health()
    assert result["status"] == "ok" and result["ai_ready"] is False
    assert "not installed" in result["ai_readiness_reason"]


# ---- Mistral provider --------------------------------------------------------------------------------------
def _provider(handler):
    return MistralProvider(api_key="test-key", model="test-model",
                           client=httpx.Client(transport=httpx.MockTransport(handler)))


def _chat(content):
    return httpx.Response(200, json={"choices": [{"message": {"content": content}}]})


def test_mistral_extracts_with_json_schema_and_validates():
    seen = {}
    def handler(req):
        seen["body"] = json.loads(req.content); seen["auth"] = req.headers["authorization"]
        return _chat(as_json(positive_payload()))
    ex = _provider(handler).extract_semantics(POSITIVE_TEXT, context={"evidence": ["SECRET"], "baseline": {"stress": 5}})
    assert ex.concepts[0].concept == "lower back pain"
    assert seen["body"]["response_format"]["type"] == "json_schema" and seen["auth"] == "Bearer test-key"
    assert "SECRET" not in json.dumps(seen["body"])                         # no accumulated assessment state sent


def test_mistral_falls_back_to_json_object_when_schema_rejected():
    calls = []
    def handler(req):
        calls.append(json.loads(req.content)["response_format"]["type"])
        return httpx.Response(422, json={}) if len(calls) == 1 else _chat(as_json(positive_payload()))
    _provider(handler).extract_semantics(POSITIVE_TEXT)
    assert calls == ["json_schema", "json_object"]


def test_mistral_rejects_schema_invalid_output_and_needs_key():
    from app.core.exceptions import LLMInvalidResponseError
    with pytest.raises(LLMInvalidResponseError):
        _provider(lambda r: _chat('{"concepts": [{"concept": "x", "polarity": "bogus"}]}')).extract_semantics("x")
    with pytest.raises(LLMConfigurationError):
        MistralProvider(api_key=None, model="m")


def test_mistral_closed_set_validation_and_factory_registration():
    from app.core.config import Settings
    from app.llm.resilient import build_llm_provider
    def handler(req):
        return _chat(json.dumps({"judgements": [{"indicator_id": "EMO-012", "match": "exact"}]}))
    v = _provider(handler).validate_candidates("t", {"concept": "c"}, [{"indicator_id": "EMO-012", "term": "x", "domain": "emotion"}])
    assert v.judgements[0].match == "exact"
    chain = build_llm_provider(Settings(llm_provider="mistral", llm_fallback_providers="", mistral_api_key="k", mistral_model="m"))
    assert chain.provider_names == ["MistralProvider"] or chain.provider_names == ["mistral"]


# ---- result contract ---------------------------------------------------------------------------------------------------
def test_result_contract_has_everything_the_window_needs():
    t = "I feel unheard at home"
    svc, sid = make_session({t: [concept("feel unheard", "feeling unheard", "emotion")]}, {"feeling unheard": [(THROAT["unheard"], .9)]})
    say(svc, sid, t)
    res = svc.final_result(sid)
    assert len(res["chakras"]) == 7
    for c in res["chakras"]:
        for k in ("status", "status_label", "scores", "confidence_pct", "coverage_pct", "reasons", "trace", "pending_details"):
            assert k in c
    assert res["requires_domain_validation"] and res["disclaimer"] and "coverage" in res
    json.dumps(res, default=str)                                             # serialisable for the API


# ---- session-less KB helpers used by the Node backend -----------------------------------------------------
def test_opening_styles_and_suggestions_come_only_from_the_kb():
    svc, _ = make_session({}, {})
    assert len(svc.list_opening_styles()["styles"]) == 10
    first = svc.suggest_question("", [], "C")
    kb_first = next(s for s in kb().opening_styles["styles"] if s["id"] == "C")["questions"][0]
    assert first["text"] == kb_first["text"]
    nxt = svc.suggest_question("", [first["id"]], "C")
    assert nxt["id"] != first["id"]
    fam = svc.suggest_question("family structure and family dynamics matter in my household", [])
    assert fam["quadrant"] == "Family" and fam["source"]
