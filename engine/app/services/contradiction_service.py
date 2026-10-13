from collections import defaultdict

from app.engine.attribute_conflict import clarification_question

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

        groups = defaultdict(lambda: {"pos": [], "neg": [], "hist": [], "iid": None})
        by_id = {e.evidence_id: e for e in live}
        for ev in live:
            key = ev.correlation_group or f"id:{ev.canonical_indicator_id}"
            g = groups[key]
            g["iid"] = g["iid"] or ev.canonical_indicator_id
            if ev.polarity == "negative" or ev.status.value == "NEGATIVE":
                g["neg"].append(ev.evidence_id)
            elif ev.polarity == "positive" and ev.currentness == "current" and ev.status.value != "HISTORICAL":
                g["pos"].append(ev.evidence_id)
            elif ev.polarity == "positive" and (ev.currentness == "historical" or ev.status.value == "HISTORICAL"):
                g["hist"].append(ev.evidence_id)
        def ask(attribute, a_ids, b_ids):
            a, b = by_id.get(a_ids[0]), by_id.get(b_ids[0])
            if not a or not b:
                return None
            return clarification_question(a.indicator_term or "this", attribute,
                                          (a.quote or a.indicator_term or "").strip(),
                                          (b.quote or b.indicator_term or "").strip())

        for key, g in groups.items():
            chakras = sorted({i.chakra for i in indicator_repo.get_by_id(g["iid"])}) if g["iid"] else []
            if g["pos"] and g["neg"]:
                # presence / absence: the patient both affirmed and denied the same problem
                for chakra in chakras:
                    out.append({"type": "polarity", "chakra": chakra, "indicator_id": g["iid"], "group": key,
                                "positive_evidence_ids": sorted(g["pos"]), "negative_evidence_ids": sorted(g["neg"]),
                                "question": ask("presence", sorted(g["pos"]), sorted(g["neg"]))})
            if g["pos"] and g["hist"]:
                # current vs historical: unresolved until the patient says which is true (spec section 6)
                for chakra in chakras:
                    out.append({"type": "currentness", "chakra": chakra, "indicator_id": g["iid"], "group": key,
                                "positive_evidence_ids": sorted(g["pos"]), "historical_evidence_ids": sorted(g["hist"]),
                                "question": ask("currentness", sorted(g["pos"]), sorted(g["hist"]))})
        return out
