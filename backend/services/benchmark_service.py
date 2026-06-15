from __future__ import annotations

import csv
import hashlib
import platform
import re
from collections import defaultdict
from datetime import datetime, timedelta, timezone
from math import sqrt
from pathlib import Path
from statistics import mean, stdev
from uuid import uuid4

from backend.core.paths import BENCHMARK_BASELINE_PATH, BENCHMARK_CSV_DIR, BENCHMARK_REPORTS_PATH
from backend.schemas.api import (
    BenchmarkDelta,
    BenchmarkEvidenceSummary,
    BenchmarkMetricEvidence,
    BenchmarkReport,
    BenchmarkWindow,
)
from backend.services.activity_service import append_proof_event, evidence_actions, link_proof
from backend.services.json_store import read_json, write_json
from backend.services.profile_service import get_profile, match_profile
from backend.services.runtime_state_service import get_session_state
from backend.services.telemetry_service import current_mode, list_recent


CSV_FIELDS = [
    "timestamp",
    "mode",
    "capture_source",
    "metrics_origin",
    "game_name",
    "process_id",
    "session_state",
    "fps_avg",
    "fps_p1_low",
    "fps_p01_low",
    "frametime_avg_ms",
    "frametime_p95_ms",
    "frametime_p99_ms",
    "frame_drop_ratio",
    "cpu_process_pct",
    "cpu_total_pct",
    "gpu_usage_pct",
    "gpu_temp_c",
    "ram_working_set_mb",
    "memory_pressure_pct",
    "background_process_count",
    "background_cpu_pct",
    "disk_pressure_pct",
    "ping",
    "jitter",
    "packet_loss",
    "anomaly_score",
    "threat_level",
    "presentmon_frame_count",
]
MINIMUM_PRACTICAL_EFFECT_PCT = 1.0
MINIMUM_REPEATED_TRIALS = 3
REPORT_HISTORY_LIMIT = 120
BENCHMARK_PROTOCOL_VERSION = "paired-ab-v1"
PRIMARY_METRICS = ("fps_1pct", "frametime_p95", "frametime_p99")
T_CRITICAL_95 = {
    1: 12.706,
    2: 4.303,
    3: 3.182,
    4: 2.776,
    5: 2.571,
    6: 2.447,
    7: 2.365,
    8: 2.306,
    9: 2.262,
    10: 2.228,
    11: 2.201,
    12: 2.179,
    13: 2.160,
    14: 2.145,
    15: 2.131,
    16: 2.120,
    17: 2.110,
    18: 2.101,
    19: 2.093,
    20: 2.086,
    21: 2.080,
    22: 2.074,
    23: 2.069,
    24: 2.064,
    25: 2.060,
    26: 2.056,
    27: 2.052,
    28: 2.048,
    29: 2.045,
    30: 2.042,
}


def _safe_file_part(value: str) -> str:
    cleaned = re.sub(r"[^A-Za-z0-9_.-]+", "-", value.strip()).strip("-")
    return cleaned[:42] or "game"


def _write_metric_csv(rows: list[dict[str, object]], prefix: str) -> tuple[str, Path]:
    if not rows:
        raise ValueError("No telemetry rows available for CSV export.")
    latest = rows[-1]
    game_name = _safe_file_part(str(latest.get("game_name") or "game"))
    timestamp = datetime.now(timezone.utc).strftime("%Y%m%d-%H%M%S")
    csv_id = f"{prefix}-{game_name}-{timestamp}-{uuid4().hex[:8]}"
    path = BENCHMARK_CSV_DIR / f"{csv_id}.csv"
    with path.open("w", newline="", encoding="utf-8") as handle:
        writer = csv.DictWriter(handle, fieldnames=CSV_FIELDS)
        writer.writeheader()
        for row in rows:
            writer.writerow({field: row.get(field, "") for field in CSV_FIELDS})
    return csv_id, path


def benchmark_csv_file(csv_id: str) -> Path:
    if not re.fullmatch(r"[A-Za-z0-9_.-]+", csv_id):
        raise ValueError("Invalid benchmark CSV id.")
    path = (BENCHMARK_CSV_DIR / f"{csv_id}.csv").resolve()
    root = BENCHMARK_CSV_DIR.resolve()
    if path.parent != root:
        raise ValueError("Invalid benchmark CSV path.")
    return path


