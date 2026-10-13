from app.knowledge.loader import KnowledgeBase
from app.services.raga_service import RagaService

def test_chakra_to_raga_bridge_cannot_auto_recommend():
    kb=KnowledgeBase().load_directory('knowledge_base/ANAHAT_KnowledgeBase_v3'); out=RagaService(kb).candidates(approved_chakras=['Root Chakra'])
    assert out['candidates']==[] and 'No validated chakra-to-raga mapping' in out['governance_notes'][0]
