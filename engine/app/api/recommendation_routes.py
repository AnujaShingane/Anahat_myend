from fastapi import APIRouter, HTTPException
from app.api.assessment_routes import _runtime_service
router=APIRouter()
@router.get('/sessions/{session_id}')
def recommendations(session_id:str):
    try: return _runtime_service().recommendations(session_id)
    except Exception as exc: raise HTTPException(status_code=400,detail=str(exc)) from exc
