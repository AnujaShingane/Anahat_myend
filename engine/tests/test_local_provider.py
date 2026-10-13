import json

import httpx

from app.llm.local_provider import LocalOllamaProvider
from app.llm.resilient import ResilientLLMProvider
from app.llm.gemini_provider import GeminiProvider
from app.llm.schemas import CandidateValidation
from tests.helpers import FakeGemini, POSITIVE_TEXT, as_json, gemini_reply, positive_payload


def test_local_provider_uses_ollama_schema_and_parses_extraction():
    captured = {}

    def respond(request):
        captured["url"] = str(request.url)
        captured["payload"] = json.loads(request.content)
        return httpx.Response(
            200,
            json={"message": {"content": as_json(positive_payload())}},
        )

    client = httpx.Client(transport=httpx.MockTransport(respond))
    provider = LocalOllamaProvider(
        base_url="http://ollama.test",
        model="llama3:latest",
        keep_alive="30m",
        request_timeout=3,
        total_timeout=5,
        client=client,
    )

    result = provider.extract_semantics(POSITIVE_TEXT)
    client.close()

    assert result.concepts[0].concept == "lower back pain"
    assert captured["url"] == "http://ollama.test/api/chat"
    assert captured["payload"]["model"] == "llama3:latest"
    assert captured["payload"]["keep_alive"] == "30m"
    assert captured["payload"]["stream"] is False
    assert captured["payload"]["format"]["type"] == "object"


def test_local_extraction_distinguishes_reported_difficulties_from_denials():
    captured = {}

    def respond(request):
        captured["system"] = json.loads(request.content)["messages"][0]["content"]
        return httpx.Response(
            200,
            json={"message": {"content": as_json(positive_payload())}},
        )

    client = httpx.Client(transport=httpx.MockTransport(respond))
    provider = LocalOllamaProvider(base_url="http://ollama.test", model="llama3:latest", client=client)
    provider.extract_semantics("My motivation has decreased and I can't concentrate.")
    client.close()

    assert "decreased motivation" in captured["system"]
    assert "positive current symptoms" in captured["system"]
    assert "I don't have difficulty concentrating" in captured["system"]


def test_local_provider_validates_only_candidates_in_the_closed_list():
    captured = {}

    def respond(request):
        captured["payload"] = json.loads(request.content)
        return httpx.Response(200, json={"message": {"content": json.dumps({
            "judgements": [
                {"indicator_id": "SYM-043", "match": "exact"},
                {"indicator_id": "SYM-119", "match": "none"},
            ]
        })}})

    client = httpx.Client(transport=httpx.MockTransport(respond))
    provider = LocalOllamaProvider(base_url="http://ollama.test", model="llama3:latest", client=client)
    result = provider.validate_candidates(
        "I have fatigue", {"concept": "fatigue"},
        [{"indicator_id": "SYM-043", "term": "Fatigue", "domain": "symptom"},
         {"indicator_id": "SYM-119", "term": "Stroke", "domain": "symptom"}],
    )
    client.close()

    assert isinstance(result, CandidateValidation)
    assert [j.match for j in result.judgements] == ["exact", "none"]
    assert "I have fatigue" in captured["payload"]["messages"][1]["content"]


def test_local_provider_omits_accumulated_assessment_state_from_prompt():
    captured = {}

    def respond(request):
        captured["prompt"] = json.loads(request.content)["messages"][1]["content"]
        return httpx.Response(200, json={"message": {"content": as_json(positive_payload())}})

    client = httpx.Client(transport=httpx.MockTransport(respond))
    provider = LocalOllamaProvider(
        base_url="http://ollama.test",
        model="llama3:latest",
        client=client,
    )
    provider.extract_semantics(
        POSITIVE_TEXT,
        context={
            "baseline": {"stress": 5},
            "patient_state": {"current_issue": "Nature", "opening_response": "synthetic opening"},
            "responses": [{"raw_text": "old response"}],
            "candidates": [{"payload": {"indicator_id": "synthetic"}}],
            "evidence": [{"indicator_id": "synthetic"}],
            "audit_events": [{"event": "synthetic"} for _ in range(30)],
        },
    )
    client.close()

    assert "synthetic opening" in captured["prompt"]
    assert "current_issue" in captured["prompt"]
    assert "audit_events" not in captured["prompt"]
    assert "candidates" not in captured["prompt"]
    assert "old response" not in captured["prompt"]


def test_local_timeout_falls_back_to_gemini():
    def timeout(_request):
        raise httpx.ReadTimeout("simulated local model timeout")

    local_client = httpx.Client(transport=httpx.MockTransport(timeout))
    local = LocalOllamaProvider(
        base_url="http://ollama.test",
        model="llama3:latest",
        request_timeout=2,
        total_timeout=4,
        client=local_client,
    )
    gemini_client = FakeGemini([gemini_reply(parsed=positive_payload())])
    gemini = GeminiProvider(client=gemini_client, model="gemini-test-model", max_retries=0)

    result = ResilientLLMProvider([local, gemini], total_timeout=10).extract_semantics(POSITIVE_TEXT)
    local_client.close()

    assert result.concepts[0].concept == "lower back pain"
    assert len(gemini_client.calls) == 1
