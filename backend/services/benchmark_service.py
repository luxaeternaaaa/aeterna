from __future__ import annotations

from statistics import mean
from uuid import uuid4

from backend.core.paths import BENCHMARK_BASELINE_PATH, BENCHMARK_REPORTS_PATH
from backend.schemas.api import BenchmarkDelta, BenchmarkReport, BenchmarkWindow
from backend.services.activity_service import append_proof_event, latest_action, link_proof
from backend.services.json_store import read_json, write_json
from backend.services.profile_service import get_profile, match_profile
from backend.services.runtime_state_service import get_session_state
from backend.services.telemetry_service import list_recent


def _window_from_rows(rows: list[dict[str, object]], session_id: str | None) -> BenchmarkWindow:
    if not rows:
        raise ValueError("No telemetry rows available for benchmark capture.")
    latest = rows[-1]
    sample_count = len(rows)
    return BenchmarkWindow(
        captured_at=str(latest["timestamp"]),
        sample_count=sample_count,
        mode=str(latest["mode"]),
        capture_source=str(latest["capture_source"]),
        game_name=str(latest["game_name"]),
        process_id=latest.get("process_id"),
        session_id=session_id,
        fps_avg=round(mean(float(row["fps_avg"]) for row in rows), 2),
        frametime_avg_ms=round(mean(float(row["frametime_avg_ms"]) for row in rows), 2),
        frametime_p95_ms=round(mean(float(row["frametime_p95_ms"]) for row in rows), 2),
        frame_drop_ratio=round(mean(float(row["frame_drop_ratio"]) for row in rows), 4),
        cpu_process_pct=round(mean(float(row["cpu_process_pct"]) for row in rows), 2),
        cpu_total_pct=round(mean(float(row["cpu_total_pct"]) for row in rows), 2),
        gpu_usage_pct=round(mean(float(row.get("gpu_usage_pct") or 0.0) for row in rows), 2),
        ram_working_set_mb=round(mean(float(row["ram_working_set_mb"]) for row in rows), 2),
        ping=round(mean(float(row.get("ping", 0.0)) for row in rows), 2),
        jitter=round(mean(float(row.get("jitter", 0.0)) for row in rows), 2),
        packet_loss=round(mean(float(row.get("packet_loss", 0.0)) for row in rows), 2),
        background_cpu_pct=round(mean(float(row["background_cpu_pct"]) for row in rows), 2),
        anomaly_score=round(mean(float(row["anomaly_score"]) for row in rows), 4),
        session_health=str(latest["threat_level"]),
    )


def _recent_rows(limit: int = 60) -> list[dict[str, object]]:
    window = max(limit * 4, 120)
    rows = [row.model_dump() for row in list_recent(limit=window)]
    enabled_rows = [row for row in rows if row["mode"] != "disabled"]
    live_rows = [row for row in enabled_rows if row["mode"] == "live"]
    fallback_live_rows = [row for row in live_rows if row["capture_source"] == "counters-fallback"]

    if live_rows and not fallback_live_rows:
        raise ValueError("No fallback telemetry rows available for benchmark capture. Attach session and wait for fallback samples.")

    if fallback_live_rows:
        return fallback_live_rows[-limit:]

    # Local API tests and demo mode use demo rows when live mode is not active.
    return enabled_rows[-limit:]


def latest_baseline() -> BenchmarkWindow | None:
    payload = read_json(BENCHMARK_BASELINE_PATH, None)
    if isinstance(payload, dict):
        return BenchmarkWindow(**payload)
    return None


def latest_report() -> BenchmarkReport | None:
    payload = read_json(BENCHMARK_REPORTS_PATH, [])
    if not isinstance(payload, list) or not payload:
        return None
    return BenchmarkReport(**payload[0])


def capture_baseline(sample_limit: int = 60) -> BenchmarkWindow:
    if sample_limit < 1 or sample_limit > 300:
        raise ValueError("Benchmark duration must be between 1 and 300 seconds.")
    rows = _recent_rows(limit=sample_limit)
    baseline = _window_from_rows(rows, get_session_state().session_id)
    write_json(BENCHMARK_BASELINE_PATH, baseline.model_dump())
    return baseline


def _evidence_quality(window: BenchmarkWindow) -> str:
    if window.mode == "disabled":
        return "disabled"
    if window.mode == "demo":
        return "demo"
    if window.capture_source == "presentmon":
        return "live"
    return "degraded"


