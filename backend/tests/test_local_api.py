import importlib
import json
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
    assert sorted(payload.keys()) == [
        "benchmark_baseline",
        "build",
        "capture_status",
        "demo_mode",
        "detected_game",
        "last_snapshot_meta",
        "latest_benchmark",
        "models",
        "profiles",
        "session",
        "settings",
    ]
    assert payload["settings"]["feature_flags"]["telemetry_collect"] is True
    assert payload["settings"]["system"]["privacy_mode"] == "local-only"
    assert payload["settings"]["system"]["telemetry_mode"] in {"demo", "live", "disabled"}
    assert payload["settings"]["system"]["registry_presets_enabled"] is False
    assert payload["settings"]["system"]["show_advanced_registry_details"] is False
    assert isinstance(payload["models"], list)
    assert isinstance(payload["profiles"], list)
    assert isinstance(payload["demo_mode"], bool)
    assert payload["build"]["sidecar_protocol_version"] == "3"
    assert payload["session"]["state"] in {"idle", "detected", "attached", "active", "ended", "restored"}
    assert payload["capture_status"]["source"] in {"counters-fallback", "presentmon"}


def test_benchmark_capture_and_run_create_local_proof(tmp_path) -> None:
    client = load_client(str(tmp_path / "runtime"))
    client.put(
        "/api/settings/system",
        json={
            "privacy_mode": "local-only",
            "telemetry_retention_days": 14,
            "sampling_interval_seconds": 5,
            "active_profile": "balanced",
            "allow_outbound_sync": False,
            "telemetry_mode": "demo",
            "automation_mode": "manual",
            "automation_allowlist": [],
            "registry_presets_enabled": False,
            "show_advanced_registry_details": False,
        },
    )

    baseline = client.post("/api/benchmark/capture-baseline")
    report = client.post("/api/benchmark/run")
    latest = client.get("/api/benchmark/latest")

    assert baseline.status_code == 200
    assert report.status_code == 200
    assert latest.status_code == 200
    assert baseline.json()["sample_count"] > 0
    assert baseline.json()["csv_id"]
    csv_response = client.get(f"/api/benchmark/csv/{baseline.json()['csv_id']}")
    assert csv_response.status_code == 200
    assert "fps_avg" in csv_response.text
    assert report.json()["verdict"] in {"better", "mixed", "worse", "inconclusive"}
    assert report.json()["csv_id"]
    assert report.json()["recommended_next_step"]
    assert latest.json()["id"] == report.json()["id"]


def test_live_mode_ignores_degraded_benchmark_cache(tmp_path) -> None:
    client = load_client(str(tmp_path / "runtime"))
    demo_settings = {
        "privacy_mode": "local-only",
        "telemetry_retention_days": 14,
        "sampling_interval_seconds": 5,
        "active_profile": "balanced",
        "allow_outbound_sync": False,
        "telemetry_mode": "demo",
        "automation_mode": "manual",
        "automation_allowlist": [],
        "registry_presets_enabled": False,
        "show_advanced_registry_details": False,
    }
    client.put("/api/settings/system", json=demo_settings)
    baseline = client.post("/api/benchmark/capture-baseline", params={"scenario_id": "Test route"})
    report = client.post("/api/benchmark/run")

    assert baseline.status_code == 200
    assert report.status_code == 200
    assert baseline.json()["capture_source"] != "presentmon"

    client.put("/api/settings/system", json={**demo_settings, "telemetry_mode": "live"})

    assert client.get("/api/benchmark/baseline").json() is None
    assert client.get("/api/benchmark/latest").json() is None


