def rank_candidates(results):
    return sorted(results, key=lambda r: float(getattr(r, "score", 0.0) or 0.0), reverse=True)
