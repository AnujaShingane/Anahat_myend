from app.knowledge.loader import KnowledgeBase
from app.knowledge.indicator_repository import IndicatorRepository
from app.engine.evidence_engine import EvidenceEngine
from app.engine.scoring_engine import ScoringEngine
from app.core.enums import EvidenceStatus

def make_ev(eid,rid,iid,intensity='Severe'):
    kb=KnowledgeBase().load_directory('knowledge_base/ANAHAT_KnowledgeBase_v3'); repo=IndicatorRepository(kb); eng=EvidenceEngine(repo)
    return eng.build_evidence(response_id=rid,candidate={"candidate_id":eid,"score":.99,"payload":{"indicator_id":iid,"ailment":"x"},"concept":{"polarity":"positive","currentness":"current","certainty":"certain","domain":"symptom","intensity":intensity,"context":"test"}},extraction={},status=EvidenceStatus.CONFIRMED)

def test_diminishing_returns_and_all_seven_chakras():
    kb=KnowledgeBase().load_directory('knowledge_base/ANAHAT_KnowledgeBase_v3'); se=ScoringEngine(kb)
    ev1=make_ev('a','r1','SYM-001'); ev2=make_ev('b','r2','SYM-001')
    report=se.score([ev1,ev2],assessed_quadrants=set(kb.quadrant_names))
    assert len(report.results)==7
    assert any(x.presence_score > 0 for x in report.results)
    sacral=next(x for x in report.results if x.chakra=='Sacral Chakra'); assert sacral.presence_score <= 1

def test_no_evidence_can_be_resolved_after_one_relevant_quadrant_is_assessed():
    kb=KnowledgeBase().load_directory('knowledge_base/ANAHAT_KnowledgeBase_v3'); report=ScoringEngine(kb).score([],assessed_quadrants={'Nature'})
    assert all(r.status=='BALANCED' for r in report.results)

def test_compound_indicator_state_is_normalized_for_scoring():
    kb=KnowledgeBase().load_directory('knowledge_base/ANAHAT_KnowledgeBase_v3')
    anxiety_root=next(i for i in kb.indicators if i.indicator_id=='SYM-009' and i.chakra=='Root Chakra')
    assert anxiety_root.state_raw == 'Deficient'

def test_one_confirmed_meaningful_direction_passes_even_with_low_confidence():
    kb=KnowledgeBase().load_directory('knowledge_base/ANAHAT_KnowledgeBase_v3')
    evidence=make_ev('one','r1','EMO-009','Moderate')
    evidence.context = None
    report=ScoringEngine(kb).score([evidence], contradictions=[{"chakra": "Third Eye Chakra", "type": "intensity"}])
    third_eye=next(x for x in report.results if x.chakra=='Third Eye Chakra')
    assert third_eye.deficient_score == .7
    assert third_eye.status == 'IMBALANCED_DEFICIENT'
    assert third_eye.gate_passed
    assert third_eye.confidence_pct < 60
    assert third_eye.scored_evidence_count == 1

def test_meaningful_opposing_directions_are_conflicted_without_20_percent_dominance():
    kb=KnowledgeBase().load_directory('knowledge_base/ANAHAT_KnowledgeBase_v3')
    evidence=[make_ev('deficient','r1','EMO-009','Moderate'),
              make_ev('excess','r2','EMO-010','Moderate')]
    report=ScoringEngine(kb).score(evidence)
    third_eye=next(x for x in report.results if x.chakra=='Third Eye Chakra')
    assert third_eye.deficient_score == .7
    assert third_eye.excess_score == .7
    assert third_eye.status == 'CONFLICTED'
    assert third_eye.direction is None
    assert 'dominance ratio' in third_eye.reasons[0]
