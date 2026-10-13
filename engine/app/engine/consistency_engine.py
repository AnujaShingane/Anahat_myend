from collections import defaultdict

class ConsistencyEngine:
    """Deterministic contradiction/consistency summary over canonical associations."""
    def __init__(self, indicator_repo): self.indicator_repo=indicator_repo
    def detect(self, evidence_records):
        by_chakra=defaultdict(lambda:{"Deficient":[] ,"Excess":[]})
        for ev in evidence_records:
            if ev.status.value not in ("CONFIRMED","Resolved After Clarification","PROVISIONAL") or ev.polarity!='positive' or ev.currentness!='current': continue
            for ind in self.indicator_repo.get_by_id(ev.canonical_indicator_id):
                if ev.selected_chakra and ev.selected_chakra != ind.chakra: continue
                if ind.state_raw in by_chakra[ind.chakra]: by_chakra[ind.chakra][ind.state_raw].append(ev.evidence_id)
        return {c:{k:sorted(v) for k,v in d.items()} for c,d in by_chakra.items()}
