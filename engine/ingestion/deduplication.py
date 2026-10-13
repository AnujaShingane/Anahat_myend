from __future__ import annotations

import hashlib


def content_hash(text: str) -> str:

    normalized = " ".join(text.split())

    return hashlib.sha256(
        normalized.encode("utf-8")
    ).hexdigest()


def is_duplicate(
    text: str,
    seen_hashes: set[str],
) -> bool:

    digest = content_hash(text)

    if digest in seen_hashes:
        return True

    seen_hashes.add(digest)

    return False