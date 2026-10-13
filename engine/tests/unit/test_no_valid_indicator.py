from app.knowledge.loader import KnowledgeBase
from app.services.assessment_service import AssessmentService
from app.llm.schemas import SemanticExtraction, ExtractedConcept
from app.models.assessment import AssessmentCreate
class L:
    def extract_semantics(self,text,context=None):
        return SemanticExtraction(concepts=[ExtractedConcept(concept='everything is fine',domain='other',polarity='neutral',currentness='current',certainty='certain',clarification_required=False)])
class R:
    def search(self,q): raise AssertionError('non-indicator concept must not reach retrieval')
def test_generic_statement_has_explicit_no_valid_indicator_path():
    kb=KnowledgeBase().load_directory('knowledge_base/ANAHAT_KnowledgeBase_v3'); s=AssessmentService(kb=kb,llm=L(),retriever=R()); sid=s.create_session(AssessmentCreate(patient_id='p')).session_id
    out=s.process_response(sid,'Everything is fine')
    assert out['status']=='NO_VALID_INDICATOR' and out['candidate_count']==0