def _parse_timestamp(value: object) -> datetime | None:
    if not isinstance(value, str) or not value:
        return None
    normalized = value.replace("Z", "+00:00")
    try:
        parsed = datetime.fromisoformat(normalized)
    except ValueError:
        return None
    return parsed if parsed.tzinfo else parsed.replace(tzinfo=timezone.utc)


def _mean_field(rows: list[dict[str, object]], key: str, fallback_key: str | None = None) -> float:
    values = [float(row[key]) for row in rows if row.get(key) is not None]
    if values:
        return round(mean(values), 2)
    if fallback_key:
        return round(mean(float(row[fallback_key]) for row in rows), 2)
    return 0.0


def _window_from_rows(
    rows: list[dict[str, object]],
    session_id: str | None,
    csv_id: str | None = None,
    csv_path: str | None = None,
    scenario_id: str | None = None,
    environment_fingerprint: str | None = None,
    requested_window_seconds: int | None = None,
) -> BenchmarkWindow:
    if not rows:
        raise ValueError("No telemetry rows available for benchmark capture.")
    latest = rows[-1]
    sample_count = len(rows)
    return BenchmarkWindow(
        captured_at=str(latest["timestamp"]),
        recorded_at=datetime.now(timezone.utc).isoformat(),
        sample_count=sample_count,
        mode=str(latest["mode"]),
        capture_source=str(latest["capture_source"]),
        game_name=str(latest["game_name"]),
        process_id=latest.get("process_id"),
        session_id=session_id,
        scenario_id=scenario_id,
        environment_fingerprint=environment_fingerprint,
        requested_window_seconds=requested_window_seconds,
        csv_id=csv_id,
        csv_path=csv_path,
        fps_avg=round(mean(float(row["fps_avg"]) for row in rows), 2),
        fps_p1_low=_mean_field(rows, "fps_p1_low", "fps_avg"),
        fps_p01_low=_mean_field(rows, "fps_p01_low", "fps_avg"),
        frametime_avg_ms=round(mean(float(row["frametime_avg_ms"]) for row in rows), 2),
        frametime_p95_ms=round(mean(float(row["frametime_p95_ms"]) for row in rows), 2),
        frametime_p99_ms=_mean_field(rows, "frametime_p99_ms", "frametime_p95_ms"),
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
        metrics_origin=str(latest.get("metrics_origin") or latest["capture_source"]),
        presentmon_frame_count=int(max(float(row.get("presentmon_frame_count") or 0) for row in rows)),
    )


def _recent_rows(limit: int = 60) -> list[dict[str, object]]:
    session = get_session_state()
    window = max(limit * 4, 120)
    rows = [row.model_dump() for row in list_recent(limit=window)]
    enabled_rows = [row for row in rows if row["mode"] != "disabled"]
    live_rows = [row for row in enabled_rows if row["mode"] == "live"]

    if session.process_id:
        live_rows = [row for row in live_rows if row.get("process_id") == session.process_id]
    attached_at = _parse_timestamp(session.attached_at)
    if attached_at:
        min_time = attached_at - timedelta(seconds=2)
        live_rows = [
            row
            for row in live_rows
            if (captured_at := _parse_timestamp(row.get("timestamp"))) is not None and captured_at >= min_time
        ]

    presentmon_rows = [row for row in live_rows if row["capture_source"] == "presentmon"]
    fallback_live_rows = [row for row in live_rows if row["capture_source"] == "counters-fallback"]

    minimum_presentmon_rows = max(3, min(limit, 5))
    if len(presentmon_rows) >= minimum_presentmon_rows:
        return presentmon_rows[-limit:]

    if current_mode() == "live" and session.process_id:
        if presentmon_rows:
            raise ValueError(
                "PresentMon did not produce enough real frame rows for this capture. Keep the game active and rerun the test."
            )
        raise ValueError(
            "No real PresentMon frame rows were captured for the selected game. Run Aeterna as administrator and keep the game in foreground."
        )

    if fallback_live_rows and not presentmon_rows:
        return fallback_live_rows[-limit:]

    if live_rows:
        return live_rows[-limit:]

    # Local API tests and demo mode use demo rows when live mode is not active.
    if current_mode() == "live":
        raise ValueError("No live telemetry rows for the selected game yet. Attach the game, keep it in foreground, and wait for the capture window.")
    return enabled_rows[-limit:]


def latest_baseline() -> BenchmarkWindow | None:
    payload = read_json(BENCHMARK_BASELINE_PATH, None)
    if isinstance(payload, dict):
        baseline = BenchmarkWindow(**payload)
        if current_mode() == "live" and baseline.capture_source != "presentmon":
            return None
        return baseline
    return None


