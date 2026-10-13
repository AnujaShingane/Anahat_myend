class RagaRepository:
    def __init__(self, kb):
        self.kb = kb
        self.by_name = {r.get("raga_name"): r for r in kb.ragas if r.get("raga_name")}

    def all(self):
        return list(self.kb.ragas)

    def get(self, name):
        return self.by_name.get(name)