def test_legacy_benchmark_report_is_migrated(tmp_path) -> None:
    runtime_root = tmp_path / "runtime"
    client = load_client(str(runtime_root))
    client.put(
        "/api/settings/system",
        json={
            "privacy_mode": "local-only",
            "telemetry_retention_days": 14,
            "sampling_interval_seconds": 5,
            "active_profile": "balanced",
            "allow_outbound_sync": False,
            "telemetry_mode": "demo",
            "automation_mode": "manual",
            "automation_allowlist": [],
            "registry_presets_enabled": False,
            "show_advanced_registry_details": False,
        },
    )
    baseline = client.post("/api/benchmark/capture-baseline")
    assert baseline.status_code == 200

    from backend.core.paths import BENCHMARK_REPORTS_PATH

    BENCHMARK_REPORTS_PATH.write_text(
        json.dumps(
            [
                {
                    "id": "legacy-report",
                    "created_at": baseline.json()["captured_at"],
                    "game_name": baseline.json()["game_name"],
                    "evidence_quality": "demo",
                    "baseline": baseline.json(),
                    "current": baseline.json(),
                    "delta": {
                        "fps_avg": 0,
                        "fps_p1_low": 0,
                        "fps_p01_low": 0,
                        "frametime_avg_ms": 0,
                        "frametime_p95_ms": 0,
                        "frametime_p99_ms": 0,
                        "frame_drop_ratio": 0,
                        "cpu_process_pct": 0,
                        "cpu_total_pct": 0,
                        "gpu_usage_pct": 0,
                        "ram_working_set_mb": 0,
                        "background_cpu_pct": 0,
                        "ping": 0,
                        "jitter": 0,
                        "packet_loss": 0,
                        "anomaly_score": 0,
                    },
                    "verdict": "regressed",
                    "summary": "Legacy report",
                }
            ]
        ),
        encoding="utf-8",
    )

    latest = client.get("/api/benchmark/latest")

    assert latest.status_code == 200
    assert latest.json()["verdict"] == "worse"
    assert latest.json()["recommended_next_step"]


def test_benchmark_links_to_latest_runtime_action(tmp_path) -> None:
    runtime_root = tmp_path / "runtime"
    client = load_client(str(runtime_root))
    client.put(
        "/api/settings/system",
        json={
            "privacy_mode": "local-only",
            "telemetry_retention_days": 14,
            "sampling_interval_seconds": 5,
            "active_profile": "balanced",
            "allow_outbound_sync": False,
            "telemetry_mode": "demo",
            "automation_mode": "manual",
            "automation_allowlist": [],
            "registry_presets_enabled": False,
            "show_advanced_registry_details": False,
        },
    )
    baseline = client.post("/api/benchmark/capture-baseline", params={"scenario_id": "Test route"})
    assert baseline.status_code == 200

    activity_path = runtime_root / "data" / "logs" / "tweak_activity.json"
    activity_path.write_text(
        json.dumps(
            [
                {
                    "id": "activity-tweak-1",
                    "timestamp": "2099-03-19T12:00:00+00:00",
                    "category": "tweak",
                    "action": "Priority applied",
                    "detail": "Raised session priority.",
                    "risk": "medium",
                    "snapshot_id": "snapshot-1",
                    "session_id": None,
                    "action_id": "activity-tweak-1",
                    "action_key": "power_plan",
                    "can_undo": True,
                    "proof_link": None,
                    "blocked_by_policy": False,
                }
            ]
        ),
        encoding="utf-8",
    )

    report = client.post("/api/benchmark/run")

    assert report.status_code == 200
    payload = report.json()
    assert payload["action_id"] == "activity-tweak-1"
    assert payload["action_key"] == "power_plan"
    assert payload["snapshot_id"] == "snapshot-1"
    assert payload["tested_action_count"] == 1
    assert payload["evidence_status"] == "demo"
    assert payload["evidence_level"] == "S0-hypothesis"
    stored_activity = json.loads(activity_path.read_text(encoding="utf-8"))
    assert stored_activity[0]["proof_link"] == payload["id"]
    assert any(entry["category"] == "proof" and entry["proof_link"] == payload["id"] for entry in stored_activity)


