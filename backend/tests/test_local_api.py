import importlib
import sys

from fastapi.testclient import TestClient


def load_client(runtime_root: str) -> TestClient:
    for name in [module for module in sys.modules if module == "backend" or module.startswith("backend.") or module == "ml" or module.startswith("ml.")]:
        sys.modules.pop(name, None)
    import os

    os.environ["AETERNA_RUNTIME_ROOT"] = runtime_root
    from backend.core.bootstrap import bootstrap

    bootstrap()
    module = importlib.import_module("backend.main")
    return TestClient(module.app)


def test_health_reports_local_only(tmp_path) -> None:
    client = load_client(str(tmp_path / "runtime"))

    response = client.get("/api/health")

    assert response.status_code == 200
    assert response.json() == {"status": "ok", "mode": "local-only"}


def test_bootstrap_payload_is_minimal_and_contains_shell_state(tmp_path) -> None:
    client = load_client(str(tmp_path / "runtime"))

    response = client.get("/api/bootstrap")

    assert response.status_code == 200
    payload = response.json()
    assert sorted(payload.keys()) == ["build", "capture_status", "demo_mode", "detected_game", "last_snapshot_meta", "models", "session", "settings"]
    assert payload["settings"]["feature_flags"]["telemetry_collect"] is False
    assert payload["settings"]["system"]["privacy_mode"] == "local-only"
    assert payload["settings"]["system"]["telemetry_mode"] == "demo"
    assert isinstance(payload["models"], list)
    assert isinstance(payload["demo_mode"], bool)
    assert payload["build"]["sidecar_protocol_version"] == "3"
    assert payload["session"]["state"] in {"idle", "detected", "attached", "active", "ended", "restored"}
    assert payload["capture_status"]["source"] in {"counters-fallback", "presentmon"}


def test_feature_flags_start_disabled_and_create_snapshot_on_update(tmp_path) -> None:
    client = load_client(str(tmp_path / "runtime"))

    initial_flags = client.get("/api/settings/feature-flags")
    initial_snapshots = client.get("/api/snapshots")

    assert initial_flags.status_code == 200
    assert initial_snapshots.status_code == 200
    assert all(value is False for value in initial_flags.json().values())

    payload = {**initial_flags.json(), "telemetry_collect": True}
    update = client.put("/api/settings/feature-flags", json=payload)
    next_snapshots = client.get("/api/snapshots")

    assert update.status_code == 200
    assert update.json()["telemetry_collect"] is True
    assert len(next_snapshots.json()) == len(initial_snapshots.json()) + 1


def test_model_activation_changes_active_model_and_supports_diff_lookup(tmp_path) -> None:
    client = load_client(str(tmp_path / "runtime"))

    before = client.get("/api/models")
    activated = client.post("/api/models/anomaly-ae-v1/activate")
    snapshots = client.get("/api/snapshots").json()
    model_snapshot = next(snapshot for snapshot in snapshots if snapshot["kind"] == "models")
    diff = client.get(f"/api/snapshots/{model_snapshot['id']}/diff")

    assert before.status_code == 200
    assert activated.status_code == 200
    assert activated.json()["id"] == "anomaly-ae-v1"
    assert diff.status_code == 200
    assert "active" in diff.json()["diff"]
