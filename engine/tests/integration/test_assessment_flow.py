from app.knowledge.loader import KnowledgeBase
from app.services.assessment_service import AssessmentService
from app.models.assessment import AssessmentCreate, BaselineCreate
from app.llm.schemas import CandidateJudgement, CandidateValidation, SemanticExtraction, ExtractedConcept
from fastapi import FastAPI
from fastapi.testclient import TestClient

class FakeLLM:
    def extract_semantics(self,text,context=None):
        return SemanticExtraction(concepts=[ExtractedConcept(concept='abdominal cramps',evidence_quote=None,domain='symptom',polarity='positive',currentness='current',certainty='certain',intensity='Severe',context='stress',trigger='stress',frequency='sometimes',clarification_required=True)])
    def validate_candidates(self,text,concept,candidates):
        return CandidateValidation(judgements=[CandidateJudgement(
            indicator_id=c['indicator_id'],
            match='exact' if c['term'].lower() == concept['concept'].lower() else 'none')
            for c in candidates])
class FakeResult:
    score=.95; payload={'indicator_id':'SYM-001','ailment':'Abdominal cramps','diagnostic_type':'ambiguous'}
class FakeRetriever:
    def search(self,q,top_k=None):
        if 'Current quadrant:' in q:
            class QuestionResult:
                score=.9
                payload={'source':'rag/question_bank/lifestyle.md','text':
                         'How often does this affect your daily routine?\nWhat helps you manage this area of your life?\nWhat change would make this area feel more supportive?'}
            return [QuestionResult()]
        return [FakeResult()]

def test_end_to_end_patient_session_response_becomes_evidence_without_confirmation():
    kb=KnowledgeBase().load_directory('knowledge_base/ANAHAT_KnowledgeBase_v3'); svc=AssessmentService(kb=kb,llm=FakeLLM(),retriever=FakeRetriever())
    created=svc.create_session(AssessmentCreate(patient_id='p1')); sid=created.session_id
    svc.set_baseline(
    sid,
    BaselineCreate(
        stress=5,
        anxiety=5,
        mood=5,
        sleep_quality='Good',
        energy=5,
    ),
    )

    styles = svc.get_opening_questions(sid)
    assert len(styles["styles"]) == 10
    opening = svc.get_opening_questions(sid, style="C")
    assert opening["title"] == "Opening Questions"
    assert 2 <= len(opening["questions"]) <= 3

    opening_response = svc.submit_opening_response(
        sid,
        "I have been experiencing abdominal cramps and stress-related discomfort.",
    )
    assert len(opening_response["evidence"]) == 1
    assert opening_response["evidence"][0]["confirmation"]["patient_confirmed"] is True

    svc.select_quadrant(sid, "Lifestyle")
    out = svc.process_response(sid, "I keep getting abdominal cramps")
    assert out["status"] == "OK" and out["candidate_count"] == 1
    # same indicator already recorded from the opening answer: merged, not counted twice
    assert out["evidence"] == [] and len(out["repeat_mentions"]) == 1
    assert out["candidates"][0]["requires_confirmation"] is False


