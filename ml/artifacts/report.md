# Aeterna FPS and Safe-Tweak Model Report

## Dataset

- Rows: 2048
- Games: apex_legends, cs2, cyberpunk_2077, fortnite, valorant, warzone
- CPU models: 8
- GPU models: 8
- Tweak columns: tweak_affinity, tweak_game_mode, tweak_hags, tweak_low_timer_resolution, tweak_power_plan, tweak_priority, tweak_recording_off, tweak_registry_preset, tweak_service

The synthetic dataset is built as paired gameplay sessions. For each game, hardware profile, graphics preset, and telemetry context, the generator creates a no-tweak baseline and rows where one or more safe tweaks are enabled. A tweak recommendation label is positive when the paired session improves mean FPS by at least 5 percent.

Evaluation split: GroupKFold by session_config_id when available; KFold fallback otherwise.
Positive tweak label: paired mean_fps gain >= 5.00%
Selected regressor: ridge

## Feature Groups

- Hardware: cpu_model, gpu_model, ram_gb, drive_type, laptop.
- Game and graphics: game_id, resolution, graphics_preset, vsync, antialiasing, texture_quality, special_effects, npc_count, player_actions.
- Runtime signals: cpu_util, gpu_util, vram_util, temperature, background_process_count.
- Safe tweaks: process priority, CPU affinity, power plan, registry preset, safe service reduction, HAGS, Game Mode, recording off, low timer resolution.

## EDA Artifacts

- Table: `C:\Users\foxal.DESKTOP-N1GCIEU\Desktop\aeterna\ml\artifacts\eda\fps_by_game_preset.csv`
- Table: `C:\Users\foxal.DESKTOP-N1GCIEU\Desktop\aeterna\ml\artifacts\eda\fps_by_hardware.csv`
- Table: `C:\Users\foxal.DESKTOP-N1GCIEU\Desktop\aeterna\ml\artifacts\eda\correlation.csv`
- Table: `C:\Users\foxal.DESKTOP-N1GCIEU\Desktop\aeterna\ml\artifacts\eda\outliers.csv`
- Plot: `C:\Users\foxal.DESKTOP-N1GCIEU\Desktop\aeterna\ml\artifacts\eda\mean_fps_distribution.png`
- Plot: `C:\Users\foxal.DESKTOP-N1GCIEU\Desktop\aeterna\ml\artifacts\eda\fps_1pct_distribution.png`
- Plot: `C:\Users\foxal.DESKTOP-N1GCIEU\Desktop\aeterna\ml\artifacts\eda\fps_by_preset.png`
- Plot: `C:\Users\foxal.DESKTOP-N1GCIEU\Desktop\aeterna\ml\artifacts\eda\correlation_heatmap.png`

## Baseline Comparison

| Model | Target | MAE | MAPE | R2 |
| --- | --- | ---: | ---: | ---: |
| dummy_mean | mean_fps | 39.5507 | 38.8471% | -0.0137 |
| dummy_mean | fps_1pct | 31.6646 | 39.8803% | -0.0124 |
| ridge | mean_fps | 21.7462 | 21.8603% | 0.6830 |
| ridge | fps_1pct | 17.6117 | 22.4985% | 0.6782 |
| random_forest | mean_fps | 30.2059 | 26.6618% | 0.3796 |
| random_forest | fps_1pct | 24.0826 | 27.2799% | 0.3793 |
| lightgbm | mean_fps | 28.1062 | 25.3186% | 0.4642 |
| lightgbm | fps_1pct | 21.2921 | 24.6628% | 0.5110 |

## Regression Metrics

| Target | MAE | MAPE | R2 |
| --- | ---: | ---: | ---: |
| mean_fps | 21.7462 | 21.8603% | 0.6830 |
| fps_1pct | 17.6117 | 22.4985% | 0.6782 |

## Tweak Classifier Metrics

| Tweak | Accuracy | F1 | ROC AUC | Positive rate |
| --- | ---: | ---: | ---: | ---: |
| tweak_affinity | 0.9746 | 0.2571 | 0.9731 | 0.0298 |
| tweak_game_mode | 1.0000 | 0.0000 | 0.5000 | 0.0000 |
| tweak_hags | 0.9785 | 0.0435 | 0.9891 | 0.0220 |
| tweak_low_timer_resolution | 1.0000 | 0.0000 | 0.5000 | 0.0000 |
| tweak_power_plan | 0.9731 | 0.2466 | 0.9736 | 0.0312 |
| tweak_priority | 0.9766 | 0.5932 | 0.9667 | 0.0405 |
| tweak_recording_off | 0.9722 | 0.3294 | 0.9758 | 0.0347 |
| tweak_registry_preset | 1.0000 | 0.0000 | 0.5000 | 0.0000 |
| tweak_service | 0.9893 | 0.0000 | 0.8857 | 0.0107 |

## Tweak Ablation

