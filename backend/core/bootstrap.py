from backend.core.database import init_database
from backend.core.paths import (
    BUILD_METADATA_PATH,
    DEFAULT_FEATURE_FLAGS_PATH,
    DEFAULT_BUILD_METADATA_PATH,
    DEFAULT_MODEL_REGISTRY_PATH,
    DEFAULT_SYSTEM_SETTINGS_PATH,
    FEATURE_FLAGS_PATH,
    MODEL_REGISTRY_PATH,
    SNAPSHOT_DIR,
    SYSTEM_SETTINGS_PATH,
    ensure_directories,
)
from backend.services.json_store import read_json
from backend.services.log_service import add_log
from backend.services.snapshot_service import create_snapshot
from backend.services.json_store import write_json


def ensure_baseline_snapshots() -> None:
    if any(SNAPSHOT_DIR.glob("*.json")):
        return
    create_snapshot("feature-flags", str(FEATURE_FLAGS_PATH), read_json(FEATURE_FLAGS_PATH, {}), "Initial feature flag baseline")
    create_snapshot("system-settings", str(SYSTEM_SETTINGS_PATH), read_json(SYSTEM_SETTINGS_PATH, {}), "Initial system settings baseline")
    create_snapshot("models", str(MODEL_REGISTRY_PATH), read_json(MODEL_REGISTRY_PATH, []), "Initial model registry baseline")


def ensure_default_configs() -> None:
    defaults = (
        (DEFAULT_FEATURE_FLAGS_PATH, FEATURE_FLAGS_PATH, {}),
        (DEFAULT_SYSTEM_SETTINGS_PATH, SYSTEM_SETTINGS_PATH, {}),
        (DEFAULT_MODEL_REGISTRY_PATH, MODEL_REGISTRY_PATH, []),
        (DEFAULT_BUILD_METADATA_PATH, BUILD_METADATA_PATH, {}),
    )
    for source, target, fallback in defaults:
        if target.exists():
            continue
        write_json(target, read_json(source, fallback))


def bootstrap() -> None:
    ensure_directories()
    ensure_default_configs()
    init_database()
    ensure_baseline_snapshots()
    add_log("app", "info", "bootstrap", "Application bootstrap completed.")