def test_benchmark_rejects_stacked_actions(tmp_path) -> None:
    runtime_root = tmp_path / "runtime"
    client = load_client(str(runtime_root))
    client.put(
        "/api/settings/system",
        json={
            "privacy_mode": "local-only",
            "telemetry_retention_days": 14,
            "sampling_interval_seconds": 5,
            "active_profile": "balanced",
            "allow_outbound_sync": False,
            "telemetry_mode": "demo",
            "automation_mode": "manual",
            "automation_allowlist": [],
            "registry_presets_enabled": False,
            "show_advanced_registry_details": False,
        },
    )
    baseline = client.post("/api/benchmark/capture-baseline", params={"scenario_id": "Test route"})
    assert baseline.status_code == 200

    activity_path = runtime_root / "data" / "logs" / "tweak_activity.json"
    activity_path.write_text(
        json.dumps(
            [
                {
                    "id": f"activity-tweak-{index}",
                    "timestamp": f"2099-03-19T12:00:0{index}+00:00",
                    "category": "tweak",
                    "action": f"Test action {index}",
                    "detail": "Applied during the evidence window.",
                    "risk": "medium",
                    "snapshot_id": f"snapshot-{index}",
                    "session_id": None,
                    "action_id": f"activity-tweak-{index}",
                    "can_undo": True,
                    "proof_link": None,
                    "blocked_by_policy": False,
                }
                for index in (1, 2)
            ]
        ),
        encoding="utf-8",
    )

    report = client.post("/api/benchmark/run")

    assert report.status_code == 200
    payload = report.json()
    assert payload["verdict"] == "inconclusive"
    assert payload["tested_action_count"] == 2
    assert payload["action_id"] is None
    assert "cannot be separated" in payload["summary"]


def test_benchmark_verdict_uses_practical_effect_threshold(tmp_path) -> None:
    load_client(str(tmp_path / "runtime"))
    from backend.schemas.api import BenchmarkDelta, BenchmarkWindow
    from backend.services.benchmark_service import _verdict

    baseline = BenchmarkWindow(
        captured_at="2026-06-15T00:00:00+00:00",
        sample_count=60,
        mode="live",
        capture_source="presentmon",
        game_name="cs2.exe",
        fps_avg=200,
        fps_p1_low=100,
        fps_p01_low=80,
        frametime_avg_ms=5,
        frametime_p95_ms=10,
        frametime_p99_ms=12,
        frame_drop_ratio=0.01,
        cpu_total_pct=50,
        background_cpu_pct=5,
        anomaly_score=0.2,
        session_health="low",
    )
    small_delta = BenchmarkDelta(
        fps_avg=0.5,
        fps_p1_low=0.5,
        fps_p01_low=0.4,
        frametime_avg_ms=-0.02,
        frametime_p95_ms=-0.05,
        frametime_p99_ms=-0.06,
        frame_drop_ratio=0,
        cpu_total_pct=0,
        background_cpu_pct=0,
        anomaly_score=0,
    )
    meaningful_delta = small_delta.model_copy(
        update={
            "fps_p1_low": 2.0,
            "frametime_p95_ms": -0.2,
            "frametime_p99_ms": -0.24,
        }
    )

    small_verdict, _, _, small_effects = _verdict(baseline, small_delta)
    meaningful_verdict, _, _, meaningful_effects = _verdict(baseline, meaningful_delta)

    assert small_verdict == "mixed"
    assert all(abs(value) < 1.0 for value in small_effects.values())
    assert meaningful_verdict == "better"
    assert all(value >= 2.0 for value in meaningful_effects.values())


def _evidence_report(index: int, effects: dict[str, float], *, quality: str = "live", action_key: str | None = "power_plan"):
    from backend.schemas.api import BenchmarkDelta, BenchmarkReport, BenchmarkWindow

    session_id = f"session-{index}"
    baseline = BenchmarkWindow(
        captured_at=f"2026-06-15T00:00:0{index}+00:00",
        recorded_at=f"2026-06-15T00:00:0{index}+00:00",
        sample_count=60,
        mode="live",
        capture_source="presentmon",
        game_name="cs2.exe",
        process_id=42,
        session_id=session_id,
        scenario_id="Dust2 benchmark route",
        environment_fingerprint="environment-a",
        requested_window_seconds=60,
        fps_avg=200,
        fps_p1_low=100,
        fps_p01_low=80,
        frametime_avg_ms=5,
        frametime_p95_ms=10,
        frametime_p99_ms=12,
        frame_drop_ratio=0.01,
        cpu_total_pct=50,
        background_cpu_pct=5,
        anomaly_score=0.2,
        session_health="low",
    )
    current = baseline.model_copy(
        update={
            "captured_at": f"2026-06-15T00:01:0{index}+00:00",
            "recorded_at": f"2026-06-15T00:01:0{index}+00:00",
        }
    )
    delta = BenchmarkDelta(
        fps_avg=0,
        fps_p1_low=0,
        fps_p01_low=0,
        frametime_avg_ms=0,
        frametime_p95_ms=0,
        frametime_p99_ms=0,
        frame_drop_ratio=0,
        cpu_total_pct=0,
        background_cpu_pct=0,
        anomaly_score=0,
    )
    return BenchmarkReport(
        id=f"report-{index}",
        created_at=current.captured_at,
        profile_id="cs2",
        game_name="cs2.exe",
        session_id=session_id,
        scenario_id="Dust2 benchmark route",
        environment_fingerprint="environment-a",
        protocol_version="paired-ab-v1",
        window_seconds=60,
        action_id=f"activity-{index}",
        action_key=action_key,
        action_title="Power plan applied",
        evidence_quality=quality,
        evidence_status="single-pass" if quality == "live" else "demo",
        evidence_level="S2-local-single-pass" if quality == "live" else "S0-hypothesis",
        tested_action_count=1,
        primary_effect_pct=effects,
        baseline=baseline,
        current=current,
        delta=delta,
        verdict="better",
        summary="Directional test result.",
        recommended_next_step="Repeat.",
    )


