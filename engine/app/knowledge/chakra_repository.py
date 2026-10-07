class ChakraRepository:
    def __init__(self, kb):
        self.kb = kb
        self.by_name = {c.get("name"): c for c in kb.chakra_master}

    def names(self):
        return list(self.by_name)

    def get(self, name):
        return self.by_name.get(name)
