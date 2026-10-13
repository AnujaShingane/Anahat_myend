"""Live check of adaptive questions against YOUR configured model (Ollama by default).

    python scripts/try_adaptive_question.py
    python scripts/try_adaptive_question.py --text "My boss shouts at me and I can't sleep" --quadrant Profession
    python scripts/try_adaptive_question.py --model llama3.2:3b --answer "He wants me to take over his business"

Uses the real KB, the real extraction model (LLM_PROVIDER chain from .env) and the real question
generator (DYNAMIC_QUESTION_PROVIDERS). Qdrant is NOT required: indicator retrieval is stubbed,
so only patient words that match a canonical KB term directly (e.g. "anxious" -> Anxiety)
become evidence. Prints what the model saw, what it produced and whether the backend accepted it.
"""
from __future__ import annotations

import argparse
import json
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.core.config import settings  # noqa: E402
from app.knowledge.loader import KnowledgeBase  # noqa: E402
from app.llm.resilient import build_llm_provider  # noqa: E402
from app.models.assessment import AssessmentCreate, BaselineCreate  # noqa: E402
from app.services.assessment_service import AssessmentService  # noqa: E402


class NoRetriever:
    def search(self, *args, **kwargs):
        return []


class Recording:
    def __init__(self, inner):
        self.inner, self.contexts, self.outputs = inner, [], []

    @property
    def provider_names(self):
        return getattr(self.inner, "provider_names", [])

    def generate_question(self, context):
        self.contexts.append(context)
        out, provider = self.inner.generate_question(context)
        self.outputs.append(out.model_dump())
        return out, provider


def show(title, obj):
    print(f"\n=== {title} ===")
    print(json.dumps(obj, indent=2, ensure_ascii=False) if not isinstance(obj, str) else obj)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--text", default="I have family issues, my brother pressurizes me that makes me feel anxious")
    ap.add_argument("--quadrant", default="Family")
    ap.add_argument("--answer", default=None, help="optional patient answer to the generated question")
    ap.add_argument("--model", default=None, help="Ollama model for questions (overrides DYNAMIC_QUESTION_MODEL)")
    ap.add_argument("--delivery", default="auto", choices=["auto", "therapist_review"])
    args = ap.parse_args()

    settings.dynamic_questions_enabled = True
    settings.dynamic_question_delivery = args.delivery
    if args.model:
        settings.dynamic_question_model = args.model

    kb = KnowledgeBase().load_directory(settings.kb_path)
    svc = AssessmentService(kb=kb, llm=build_llm_provider(), retriever=NoRetriever())
    from app.llm.question_provider import build_question_generator
    rec = Recording(build_question_generator())
    svc.dynamic._generator = rec
    print("question providers:", rec.provider_names,
          "| model:", settings.dynamic_question_model or settings.local_llm_model)

    sid = svc.create_session(AssessmentCreate(patient_id="live-check")).session_id
    svc.set_baseline(sid, BaselineCreate(stress=6, anxiety=6, mood=5, sleep_quality="Fair", energy=5))
    t = time.time()
    opening = svc.submit_opening_response(sid, args.text)
    show(f"evidence from opening answer ({time.time() - t:.1f}s)",
         [{k: e.get(k) for k in ("indicator_term", "status", "quote")} for e in opening.get("evidence", [])])

    for turn in range(2 if args.answer else 1):
        t = time.time()
        page = (svc.select_quadrant(sid, args.quadrant) if turn == 0 else svc.next_questions(sid, args.quadrant))
        q = (page.get("questions") or [None])[0]
        if rec.contexts:
            show("context sent to the question model", rec.contexts[-1])
            show("raw model output", rec.outputs[-1] if len(rec.outputs) == len(rec.contexts) else "(model failed)")
        show(f"question shown to the patient ({time.time() - t:.1f}s)", q and q.get("question"))
        show("generation metadata", q and q.get("generation"))
        if turn == 0 and args.answer and q:
            out = svc.process_response(sid, args.answer, q["id"], args.quadrant)
            show("evidence from the answer", [{k: e.get(k) for k in ("indicator_term", "status", "quote")}
                                               for e in out.get("evidence", [])])
            rec.contexts.clear(); rec.outputs.clear()


if __name__ == "__main__":
    from app.core.exceptions import LLMServiceError
    try:
        main()
    except LLMServiceError:
        print("\nThe extraction model could not be reached. Start Ollama and pull the model, e.g.\n"
              f"  ollama serve\n  ollama pull {settings.local_llm_model}\n"
              f"(LOCAL_LLM_URL={settings.local_llm_url}, LOCAL_LLM_MODEL={settings.local_llm_model})")
        sys.exit(1)
