from __future__ import annotations

class PrescriptionService:
    def draft(self, *, patient_id, findings, raga_candidates, activities, songs=None, safety_notes=None):
        return {
            "patient_id": patient_id, "findings": findings, "raga_candidates": raga_candidates,
            "activities": activities, "songs": songs or [], "safety_notes": safety_notes or [],
            "therapist_decision": None, "status": "DRAFT_REQUIRES_THERAPIST_APPROVAL"
        }

    def apply_therapist_decision(self, draft, decision):
        result = dict(draft)
        action = str(decision.get("decision", "")).lower()
        if action not in {"approve", "reject", "edit", "dismiss"}:
            raise ValueError("Therapist decision must be approve, reject, edit, or dismiss")
        result["therapist_decision"] = decision
        result["status"] = {"approve":"THERAPIST_APPROVED", "reject":"THERAPIST_REJECTED", "edit":"THERAPIST_EDITED", "dismiss":"THERAPIST_DISMISSED"}[action]
        return result
