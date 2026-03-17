from backend.core.paths import FEATURE_FLAGS_PATH, SYSTEM_SETTINGS_PATH
from backend.schemas.api import FeatureFlags, SystemSettings
from backend.services.json_store import read_json, write_json
from backend.services.log_service import add_log
from backend.services.snapshot_service import create_snapshot


def get_feature_flags() -> FeatureFlags:
    return FeatureFlags(**read_json(FEATURE_FLAGS_PATH, {}))


def update_feature_flags(payload: FeatureFlags) -> FeatureFlags:
    create_snapshot(
        "feature-flags",
        str(FEATURE_FLAGS_PATH),
        read_json(FEATURE_FLAGS_PATH, {}),
        "Before feature flags update",
    )
    write_json(FEATURE_FLAGS_PATH, payload.model_dump())
    add_log("settings", "info", "feature-flags", "Feature flags updated.")
    return payload


def get_system_settings() -> SystemSettings:
    return SystemSettings(**read_json(SYSTEM_SETTINGS_PATH, {}))


def update_system_settings(payload: SystemSettings) -> SystemSettings:
    create_snapshot(
        "system-settings",
        str(SYSTEM_SETTINGS_PATH),
        read_json(SYSTEM_SETTINGS_PATH, {}),
        "Before system settings update",
    )
    write_json(SYSTEM_SETTINGS_PATH, payload.model_dump())
    add_log("settings", "info", "system-settings", "System settings updated.")
    return payload
