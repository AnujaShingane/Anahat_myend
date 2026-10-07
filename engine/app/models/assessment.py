from pydantic import BaseModel, Field

class AssessmentCreate(BaseModel):
    patient_id: str
    language: str = "en"
    communication_preferences: dict = Field(default_factory=dict)

class AssessmentResponse(BaseModel):
    session_id: str
    status: str
    current_stage: str

class BaselineCreate(BaseModel):
    stress: int = Field(ge=1, le=10)
    anxiety: int = Field(ge=1, le=10)
    mood: int = Field(ge=1, le=10)
    sleep_quality: str
    energy: int = Field(ge=1, le=10)

class OpeningSelection(BaseModel):
    set_id: str

class QuadrantSelection(BaseModel):
    quadrant: str
