from fastapi import APIRouter
from app.core.config import settings
from app.knowledge.loader import KnowledgeBase
from app.services.assessment_service import AssessmentService
router=APIRouter()
_service=AssessmentService(kb=KnowledgeBase().load_directory(settings.kb_path))
@router.get('/reference')
def reference(): return {"chakras":_service.kb.chakra_names,"clinical_validation":False}