def test_repeated_evidence_uses_student_t_interval(tmp_path) -> None:
    load_client(str(tmp_path / "runtime"))
    from backend.services.benchmark_service import _build_evidence_summary

    reports = [
        _evidence_report(1, {"fps_1pct": 2.0, "frametime_p95": 2.5, "frametime_p99": 1.5}),
        _evidence_report(2, {"fps_1pct": 2.2, "frametime_p95": 2.3, "frametime_p99": 1.6}),
        _evidence_report(3, {"fps_1pct": 1.8, "frametime_p95": 2.7, "frametime_p99": 1.4}),
    ]

    summary = _build_evidence_summary(reports)

    assert summary.trial_count == 3
    assert summary.confidence_method == "student-t-95"
    assert summary.evidence_level == "S3-local-repeated"
    assert summary.status == "consistent-improvement"
    assert all(metric.ci95_low_pct is not None and metric.ci95_low_pct >= 1.0 for metric in summary.metrics)


def test_evidence_endpoint_excludes_demo_and_unkeyed_reports(tmp_path) -> None:
    runtime_root = tmp_path / "runtime"
    client = load_client(str(runtime_root))
    from backend.core.paths import BENCHMARK_REPORTS_PATH

    valid_reports = [
        _evidence_report(1, {"fps_1pct": 2.0, "frametime_p95": 2.5, "frametime_p99": 1.5}),
        _evidence_report(2, {"fps_1pct": 2.2, "frametime_p95": 2.3, "frametime_p99": 1.6}),
        _evidence_report(3, {"fps_1pct": 1.8, "frametime_p95": 2.7, "frametime_p99": 1.4}),
    ]
    excluded = [
        _evidence_report(4, {"fps_1pct": 20, "frametime_p95": 20, "frametime_p99": 20}, quality="demo"),
        _evidence_report(5, {"fps_1pct": 20, "frametime_p95": 20, "frametime_p99": 20}, action_key=None),
    ]
    other_scenario = _evidence_report(6, {"fps_1pct": -2, "frametime_p95": -2, "frametime_p99": -2})
    other_scenario.scenario_id = "Ancient benchmark route"
    other_scenario.baseline.scenario_id = other_scenario.scenario_id
    other_scenario.current.scenario_id = other_scenario.scenario_id
    other_environment = _evidence_report(7, {"fps_1pct": -3, "frametime_p95": -3, "frametime_p99": -3})
    other_environment.environment_fingerprint = "environment-b"
    other_environment.baseline.environment_fingerprint = other_environment.environment_fingerprint
    other_environment.current.environment_fingerprint = other_environment.environment_fingerprint
    other_window = _evidence_report(8, {"fps_1pct": 4, "frametime_p95": 4, "frametime_p99": 4})
    other_window.window_seconds = 30
    other_window.baseline.requested_window_seconds = 30
    other_window.current.requested_window_seconds = 30
    BENCHMARK_REPORTS_PATH.write_text(
        json.dumps(
            [
                report.model_dump()
                for report in [*valid_reports, *excluded, other_scenario, other_environment, other_window]
            ],
            default=str,
        ),
        encoding="utf-8",
    )

    response = client.get("/api/benchmark/evidence")

    assert response.status_code == 200
    payload = response.json()
    assert len(payload) == 4
    dust2 = next(
        item
        for item in payload
        if item["scenario_id"] == "Dust2 benchmark route"
        and item["environment_fingerprint"] == "environment-a"
        and item["window_seconds"] == 60
    )
    ancient = next(item for item in payload if item["scenario_id"] == "Ancient benchmark route")
    changed_environment = next(item for item in payload if item["environment_fingerprint"] == "environment-b")
    changed_window = next(
        item
        for item in payload
        if item["scenario_id"] == "Dust2 benchmark route"
        and item["environment_fingerprint"] == "environment-a"
        and item["window_seconds"] == 30
    )
    assert dust2["action_key"] == "power_plan"
    assert dust2["trial_count"] == 3
    assert dust2["status"] == "consistent-improvement"
    assert ancient["trial_count"] == 1
    assert ancient["status"] == "insufficient"
    assert changed_environment["trial_count"] == 1
    assert changed_environment["status"] == "insufficient"
    assert changed_window["trial_count"] == 1


