from collections import defaultdict

_OPEN = ("CONFIRMED", "Resolved After Clarification", "PROVISIONAL")


class ContradictionService:
    """Finds MEANINGFUL contradictions without ever overwriting a raw response.

    direction : confirmed Deficient and Excess evidence on the same chakra.
    polarity  : the patient both affirmed AND denied the same indicator
                ("I sleep very well" ... "I have been unable to sleep for weeks").
    Resolved contradictions (a therapist marked one side `superseded`) disappear here
    but the records stay stored for audit.
    """

    def find(self, evidence, indicator_repo):
        live = [e for e in evidence if not getattr(e, "superseded", False)]
        by = defaultdict(lambda: {"Deficient": [], "Excess": []})
        for ev in live:
            if ev.status.value not in _OPEN or ev.polarity != "positive" or ev.currentness != "current":
                continue
            for ind in indicator_repo.get_by_id(ev.canonical_indicator_id):
                if ev.status.value == "Resolved After Clarification" and ev.selected_chakra \
                        and ev.selected_chakra != ind.chakra:
                    continue
                if ind.state_raw in by[ind.chakra]:
                    by[ind.chakra][ind.state_raw].append(ev.evidence_id)
        out = [
            {"type": "direction", "chakra": chakra, "deficient_evidence_ids": vals["Deficient"],
             "excess_evidence_ids": vals["Excess"]}
            for chakra, vals in by.items() if vals["Deficient"] and vals["Excess"]
        ]

        groups = defaultdict(lambda: {"pos": [], "neg": [], "iid": None})
        for ev in live:
            key = ev.correlation_group or f"id:{ev.canonical_indicator_id}"
            g = groups[key]
            g["iid"] = g["iid"] or ev.canonical_indicator_id
            if ev.polarity == "negative" or ev.status.value == "NEGATIVE":
                g["neg"].append(ev.evidence_id)
            elif ev.polarity == "positive" and ev.currentness == "current":
                g["pos"].append(ev.evidence_id)
        for key, g in groups.items():
            if not (g["pos"] and g["neg"]):
                continue
            chakras = sorted({i.chakra for i in indicator_repo.get_by_id(g["iid"])})
            for chakra in chakras:
                out.append({"type": "polarity", "chakra": chakra, "indicator_id": g["iid"], "group": key,
                            "positive_evidence_ids": sorted(g["pos"]), "negative_evidence_ids": sorted(g["neg"])})
        return out
