from fastapi import APIRouter

from backend.services.summary_service import get_optimization_summary, get_security_summary


router = APIRouter(prefix="/api", tags=["summary"])


@router.get("/security")
def security() -> dict[str, object]:
    return get_security_summary()


@router.get("/optimization")
def optimization() -> dict[str, object]:
    return get_optimization_summary()