def latest_report() -> BenchmarkReport | None:
    baseline = latest_baseline()
    if not baseline:
        return None
    for report in _read_reports():
        same_baseline = (
            report.baseline.csv_id == baseline.csv_id
            if report.baseline.csv_id and baseline.csv_id
            else report.baseline.captured_at == baseline.captured_at
        )
        if not same_baseline:
            continue
        if current_mode() == "live" and (
            report.baseline.capture_source != "presentmon" or report.current.capture_source != "presentmon"
        ):
            return None
        return report
    return None


def _normalize_scenario_id(value: str | None) -> str | None:
    if value is None:
        return None
    normalized = re.sub(r"\s+", " ", value.strip())
    if not normalized:
        return None
    if len(normalized) > 80:
        raise ValueError("Scenario label must be 80 characters or fewer.")
    return normalized


def _environment_fingerprint() -> str:
    components = "|".join(
        [
            platform.system(),
            platform.release(),
            platform.version(),
            platform.machine(),
            platform.processor(),
        ]
    )
    return hashlib.sha256(components.encode("utf-8")).hexdigest()[:16]


def capture_baseline(sample_limit: int = 60, scenario_id: str | None = None) -> BenchmarkWindow:
    if sample_limit < 1 or sample_limit > 300:
        raise ValueError("Benchmark duration must be between 1 and 300 seconds.")
    if current_mode() == "live":
        if BENCHMARK_BASELINE_PATH.exists():
            BENCHMARK_BASELINE_PATH.unlink()
    rows = _recent_rows(limit=sample_limit)
    csv_id, csv_path = _write_metric_csv(rows, "baseline")
    baseline = _window_from_rows(
        rows,
        get_session_state().session_id,
        csv_id,
        str(csv_path),
        _normalize_scenario_id(scenario_id),
        _environment_fingerprint(),
        sample_limit,
    )
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


def _relative_effect(delta: float, baseline: float, *, higher_is_better: bool) -> float:
    if abs(baseline) < 1e-9:
        return 0.0
    effect = delta / abs(baseline) * 100.0
    return round(effect if higher_is_better else -effect, 2)


def _primary_effects(baseline: BenchmarkWindow, delta: BenchmarkDelta) -> dict[str, float]:
    return {
        "fps_1pct": _relative_effect(delta.fps_p1_low, baseline.fps_p1_low, higher_is_better=True),
        "frametime_p95": _relative_effect(delta.frametime_p95_ms, baseline.frametime_p95_ms, higher_is_better=False),
        "frametime_p99": _relative_effect(delta.frametime_p99_ms, baseline.frametime_p99_ms, higher_is_better=False),
    }


def _read_reports() -> list[BenchmarkReport]:
    payload = read_json(BENCHMARK_REPORTS_PATH, [])
    if not isinstance(payload, list):
        return []
    reports = []
    for item in payload:
        if not isinstance(item, dict):
            continue
        normalized = dict(item)
        if normalized.get("verdict") == "improved":
            normalized["verdict"] = "better"
        elif normalized.get("verdict") == "regressed":
            normalized["verdict"] = "worse"
        normalized.setdefault(
            "recommended_next_step",
            "Repeat the benchmark with the same game and capture duration before making a keep or rollback decision.",
        )
        try:
            reports.append(BenchmarkReport(**normalized))
        except (TypeError, ValueError):
            continue
    return reports


def _normalized_game_name(value: str) -> str:
    return re.sub(r"\s+", "", value.strip().lower())


def _evidence_group_key(report: BenchmarkReport) -> tuple[str, str, str, str, str, str, int]:
    return (
        report.action_key or "",
        _normalized_game_name(report.game_name),
        report.profile_id or "",
        (report.scenario_id or "").strip().lower(),
        report.environment_fingerprint or "",
        report.protocol_version,
        report.window_seconds or 0,
    )


def _is_comparable_evidence(report: BenchmarkReport) -> bool:
    return bool(
        report.action_key
        and report.scenario_id
        and report.environment_fingerprint
        and report.protocol_version == BENCHMARK_PROTOCOL_VERSION
        and report.window_seconds is not None
        and report.window_seconds >= 15
        and report.tested_action_count == 1
        and report.evidence_quality == "live"
        and report.baseline.capture_source == "presentmon"
        and report.current.capture_source == "presentmon"
        and report.baseline.environment_fingerprint
        and report.baseline.environment_fingerprint == report.current.environment_fingerprint
        and report.environment_fingerprint == report.current.environment_fingerprint
        and report.baseline.requested_window_seconds == report.current.requested_window_seconds
        and report.window_seconds == report.current.requested_window_seconds
        and report.baseline.session_id
        and report.baseline.session_id == report.current.session_id
        and report.baseline.process_id
        and report.baseline.process_id == report.current.process_id
        and all(metric in report.primary_effect_pct for metric in PRIMARY_METRICS)
    )


