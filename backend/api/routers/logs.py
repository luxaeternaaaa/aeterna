from fastapi import APIRouter

from backend.schemas.api import LogRecord
from backend.services.log_service import list_logs


router = APIRouter(prefix="/api/logs", tags=["logs"])


@router.get("", response_model=list[LogRecord])
def logs() -> list[LogRecord]:
    return list_logs()

