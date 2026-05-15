from fastapi import APIRouter

from backend.schemas.api import SystemTelemetryPayload
from backend.services.system_telemetry_service import get_system_telemetry


router = APIRouter(prefix="/api/system", tags=["system"])


@router.get("/telemetry", response_model=SystemTelemetryPayload)
def system_telemetry() -> SystemTelemetryPayload:
    return get_system_telemetry()
