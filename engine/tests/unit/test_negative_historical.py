from app.knowledge.loader import KnowledgeBase
from app.knowledge.indicator_repository import IndicatorRepository
from app.engine.evidence_engine import EvidenceEngine
from app.engine.scoring_engine import ScoringEngine
from app.core.enums import EvidenceStatus

def build(kb,concept,status):
    eng=EvidenceEngine(IndicatorRepository(kb)); return eng.build_evidence(response_id='r',candidate={'candidate_id':'c','score':.9,'payload':{'indicator_id':'SYM-001'}},extraction=concept,status=status)

def test_negative_and_historical_never_score_as_current_positive():
    kb=KnowledgeBase().load_directory('knowledge_base/ANAHAT_KnowledgeBase_v3'); se=ScoringEngine(kb)
    neg=build(kb,{'polarity':'negative','currentness':'current','certainty':'certain','domain':'symptom','intensity':'Severe'},EvidenceStatus.CONFIRMED)
    hist=build(kb,{'polarity':'positive','currentness':'historical','certainty':'certain','domain':'symptom','intensity':'Severe'},EvidenceStatus.HISTORICAL)
    report=se.score([neg,hist],assessed_quadrants=set(kb.quadrant_names))
    assert all(r.deficient_score==0 and r.excess_score==0 for r in report.results)
