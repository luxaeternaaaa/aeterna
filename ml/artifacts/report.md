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
| tweak_affinity | 0.9761 | 0.3288 | 0.9617 | 0.0298 |
| tweak_game_mode | 1.0000 | 0.0000 | 0.5000 | 0.0000 |
| tweak_hags | 0.9790 | 0.1224 | 0.9855 | 0.0220 |
| tweak_low_timer_resolution | 1.0000 | 0.0000 | 0.5000 | 0.0000 |
| tweak_power_plan | 0.9761 | 0.3797 | 0.9742 | 0.0312 |
| tweak_priority | 0.9814 | 0.7031 | 0.9681 | 0.0405 |
| tweak_recording_off | 0.9824 | 0.6727 | 0.9810 | 0.0347 |
| tweak_registry_preset | 1.0000 | 0.0000 | 0.5000 | 0.0000 |
| tweak_service | 0.9893 | 0.0000 | 0.7589 | 0.0107 |

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
| tweak_affinity | 0.00-0.40 | 2019 | 0.0198 | 0.0173 | 0.9827 |
| tweak_affinity | 0.40-0.55 | 10 | 0.4668 | 0.8000 | 0.2000 |
| tweak_affinity | 0.55-0.62 | 7 | 0.5953 | 0.8571 | 0.1429 |
| tweak_affinity | 0.62-0.75 | 8 | 0.6645 | 1.0000 | 1.0000 |
| tweak_affinity | 0.75-0.90 | 3 | 0.8503 | 1.0000 | 1.0000 |
| tweak_affinity | 0.90-1.00 | 1 | 0.9127 | 1.0000 | 1.0000 |
| tweak_hags | 0.00-0.40 | 2029 | 0.0156 | 0.0153 | 0.9847 |
| tweak_hags | 0.40-0.55 | 13 | 0.4500 | 0.7692 | 0.2308 |
| tweak_hags | 0.55-0.62 | 2 | 0.5897 | 0.5000 | 0.5000 |
| tweak_hags | 0.62-0.75 | 2 | 0.6733 | 1.0000 | 1.0000 |
| tweak_hags | 0.75-0.90 | 2 | 0.7986 | 0.5000 | 0.5000 |
| tweak_power_plan | 0.00-0.40 | 2011 | 0.0175 | 0.0139 | 0.9861 |
| tweak_power_plan | 0.40-0.55 | 16 | 0.4798 | 1.0000 | 0.0000 |
| tweak_power_plan | 0.55-0.62 | 6 | 0.5867 | 0.8333 | 0.1667 |
| tweak_power_plan | 0.62-0.75 | 5 | 0.6677 | 1.0000 | 1.0000 |
| tweak_power_plan | 0.75-0.90 | 10 | 0.8150 | 1.0000 | 1.0000 |
| tweak_priority | 0.00-0.40 | 1984 | 0.0180 | 0.0106 | 0.9894 |
| tweak_priority | 0.40-0.55 | 10 | 0.4808 | 0.8000 | 0.2000 |
| tweak_priority | 0.55-0.62 | 9 | 0.5853 | 1.0000 | 0.0000 |
| tweak_priority | 0.62-0.75 | 14 | 0.6909 | 1.0000 | 1.0000 |
| tweak_priority | 0.75-0.90 | 26 | 0.8255 | 1.0000 | 1.0000 |
| tweak_priority | 0.90-1.00 | 5 | 0.9108 | 1.0000 | 1.0000 |
| tweak_recording_off | 0.00-0.40 | 1990 | 0.0126 | 0.0101 | 0.9899 |
| tweak_recording_off | 0.40-0.55 | 13 | 0.4781 | 0.6154 | 0.3846 |
| tweak_recording_off | 0.55-0.62 | 6 | 0.5892 | 1.0000 | 0.0000 |
| tweak_recording_off | 0.62-0.75 | 13 | 0.6903 | 0.9231 | 0.9231 |
| tweak_recording_off | 0.75-0.90 | 17 | 0.8287 | 0.9412 | 0.9412 |
| tweak_recording_off | 0.90-1.00 | 9 | 0.9378 | 1.0000 | 1.0000 |
| tweak_service | 0.00-0.40 | 2048 | 0.0106 | 0.0107 | 0.9893 |

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
- Demo examples: `5`

## Defense Position

The model is an advisory ranking system. It predicts FPS and ranks reversible safe tweaks for a selected session, but it does not claim universal FPS gains and does not bypass Aeterna safety policy. When confidence is insufficient, the correct behavior is abstention plus fallback.

## Further Improvements

- Replace synthetic rows with captured PresentMon sessions once enough local opt-in telemetry exists.
- Balance rare positive labels per tweak, especially affinity and low timer resolution.
- Calibrate recommendation probabilities with held-out real sessions.
- Add game-specific safety blocklists in the Rust sidecar before automated apply.
- Track per-hardware confidence drift and trigger warm-start refit only when data quality is sufficient.
