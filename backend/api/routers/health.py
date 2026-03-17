from fastapi import APIRouter

from backend.schemas.api import HealthPayload


router = APIRouter(prefix="/api/health", tags=["health"])


@router.get("", response_model=HealthPayload)
def health() -> HealthPayload:
    return HealthPayload(status="ok", mode="local-only")
