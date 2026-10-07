from app.knowledge.loader import KnowledgeBase

def test_ten_quadrants():
    kb=KnowledgeBase().load_directory('knowledge_base/ANAHAT_KnowledgeBase_v3')
    assert kb.quadrant_names == ['Nature','Family','Social Circle','Personal Interests','Profession','Lifestyle','Diet','Physical Nature','Medical & Therapeutic Background','Music Therapy Profile']