def _critical_value_95(sample_count: int) -> float:
    degrees_of_freedom = max(sample_count - 1, 1)
    return T_CRITICAL_95.get(degrees_of_freedom, 2.0)


def _metric_evidence(metric: str, values: list[float]) -> BenchmarkMetricEvidence:
    sample_count = len(values)
    average = mean(values)
    ci_low = None
    ci_high = None
    if sample_count >= 2:
        margin = _critical_value_95(sample_count) * stdev(values) / sqrt(sample_count)
        ci_low = round(average - margin, 2)
        ci_high = round(average + margin, 2)
    improved = sum(value >= MINIMUM_PRACTICAL_EFFECT_PCT for value in values)
    regressed = sum(value <= -MINIMUM_PRACTICAL_EFFECT_PCT for value in values)
    neutral = sample_count - improved - regressed
    consistency = max(improved, regressed) / sample_count * 100 if sample_count else 0
    return BenchmarkMetricEvidence(
        metric=metric,
        trial_count=sample_count,
        mean_effect_pct=round(average, 2),
        ci95_low_pct=ci_low,
        ci95_high_pct=ci_high,
        improved_trials=improved,
        regressed_trials=regressed,
        neutral_trials=neutral,
        direction_consistency_pct=round(consistency, 1),
    )


def _build_evidence_summary(reports: list[BenchmarkReport]) -> BenchmarkEvidenceSummary:
    if not reports:
        raise ValueError("At least one comparable report is required.")
    latest = reports[0]
    metrics = [
        _metric_evidence(metric, [report.primary_effect_pct[metric] for report in reports])
        for metric in PRIMARY_METRICS
    ]
    trial_count = len(reports)
    overall_consistency = round(mean(metric.direction_consistency_pct for metric in metrics), 1)
    confirmed_improvements = sum(
        metric.ci95_low_pct is not None and metric.ci95_low_pct >= MINIMUM_PRACTICAL_EFFECT_PCT for metric in metrics
    )
    confirmed_regressions = sum(
        metric.ci95_high_pct is not None and metric.ci95_high_pct <= -MINIMUM_PRACTICAL_EFFECT_PCT for metric in metrics
    )

    if trial_count < MINIMUM_REPEATED_TRIALS:
        status = "insufficient" if trial_count == 1 else "directional"
        summary = (
            "One controlled A/B pair is available. It is useful directional evidence, but it cannot estimate repeatability."
            if trial_count == 1
            else "Two controlled A/B pairs are available. The 95% interval is still too fragile for a repeated-evidence verdict."
        )
        next_step = f"Run {MINIMUM_REPEATED_TRIALS - trial_count} more matching A/B pair(s) in the same game and scene."
    elif confirmed_improvements >= 2 and confirmed_regressions == 0:
        status = "consistent-improvement"
        summary = (
            f"{trial_count} controlled A/B pairs show a repeated local improvement: at least two primary metric "
            "confidence intervals remain above the practical-effect threshold."
        )
        next_step = "Keep the change only for this tested game/configuration and periodically revalidate after driver or OS updates."
    elif confirmed_regressions >= 2 and confirmed_improvements == 0:
        status = "consistent-regression"
        summary = (
            f"{trial_count} controlled A/B pairs show a repeated local regression in at least two primary frame metrics."
        )
        next_step = "Rollback the change and mark it as unsuitable for this game/configuration."
    elif overall_consistency >= 66.7:
        status = "directional"
        summary = (
            f"{trial_count} controlled A/B pairs lean in one direction, but the 95% confidence intervals still cross "
            "the practical-effect threshold."
        )
        next_step = "Repeat the same scene until the interval narrows, or treat the effect as too small to justify the tweak."
    else:
        status = "mixed"
        summary = (
            f"{trial_count} controlled A/B pairs disagree across runs or primary frame metrics. No stable effect is established."
        )
        next_step = "Improve scene control, remove background variance, and repeat before making a keep/rollback decision."

    return BenchmarkEvidenceSummary(
        action_key=latest.action_key or "",
        action_title=latest.action_title or latest.action_key or "Tested change",
        game_name=latest.game_name,
        profile_id=latest.profile_id,
        scenario_id=latest.scenario_id or "",
        environment_fingerprint=latest.environment_fingerprint or "",
        protocol_version=latest.protocol_version,
        window_seconds=latest.window_seconds or 0,
        trial_count=trial_count,
        minimum_trials_required=MINIMUM_REPEATED_TRIALS,
        confidence_method="student-t-95" if trial_count >= 2 else "none",
        status=status,
        evidence_level="S3-local-repeated" if trial_count >= MINIMUM_REPEATED_TRIALS else "S2-local-single-pass",
        overall_consistency_pct=overall_consistency,
        metrics=metrics,
        summary=summary,
        recommended_next_step=next_step,
    )


