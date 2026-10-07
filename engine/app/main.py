from fastapi import FastAPI
from app.core.logging_config import setup_logging

setup_logging()
from app.api.assessment_routes import router as assessment_router
from app.api.chakra_routes import router as chakra_router
from app.api.evidence_routes import router as evidence_router
from app.api.health_routes import router as health_router
from app.api.recommendation_routes import router as recommendation_router
from app.api.prescription_routes import router as prescription_router

app=FastAPI(title='ANAHAT AI Engine',version='3.0.0')
app.include_router(assessment_router,prefix='/assessment')
app.include_router(chakra_router,prefix='/chakra')
app.include_router(evidence_router,prefix='/evidence')
app.include_router(health_router)
app.include_router(recommendation_router,prefix='/recommendations')
app.include_router(prescription_router,prefix='/prescription')

