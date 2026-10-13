from types import SimpleNamespace
from app.knowledge.loader import KnowledgeBase
from app.knowledge.indicator_repository import IndicatorRepository
from app.engine.evidence_engine import EvidenceEngine
from app.core.enums import EvidenceStatus

def test_candidate_is_not_evidence_until_confirmation():
    kb=KnowledgeBase().load_directory('knowledge_base/ANAHAT_KnowledgeBase_v3'); repo=IndicatorRepository(kb); eng=EvidenceEngine(repo)
    ind=repo.get_by_id('SYM-001')[0]
    c={"candidate_id":"c1","score":.9,"payload":{"indicator_id":"SYM-001","ailment":"Abdominal cramps"},"concept":{"polarity":"positive","currentness":"current","certainty":"certain","domain":"symptom","intensity":"Moderate","context":"stress"}}
    ev=eng.build_evidence(response_id='r1',candidate=c,extraction=c['concept'],status=EvidenceStatus.PROVISIONAL)
    assert ev.status==EvidenceStatus.PROVISIONAL and ev.canonical_indicator_id=='SYM-001'
