from __future__ import annotations

import numpy as np
import pandas as pd
import pytest

from ml.aeterna_model import AeternaModel
from ml.dataset_loader import DatasetLoader
from ml.evaluation import select_best_regressor


def paired_frame() -> pd.DataFrame:
    rows = [
        {
            "session_config_id": "cfg-a",
            "game_id": "cs2",
            "ram_gb": 16,
            "background_process_count": 40,
            "tweak_power_plan": 0,
            "tweak_hags": 0,
            "mean_fps": 100.0,
            "fps_1pct": 70.0,
            "cpu_util": 80.0,
        },
        {
            "session_config_id": "cfg-a",
            "game_id": "cs2",
            "ram_gb": 16,
            "background_process_count": 40,
            "tweak_power_plan": 1,
            "tweak_hags": 0,
            "mean_fps": 108.0,
            "fps_1pct": 76.0,
            "cpu_util": 72.0,
        },
        {
            "session_config_id": "cfg-b",
            "game_id": "cs2",
            "ram_gb": 16,
            "background_process_count": 40,
            "tweak_power_plan": 0,
            "tweak_hags": 0,
            "mean_fps": 100.0,
            "fps_1pct": 70.0,
            "cpu_util": 80.0,
        },
    ]
    return pd.DataFrame(rows)


def test_tweak_labels_only_exist_for_measured_baseline_counterfactuals() -> None:
    loader = DatasetLoader()
    frame = paired_frame()

    labels, gains = loader.derive_tweak_labels(frame, min_gain=0.05)

    assert labels.loc[0, "tweak_power_plan"] == 1
    assert gains.loc[0, "tweak_power_plan"] == pytest.approx(0.08)
    assert np.isnan(labels.loc[1, "tweak_power_plan"])
    assert np.isnan(labels.loc[2, "tweak_power_plan"])
    assert labels["tweak_hags"].isna().all()


def test_recommendation_feature_contract_excludes_interventions_and_outcomes() -> None:
    loader = DatasetLoader(include_tweaks=False)
    loaded = loader.fit_transform(paired_frame())

    assert not any(column.startswith("tweak_") for column in loaded.feature_frame.columns)
    assert "cpu_util" not in loaded.feature_frame.columns
    assert "mean_fps" not in loaded.feature_frame.columns
    assert loader.feature_schema()["prediction_moment"] == "before applying the candidate tweak"


def test_missing_required_feature_is_rejected_instead_of_zero_filled() -> None:
    loader = DatasetLoader(include_tweaks=False)
    loader.fit_transform(paired_frame())

    with pytest.raises(ValueError, match="missing columns"):
        loader.transform_features({"game_id": "cs2"})


def test_release_gate_rejects_accurate_but_useless_classifier() -> None:
    gate = AeternaModel._tweak_release_gate(
        {
            "valid_count": 200,
            "positive_count": 10,
            "precision": 0.0,
            "recall": 0.0,
            "f1": 0.0,
            "roc_auc": 0.5,
            "pr_auc": 0.05,
            "positive_rate": 0.05,
        }
    )

    assert gate["enabled"] is False
    assert {"precision", "recall", "f1", "roc_auc", "pr_auc"}.issubset(gate["failed_checks"])


def test_internal_only_classifier_cannot_emit_runtime_recommendation() -> None:
    model = AeternaModel()
    model.tweak_classifiers = {"tweak_power_plan": object()}
    model.tweak_release_gates = {"tweak_power_plan": {"enabled": True}}

    result = model.recommend_tweaks({})

    assert result["recommendations"] == []
    assert result["abstained"] is True
    assert "external validation" in result["reason"]


def test_regressor_selection_uses_multiple_quality_metrics() -> None:
    metrics = {
        "dummy_mean": {
            "mean_fps": {"mae": 40.0, "mape": 40.0, "r2": 0.0},
            "fps_1pct": {"mae": 32.0, "mape": 40.0, "r2": 0.0},
        },
        "ridge": {
            "mean_fps": {"mae": 20.0, "mape": 21.0, "r2": 0.71},
            "fps_1pct": {"mae": 16.0, "mape": 21.5, "r2": 0.70},
        },
        "lightgbm": {
            "mean_fps": {"mae": 21.5, "mape": 20.3, "r2": 0.67},
            "fps_1pct": {"mae": 17.5, "mape": 20.7, "r2": 0.66},
        },
    }

    assert select_best_regressor(metrics, "auto") == "ridge"
