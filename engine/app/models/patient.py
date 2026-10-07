from pydantic import BaseModel, Field

class BaselineRatings(BaseModel):
    stress: int = Field(ge=1, le=10)
    anxiety: int = Field(ge=1, le=10)
    mood: int = Field(ge=1, le=10)
    sleep_quality: str
    energy: int = Field(ge=1, le=10)

class PatientDemographics(BaseModel):
    patient_id: str
    name: str | None = None
    age: int | None = Field(default=None, ge=0, le=130)
    language: str = "en"
    communication_preferences: dict = Field(default_factory=dict)
    disability_type: str | None = None
    mental_age: int | None = Field(default=None, ge=0, le=130)
