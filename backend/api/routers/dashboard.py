from fastapi import APIRouter

from backend.schemas.api import DashboardPayload, TelemetryPoint
from backend.services.telemetry_service import get_dashboard, list_recent


router = APIRouter(prefix="/api/dashboard", tags=["dashboard"])


@router.get("", response_model=DashboardPayload)
def dashboard() -> DashboardPayload:
    return get_dashboard()


@router.get("/history", response_model=list[TelemetryPoint])
def history() -> list[TelemetryPoint]:
    return list_recent()