def benchmark_evidence() -> list[BenchmarkEvidenceSummary]:
    groups: dict[tuple[str, str, str, str, str, str, int], list[BenchmarkReport]] = defaultdict(list)
    for report in _read_reports():
        if _is_comparable_evidence(report):
            groups[_evidence_group_key(report)].append(report)
    summaries = [_build_evidence_summary(reports) for reports in groups.values()]
    summaries.sort(key=lambda item: (item.trial_count, item.game_name, item.action_title), reverse=True)
    return summaries


def _verdict(baseline: BenchmarkWindow, delta: BenchmarkDelta) -> tuple[str, str, str, dict[str, float]]:
    effects = _primary_effects(baseline, delta)
    improved = sum(value >= MINIMUM_PRACTICAL_EFFECT_PCT for value in effects.values())
    worsened = sum(value <= -MINIMUM_PRACTICAL_EFFECT_PCT for value in effects.values())

    if improved >= 2 and worsened == 0:
        return (
            "better",
            "This single pass shows a practically meaningful improvement in at least two primary frame metrics. It is directional evidence, not final proof.",
            "Rollback, repeat the same scene, and confirm the result before enabling this change automatically.",
            effects,
        )
    if worsened >= 2 and improved == 0:
        return (
            "worse",
            "This single pass shows a practically meaningful regression in at least two primary frame metrics.",
            "Rollback the tested change and do not recommend it for this configuration.",
            effects,
        )
    return (
        "mixed",
        "Primary frame metrics did not move consistently beyond the practical effect threshold in this single pass.",
        "Rollback and repeat the controlled test before deciding whether this change helps.",
        effects,
    )


