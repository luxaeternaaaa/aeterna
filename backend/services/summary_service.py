from backend.services.feature_service import get_feature_flags
from backend.services.telemetry_service import list_recent


def get_security_summary() -> dict[str, object]:
    latest = list_recent(limit=1)[-1].model_dump()
    label = "stable-session"
    if latest["anomaly_score"] > 0.7:
        label = "unstable-session"
    elif latest["background_cpu_pct"] > 28 or latest["background_process_count"] > 36:
        label = "background-heavy"
    return {
        "status": latest["threat_level"],
        "label": label,
        "confidence": round(min(0.94, 0.58 + float(latest["anomaly_score"]) * 0.3), 2),
        "auto_scan_enabled": get_feature_flags().auto_security_scan,
    }


def get_optimization_summary() -> dict[str, object]:
    latest = list_recent(limit=1)[-1].model_dump()
    probability = min(
        0.98,
        0.14
        + float(latest["cpu_process_pct"]) / 160
        + float(latest["frametime_p95_ms"]) / 42
        + float(latest["background_cpu_pct"]) / 180
        + int(latest["background_process_count"]) / 240,
    )
    return {
        "optimizer_enabled": get_feature_flags().network_optimizer,
        "risk_label": "high" if probability > 0.78 else "medium" if probability > 0.48 else "low",
        "spike_probability": round(probability, 2),
        "confidence": round(min(0.95, 0.55 + probability * 0.28), 2),
        "model_source": "local-summary",
    }
