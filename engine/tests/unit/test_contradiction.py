from app.knowledge.loader import KnowledgeBase
from app.knowledge.indicator_repository import IndicatorRepository
from app.services.contradiction_service import ContradictionService
from app.engine.evidence_engine import EvidenceEngine
from app.core.enums import EvidenceStatus

def test_same_chakra_direction_conflict():
    kb=KnowledgeBase().load_directory('knowledge_base/ANAHAT_KnowledgeBase_v3'); repo=IndicatorRepository(kb); eng=EvidenceEngine(repo)
    # EMO-004 is Excess Solar Plexus; EMO-003 is Deficient Solar Plexus.
    def ev(i,r): return eng.build_evidence(response_id=r,candidate={"candidate_id":r,"score":1,"payload":{"indicator_id":i},"concept":{"polarity":"positive","currentness":"current","certainty":"certain","domain":"emotion","intensity":"Moderate","context":"x"}},extraction={},status=EvidenceStatus.CONFIRMED)
    out=ContradictionService().find([ev('EMO-003','r1'),ev('EMO-004','r2')],repo)
    assert any(x['chakra']=='Solar Plexus Chakra' for x in out)