def _verdict(delta: BenchmarkDelta) -> tuple[str, str, str]:
    score = 0
    if delta.fps_avg > 0:
        score += 1
    if delta.frametime_p95_ms < 0:
        score += 1
    if delta.frame_drop_ratio < 0:
        score += 1
    if delta.cpu_total_pct < 0:
        score += 1
    if delta.background_cpu_pct < 0:
        score += 1
    if delta.anomaly_score < 0:
        score += 1

    if score >= 5:
        return (
            "better",
            "The current session is measurably cleaner than the captured baseline. This change looks worth keeping unless the next session disproves it.",
            "Keep the change or run one more compare before stacking another action.",
        )
    if score <= 2:
        return (
            "worse",
            "The current session is worse than the baseline in too many important signals. Treat this change as unproven and restore it before stacking anything else.",
            "Rollback the last change, then capture a fresh baseline before testing again.",
        )
    return (
        "mixed",
        "Some metrics improved, but the evidence is still split. The result is not clean enough to trust blindly.",
        "Either rollback now or run one more controlled compare before keeping the change.",
    )


def run_benchmark(sample_limit: int = 60, profile_id: str | None = None) -> BenchmarkReport:
    if sample_limit < 1 or sample_limit > 300:
        raise ValueError("Benchmark duration must be between 1 and 300 seconds.")
    baseline = latest_baseline()
    if not baseline:
        raise ValueError("Capture a baseline before running a comparison benchmark.")
    session = get_session_state()
    current = _window_from_rows(_recent_rows(limit=sample_limit), session.session_id)
    profile = get_profile(profile_id) or match_profile(current.game_name) or match_profile(baseline.game_name)
    linked_action = latest_action(session.session_id)
    delta = BenchmarkDelta(
        fps_avg=round(current.fps_avg - baseline.fps_avg, 2),
        frametime_avg_ms=round(current.frametime_avg_ms - baseline.frametime_avg_ms, 2),
        frametime_p95_ms=round(current.frametime_p95_ms - baseline.frametime_p95_ms, 2),
        frame_drop_ratio=round(current.frame_drop_ratio - baseline.frame_drop_ratio, 4),
        cpu_process_pct=round(current.cpu_process_pct - baseline.cpu_process_pct, 2),
        cpu_total_pct=round(current.cpu_total_pct - baseline.cpu_total_pct, 2),
        gpu_usage_pct=round((current.gpu_usage_pct or 0.0) - (baseline.gpu_usage_pct or 0.0), 2),
        ram_working_set_mb=round(current.ram_working_set_mb - baseline.ram_working_set_mb, 2),
        ping=round(current.ping - baseline.ping, 2),
        jitter=round(current.jitter - baseline.jitter, 2),
        packet_loss=round(current.packet_loss - baseline.packet_loss, 2),
        background_cpu_pct=round(current.background_cpu_pct - baseline.background_cpu_pct, 2),
        anomaly_score=round(current.anomaly_score - baseline.anomaly_score, 4),
    )
    evidence_quality = _evidence_quality(current)
    if linked_action is None:
        verdict = "inconclusive"
        summary = "No tested change is linked to this compare window yet. This result shows session drift, not proof of a specific action."
        next_step = "Apply one safe change, then run Compare again so the verdict can be tied to a specific action."
    elif baseline.session_id and current.session_id and baseline.session_id != current.session_id:
        verdict = "inconclusive"
        summary = "Baseline and compare belong to different attached sessions. This verdict is not trustworthy until you capture a fresh baseline."
        next_step = "Capture a new baseline for the current session before comparing again."
    else:
        verdict, summary, next_step = _verdict(delta)
    report = BenchmarkReport(
        id=f"benchmark-{uuid4().hex[:10]}",
        created_at=current.captured_at,
        profile_id=profile.id if profile else profile_id,
        game_name=current.game_name,
        session_id=current.session_id,
        action_id=linked_action.id if linked_action else None,
        snapshot_id=linked_action.snapshot_id if linked_action else None,
        evidence_quality=evidence_quality,
        baseline=baseline,
        current=current,
        delta=delta,
        verdict=verdict,
        summary=summary,
        recommended_next_step=next_step,
    )
    payload = read_json(BENCHMARK_REPORTS_PATH, [])
    rows = payload if isinstance(payload, list) else []
    rows.insert(0, report.model_dump())
    write_json(BENCHMARK_REPORTS_PATH, rows[:12])
    link_proof(report.action_id, report.id)
    append_proof_event(report)
    return report
