from __future__ import annotations

from pathlib import Path
from typing import Any

import pandas as pd


def write_report(
    path: str | Path,
    frame: pd.DataFrame,
    eda: dict[str, Any],
    regression_metrics: dict[str, dict[str, float]],
    tweak_metrics: dict[str, dict[str, float]],
    metadata: dict[str, Any],
    baseline_metrics: dict[str, dict[str, dict[str, float]]] | None = None,
    ablation_summary: dict[str, dict[str, float]] | None = None,
    validation_metrics: dict[str, Any] | None = None,
) -> Path:
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)

    lines = [
        "# Aeterna FPS and Safe-Tweak Model Report",
        "",
        "## Dataset",
        "",
        f"- Rows: {len(frame)}",
        f"- Games: {', '.join(sorted(map(str, frame['game_id'].dropna().unique())))}",
        f"- CPU models: {frame['cpu_model'].nunique()}",
        f"- GPU models: {frame['gpu_model'].nunique()}",
        f"- Tweak columns: {', '.join(metadata.get('tweak_columns', []))}",
        "",
        "The synthetic dataset is built as paired gameplay sessions. For each game, hardware profile, graphics preset, and telemetry context, the generator creates a no-tweak baseline and rows where one or more safe tweaks are enabled. A tweak recommendation label is positive when the paired session improves mean FPS by at least 5 percent.",
        "",
        f"Evaluation split: {metadata.get('evaluation_protocol', {}).get('split', 'KFold fallback')}",
        f"Positive tweak label: {metadata.get('evaluation_protocol', {}).get('positive_tweak_label', 'paired mean_fps gain >= 5%')}",
        f"Selected regressor: {metadata.get('evaluation_protocol', {}).get('selected_regressor', metadata.get('regressor_family', 'unknown'))}",
        "",
        "## Feature Groups",
        "",
        "- Hardware: cpu_model, gpu_model, ram_gb, drive_type, laptop.",
        "- Game and graphics: game_id, resolution, graphics_preset, vsync, antialiasing, texture_quality, special_effects, npc_count, player_actions.",
        "- Runtime signals: cpu_util, gpu_util, vram_util, temperature, background_process_count.",
        "- Safe tweaks: process priority, CPU affinity, power plan, registry preset, safe service reduction, HAGS, Game Mode, recording off, low timer resolution.",
        "",
        "## EDA Artifacts",
        "",
    ]
    for table in eda.get("tables", []):
        lines.append(f"- Table: `{table}`")
    for plot in eda.get("plots", []):
        lines.append(f"- Plot: `{plot}`")
    if eda.get("plot_error"):
        lines.append(f"- Plot generation skipped: `{eda['plot_error']}`")

    if baseline_metrics:
        lines.extend(
            [
                "",
                "## Baseline Comparison",
                "",
                "| Model | Target | MAE | MAPE | R2 |",
                "| --- | --- | ---: | ---: | ---: |",
            ]
        )
        for model_name, targets in baseline_metrics.items():
            for target, values in targets.items():
                lines.append(
                    f"| {model_name} | {target} | {values.get('mae', 0):.4f} | {values.get('mape', 0):.4f}% | {values.get('r2', 0):.4f} |"
                )

    lines.extend(
        [
            "",
            "## Regression Metrics",
            "",
            "| Target | MAE | MAPE | R2 |",
            "| --- | ---: | ---: | ---: |",
        ]
    )
    for target, values in regression_metrics.items():
        lines.append(
            f"| {target} | {values.get('mae', 0):.4f} | {values.get('mape', 0):.4f}% | {values.get('r2', 0):.4f} |"
        )

    lines.extend(
        [
            "",
            "## Tweak Classifier Metrics",
            "",
            "| Tweak | Accuracy | F1 | ROC AUC | Positive rate |",
            "| --- | ---: | ---: | ---: | ---: |",
        ]
    )
    for tweak, values in tweak_metrics.items():
        lines.append(
            f"| {tweak} | {values.get('accuracy', 0):.4f} | {values.get('f1', 0):.4f} | {values.get('roc_auc', 0):.4f} | {values.get('positive_rate', 0):.4f} |"
        )

    if ablation_summary:
        lines.extend(
            [
                "",
                "## Tweak Ablation",
                "",
                "| Tweak | Mean gain | Positive mean gain | P75 gain | Useful rate |",
                "| --- | ---: | ---: | ---: | ---: |",
            ]
        )
        for tweak, values in ablation_summary.items():
            lines.append(
                f"| {tweak} | {values.get('mean_gain_pct', 0):.3f}% | {values.get('positive_mean_gain_pct', 0):.3f}% | {values.get('p75_gain_pct', 0):.3f}% | {values.get('useful_rate', 0):.4f} |"
            )

    reliability = metadata.get("tweak_reliability", {})
    if reliability:
        lines.extend(
            [
                "",
                "## Confidence Reliability",
                "",
                "| Tweak | Bucket | Count | Mean probability | Positive rate | Accuracy at threshold |",
                "| --- | --- | ---: | ---: | ---: | ---: |",
            ]
        )
        for tweak, buckets in reliability.items():
            for bucket in buckets:
                lines.append(
                    f"| {tweak} | {bucket.get('lower', 0):.2f}-{bucket.get('upper', 0):.2f} | {int(bucket.get('count', 0))} | {bucket.get('mean_probability', 0):.4f} | {bucket.get('positive_rate', 0):.4f} | {bucket.get('accuracy_at_threshold', 0):.4f} |"
                )

    if validation_metrics:
        lines.extend(["", "## Held-Out Real Validation", ""])
        regression = validation_metrics.get("regression", {})
        if regression:
            lines.extend(["| Target | MAE | MAPE | R2 |", "| --- | ---: | ---: | ---: |"])
            for target, values in regression.items():
                lines.append(
                    f"| {target} | {values.get('mae', 0):.4f} | {values.get('mape', 0):.4f}% | {values.get('r2', 0):.4f} |"
                )
        tweaks = validation_metrics.get("tweaks", {})
        if tweaks:
            lines.extend(["", "| Tweak | Accuracy | F1 | ROC AUC | Positive rate |", "| --- | ---: | ---: | ---: | ---: |"])
            for tweak, values in tweaks.items():
                lines.append(
                    f"| {tweak} | {values.get('accuracy', 0):.4f} | {values.get('f1', 0):.4f} | {values.get('roc_auc', 0):.4f} | {values.get('positive_rate', 0):.4f} |"
                )

    lines.extend(
        [
            "",
            "## Safety Behavior",
            "",
            f"- Recommendation confidence threshold: {metadata.get('confidence_threshold', 0.62)}.",
            "- A tweak is not recommended when the model probability or final confidence is below the threshold.",
            "- Active tweaks are not recommended again.",
            "- Joblib fallback remains available when ONNX export or runtime loading is unavailable.",
            "- Per-tweak logistic-regression fallback classifiers are saved inside the model bundle.",
            "",
            "## Artifacts",
            "",
            f"- Model source: `{metadata.get('model_source')}`",
            f"- ONNX exported: `{metadata.get('artifacts', {}).get('onnx_exported')}`",
            f"- ONNX path: `{metadata.get('artifacts', {}).get('onnx_path')}`",
            f"- Joblib path: `{metadata.get('artifacts', {}).get('joblib_path')}`",
            f"- Demo examples: `{len(metadata.get('demo_predictions', []))}`",
            "",
            "## Defense Position",
            "",
            "The model is an advisory ranking system. It predicts FPS and ranks reversible safe tweaks for a selected session, but it does not claim universal FPS gains and does not bypass Aeterna safety policy. When confidence is insufficient, the correct behavior is abstention plus fallback.",
            "",
            "## Further Improvements",
            "",
            "- Replace synthetic rows with captured PresentMon sessions once enough local opt-in telemetry exists.",
            "- Balance rare positive labels per tweak, especially affinity and low timer resolution.",
            "- Calibrate recommendation probabilities with held-out real sessions.",
            "- Add game-specific safety blocklists in the Rust sidecar before automated apply.",
            "- Track per-hardware confidence drift and trigger warm-start refit only when data quality is sufficient.",
            "",
        ]
    )

    path.write_text("\n".join(lines), encoding="utf-8")
    return path
