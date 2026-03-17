from pathlib import Path

from backend.core.paths import DEFAULTS_ROOT, MODEL_REGISTRY_PATH, SNAPSHOT_DIR, SOURCE_ROOT
from backend.schemas.api import ActionResult, ModelRecord
from backend.services.json_store import read_json, write_json
from backend.services.log_service import add_log
from backend.services.snapshot_service import create_snapshot, restore_snapshot


def list_models() -> list[ModelRecord]:
    models = []
    for row in read_json(MODEL_REGISTRY_PATH, []):
        preview = []
        preview_path = row.get("shap_preview_path")
        if preview_path:
            candidate = Path(preview_path)
            if not candidate.exists():
                candidate = SOURCE_ROOT / preview_path
            if not candidate.exists():
                candidate = DEFAULTS_ROOT / preview_path
            preview = read_json(candidate, {}).get("summary", [])
        models.append(ModelRecord(**{**row, "shap_preview": preview}))
    return models


def activate_model(model_id: str) -> ModelRecord:
    current = read_json(MODEL_REGISTRY_PATH, [])
    create_snapshot("models", str(MODEL_REGISTRY_PATH), current, f"Before activating {model_id}")
    for item in current:
        item["status"] = "active" if item["id"] == model_id else "ready"
    write_json(MODEL_REGISTRY_PATH, current)
    add_log("models", "info", "model-registry", f"Activated model {model_id}.")
    return next(ModelRecord(**item) for item in current if item["id"] == model_id)


def rollback_model(model_id: str) -> ActionResult:
    for path in sorted(SNAPSHOT_DIR.glob("models-*.json"), reverse=True):
        record = read_json(path, {})
        if record.get("kind") != "models":
            continue
        restore_snapshot(record["id"])
        add_log("models", "info", "model-registry", f"Rolled back model registry while handling {model_id}.")
        return ActionResult(ok=True, message=f"Rolled back model registry for {model_id}.")
    return ActionResult(ok=False, message="No model snapshot is available for rollback.")
