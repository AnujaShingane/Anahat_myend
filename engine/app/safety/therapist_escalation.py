from datetime import datetime, timezone

class TherapistEscalation:
    def create_event(self, session_id, safety_result):
        return {"session_id":session_id,"type":"SAFETY_ESCALATION","created_at":datetime.now(timezone.utc).isoformat(),"details":safety_result}
