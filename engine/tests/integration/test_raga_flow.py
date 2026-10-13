from app.knowledge.loader import KnowledgeBase
from app.services.raga_service import RagaService

def test_raga_layer_blocks_unvalidated_chakra_bridge():
    kb=KnowledgeBase().load_directory('knowledge_base/ANAHAT_KnowledgeBase_v3'); result=RagaService(kb).candidates(approved_chakras=['Heart Chakra'])
    assert not result['candidates']