def test_opening_response_route_completes_assessment_to_final_result(monkeypatch):
    import app.api.assessment_routes as assessment_routes
    from app.api.recommendation_routes import router as recommendation_router

    kb = KnowledgeBase().load_directory('knowledge_base/ANAHAT_KnowledgeBase_v3')
    service = AssessmentService(kb=kb, llm=FakeLLM(), retriever=FakeRetriever())
    monkeypatch.setattr(assessment_routes, '_service', service)

    app = FastAPI()
    app.include_router(assessment_routes.router, prefix='/assessment')
    app.include_router(recommendation_router, prefix='/recommendations')
    client = TestClient(app, raise_server_exceptions=False)

    created = client.post('/assessment/sessions', json={'patient_id': 'integration-patient'})
    assert created.status_code == 200
    session_id = created.json()['session_id']

    baseline = client.post(f'/assessment/sessions/{session_id}/baseline', json={
        'stress': 5,
        'anxiety': 5,
        'mood': 5,
        'sleep_quality': 'Good',
        'energy': 5,
    })
    assert baseline.status_code == 200

    styles = client.get(f'/assessment/sessions/{session_id}/opening-questions')
    assert styles.status_code == 200 and len(styles.json()['styles']) == 10
    questions = client.get(f'/assessment/sessions/{session_id}/opening-questions', params={'style': 'A'})
    assert questions.status_code == 200
    assert 2 <= len(questions.json()['questions']) <= 3

    opening = client.post(
        f'/assessment/sessions/{session_id}/opening-response',
        json={'text': 'I have been experiencing abdominal cramps and stress-related discomfort.'},
    )
    assert opening.status_code == 200
    assert opening.json()['status'] == 'OK'

    selected = client.post(
        f'/assessment/sessions/{session_id}/quadrants/select',
        json={'quadrant': 'Lifestyle'},
    )
    assert selected.status_code == 200

    page = client.get(f'/assessment/sessions/{session_id}/questions/next', params={'quadrant': 'Lifestyle', 'limit': 1}).json()
    for number in range(3):
        question = page['questions'][0]
        response = client.post(
            f'/assessment/sessions/{session_id}/responses',
            json={'text': f'I have abdominal cramps and this affects my daily routine, answer {number}.', 'quadrant': 'Lifestyle', 'question_id': question['id']},
        )
        assert response.status_code == 200
        assert response.json()['candidate_count'] == 1
        if False:
            pass
        else:   # same symptom as the opening answer: one indicator = one count
            assert response.json()['evidence'] == [] and len(response.json()['repeat_mentions']) == 1
        if number < 2:
            page = client.get(f'/assessment/sessions/{session_id}/questions/next', params={'quadrant': 'Lifestyle', 'limit': 1}).json()
    completed = client.post(f'/assessment/sessions/{session_id}/quadrants/complete', json={'quadrant': 'Lifestyle'})
    assert completed.status_code == 200
    final = client.post(f'/assessment/sessions/{session_id}/end')
    assert final.status_code == 200
    # End Session always scores; open follow-ups are reported, not blocking.
    assert final.json()['status'] == 'COMPLETED'
    assert final.json()['final_result']['open_items']['pending_deep_dive']
    assert final.json()['assessment_context_summary']['total_responses'] >= 4
    assert 'final_result' in final.json() and 'chakra_report' in final.json() and 'raga' in final.json()


def test_selected_quadrant_uses_rag_until_coverage_then_displays_final_result(monkeypatch):
    from app.core.config import settings
    monkeypatch.setattr(settings, 'auto_advance_quadrants', True)   # legacy behaviour, still supported
    kb = KnowledgeBase().load_directory('knowledge_base/ANAHAT_KnowledgeBase_v3')
    svc = AssessmentService(kb=kb, llm=FakeLLM(), retriever=FakeRetriever())
    sid = svc.create_session(AssessmentCreate(patient_id='rag-flow-patient')).session_id
    svc.set_baseline(sid, BaselineCreate(stress=5, anxiety=5, mood=5, sleep_quality='Good', energy=5))

    selected = ['Lifestyle', 'Nature']
    for quadrant in selected:
        svc.select_quadrant(sid, quadrant)
    session_responses = 0
    for quadrant in selected:
        page = svc.next_questions(sid, quadrant, 1)
        for number in range(3):
            question = page['questions'][0]
            response = svc.process_response(
                sid, f'I experience abdominal cramps in this {quadrant} area, detail {number}.', question['id'], quadrant
            )
            session_responses += 1
            page = response.get('quadrant_transition') or svc.next_questions(sid, quadrant, 1)
        assert response['quadrant_progress']['normal_question_count'] == 3
        assert response['quadrant_progress']['completed'] is True
        if quadrant == selected[0]:
            assert page['quadrant'] == selected[1]
            assert page['question_count'] == 0
            assert page['questions'][0]['quadrant'] == selected[1]

    score_calls = []
    original_score = svc.scoring.score
    def count_final_score(*args, **kwargs):
        score_calls.append(1)
        return original_score(*args, **kwargs)
    svc.scoring.score = count_final_score
    # Follow-ups are answered during the session (not forced by End Session).
    for item in svc.deep_dive_items(sid)['items']:
        if item['field'] in {'intensity', 'disambiguation'}:
            svc.answer_deep_dive(
                sid, item['evidence_id'], item['field'],
                'Root Chakra' if item['field'] == 'disambiguation' else 'Severe',
                raw_text='I feel unsafe and worried about basic needs.'
                if item['field'] == 'disambiguation' else 'It is severe.',
            )
    final = svc.finalize_session(sid)
    # End Session always scores on the first call, even with open follow-ups.
    assert final['status'] == 'COMPLETED'
    assert len(score_calls) == 1
    assert final['final_result']['summary']['display_message'] == 'Chakra evaluation complete.'
    assert len(final['final_result']['chakras']) == 7
    assert all({'score', 'evidence_count', 'gate_passed', 'gate_threshold', 'status', 'reason'} <= set(item)
               for item in final['final_result']['chakras'])
    assert final['assessment_context_summary']['total_responses'] > session_responses
    assert set(final['assessment_context_summary']['completed_quadrants']) == set(selected)
    assert set(final['assessment_context_summary']['evidence_by_quadrant']) == set(selected)
    assert svc.get(sid).patient_state['assessment_complete'] is True
    assert svc.get(sid).patient_state['final_chakra_evaluated'] is True


