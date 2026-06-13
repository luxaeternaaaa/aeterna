# Aeterna FPS and Safe-Tweak Model Report

## Dataset

- Rows: 4096
- Games: apex_legends, cs2, cyberpunk_2077, fortnite, valorant, warzone
- CPU models: 8
- GPU models: 8
- Tweak columns: tweak_affinity, tweak_game_mode, tweak_hags, tweak_low_timer_resolution, tweak_power_plan, tweak_priority, tweak_recording_off, tweak_registry_preset, tweak_service

Training data origin: `synthetic-generator`.

Tweak targets are created only for baseline rows with a measured matching counterfactual. Rows with an enabled target tweak or without a pair are excluded from that classifier rather than treated as negative examples.

Evaluation split: Fold-local preprocessing with GroupKFold by session_config_id when available; KFold fallback otherwise.
Positive tweak label: paired baseline-only mean_fps gain >= 5.00%; rows without a measured counterfactual are masked, not negative
Selected regressor: ridge

## Feature Groups

- Hardware: cpu_model, gpu_model, ram_gb, drive_type, laptop.
- Game and graphics: game_id, resolution, graphics_preset, vsync, antialiasing, texture_quality, special_effects, npc_count, player_actions.
- Pre-session context: background_process_count. Post-treatment CPU/GPU/VRAM utilization and temperature are excluded.
- FPS outcome model only: selected safe-tweak state.
- Tweak recommendation models: no tweak state columns are available to the classifier.

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
| dummy_mean | mean_fps | 38.9780 | 38.1703% | -0.0035 |
| dummy_mean | fps_1pct | 31.2563 | 39.3258% | -0.0031 |
| ridge | mean_fps | 20.8187 | 20.9231% | 0.7018 |
| ridge | fps_1pct | 16.8005 | 21.5084% | 0.7003 |
| random_forest | mean_fps | 26.6348 | 24.5704% | 0.5214 |
| random_forest | fps_1pct | 21.5600 | 25.1860% | 0.5105 |
| lightgbm | mean_fps | 21.7622 | 20.3071% | 0.6729 |
| lightgbm | fps_1pct | 17.6688 | 20.6722% | 0.6606 |

## Regression Metrics

| Target | MAE | MAPE | R2 |
| --- | ---: | ---: | ---: |
| mean_fps | 20.8187 | 20.9231% | 0.7018 |
| fps_1pct | 16.8005 | 21.5084% | 0.7003 |

## Tweak Classifier Metrics

| Tweak | Valid pairs | Positives | Precision | Recall | F1 | ROC AUC | PR AUC | Brier | Released internally |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- |
| tweak_affinity | 390 | 119 | 0.9302 | 0.3361 | 0.4938 | 0.9251 | 0.8511 | 0.1272 | True |
| tweak_game_mode | 366 | 0 | 0.0000 | 0.0000 | 0.0000 | 0.5000 | 0.0000 | 1.0000 | False |
| tweak_hags | 388 | 94 | 0.9310 | 0.2872 | 0.4390 | 0.9188 | 0.7978 | 0.1215 | True |
| tweak_low_timer_resolution | 394 | 0 | 0.0000 | 0.0000 | 0.0000 | 0.5000 | 0.0000 | 1.0000 | False |
| tweak_power_plan | 381 | 133 | 1.0000 | 0.9098 | 0.9528 | 0.9967 | 0.9943 | 0.0534 | True |
| tweak_priority | 382 | 151 | 0.9467 | 0.4702 | 0.6283 | 0.9060 | 0.8825 | 0.1478 | True |
| tweak_recording_off | 371 | 147 | 0.8529 | 0.3946 | 0.5395 | 0.8864 | 0.7964 | 0.1593 | True |
| tweak_registry_preset | 377 | 0 | 0.0000 | 0.0000 | 0.0000 | 0.5000 | 0.0000 | 1.0000 | False |
| tweak_service | 391 | 57 | 0.7500 | 0.0526 | 0.0984 | 0.9398 | 0.7372 | 0.0857 | False |

## Tweak Ablation

| Tweak | Paired rows | Mean gain | Positive mean gain | P75 gain | Useful rate |
| --- | ---: | ---: | ---: | ---: | ---: |
| tweak_power_plan | 381 | 5.189% | 5.831% | 8.598% | 0.3491 |
| tweak_priority | 382 | 3.824% | 4.374% | 5.860% | 0.3953 |
| tweak_affinity | 390 | 2.554% | 3.747% | 5.500% | 0.3051 |
| tweak_hags | 388 | 2.035% | 3.525% | 4.889% | 0.2423 |
| tweak_recording_off | 371 | 3.090% | 3.463% | 5.399% | 0.3962 |
| tweak_service | 391 | 3.022% | 3.435% | 4.429% | 0.1458 |
| tweak_registry_preset | 377 | 2.912% | 3.277% | 3.832% | 0.0000 |
| tweak_game_mode | 366 | 2.104% | 2.354% | 2.860% | 0.0000 |
| tweak_low_timer_resolution | 394 | 0.629% | 0.721% | 1.243% | 0.0000 |