def run_benchmark(sample_limit: int = 60, profile_id: str | None = None) -> BenchmarkReport:
    if sample_limit < 1 or sample_limit > 300:
        raise ValueError("Benchmark duration must be between 1 and 300 seconds.")
    baseline = latest_baseline()
    if not baseline:
        raise ValueError("Capture a baseline before running a comparison benchmark.")
    session = get_session_state()
    rows = _recent_rows(limit=sample_limit)
    csv_id, csv_path = _write_metric_csv(rows, "optimized")
    current_environment = _environment_fingerprint()
    current = _window_from_rows(
        rows,
        session.session_id,
        csv_id,
        str(csv_path),
        baseline.scenario_id,
        current_environment,
        sample_limit,
    )
    profile = get_profile(profile_id) or match_profile(current.game_name) or match_profile(baseline.game_name)
    linked_actions = evidence_actions(session.session_id, baseline.recorded_at or baseline.captured_at)
    linked_action = linked_actions[0] if len(linked_actions) == 1 else None
    delta = BenchmarkDelta(
        fps_avg=round(current.fps_avg - baseline.fps_avg, 2),
        fps_p1_low=round(current.fps_p1_low - baseline.fps_p1_low, 2),
        fps_p01_low=round(current.fps_p01_low - baseline.fps_p01_low, 2),
        frametime_avg_ms=round(current.frametime_avg_ms - baseline.frametime_avg_ms, 2),
        frametime_p95_ms=round(current.frametime_p95_ms - baseline.frametime_p95_ms, 2),
        frametime_p99_ms=round(current.frametime_p99_ms - baseline.frametime_p99_ms, 2),
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
    evidence_status = "inconclusive"
    evidence_level = "S0-hypothesis"
    primary_effect_pct = _primary_effects(baseline, delta)
    if baseline.session_id and current.session_id and baseline.session_id != current.session_id:
        verdict = "inconclusive"
        summary = "Baseline and compare belong to different attached sessions. This verdict is not trustworthy until you capture a fresh baseline."
        next_step = "Capture a new baseline for the current session before comparing again."
    elif baseline.process_id and current.process_id and baseline.process_id != current.process_id:
        verdict = "inconclusive"
        summary = "Baseline and compare belong to different game processes."
        next_step = "Capture a new baseline and optimized pass against the same running process."
    elif not baseline.scenario_id:
        verdict = "inconclusive"
        summary = "The baseline has no controlled scenario label, so repeated evidence cannot identify comparable runs."
        next_step = "Capture a fresh baseline with a map, route, resolution, and graphics-settings scenario label."
    elif baseline.environment_fingerprint != current.environment_fingerprint:
        verdict = "inconclusive"
        summary = "The local environment fingerprint changed between baseline and optimized capture."
        next_step = "Capture a fresh baseline after the OS or hardware environment is stable."
    elif baseline.requested_window_seconds != current.requested_window_seconds:
        verdict = "inconclusive"
        summary = "Baseline and optimized capture used different measurement-window durations."
        next_step = "Repeat both halves of the A/B pair with the same duration."
    elif len(linked_actions) == 0:
        verdict = "inconclusive"
        summary = "No tested change was recorded after this baseline. The observed drift cannot be attributed to a tweak."
        next_step = "Apply exactly one safe change, then run the optimized pass."
    elif len(linked_actions) > 1:
        verdict = "inconclusive"
        summary = f"{len(linked_actions)} changes were recorded after the baseline, so their individual effects cannot be separated."
        next_step = "Rollback the test changes, capture a fresh baseline, and test exactly one change."
    elif evidence_quality != "live":
        verdict = "inconclusive"
        evidence_status = evidence_quality if evidence_quality in {"demo", "degraded"} else "inconclusive"
        evidence_level = "S0-hypothesis"
        summary = "This comparison did not use live PresentMon evidence and cannot prove a real performance effect."
        next_step = "Run the same one-change test with live PresentMon capture."
    else:
        verdict, summary, next_step, primary_effect_pct = _verdict(baseline, delta)
        evidence_status = "single-pass"
        evidence_level = "S2-local-single-pass"
    report = BenchmarkReport(
        id=f"benchmark-{uuid4().hex[:10]}",
        created_at=current.captured_at,
        profile_id=profile.id if profile else profile_id,
        game_name=current.game_name,
        session_id=current.session_id,
        scenario_id=baseline.scenario_id,
        environment_fingerprint=current_environment,
        protocol_version=BENCHMARK_PROTOCOL_VERSION,
        window_seconds=sample_limit,
        action_id=linked_action.id if linked_action else None,
        action_key=linked_action.action_key if linked_action else None,
        action_title=linked_action.action if linked_action else None,
        snapshot_id=linked_action.snapshot_id if linked_action else None,
        csv_id=csv_id,
        csv_path=str(csv_path),
        evidence_quality=evidence_quality,
        evidence_status=evidence_status,
        evidence_level=evidence_level,
        tested_action_count=len(linked_actions),
        minimum_effect_pct=MINIMUM_PRACTICAL_EFFECT_PCT,
        primary_effect_pct=primary_effect_pct,
        baseline=baseline,
        current=current,
        delta=delta,
        verdict=verdict,
        summary=summary,
        recommended_next_step=next_step,
    )
    previous_reports = _read_reports()
    if _is_comparable_evidence(report):
        comparable_reports = [
            candidate
            for candidate in [report, *previous_reports]
            if _is_comparable_evidence(candidate) and _evidence_group_key(candidate) == _evidence_group_key(report)
        ]
        evidence_summary = _build_evidence_summary(comparable_reports)
        report.evidence_summary = evidence_summary
        if evidence_summary.trial_count >= 2:
            report.evidence_status = "repeated"
        if evidence_summary.trial_count >= MINIMUM_REPEATED_TRIALS:
            report.evidence_level = "S3-local-repeated"
            report.summary = evidence_summary.summary
            report.recommended_next_step = evidence_summary.recommended_next_step
            if evidence_summary.status == "consistent-improvement":
                report.verdict = "better"
            elif evidence_summary.status == "consistent-regression":
                report.verdict = "worse"
            else:
                report.verdict = "mixed"
    rows = [report.model_dump(), *[item.model_dump() for item in previous_reports]]
    write_json(BENCHMARK_REPORTS_PATH, rows[:REPORT_HISTORY_LIMIT])
    link_proof(report.action_id, report.id)
    append_proof_event(report)
    return report
