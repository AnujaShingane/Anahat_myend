"""Live check of the configured LLM chain against the REAL SemanticExtraction schema + prompt.

Usage (from the project root, with .env configured):
    python scripts/llm_integration_check.py

Prints only validated results / safe error info. Never prints API keys or raw provider errors.
Exit code 0 = both checks passed, 1 = a check failed, 2 = provider unreachable/not configured.
"""
import logging
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
logging.basicConfig(level=logging.INFO, format="%(levelname)s %(name)s: %(message)s")

from app.core.config import settings  # noqa: E402
from app.core.exceptions import LLMServiceError  # noqa: E402
from app.llm.resilient import build_llm_provider  # noqa: E402
from app.llm.schemas import SemanticExtraction  # noqa: E402

POSITIVE = ("Patient reports severe lower back pain every day for the last two weeks.\n"
            "It becomes worse when bending and has affected sleep.")
NEGATIVE = "Patient does not have back pain."


def show(label, ex):
    print(f"\n[{label}] valid SemanticExtraction: {isinstance(ex, SemanticExtraction)}")
    for c in ex.concepts:
        print(f"  - {c.concept!r} domain={c.domain} polarity={c.polarity} currentness={c.currentness} "
              f"certainty={c.certainty} intensity={c.intensity} frequency={c.frequency!r} "
              f"duration={c.duration!r} trigger={c.trigger!r} impact={c.impact!r}")


def main() -> int:
    print(f"provider={settings.llm_provider} model={settings.llm_model} "
          f"fallback_models={settings.openrouter_fallback_model_list} "
          f"fallback_providers={settings.llm_fallback_provider_list}")
    provider = build_llm_provider()
    print("chain:", provider.provider_names)
    ok = True
    try:
        pos = provider.extract_semantics(POSITIVE, context={})
        show("positive", pos)
        text_blob = " ".join((c.concept + " " + (c.frequency or "") + " " + (c.duration or "") + " "
                              + (c.trigger or "") + " " + (c.impact or "")).lower() for c in pos.concepts)
        symptom_ok = any("back" in c.concept.lower() and c.polarity == "positive" and c.domain == "symptom"
                         for c in pos.concepts)
        detail_ok = all(k in text_blob for k in ("two week", "bend", "sleep")) or \
            any(c.intensity == "Severe" for c in pos.concepts)
        print(f"  explicit symptom captured as positive: {symptom_ok}; details captured: {detail_ok}")
        ok &= symptom_ok

        neg = provider.extract_semantics(NEGATIVE, context={})
        show("negative", neg)
        false_positive = any("back" in c.concept.lower() and c.polarity == "positive" for c in neg.concepts)
        print(f"  incorrectly created a POSITIVE back-pain concept: {false_positive}")
        ok &= not false_positive
    except LLMServiceError as exc:
        print(f"\nSAFE APPLICATION ERROR ({exc.code}): {exc.user_message}")
        print("See the log lines above for the technical category/provider.")
        return 2
    print("\nRESULT:", "PASS" if ok else "FAIL")
    return 0 if ok else 1


if __name__ == "__main__":
    raise SystemExit(main())
