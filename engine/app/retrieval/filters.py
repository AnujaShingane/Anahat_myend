def candidate_is_usable(candidate, *, score_threshold: float) -> bool:
    score = float(getattr(candidate, "score", 0.0) or 0.0)
    payload = getattr(candidate, "payload", {}) or {}
    return bool(payload.get("indicator_id")) and score >= score_threshold
