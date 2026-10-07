from fastapi import APIRouter, HTTPException
from app.api.assessment_routes import _runtime_service
from app.models.prescription import TherapistDecision
router=APIRouter()
@router.get('/sessions/{session_id}')
def draft(session_id:str):
    try: return _runtime_service().prescription(session_id)
    except Exception as exc: raise HTTPException(status_code=400,detail=str(exc)) from exc
@router.post('/sessions/{session_id}/decision')
def decision(session_id:str, request:TherapistDecision):
    try:
        service=_runtime_service(); draft=service.prescription(session_id); result=service.prescriptions.apply_therapist_decision(draft,request.model_dump()); ctx=service.get(session_id); ctx.therapist_decisions.append(request.model_dump()); ctx.audit("THERAPIST_PRESCRIPTION_DECISION", decision=request.decision); return result
    except Exception as exc: raise HTTPException(status_code=400,detail=str(exc)) from exc
