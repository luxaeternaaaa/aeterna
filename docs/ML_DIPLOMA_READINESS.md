# ML Diploma Readiness

This checklist describes the minimum evidence needed to defend Aeterna's ML module without overstating what the model proves.

## Scope

Aeterna ML is a local decision-support layer. It predicts average FPS and 1 percent low FPS for a selected game/session and ranks reversible safe tweaks. It does not promise universal FPS gains and it must abstain when confidence is low.

## Reproducible Training

```powershell
cd C:\Users\foxal.DESKTOP-N1GCIEU\Desktop\aeterna
python -m pip install -r ml\requirements-ml.txt
python train.py
```

Expected artifacts:

- `ml/models/aeterna_fps_model.joblib`
- `ml/models/aeterna_fps_model.onnx` when ONNX conversion is available
- `ml/models/aeterna_fps_model.metadata.json`
- `ml/artifacts/report.md`
- `ml/artifacts/demo_predictions.json`
- `ml/artifacts/eda/*`

Verify preprocessing parity:

```powershell
python -m ml.verify_onnx_parity
```

Sidecar integration:

- `ml_runtime_truth` detects `ml/models/aeterna_fps_model.onnx`.
- The Rust sidecar validates that the ONNX artifact is loadable through `tract-onnx`.
- The exported FPS ONNX graph includes `DatasetLoader` preprocessing (`ColumnTransformer`, one-hot encoding, scaling) and accepts raw game/hardware/graphics/tweak input columns.
- The live `ml_inference` endpoint keeps the existing telemetry-pressure fallback active until the sidecar receives those raw FPS model inputs.

## Required Defense Evidence

- Dataset description: synthetic paired sessions plus optional real validation sessions.
- EDA: FPS distribution, hardware/preset grouping, correlation table, outlier table.
- Baseline comparison: dummy mean, ridge, random forest, and LightGBM when available.
- Evaluation split: `GroupKFold` by `session_config_id` so identical paired sessions do not leak across folds.
- Regression metrics: MAE, MAPE, and R2 for `mean_fps` and `fps_1pct`.
- Tweak metrics: accuracy, F1, ROC AUC, positive rate per safe tweak.
- Tweak ablation: average gain and useful-rate per tweak.
- Confidence reliability: probability buckets and accuracy at the recommendation threshold.
- Safety behavior: confidence threshold, abstention, fallback, rollback, no injection, no memory editing.

## Real Validation Protocol

Collect 30-100 rows if time is limited:

- 3-5 games.
- 2-3 graphics presets.
- baseline with all tweaks off.
- one row per safe tweak on the same game/hardware/settings.
- 60-120 seconds per run.
- record mean FPS, 1 percent low FPS, CPU/GPU utilization, temperature, and background process count.

Run:

```powershell
python train.py ml\artifacts\synthetic_fps_sessions.csv --validation-csv data\real_game_sessions.csv
```

## Defense Statement

Use this wording:

> The model is not an autonomous optimizer. It is an advisory ranking model that predicts FPS and ranks reversible safe tweaks for a selected session. If confidence is below threshold, Aeterna abstains and keeps the fallback path active.

## Known Limitations

- Synthetic data is a pretraining and demonstration source, not final proof of universal gains.
- The real validation set should be expanded after the diploma prototype.
- Per-game safety blocklists should be maintained in the sidecar before trusted automation is enabled.
- Confidence calibration must be rechecked when the hardware or game distribution changes.
- Full Rust-side FPS prediction now requires a dedicated request path that supplies the raw FPS model columns to the preprocessing-inclusive ONNX graph.
