from uuid import uuid4
from app.models.response import ResponseRecord

class ResponseService:
    def create(self, *, text, question_id=None, quadrant=None):
        return ResponseRecord(response_id=str(uuid4()), question_id=question_id, quadrant=quadrant, raw_text=text)
