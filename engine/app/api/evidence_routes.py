from fastapi import APIRouter, HTTPException
from app.api.assessment_routes import _runtime_service
router=APIRouter()
@router.post('/sessions/{session_id}/evidence/{evidence_id}/resolve')
def resolve(session_id:str,evidence_id:str,selected_chakra:str,therapist_note:str|None=None):
    try:return _runtime_service().resolve_ambiguity(session_id,evidence_id,selected_chakra,therapist_note)
    except Exception as exc: raise HTTPException(status_code=400,detail=str(exc)) from exc
