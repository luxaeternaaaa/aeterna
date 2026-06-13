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
        f"Training data origin: `{metadata.get('training_data_origin', 'unknown')}`.",
        "",
        "Tweak targets are created only for baseline rows with a measured matching counterfactual. Rows with an enabled target tweak or without a pair are excluded from that classifier rather than treated as negative examples.",
        "",
        f"Evaluation split: {metadata.get('evaluation_protocol', {}).get('split', 'KFold fallback')}",
        f"Positive tweak label: {metadata.get('evaluation_protocol', {}).get('positive_tweak_label', 'paired mean_fps gain >= 5%')}",
        f"Selected regressor: {metadata.get('evaluation_protocol', {}).get('selected_regressor', metadata.get('regressor_family', 'unknown'))}",
        "",
        "## Feature Groups",
        "",
        "- Hardware: cpu_model, gpu_model, ram_gb, drive_type, laptop.",
        "- Game and graphics: game_id, resolution, graphics_preset, vsync, antialiasing, texture_quality, special_effects, npc_count, player_actions.",
        "- Pre-session context: background_process_count. Post-treatment CPU/GPU/VRAM utilization and temperature are excluded.",
        "- FPS outcome model only: selected safe-tweak state.",
        "- Tweak recommendation models: no tweak state columns are available to the classifier.",
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
            "| Tweak | Valid pairs | Positives | Precision | Recall | F1 | ROC AUC | PR AUC | Brier | Released internally |",
            "| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- |",
        ]
    )
    release_gates = metadata.get("tweak_release_gates", {})
    for tweak, values in tweak_metrics.items():
        released = release_gates.get(tweak, {}).get("internal_enabled", release_gates.get(tweak, {}).get("enabled", False))
        lines.append(
            f"| {tweak} | {int(values.get('valid_count', 0))} | {int(values.get('positive_count', 0))} | "
            f"{values.get('precision', 0):.4f} | {values.get('recall', 0):.4f} | "
            f"{values.get('f1', 0):.4f} | {values.get('roc_auc', 0):.4f} | "
            f"{values.get('pr_auc', 0):.4f} | {values.get('brier', 0):.4f} | {released} |"
        )

    if ablation_summary:
        lines.extend(
            [
                "",
                "## Tweak Ablation",
                "",
                "| Tweak | Paired rows | Mean gain | Positive mean gain | P75 gain | Useful rate |",
                "| --- | ---: | ---: | ---: | ---: | ---: |",
            ]
        )
        for tweak, values in ablation_summary.items():
            lines.append(
                f"| {tweak} | {int(values.get('paired_count', 0))} | {values.get('mean_gain_pct', 0):.3f}% | {values.get('positive_mean_gain_pct', 0):.3f}% | {values.get('p75_gain_pct', 0):.3f}% | {values.get('useful_rate', 0):.4f} |"
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
            "- Recommendation confidence is the classifier probability; it is not blended with accuracy heuristics.",
            "- A tweak is not trained for recommendation unless its valid-pair count and out-of-fold precision, recall, F1, ROC-AUC, and PR-AUC pass release gates.",
            "- Runtime metadata priors remain disabled without an independent external validation CSV.",
            "- Active tweaks are not recommended again.",
            "- Missing required feature columns are rejected instead of silently replaced with zero.",
            "",
            "## Artifacts",
            "",
            f"- Model artifact source: `{metadata.get('model_source')}`",
            f"- Runtime capability: `{metadata.get('runtime_capability')}`",
            f"- ONNX exported: `{metadata.get('artifacts', {}).get('onnx_exported')}`",
            f"- ONNX path: `{metadata.get('artifacts', {}).get('onnx_path')}`",
            f"- Joblib path: `{metadata.get('artifacts', {}).get('joblib_path')}`",
            f"- Preprocessing included in ONNX: `{metadata.get('preprocessing', {}).get('included_in_onnx')}`",
            f"- ONNX raw input columns: `{len(metadata.get('onnx_input_schema', []))}`",
            f"- Demo examples: `{len(metadata.get('demo_predictions', []))}`",
            "",
            "## Defense Position",
            "",
            "The ONNX file is an offline FPS prediction artifact. Artifact validation is not runtime inference. Tweak priors are not released to the Rust recommendation path until independent validation exists and every released classifier passes its quality gate.",
            "",
            "## Further Improvements",
            "",
            "- Replace synthetic rows with repeated randomized PresentMon A/B sessions across games and hardware.",
            "- Add temporal, leave-game-out, and leave-hardware-out evaluation once enough real data exists.",
            "- Calibrate recommendation probabilities only on held-out real sessions.",
            "- Add game-specific safety blocklists in the Rust sidecar before automated apply.",
            "- Track per-hardware confidence drift and use versioned full retraining with a replayable dataset.",
            "",
        ]
    )

    path.write_text("\n".join(lines), encoding="utf-8")
    return path
