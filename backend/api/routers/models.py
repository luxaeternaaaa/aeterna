from fastapi import APIRouter

from backend.schemas.api import ActionResult, ModelRecord
from backend.services.model_service import activate_model, list_models, rollback_model


router = APIRouter(prefix="/api/models", tags=["models"])


@router.get("", response_model=list[ModelRecord])
def models() -> list[ModelRecord]:
    return list_models()


@router.post("/{model_id}/activate", response_model=ModelRecord)
def activate(model_id: str) -> ModelRecord:
    return activate_model(model_id)


@router.post("/{model_id}/rollback", response_model=ActionResult)
def rollback(model_id: str) -> ActionResult:
    return rollback_model(model_id)
