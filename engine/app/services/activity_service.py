class ActivityService:
    def __init__(self, repository): self.repository=repository
    def candidates_for_chakras(self, chakras):
        out=[]
        for chakra in chakras:
            for activity in self.repository.for_chakra(chakra):
                out.append({"chakra":chakra,"activity":activity,"requires_therapist_approval":True})
        return out
