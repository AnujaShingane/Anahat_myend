import httpx
from fastapi import APIRouter
from app.core.config import settings
router=APIRouter()

def _provider_ready(name):
    if name in {"local", "ollama"}:
        if not settings.local_llm_url or not settings.local_llm_model:
            return False, "local model URL or model name is missing"
        try:
            response = httpx.get(f"{settings.local_llm_url.rstrip('/')}/api/tags", timeout=1.5)
            response.raise_for_status()
            names = {str(row.get("name", "")).split(":", 1)[0] for row in response.json().get("models", [])}
            configured = settings.local_llm_model.split(":", 1)[0]
            return (True, None) if configured in names else (False, f"local model '{settings.local_llm_model}' is not installed")
        except Exception:
            return False, "local model service is unreachable"
    configured = {
        "mistral": bool(settings.mistral_api_key and settings.mistral_model),
        "gemini": bool(settings.gemini_api_key and (settings.gemini_model or settings.llm_model)),
        "openrouter": bool(settings.openrouter_api_key and (settings.openrouter_model or settings.llm_model)),
    }.get(name, False)
    return (True, None) if configured else (False, f"{name} credentials or model are not configured")


@router.get('/health')
def health():
    chain = list(dict.fromkeys([settings.llm_provider, *settings.llm_fallback_provider_list]))
    results = [(name, *_provider_ready(name)) for name in chain]
    ready = any(is_ready for _, is_ready, _ in results)
    return {"status":"ok", "engine":"ANAHAT AI Engine", "llm_provider":settings.llm_provider,
            "ai_ready":ready,
            "ai_readiness_reason":None if ready else "; ".join(reason for _, _, reason in results),
            "clinical_validation":False}
