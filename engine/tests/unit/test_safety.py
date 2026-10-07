from app.knowledge.loader import KnowledgeBase
from app.services.safety_service import SafetyService

def test_safety_escalation():
    kb=KnowledgeBase().load_directory('knowledge_base/ANAHAT_KnowledgeBase_v3'); x=SafetyService(kb).assess('I want to kill myself')
    assert x['status']=='ESCALATE'

def test_normal_response_clear():
    kb=KnowledgeBase().load_directory('knowledge_base/ANAHAT_KnowledgeBase_v3'); assert SafetyService(kb).assess('Everything is fine')['status']=='CLEAR'
