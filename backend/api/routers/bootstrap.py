from fastapi import APIRouter

from backend.schemas.api import BootstrapPayload, BootstrapSettingsPayload
from backend.services.benchmark_service import latest_baseline, latest_report
from backend.services.feature_service import get_feature_flags, get_system_settings
from backend.services.model_service import list_models
from backend.services.profile_service import list_profiles
from backend.services.runtime_state_service import get_build_metadata, get_capture_status, get_detected_game, get_session_state
from backend.services.snapshot_service import latest_snapshot
from backend.services.telemetry_service import is_demo_mode


router = APIRouter(prefix="/api/bootstrap", tags=["bootstrap"])


@router.get("", response_model=BootstrapPayload)
def bootstrap_payload() -> BootstrapPayload:
    return BootstrapPayload(
        settings=BootstrapSettingsPayload(
            feature_flags=get_feature_flags(),
            system=get_system_settings(),
        ),
        last_snapshot_meta=latest_snapshot(),
        models=list_models(),
        demo_mode=is_demo_mode(),
        session=get_session_state(),
        detected_game=get_detected_game(),
        capture_status=get_capture_status(),
        profiles=list_profiles(),
        benchmark_baseline=latest_baseline(),
        latest_benchmark=latest_report(),
        build=get_build_metadata(),
    )
