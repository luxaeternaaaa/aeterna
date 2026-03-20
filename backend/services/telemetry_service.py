from statistics import mean

from backend.core.paths import DEMO_TELEMETRY_PATH, LIVE_TELEMETRY_PATH, SEED_DATA_PATH
from backend.schemas.api import DashboardPayload, StatCard, TelemetryPoint
from backend.services.feature_service import get_system_settings
from backend.services.json_store import read_json, read_jsonl, write_jsonl
from backend.services.recommendation_service import build_recommendations


def ensure_demo_dataset() -> list[dict[str, object]]:
    if not SEED_DATA_PATH.exists():
        from ml.synthetic import export_dataset

        export_dataset(SEED_DATA_PATH)
    rows = read_json(SEED_DATA_PATH, [])
    return rows if isinstance(rows, list) else []


def _materialize_demo_jsonl() -> list[dict[str, object]]:
    rows = read_jsonl(DEMO_TELEMETRY_PATH)
    if rows:
        return rows
    normalized = [_normalize_demo(row) for row in ensure_demo_dataset()]
    write_jsonl(DEMO_TELEMETRY_PATH, normalized)
    return normalized


def current_mode() -> str:
    return get_system_settings().telemetry_mode


def is_demo_mode() -> bool:
    return current_mode() == "demo"


def _normalize_demo(row: dict[str, object]) -> dict[str, object]:
    ping = float(row.get("ping", 0))
    jitter = float(row.get("jitter", 0))
    packet_loss = float(row.get("packet_loss", 0))
    cpu_process = float(row.get("cpu_usage", 0))
    gpu_usage = float(row.get("gpu_usage", 0))
    ram_usage = float(row.get("ram_usage", 0))
    fps_avg = float(row.get("fps_estimate", max(48.0, 220.0 - cpu_process * 1.1 - gpu_usage * 0.75)))
    frametime_avg_ms = float(row.get("frametime_ms", 1000.0 / fps_avg))
    frametime_p95_ms = float(row.get("frametime_p95_ms", frametime_avg_ms * 1.3))
    return {
        "timestamp": str(row.get("timestamp") or ""),
        "capture_source": "demo",
        "source": "demo",
        "mode": "demo",
        "game_name": row.get("game", "Demo session"),
        "process_id": None,
        "session_state": row.get("session_state", "active"),
        "fps_avg": fps_avg,
        "frametime_avg_ms": frametime_avg_ms,
        "frametime_p95_ms": frametime_p95_ms,
        "frame_drop_ratio": float(row.get("frame_drop_ratio", 0.06)),
        "cpu_process_pct": cpu_process,
        "cpu_total_pct": min(100.0, cpu_process + 8.0),
        "gpu_usage_pct": gpu_usage,
        "gpu_temp_c": row.get("temperature_c"),
        "ram_working_set_mb": ram_usage,
        "memory_pressure_pct": float(row.get("memory_pressure_pct", min(100.0, ram_usage / 120))),
        "background_process_count": int(row.get("background_process_count", (cpu_process + gpu_usage) // 8)),
        "background_cpu_pct": float(row.get("background_cpu_pct", max(0.0, cpu_process * 0.28))),
        "disk_pressure_pct": float(row.get("disk_pressure_pct", 18.0)),
        "ping": ping,
        "jitter": jitter,
        "packet_loss": packet_loss,
        "anomaly_score": float(row.get("anomaly_score", 0)),
        "threat_level": row.get("threat_level", "low"),
    }


def _disabled_row() -> dict[str, object]:
    return {
        "timestamp": "",
        "capture_source": "counters-fallback",
        "source": "live",
        "mode": "disabled",
        "game_name": "Telemetry disabled",
        "process_id": None,
        "session_state": "idle",
        "fps_avg": 0,
        "frametime_avg_ms": 0,
        "frametime_p95_ms": 0,
        "frame_drop_ratio": 0,
        "cpu_process_pct": 0,
        "cpu_total_pct": 0,
        "gpu_usage_pct": None,
        "gpu_temp_c": None,
        "ram_working_set_mb": 0,
        "memory_pressure_pct": 0,
        "background_process_count": 0,
        "background_cpu_pct": 0,
        "disk_pressure_pct": 0,
        "ping": 0,
        "jitter": 0,
        "packet_loss": 0,
        "anomaly_score": 0,
        "threat_level": "low",
    }


def _live_placeholder() -> dict[str, object]:
    return {
        **_disabled_row(),
        "mode": "live",
        "source": "live",
        "game_name": "Waiting for live telemetry",
        "session_state": "detected",
        "capture_source": "counters-fallback",
    }


def list_recent(limit: int = 24) -> list[TelemetryPoint]:
    mode = current_mode()
    if mode == "live":
        rows = read_jsonl(LIVE_TELEMETRY_PATH)
        values = rows if rows else [_live_placeholder()]
    elif mode == "demo":
        values = _materialize_demo_jsonl()
    else:
        values = [_disabled_row()]
    return [TelemetryPoint(**row) for row in values[-limit:]]


def get_dashboard() -> DashboardPayload:
    history = [row.model_dump() for row in list_recent(limit=180)]
    latest = history[-1]
    stats = [
        StatCard(label="FPS", value=f"{latest['fps_avg']:.0f}", detail="Real session average"),
        StatCard(label="Frame time p95", value=f"{latest['frametime_p95_ms']:.1f} ms", detail="Lower is more stable"),
        StatCard(label="CPU contention", value=f"{latest['cpu_total_pct']:.0f}%", detail="Whole-system scheduler pressure"),
        StatCard(label="Background pressure", value=f"{latest['background_cpu_pct']:.0f}%", detail="Competing desktop load"),
        StatCard(label="Session health", value=latest["threat_level"].title(), detail=latest["capture_source"].replace("-", " ").title()),
    ]
    if latest["mode"] == "disabled":
        stats = [
            StatCard(label="Telemetry", value="Disabled", detail="Enable Demo or Live mode in Settings"),
            StatCard(label="Optimizer", value="Safe by default", detail="No automatic collection is active"),
            StatCard(label="ML", value="Idle", detail="Inference remains local and on-demand"),
            StatCard(label="Snapshots", value="Ready", detail="Rollback remains available"),
            StatCard(label="Privacy", value="Local-only", detail="No outbound sync"),
        ]
    return DashboardPayload(
        stats=stats,
        history=[TelemetryPoint(**row) for row in history],
        recommendations=build_recommendations(latest),
        session_health="Stable" if latest["threat_level"] == "low" else "Watch" if latest["threat_level"] == "medium" else "At Risk",
        mode=latest["mode"],
        badge="Demo mode" if latest["mode"] == "demo" else "Live telemetry" if latest["mode"] == "live" else "Telemetry disabled",
    )


def mean_fps(history: list[dict[str, object]]) -> float:
    return mean(float(row["fps_avg"]) for row in history)
