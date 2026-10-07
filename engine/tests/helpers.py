"""Shared test helpers. No real network, no real keys."""
from __future__ import annotations

import json
import threading
import time
from http.server import BaseHTTPRequestHandler, HTTPServer
from types import SimpleNamespace

from google.genai import errors as genai_errors

from app.llm.schemas import SemanticExtraction

# The exact patient statements requested for verification.
POSITIVE_TEXT = ("Patient reports severe lower back pain every day for the last two weeks.\n"
                 "It becomes worse when bending and has affected sleep.")
NEGATIVE_TEXT = "Patient does not have back pain."


def positive_payload() -> dict:
    """What a correct model should return for POSITIVE_TEXT (explicit facts only)."""
    return {
        "concepts": [{
            "concept": "lower back pain", "evidence_quote": "severe lower back pain", "domain": "symptom", "polarity": "positive",
            "currentness": "current", "certainty": "certain", "intensity": "Severe",
            "frequency": "every day", "duration": "last two weeks", "trigger": "bending",
            "impact": "affected sleep", "clarification_required": False,
        }],
        "clarification_required": False, "safety_relevant": False,
    }


def negative_payload() -> dict:
    """What a correct model should return for NEGATIVE_TEXT: negation preserved."""
    return {
        "concepts": [{
            "concept": "back pain", "evidence_quote": "does not have back pain", "domain": "symptom", "polarity": "negative",
            "currentness": "current", "certainty": "certain", "clarification_required": False,
        }],
        "clarification_required": False, "safety_relevant": False,
    }


def as_json(payload: dict) -> str:
    return json.dumps(payload)


def fenced(payload: dict, lang: str = "json") -> str:
    return f"```{lang}\n{json.dumps(payload, indent=2)}\n```"


# --------------------------------------------------------------------------- #
# Mock OpenRouter (real HTTP, real openai SDK on the client side)
# --------------------------------------------------------------------------- #
def completion(content, model="primary/model:free"):
    return {"id": "gen-test", "object": "chat.completion", "created": 1, "model": model,
            "choices": [{"index": 0, "finish_reason": "stop",
                         "message": {"role": "assistant", "content": content}}]}


def error_body(status, message="upstream error", provider_name="UpstreamCo"):
    return {"error": {"code": status, "message": message, "metadata": {"provider_name": provider_name}}}


class Reply:
    def __init__(self, status=200, body=None, headers=None, delay=0.0):
        self.status, self.body, self.headers, self.delay = status, body, headers or {}, delay


def ok(content, model="primary/model:free"):
    return Reply(200, completion(content, model))


def fail(status, message="upstream error", headers=None):
    return Reply(status, error_body(status, message), headers)


class MockOpenRouter:
    """Serves scripted replies in order; the last reply repeats once the script is exhausted."""

    def __init__(self, script):
        self.script = list(script)
        self.requests: list[dict] = []
        self._lock = threading.Lock()
        outer = self

        class Handler(BaseHTTPRequestHandler):
            def log_message(self, *a):  # silence
                pass

            def do_POST(self):  # noqa: N802
                body = json.loads(self.rfile.read(int(self.headers.get("Content-Length", 0))) or b"{}")
                with outer._lock:
                    outer.requests.append({"body": body, "path": self.path,
                                           "has_auth": bool(self.headers.get("Authorization"))})
                    idx = min(len(outer.requests) - 1, len(outer.script) - 1)
                    reply = outer.script[idx]
                if reply.delay:
                    time.sleep(reply.delay)
                data = json.dumps(reply.body if reply.body is not None else {}).encode()
                try:
                    self.send_response(reply.status)
                    self.send_header("Content-Type", "application/json")
                    self.send_header("Content-Length", str(len(data)))
                    for k, v in reply.headers.items():
                        self.send_header(k, v)
                    self.end_headers()
                    self.wfile.write(data)
                except (BrokenPipeError, ConnectionResetError):
                    pass

        self._server = HTTPServer(("127.0.0.1", 0), Handler)
        self.url = f"http://127.0.0.1:{self._server.server_port}/api/v1"
        self._thread = threading.Thread(target=self._server.serve_forever, daemon=True)

    def __enter__(self):
        self._thread.start()
        return self

    def __exit__(self, *exc):
        self._server.shutdown()
        self._server.server_close()

    @property
    def call_count(self):
        return len(self.requests)


# --------------------------------------------------------------------------- #
# Fake Gemini client (raises the REAL google.genai error classes)
# --------------------------------------------------------------------------- #
def gemini_error(code: int, status: str, message: str = "provider failure"):
    payload = {"error": {"code": code, "message": message, "status": status}}
    cls = genai_errors.ServerError if code >= 500 else genai_errors.ClientError
    return cls(code, payload)


class FakeGemini:
    def __init__(self, script):
        self.script = list(script)
        self.calls: list[dict] = []
        self.models = self

    def generate_content(self, **kwargs):
        self.calls.append(kwargs)
        item = self.script[min(len(self.calls) - 1, len(self.script) - 1)]
        if isinstance(item, BaseException):
            raise item
        return item


def gemini_reply(*, parsed=None, text=None):
    return SimpleNamespace(parsed=parsed, text=text)


class Sleeps:
    """Injectable sleep that records instead of waiting."""
    def __init__(self):
        self.calls: list[float] = []

    def __call__(self, seconds):
        self.calls.append(seconds)


def concept_texts(extraction: SemanticExtraction) -> list[str]:
    return [c.concept for c in extraction.concepts]
