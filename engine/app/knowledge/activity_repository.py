class ActivityRepository:
    """Read-only activity access from canonical chakra_master healing_activities.

    No activity is synthesized here. If the KB does not contain usable activity
    data, the service returns an empty set and therapist review is required.
    """
    def __init__(self, kb):
        self.kb = kb

    def for_chakra(self, chakra: str):
        record = next((c for c in self.kb.chakra_master if c.get("name") == chakra), None)
        return list(record.get("healing_activities") or []) if record else []