def test_live_baseline_capture_preserves_report_history(tmp_path, monkeypatch) -> None:
    runtime_root = tmp_path / "runtime"
    load_client(str(runtime_root))
    from backend.core.paths import BENCHMARK_REPORTS_PATH
    from backend.services import benchmark_service

    stored_report = _evidence_report(1, {"fps_1pct": 2.0, "frametime_p95": 2.5, "frametime_p99": 1.5})
    BENCHMARK_REPORTS_PATH.write_text(json.dumps([stored_report.model_dump()], default=str), encoding="utf-8")
    rows = [
        {
            "timestamp": f"2026-06-15T00:02:0{index}+00:00",
            "mode": "live",
            "capture_source": "presentmon",
            "metrics_origin": "presentmon",
            "game_name": "cs2.exe",
            "process_id": 42,
            "fps_avg": 200 + index,
            "fps_p1_low": 100 + index,
            "fps_p01_low": 80 + index,
            "frametime_avg_ms": 5,
            "frametime_p95_ms": 10,
            "frametime_p99_ms": 12,
            "frame_drop_ratio": 0.01,
            "cpu_process_pct": 20,
            "cpu_total_pct": 50,
            "gpu_usage_pct": 70,
            "ram_working_set_mb": 2000,
            "background_cpu_pct": 5,
            "anomaly_score": 0.2,
            "threat_level": "low",
            "presentmon_frame_count": 1000,
        }
        for index in range(3)
    ]
    monkeypatch.setattr(benchmark_service, "current_mode", lambda: "live")
    monkeypatch.setattr(benchmark_service, "_recent_rows", lambda limit: rows[-limit:])

    benchmark_service.capture_baseline(sample_limit=3)

    stored = json.loads(BENCHMARK_REPORTS_PATH.read_text(encoding="utf-8"))
    assert stored[0]["id"] == stored_report.id


def test_feature_flags_start_disabled_and_create_snapshot_on_update(tmp_path) -> None:
    client = load_client(str(tmp_path / "runtime"))

    initial_flags = client.get("/api/settings/feature-flags")
    initial_snapshots = client.get("/api/snapshots")

    assert initial_flags.status_code == 200
    assert initial_snapshots.status_code == 200
    flags = initial_flags.json()
    assert flags["telemetry_collect"] is True
    assert all(value is False for key, value in flags.items() if key != "telemetry_collect")

    payload = {**initial_flags.json(), "anomaly_detection": True}
    update = client.put("/api/settings/feature-flags", json=payload)
    next_snapshots = client.get("/api/snapshots")

    assert update.status_code == 200
    assert update.json()["anomaly_detection"] is True
    assert len(next_snapshots.json()) == len(initial_snapshots.json()) + 1
    assert next_snapshots.json()[0]["surface"] == "config"


def test_security_summary_exposes_scan_checks(tmp_path) -> None:
    client = load_client(str(tmp_path / "runtime"))

    response = client.get("/api/security")

    assert response.status_code == 200
    payload = response.json()
    assert payload["status"] in {"low", "medium", "high"}
    assert payload["source"] in {"windows-security-scan", "windows-scan-error", "telemetry-fallback"}
    assert isinstance(payload["checks"], list)
    assert payload["checks"]
    assert {"id", "title", "status", "label", "detail"} <= set(payload["checks"][0])


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
