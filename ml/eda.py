from __future__ import annotations

from pathlib import Path
from typing import Any

import pandas as pd


def run_eda(frame: pd.DataFrame, output_dir: str | Path) -> dict[str, Any]:
    output_dir = Path(output_dir)
    output_dir.mkdir(parents=True, exist_ok=True)

    artifacts: dict[str, Any] = {"plots": [], "tables": []}
    summary_path = output_dir / "eda_summary.json"

    fps_by_preset = (
        frame.groupby(["game_id", "graphics_preset"], dropna=False)[["mean_fps", "fps_1pct"]]
        .agg(["count", "mean", "median", "std"])
        .round(3)
    )
    fps_by_preset_path = output_dir / "fps_by_game_preset.csv"
    fps_by_preset.to_csv(fps_by_preset_path)
    artifacts["tables"].append(str(fps_by_preset_path))

    fps_by_hardware = (
        frame.groupby(["cpu_model", "gpu_model"], dropna=False)[["mean_fps", "fps_1pct"]]
        .agg(["count", "mean", "median"])
        .sort_values(("mean_fps", "mean"), ascending=False)
        .round(3)
    )
    fps_by_hardware_path = output_dir / "fps_by_hardware.csv"
    fps_by_hardware.to_csv(fps_by_hardware_path)
    artifacts["tables"].append(str(fps_by_hardware_path))

    numeric = frame.select_dtypes(include="number")
    correlation_path = output_dir / "correlation.csv"
    numeric.corr(numeric_only=True).round(4).to_csv(correlation_path)
    artifacts["tables"].append(str(correlation_path))

    outliers = _iqr_outliers(frame, ["mean_fps", "fps_1pct", "temperature", "cpu_util", "gpu_util"])
    outliers_path = output_dir / "outliers.csv"
    outliers.to_csv(outliers_path, index=False)
    artifacts["tables"].append(str(outliers_path))

    artifacts["outlier_count"] = int(len(outliers))
    artifacts["rows"] = int(len(frame))
    artifacts["mean_fps_mean"] = float(frame["mean_fps"].mean()) if "mean_fps" in frame else 0.0
    artifacts["fps_1pct_mean"] = float(frame["fps_1pct"].mean()) if "fps_1pct" in frame else 0.0

    try:
        import matplotlib.pyplot as plt
        import seaborn as sns

        sns.set_theme(style="whitegrid")
        plot_specs = [
            ("mean_fps_distribution.png", lambda: sns.histplot(frame["mean_fps"], bins=40, kde=True)),
            ("fps_1pct_distribution.png", lambda: sns.histplot(frame["fps_1pct"], bins=40, kde=True)),
            (
                "fps_by_preset.png",
                lambda: sns.boxplot(data=frame, x="graphics_preset", y="mean_fps", order=["low", "medium", "high", "ultra"]),
            ),
            ("correlation_heatmap.png", lambda: sns.heatmap(numeric.corr(numeric_only=True), cmap="vlag", center=0)),
        ]
        for filename, plotter in plot_specs:
            plt.figure(figsize=(10, 6))
            plotter()
            plt.tight_layout()
            path = output_dir / filename
            plt.savefig(path, dpi=150)
            plt.close()
            artifacts["plots"].append(str(path))
    except Exception as exc:
        artifacts["plot_error"] = str(exc)

    summary_path.write_text(pd.Series(artifacts).to_json(indent=2), encoding="utf-8")
    artifacts["summary_path"] = str(summary_path)
    return artifacts


def _iqr_outliers(frame: pd.DataFrame, columns: list[str]) -> pd.DataFrame:
    rows = []
    for column in columns:
        if column not in frame:
            continue
        series = pd.to_numeric(frame[column], errors="coerce").dropna()
        if series.empty:
            continue
        q1 = series.quantile(0.25)
        q3 = series.quantile(0.75)
        iqr = q3 - q1
        lower = q1 - 1.5 * iqr
        upper = q3 + 1.5 * iqr
        mask = (pd.to_numeric(frame[column], errors="coerce") < lower) | (pd.to_numeric(frame[column], errors="coerce") > upper)
        for index in frame.index[mask]:
            rows.append(
                {
                    "row_index": int(index),
                    "column": column,
                    "value": float(frame.at[index, column]),
                    "lower_bound": float(lower),
                    "upper_bound": float(upper),
                }
            )
    return pd.DataFrame(rows)
