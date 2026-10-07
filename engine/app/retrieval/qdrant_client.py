from functools import lru_cache

from app.core.config import settings


@lru_cache(maxsize=4)
def _build_qdrant_client(url: str, api_key: str | None):
    try:
        from qdrant_client import QdrantClient
    except ImportError as exc:
        raise RuntimeError('qdrant-client is required for Qdrant retrieval') from exc
    kwargs = {'url': url, 'timeout': 10}
    if api_key:
        kwargs['api_key'] = api_key
    return QdrantClient(**kwargs)


def get_qdrant_client():
    return _build_qdrant_client(settings.qdrant_url, settings.qdrant_api_key)
