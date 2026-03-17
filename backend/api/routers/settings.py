from fastapi import APIRouter

from backend.schemas.api import FeatureFlags, SystemSettings
from backend.services.feature_service import (
    get_feature_flags,
    get_system_settings,
    update_feature_flags,
    update_system_settings,
)


router = APIRouter(prefix="/api/settings", tags=["settings"])


@router.get("/feature-flags", response_model=FeatureFlags)
def feature_flags() -> FeatureFlags:
    return get_feature_flags()


@router.put("/feature-flags", response_model=FeatureFlags)
def put_feature_flags(payload: FeatureFlags) -> FeatureFlags:
    return update_feature_flags(payload)


@router.get("/system", response_model=SystemSettings)
def system_settings() -> SystemSettings:
    return get_system_settings()


@router.put("/system", response_model=SystemSettings)
def put_system_settings(payload: SystemSettings) -> SystemSettings:
    return update_system_settings(payload)

