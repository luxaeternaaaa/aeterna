from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

if __package__ is None or __package__ == "":
    sys.path.append(str(Path(__file__).resolve().parents[1]))


ROOT_DIR = Path(__file__).resolve().parents[1]
ML_DIR = ROOT_DIR / "ml"
DEFAULT_MODEL_DIR = ML_DIR / "models"
DEFAULT_ARTIFACT_DIR = ML_DIR / "artifacts"


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Train Aeterna FPS and safe-tweak models.")
    parser.add_argument("csv", nargs="?", help="Path to gameplay sessions CSV. Synthetic data is generated when omitted.")
    parser.add_argument("--rows", type=int, default=4096, help="Synthetic rows to generate when CSV is omitted.")
    parser.add_argument("--seed", type=int, default=17)
    parser.add_argument("--model-dir", type=Path, default=DEFAULT_MODEL_DIR)
    parser.add_argument("--artifact-dir", type=Path, default=DEFAULT_ARTIFACT_DIR)
    parser.add_argument("--confidence-threshold", type=float, default=0.62)
    parser.add_argument("--cv", type=int, default=5)
    parser.add_argument("--min-gain", type=float, default=0.05, help="Minimum paired mean-FPS gain for a positive tweak label.")
    parser.add_argument("--validation-csv", type=Path, help="Optional held-out real gameplay CSV for final validation.")
    parser.add_argument("--demo-examples", type=int, default=5, help="Number of inference examples to export for defense/demo.")
    parser.add_argument(
        "--regressor",
        choices=["auto", "lightgbm", "catboost", "random_forest", "ridge"],
        default="auto",
        help="Regression model family. `auto` selects the lowest CV MAPE from the benchmark table.",
    )
    parser.add_argument("--skip-eda", action="store_true")
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    try:
        import pandas as pd

        from ml.aeterna_model import AeternaModel
        from ml.dataset_loader import DatasetLoader
        from ml.eda import run_eda
        from ml.evaluation import (
            benchmark_regressors,
            demo_predictions,
            evaluate_regressor_holdout,
            evaluate_tweak_holdout,
            select_best_regressor,
            tweak_ablation_summary,
        )
        from ml.report import write_report
        from ml.synthetic_fps import export_synthetic_fps_csv
    except ModuleNotFoundError as exc:
        raise SystemExit(
            f"Missing ML dependency: {exc.name}. Install Python 3.11 dependencies with "
            "`python -m pip install -r ml/requirements-ml.txt`."
        ) from exc

    args.model_dir.mkdir(parents=True, exist_ok=True)
    args.artifact_dir.mkdir(parents=True, exist_ok=True)

    if args.csv:
        csv_path = Path(args.csv)
    else:
        csv_path = args.artifact_dir / "synthetic_fps_sessions.csv"
        export_synthetic_fps_csv(csv_path, rows=args.rows, seed=args.seed)
        print(f"Generated synthetic FPS sessions: {csv_path}")

    loader = DatasetLoader()
    loaded = loader.load(csv_path)
    y_tweak, tweak_gains = loader.derive_tweak_labels(loaded.raw, min_gain=args.min_gain)
    groups = loaded.raw["session_config_id"] if "session_config_id" in loaded.raw.columns else None

    baseline_metrics = benchmark_regressors(loaded.X, loaded.y, groups=groups, cv=args.cv, random_state=args.seed)
    selected_regressor = select_best_regressor(baseline_metrics, args.regressor)
    model = AeternaModel(
        dataset_loader=loader,
        confidence_threshold=args.confidence_threshold,
        random_state=args.seed,
        regressor_kind=selected_regressor,
    )
    regression_metrics = model.evaluate_regression_cv(loaded.X, loaded.y, cv=args.cv, groups=groups)
    tweak_metrics = model.evaluate_tweak_cv(loaded.X, y_tweak, cv=args.cv, groups=groups) if not y_tweak.empty else {}
    ablation_summary = tweak_ablation_summary(tweak_gains) if not tweak_gains.empty else {}
    model.fit(loaded.X, loaded.y, y_tweak, tweak_gains=tweak_gains)

    validation_metrics: dict[str, object] = {}
    if args.validation_csv:
        validation_frame = pd.read_csv(args.validation_csv)
        validation_X = loader.transform_features(validation_frame)
        validation_y = validation_frame[loader.target_columns].astype(float)
        validation_metrics["regression"] = evaluate_regressor_holdout(model.regressor, validation_X, validation_y)
        validation_tweak_y, _ = loader.derive_tweak_labels(validation_frame, min_gain=args.min_gain)
        validation_metrics["tweaks"] = evaluate_tweak_holdout(
            model,
            validation_X,
            validation_tweak_y,
            threshold=args.confidence_threshold,
        )

    onnx_path = args.model_dir / "aeterna_fps_model.onnx"
    metadata = model.save_to_onnx(onnx_path)
    examples = demo_predictions(model, loaded.raw, limit=args.demo_examples)
    metadata.update(
        {
            "baseline_metrics": baseline_metrics,
            "ablation_summary": ablation_summary,
            "validation_metrics": validation_metrics,
            "demo_predictions": examples,
            "evaluation_protocol": {
                "cv": args.cv,
                "split": "GroupKFold by session_config_id when available; KFold fallback otherwise.",
                "positive_tweak_label": f"paired mean_fps gain >= {args.min_gain:.2%}",
                "selected_regressor": selected_regressor,
                "regressor_selection": "lowest mean target MAPE in benchmark table" if args.regressor == "auto" else "manual CLI selection",
            },
        }
    )
    metadata_path = onnx_path.with_suffix(".metadata.json")
    metadata_path.write_text(json.dumps(metadata, indent=2), encoding="utf-8")

    demo_path = args.artifact_dir / "demo_predictions.json"
    demo_path.write_text(json.dumps(examples, indent=2), encoding="utf-8")

    frame = pd.read_csv(csv_path)
    eda = {} if args.skip_eda else run_eda(frame, args.artifact_dir / "eda")
    report_path = write_report(
        args.artifact_dir / "report.md",
        frame,
        eda,
        regression_metrics,
        tweak_metrics,
        metadata,
        baseline_metrics=baseline_metrics,
        ablation_summary=ablation_summary,
        validation_metrics=validation_metrics,
    )

    print("Training complete.")
    print(f"Model metadata: {metadata_path}")
    print(f"Model bundle: {onnx_path.with_suffix('.joblib')}")
    if metadata.get("artifacts", {}).get("onnx_exported"):
        print(f"ONNX model: {onnx_path}")
    else:
        print(f"ONNX export skipped: {metadata.get('artifacts', {}).get('onnx_error')}")
    print(f"Report: {report_path}")
    print(f"Demo examples: {demo_path}")
    print(f"Selected regressor: {selected_regressor}")
    print("Regression metrics:")
    for target, values in regression_metrics.items():
        print(f"  {target}: MAE={values['mae']}, MAPE={values['mape']}%, R2={values['r2']}")


if __name__ == "__main__":
    main()
