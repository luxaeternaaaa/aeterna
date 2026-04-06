from backend.core.paths import BUILD_METADATA_PATH, SESSION_STATE_PATH, STARTUP_DIAGNOSTICS_PATH
from backend.schemas.api import BuildMetadata, CaptureStatus, DetectedGame, SessionState
from backend.services.json_store import read_json


def get_build_metadata() -> BuildMetadata:
    return BuildMetadata(
        **read_json(
            BUILD_METADATA_PATH,
            {
                "version": "1.0.0",
                "build_timestamp": "",
                "git_commit": "development",
                "runtime_schema_version": "3.0.0",
                "sidecar_protocol_version": "3",
            },
        )
    )


def get_session_state() -> SessionState:
    return SessionState(
        **read_json(
            SESSION_STATE_PATH,
            {
                "state": "idle",
                "telemetry_source": "demo",
                "capture_source": "counters-fallback",
                "capture_quality": "idle",
            },
        )
    )


def get_detected_game() -> DetectedGame | None:
    session = get_session_state()
    if not session.detected_candidate_pid or not session.detected_candidate_name:
        return None
    return DetectedGame(
        exe_name=session.detected_candidate_name,
        pid=session.detected_candidate_pid,
        observed_for_ms=3000,
        capture_available=True,
        recommended_profile_id=session.recommended_profile_id,
        reason=session.capture_reason or "Stable foreground candidate is ready for manual attach.",
    )


def get_capture_status() -> CaptureStatus:
    session = get_session_state()
    return CaptureStatus(
        source=session.capture_source,
        available=True,
        quality=session.capture_quality,
        helper_available=False,
        note=session.capture_reason,
    )


def get_startup_diagnostics() -> dict[str, str | None]:
    return read_json(
        STARTUP_DIAGNOSTICS_PATH,
        {
            "launch_started_at": None,
            "window_visible_at": None,
            "sidecar_ready_at": None,
            "backend_ready_at": None,
            "bootstrap_loaded_at": None,
        },
    )
