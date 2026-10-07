"""Log helpers that keep secrets and patient text out of server logs."""
from __future__ import annotations

import logging
import re
from typing import Any, Iterable

logger = logging.getLogger("anahat.llm")

for _name in ("openai", "httpx", "httpcore"):
    logging.getLogger(_name).setLevel(logging.WARNING)

_SECRET_PATTERNS = [
    re.compile(r"sk-or-[A-Za-z0-9_\-]{6,}"),
    re.compile(r"sk-[A-Za-z0-9_\-]{10,}"),
    re.compile(r"AIza[0-9A-Za-z_\-]{10,}"),
    re.compile(r"(?i)bearer\s+[A-Za-z0-9._\-]{8,}"),
    re.compile(r"(?i)(api[_-]?key|token|authorization)(\"?\s*[:=]\s*\"?)[^\s\",}]{6,}"),
]


def scrub(text: Any, *, secrets: Iterable[str | None] = (), sensitive: Iterable[str | None] = (),
          max_len: int = 240) -> str:
    """Redact API keys and any patient text from a provider message, then truncate."""
    out = "" if text is None else str(text)
    candidates = [str(s) for s in list(secrets) + list(sensitive) if s is not None and len(str(s)) >= 6]
    for s in candidates:
        variants = {
            s,
            s.replace("\r\n", "\n").replace("\r", "\n"),
            s.replace("\n", "\\n"),
            s.replace("\n", " "),
            " ".join(s.split()),
        }
        for v in sorted(variants, key=len, reverse=True):
            if v:
                out = out.replace(v, "[redacted]")
    for pat in _SECRET_PATTERNS:
        out = pat.sub(lambda m: "[redacted]" if m.lastindex is None else f"{m.group(1)}{m.group(2)}[redacted]", out)
    out = " ".join(out.split())
    return out if len(out) <= max_len else out[:max_len] + "…"


def fmt(**fields: Any) -> str:
    """key=value pairs, skipping None. Values with spaces are quoted."""
    parts = []
    for k, v in fields.items():
        if v is None:
            continue
        v = str(v)
        parts.append(f'{k}="{v}"' if (" " in v or not v) else f"{k}={v}")
    return " ".join(parts)


def log_attempt(level: int, event: str, **fields: Any) -> None:
    logger.log(level, "llm.%s %s", event, fmt(**fields))
