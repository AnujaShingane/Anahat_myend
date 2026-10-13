import importlib.util
from pathlib import Path

spec = importlib.util.spec_from_file_location("verify_models", Path(__file__).resolve().parents[1] / "scripts" / "verify_openrouter_models.py")
mod = importlib.util.module_from_spec(spec); spec.loader.exec_module(mod)

CATALOGUE = [
    {"id": "a/free-one:free", "pricing": {"prompt": "0", "completion": "0"}, "context_length": 32768, "supported_parameters": ["temperature"]},
    {"id": "b/paid-two", "pricing": {"prompt": "0.0000007", "completion": "0.0000022"}, "context_length": 1048576,
     "supported_parameters": ["response_format", "structured_outputs"]},
]


def test_evaluate_reports_missing_free_and_capabilities():
    rows = {r["id"]: r for r in mod.evaluate(["a/free-one:free", "b/paid-two", "c/typo"], CATALOGUE)}
    assert rows["a/free-one:free"]["free"] and not rows["a/free-one:free"]["response_format"]
    assert rows["b/paid-two"]["structured_outputs"] and not rows["b/paid-two"]["free"]
    assert rows["c/typo"] == {"id": "c/typo", "exists": False}
