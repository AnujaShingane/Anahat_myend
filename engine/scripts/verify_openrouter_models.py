"""Check the models configured in .env against OpenRouter's PUBLIC catalogue (no API key needed).

    python scripts/verify_openrouter_models.py            # checks LLM_MODEL + OPENROUTER_FALLBACK_MODELS
    python scripts/verify_openrouter_models.py a/b:free   # or check ids you pass explicitly

For each id it reports: exists?, free?, context length, and whether the model advertises
response_format / structured_outputs (ANAHAT does NOT rely on them: replies are parsed and validated strictly).
Availability for YOUR account, and live rate limits, can only be confirmed by a real request
(scripts/llm_integration_check.py).
"""
import json
import sys
import urllib.request
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))


def evaluate(ids: list[str], catalogue: list[dict]) -> list[dict]:
    by_id = {m.get("id"): m for m in catalogue}
    rows = []
    for mid in ids:
        m = by_id.get(mid)
        if m is None:
            rows.append({"id": mid, "exists": False})
            continue
        params = set(m.get("supported_parameters") or [])
        pricing = m.get("pricing") or {}
        rows.append({"id": mid, "exists": True,
                     "free": str(pricing.get("prompt")) in ("0", "0.0") and str(pricing.get("completion")) in ("0", "0.0"),
                     "context_length": m.get("context_length"),
                     "response_format": "response_format" in params,
                     "structured_outputs": "structured_outputs" in params})
    return rows


def main() -> int:
    from app.core.config import settings
    ids = sys.argv[1:] or [settings.llm_model, *settings.openrouter_fallback_model_list]
    with urllib.request.urlopen(f"{settings.openrouter_base_url}/models", timeout=20) as r:
        catalogue = json.load(r).get("data", [])
    bad = 0
    for row in evaluate(ids, catalogue):
        if not row["exists"]:
            bad += 1
            print(f"MISSING   {row['id']}  (not in OpenRouter's catalogue: fix or remove it)")
        else:
            print(f"OK        {row['id']}  free={row['free']} context={row['context_length']} "
                  f"response_format={row['response_format']} structured_outputs={row['structured_outputs']}")
    return 1 if bad else 0


if __name__ == "__main__":
    raise SystemExit(main())