| Tweak | Mean gain | Positive mean gain | P75 gain | Useful rate |
| --- | ---: | ---: | ---: | ---: |
| tweak_power_plan | 0.473% | 5.869% | 0.000% | 0.0312 |
| tweak_priority | 0.371% | 4.423% | 0.000% | 0.0405 |
| tweak_affinity | 0.245% | 3.825% | 0.000% | 0.0298 |
| tweak_service | 0.282% | 3.421% | 0.000% | 0.0107 |
| tweak_hags | 0.192% | 3.417% | 0.000% | 0.0220 |
| tweak_recording_off | 0.272% | 3.391% | 0.000% | 0.0347 |
| tweak_registry_preset | 0.283% | 3.346% | 0.000% | 0.0000 |
| tweak_game_mode | 0.189% | 2.390% | 0.000% | 0.0000 |
| tweak_low_timer_resolution | 0.061% | 0.740% | 0.000% | 0.0000 |

## Confidence Reliability

| Tweak | Bucket | Count | Mean probability | Positive rate | Accuracy at threshold |
| --- | --- | ---: | ---: | ---: | ---: |
| tweak_affinity | 0.00-0.40 | 1996 | 0.0653 | 0.0090 | 0.9910 |
| tweak_affinity | 0.40-0.55 | 36 | 0.4823 | 0.7500 | 0.2500 |
| tweak_affinity | 0.55-0.62 | 7 | 0.5817 | 1.0000 | 0.0000 |
| tweak_affinity | 0.62-0.75 | 9 | 0.6496 | 1.0000 | 1.0000 |
| tweak_hags | 0.00-0.40 | 2012 | 0.0576 | 0.0094 | 0.9906 |
| tweak_hags | 0.40-0.55 | 29 | 0.4648 | 0.6897 | 0.3103 |
| tweak_hags | 0.55-0.62 | 6 | 0.5886 | 0.8333 | 0.1667 |
| tweak_hags | 0.62-0.75 | 1 | 0.6448 | 1.0000 | 1.0000 |
| tweak_power_plan | 0.00-0.40 | 1989 | 0.0676 | 0.0080 | 0.9920 |
| tweak_power_plan | 0.40-0.55 | 37 | 0.4602 | 0.7027 | 0.2973 |
| tweak_power_plan | 0.55-0.62 | 13 | 0.5794 | 1.0000 | 0.0000 |
| tweak_power_plan | 0.62-0.75 | 9 | 0.6701 | 1.0000 | 1.0000 |
| tweak_priority | 0.00-0.40 | 1975 | 0.0801 | 0.0091 | 0.9909 |
| tweak_priority | 0.40-0.55 | 16 | 0.4643 | 0.5000 | 0.5000 |
| tweak_priority | 0.55-0.62 | 22 | 0.5904 | 1.0000 | 0.0000 |
| tweak_priority | 0.62-0.75 | 34 | 0.6731 | 1.0000 | 1.0000 |
| tweak_priority | 0.75-0.90 | 1 | 0.7755 | 1.0000 | 1.0000 |
| tweak_recording_off | 0.00-0.40 | 1978 | 0.0718 | 0.0061 | 0.9939 |
| tweak_recording_off | 0.40-0.55 | 32 | 0.4784 | 0.7188 | 0.2812 |
| tweak_recording_off | 0.55-0.62 | 24 | 0.5847 | 0.9167 | 0.0833 |
| tweak_recording_off | 0.62-0.75 | 14 | 0.6682 | 1.0000 | 1.0000 |
| tweak_service | 0.00-0.40 | 2048 | 0.0389 | 0.0107 | 0.9893 |

## Safety Behavior

- Recommendation confidence threshold: 0.62.
- A tweak is not recommended when the model probability or final confidence is below the threshold.
- Active tweaks are not recommended again.
- Joblib fallback remains available when ONNX export or runtime loading is unavailable.
- Per-tweak logistic-regression fallback classifiers are saved inside the model bundle.

## Artifacts

- Model source: `onnx`
- ONNX exported: `True`
- ONNX path: `C:\Users\foxal.DESKTOP-N1GCIEU\Desktop\aeterna\ml\models\aeterna_fps_model.onnx`
- Joblib path: `C:\Users\foxal.DESKTOP-N1GCIEU\Desktop\aeterna\ml\models\aeterna_fps_model.joblib`
- Preprocessing included in ONNX: `True`
- ONNX raw input columns: `29`
- Demo examples: `5`

## Defense Position

The model is an advisory ranking system. It predicts FPS and ranks reversible safe tweaks for a selected session, but it does not claim universal FPS gains and does not bypass Aeterna safety policy. When confidence is insufficient, the correct behavior is abstention plus fallback.

## Further Improvements

- Replace synthetic rows with captured PresentMon sessions once enough local opt-in telemetry exists.
- Balance rare positive labels per tweak, especially affinity and low timer resolution.
- Calibrate recommendation probabilities with held-out real sessions.
- Add game-specific safety blocklists in the Rust sidecar before automated apply.
- Track per-hardware confidence drift and trigger warm-start refit only when data quality is sufficient.