def test_q3_completes_current_quadrant_but_waits_for_explicit_end_to_score(monkeypatch):
    from app.core.config import settings
    monkeypatch.setattr(settings, 'auto_advance_quadrants', True)
    class EmptyLLM:
        def extract_semantics(self, text, context=None):
            return SemanticExtraction(concepts=[])

        def validate_candidates(self, text, concept, candidates):
            return CandidateValidation(judgements=[])

    class EmptyRetriever:
        def search(self, query, top_k=None):
            return []

    kb = KnowledgeBase().load_directory('knowledge_base/ANAHAT_KnowledgeBase_v3')
    svc = AssessmentService(kb=kb, llm=EmptyLLM(), retriever=EmptyRetriever())
    sid = svc.create_session(AssessmentCreate(
        patient_id='explicit-end-flow', communication_preferences={'age': 35, 'occupation': 'Teacher'}
    )).session_id
    svc.set_baseline(sid, BaselineCreate(stress=4, anxiety=3, mood=6, sleep_quality='Good', energy=6))
    opening = 'The patient feels supported by friends and has stable sleep.'
    svc.submit_opening_response(sid, opening)
    page = svc.select_quadrant(sid, 'Nature')
    question_ids = []
    for number in range(3):
        question = page['questions'][0]
        question_ids.append(question['id'])
        svc.process_response(sid, f'Answer {number + 1}', question['id'], 'Nature')
        page = svc.next_questions(sid, 'Nature', 1)

    ctx = svc.get(sid)
    assert page['normal_limit_reached'] is True
    assert page['assessment_status'] == 'awaiting_therapist_decision'
    assert ctx.patient_state['assessment_status'] == 'awaiting_therapist_decision'
    assert ctx.quadrants['Nature']['completed'] is True
    assert ctx.patient_state['selected_quadrant_names'] == ['Nature']
    assert len(ctx.responses) == 4  # opening plus three normal quadrant answers

    def unexpected_raag(*args, **kwargs):
        raise AssertionError('Raag inference must be skipped without a supported chakra')

    svc.recommendations = unexpected_raag
    final = svc.finalize_session(sid)
    assert final['assessment_context_summary']['total_responses'] == 4
    assert final['assessment_context_summary']['completed_quadrants'] == ['Nature']
    assert final['final_result']['summary']['display_message'] == 'No chakra imbalance identified from the confirmed evidence.'
    assert final['raga']['status'] == 'SKIPPED_NO_SUPPORTED_CHAKRA'
    assert final['raga']['candidates'] == []
    assert svc.get(sid).patient_state['final_assessment_context']['opening_responses'] == [opening]
    assert [response.question_id for response in svc.get(sid).responses[-3:]] == question_ids