## Confidence Reliability

| Tweak | Bucket | Count | Mean probability | Positive rate | Accuracy at threshold |
| --- | --- | ---: | ---: | ---: | ---: |
| tweak_affinity | 0.00-0.40 | 238 | 0.2291 | 0.0630 | 0.9370 |
| tweak_affinity | 0.40-0.55 | 75 | 0.4776 | 0.5067 | 0.4933 |
| tweak_affinity | 0.55-0.62 | 34 | 0.5930 | 0.7647 | 0.2353 |
| tweak_affinity | 0.62-0.75 | 37 | 0.6919 | 0.9189 | 0.9189 |
| tweak_affinity | 0.75-0.90 | 6 | 0.7885 | 1.0000 | 1.0000 |
| tweak_hags | 0.00-0.40 | 268 | 0.2266 | 0.0672 | 0.9328 |
| tweak_hags | 0.40-0.55 | 73 | 0.4566 | 0.4795 | 0.5205 |
| tweak_hags | 0.55-0.62 | 18 | 0.5820 | 0.7778 | 0.2222 |
| tweak_hags | 0.62-0.75 | 26 | 0.6793 | 0.9231 | 0.9231 |
| tweak_hags | 0.75-0.90 | 3 | 0.8202 | 1.0000 | 1.0000 |
| tweak_power_plan | 0.00-0.40 | 235 | 0.1622 | 0.0043 | 0.9957 |
| tweak_power_plan | 0.40-0.55 | 19 | 0.4889 | 0.4211 | 0.5789 |
| tweak_power_plan | 0.55-0.62 | 6 | 0.5751 | 0.5000 | 0.5000 |
| tweak_power_plan | 0.62-0.75 | 41 | 0.7059 | 1.0000 | 1.0000 |
| tweak_power_plan | 0.75-0.90 | 80 | 0.8002 | 1.0000 | 1.0000 |
| tweak_priority | 0.00-0.40 | 182 | 0.2598 | 0.0714 | 0.9286 |
| tweak_priority | 0.40-0.55 | 86 | 0.4795 | 0.4302 | 0.5698 |
| tweak_priority | 0.55-0.62 | 39 | 0.5812 | 0.7692 | 0.2308 |
| tweak_priority | 0.62-0.75 | 56 | 0.6774 | 0.9286 | 0.9286 |
| tweak_priority | 0.75-0.90 | 19 | 0.7919 | 1.0000 | 1.0000 |
| tweak_recording_off | 0.00-0.40 | 164 | 0.2648 | 0.0610 | 0.9390 |
| tweak_recording_off | 0.40-0.55 | 108 | 0.4694 | 0.5093 | 0.4907 |
| tweak_recording_off | 0.55-0.62 | 31 | 0.5833 | 0.7742 | 0.2258 |
| tweak_recording_off | 0.62-0.75 | 50 | 0.6812 | 0.8600 | 0.8600 |
| tweak_recording_off | 0.75-0.90 | 18 | 0.7797 | 0.8333 | 0.8333 |
| tweak_service | 0.00-0.40 | 350 | 0.1794 | 0.0800 | 0.9200 |
| tweak_service | 0.40-0.55 | 32 | 0.4586 | 0.6562 | 0.3438 |
| tweak_service | 0.55-0.62 | 5 | 0.5814 | 1.0000 | 0.0000 |
| tweak_service | 0.62-0.75 | 4 | 0.6712 | 0.7500 | 0.7500 |

## Safety Behavior

- Recommendation confidence threshold: 0.62.
- Recommendation confidence is the classifier probability; it is not blended with accuracy heuristics.
- A tweak is not trained for recommendation unless its valid-pair count and out-of-fold precision, recall, F1, ROC-AUC, and PR-AUC pass release gates.
- Runtime metadata priors remain disabled without an independent external validation CSV.
- Active tweaks are not recommended again.
- Missing required feature columns are rejected instead of silently replaced with zero.

## Artifacts

- Model artifact source: `onnx-artifact`
- Runtime capability: `artifact-validation-only`
- ONNX exported: `True`
- ONNX path: `C:\Users\foxal.DESKTOP-N1GCIEU\Desktop\aeterna\ml\models\aeterna_fps_model.onnx`
- Joblib path: `C:\Users\foxal.DESKTOP-N1GCIEU\Desktop\aeterna\ml\models\aeterna_fps_model.joblib`
- Preprocessing included in ONNX: `True`
- ONNX raw input columns: `25`
- Demo examples: `5`

## Defense Position

The ONNX file is an offline FPS prediction artifact. Artifact validation is not runtime inference. Tweak priors are not released to the Rust recommendation path until independent validation exists and every released classifier passes its quality gate.

## Further Improvements

- Replace synthetic rows with repeated randomized PresentMon A/B sessions across games and hardware.
- Add temporal, leave-game-out, and leave-hardware-out evaluation once enough real data exists.
- Calibrate recommendation probabilities only on held-out real sessions.
- Add game-specific safety blocklists in the Rust sidecar before automated apply.
- Track per-hardware confidence drift and use versioned full retraining with a replayable dataset.
