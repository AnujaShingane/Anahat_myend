from app.knowledge.loader import KnowledgeBase
from app.services.ambiguity_service import AmbiguityService

def test_validated_disambiguation_is_used():
    kb=KnowledgeBase().load_directory('knowledge_base/ANAHAT_KnowledgeBase_v3'); svc=AmbiguityService(kb)
    assert svc.needs_clarification('SYM-001')
    assert any(q['id']=='RCD-01' for q in svc.for_indicator('SYM-001'))

def test_patient_clarification_is_mapped_to_the_kb_chakra_option():
    kb=KnowledgeBase().load_directory('knowledge_base/ANAHAT_KnowledgeBase_v3'); svc=AmbiguityService(kb)
    assert svc.resolve_patient_answer('SYM-001', 'I feel unsafe and worried about basic needs.') == 'Root Chakra'
