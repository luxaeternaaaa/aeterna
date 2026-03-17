import os
import sys
from pathlib import Path


SOURCE_ROOT = Path(__file__).resolve().parents[2]


def _default_runtime_root() -> Path:
    if not getattr(sys, "frozen", False):
        return SOURCE_ROOT
    local_app_data = os.getenv("LOCALAPPDATA")
    if local_app_data:
        return Path(local_app_data) / "Aeterna"
    return Path.home() / ".aeterna"


def _packaged_root() -> Path:
    frozen_root = getattr(sys, "_MEIPASS", None)
    return Path(frozen_root) if frozen_root else SOURCE_ROOT


RUNTIME_ROOT = Path(os.getenv("AETERNA_RUNTIME_ROOT", _default_runtime_root()))
DEFAULTS_ROOT = Path(os.getenv("AETERNA_DEFAULTS_ROOT", _packaged_root()))
DATA_DIR = Path(os.getenv("AETERNA_DATA_DIR", RUNTIME_ROOT / "data"))
CONFIG_DIR = Path(os.getenv("AETERNA_CONFIG_DIR", RUNTIME_ROOT / "config"))
DEFAULT_CONFIG_DIR = Path(os.getenv("AETERNA_DEFAULT_CONFIG_DIR", DEFAULTS_ROOT / "config"))
LOG_DIR = DATA_DIR / "logs"
SNAPSHOT_DIR = DATA_DIR / "snapshots"
GENERATED_DIR = DATA_DIR / "generated"
DB_PATH = DATA_DIR / "app.db"
LIVE_DATA_DIR = DATA_DIR / "runtime"
FEATURE_FLAGS_PATH = CONFIG_DIR / "feature_flags.json"
SYSTEM_SETTINGS_PATH = CONFIG_DIR / "system_settings.json"
MODEL_REGISTRY_PATH = CONFIG_DIR / "model_registry.json"
BUILD_METADATA_PATH = CONFIG_DIR / "build_metadata.json"
DEFAULT_FEATURE_FLAGS_PATH = DEFAULT_CONFIG_DIR / "feature_flags.json"
DEFAULT_SYSTEM_SETTINGS_PATH = DEFAULT_CONFIG_DIR / "system_settings.json"
DEFAULT_MODEL_REGISTRY_PATH = DEFAULT_CONFIG_DIR / "model_registry.json"
DEFAULT_BUILD_METADATA_PATH = DEFAULT_CONFIG_DIR / "build_metadata.json"
SEED_DATA_PATH = GENERATED_DIR / "telemetry_seed.json"
DEMO_TELEMETRY_PATH = GENERATED_DIR / "telemetry_demo.jsonl"
LIVE_TELEMETRY_PATH = LIVE_DATA_DIR / "telemetry_live.jsonl"
SESSION_STATE_PATH = LIVE_DATA_DIR / "session_state.json"
STARTUP_DIAGNOSTICS_PATH = LIVE_DATA_DIR / "startup_diagnostics.json"


def ensure_directories() -> None:
    for path in (DATA_DIR, LOG_DIR, SNAPSHOT_DIR, GENERATED_DIR, CONFIG_DIR, LIVE_DATA_DIR):
        path.mkdir(parents=True, exist_ok=True)
