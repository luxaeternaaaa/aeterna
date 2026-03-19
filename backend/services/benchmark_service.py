from __future__ import annotations

from statistics import mean
from uuid import uuid4

from backend.core.paths import BENCHMARK_BASELINE_PATH, BENCHMARK_REPORTS_PATH
from backend.schemas.api import BenchmarkDelta, BenchmarkReport, BenchmarkWindow
from backend.services.json_store import read_json, write_json
from backend.services.profile_service import get_profile, match_profile
from backend.services.telemetry_service import list_recent


def _window_from_rows(rows: list[dict[str, object]]) -> BenchmarkWindow:
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
        fps_avg=round(mean(float(row["fps_avg"]) for row in rows), 2),
        frametime_avg_ms=round(mean(float(row["frametime_avg_ms"]) for row in rows), 2),
        frametime_p95_ms=round(mean(float(row["frametime_p95_ms"]) for row in rows), 2),
        frame_drop_ratio=round(mean(float(row["frame_drop_ratio"]) for row in rows), 4),
        cpu_total_pct=round(mean(float(row["cpu_total_pct"]) for row in rows), 2),
        background_cpu_pct=round(mean(float(row["background_cpu_pct"]) for row in rows), 2),
        anomaly_score=round(mean(float(row["anomaly_score"]) for row in rows), 4),
        session_health=str(latest["threat_level"]),
    )


def _recent_rows(limit: int = 36) -> list[dict[str, object]]:
    rows = [row.model_dump() for row in list_recent(limit=limit)]
    return [row for row in rows if row["mode"] != "disabled"]


def latest_baseline() -> BenchmarkWindow | None:
    payload = read_json(BENCHMARK_BASELINE_PATH, None)
    return BenchmarkWindow(**payload) if isinstance(payload, dict) else None


def latest_report() -> BenchmarkReport | None:
    payload = read_json(BENCHMARK_REPORTS_PATH, [])
    if not isinstance(payload, list) or not payload:
        return None
    return BenchmarkReport(**payload[0])


def capture_baseline(sample_limit: int = 36) -> BenchmarkWindow:
    rows = _recent_rows(limit=sample_limit)
    baseline = _window_from_rows(rows)
    write_json(BENCHMARK_BASELINE_PATH, baseline.model_dump())
    return baseline


def _verdict(delta: BenchmarkDelta) -> tuple[str, str]:
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
            "improved",
            "The current session is measurably cleaner than the captured baseline. Trust the preset more than before, but keep the rollback path visible.",
        )
    if score <= 2:
        return (
            "regressed",
            "The current session is worse than the baseline in too many important signals. Treat this preset as unproven and restore before stacking more changes.",
        )
    return (
        "mixed",
        "Some metrics improved, but the evidence is still split. Keep testing one change at a time instead of declaring the preset good.",
    )


def run_benchmark(sample_limit: int = 36, profile_id: str | None = None) -> BenchmarkReport:
    baseline = latest_baseline()
    if not baseline:
        raise ValueError("Capture a baseline before running a comparison benchmark.")
    current = _window_from_rows(_recent_rows(limit=sample_limit))
    profile = get_profile(profile_id) or match_profile(current.game_name) or match_profile(baseline.game_name)
    delta = BenchmarkDelta(
        fps_avg=round(current.fps_avg - baseline.fps_avg, 2),
        frametime_avg_ms=round(current.frametime_avg_ms - baseline.frametime_avg_ms, 2),
        frametime_p95_ms=round(current.frametime_p95_ms - baseline.frametime_p95_ms, 2),
        frame_drop_ratio=round(current.frame_drop_ratio - baseline.frame_drop_ratio, 4),
        cpu_total_pct=round(current.cpu_total_pct - baseline.cpu_total_pct, 2),
        background_cpu_pct=round(current.background_cpu_pct - baseline.background_cpu_pct, 2),
        anomaly_score=round(current.anomaly_score - baseline.anomaly_score, 4),
    )
    verdict, summary = _verdict(delta)
    report = BenchmarkReport(
        id=f"benchmark-{uuid4().hex[:10]}",
        created_at=current.captured_at,
        profile_id=profile.id if profile else profile_id,
        game_name=current.game_name,
        baseline=baseline,
        current=current,
        delta=delta,
        verdict=verdict,
        summary=summary,
    )
    payload = read_json(BENCHMARK_REPORTS_PATH, [])
    rows = payload if isinstance(payload, list) else []
    rows.insert(0, report.model_dump())
    write_json(BENCHMARK_REPORTS_PATH, rows[:12])
    return report
