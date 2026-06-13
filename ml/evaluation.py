from __future__ import annotations

import warnings
from typing import Any

import numpy as np
import pandas as pd
from sklearn.dummy import DummyRegressor
from sklearn.ensemble import RandomForestRegressor
from sklearn.linear_model import Ridge
from sklearn.metrics import (
    accuracy_score,
    average_precision_score,
    brier_score_loss,
    f1_score,
    mean_absolute_error,
    precision_score,
    r2_score,
    recall_score,
    roc_auc_score,
)
from sklearn.model_selection import GroupKFold, KFold, cross_val_predict
from sklearn.multioutput import MultiOutputRegressor
from sklearn.pipeline import Pipeline

from ml.dataset_loader import DatasetLoader, TARGET_COLUMNS


def metric_table(y_true: pd.DataFrame | np.ndarray, y_pred: np.ndarray, target_names: list[str] | None = None) -> dict[str, dict[str, float]]:
    y_true_array = np.asarray(y_true, dtype=float)
    y_pred_array = np.asarray(y_pred, dtype=float)
    names = target_names or (list(y_true.columns) if isinstance(y_true, pd.DataFrame) else TARGET_COLUMNS)
    metrics: dict[str, dict[str, float]] = {}
    for index, target in enumerate(names):
        actual = y_true_array[:, index]
        predicted = y_pred_array[:, index]
        mae = float(mean_absolute_error(actual, predicted))
        mape = float(np.mean(np.abs((actual - predicted) / np.clip(np.abs(actual), 1.0, None))) * 100.0)
        r2 = float(r2_score(actual, predicted))
        metrics[target] = {"mae": round(mae, 4), "mape": round(mape, 4), "r2": round(r2, 4)}
    return metrics


def benchmark_regressors(
    X: pd.DataFrame | np.ndarray,
    y: pd.DataFrame,
    groups: pd.Series | np.ndarray | None,
    cv: int,
    random_state: int,
    dataset_loader: DatasetLoader | None = None,
) -> dict[str, dict[str, dict[str, float]]]:
    estimators: dict[str, Any] = {
        "dummy_mean": DummyRegressor(strategy="mean"),
        "ridge": MultiOutputRegressor(Ridge(alpha=1.0, random_state=random_state)),
        "random_forest": RandomForestRegressor(
            n_estimators=180,
            min_samples_leaf=2,
            random_state=random_state,
            n_jobs=-1,
        ),
    }
    try:
        import lightgbm as lgb

        estimators["lightgbm"] = MultiOutputRegressor(
            lgb.LGBMRegressor(
                n_estimators=360,
                learning_rate=0.05,
                num_leaves=48,
                subsample=0.9,
                colsample_bytree=0.9,
                random_state=random_state,
                objective="regression",
                verbose=-1,
            )
        )
    except Exception:
        pass

    splitter, groups_array = _cv_splitter(cv, len(X), groups, random_state)
    results: dict[str, dict[str, dict[str, float]]] = {}
    for name, estimator in estimators.items():
        candidate: Any = estimator
        if isinstance(X, pd.DataFrame):
            if dataset_loader is None:
                raise ValueError("Raw feature benchmarking requires a DatasetLoader.")
            candidate = Pipeline(
                steps=[
                    ("preprocessor", dataset_loader.make_preprocessor()),
                    ("regressor", estimator),
                ]
            )
        with warnings.catch_warnings():
            warnings.filterwarnings("ignore", message="X does not have valid feature names")
            if groups_array is None:
                prediction = cross_val_predict(candidate, X, y.to_numpy(dtype=float), cv=splitter)
            else:
                prediction = cross_val_predict(
                    candidate,
                    X,
                    y.to_numpy(dtype=float),
                    cv=splitter,
                    groups=groups_array,
                )
        results[name] = metric_table(y, prediction, target_names=list(y.columns))
    return results


def select_best_regressor(
    baseline_metrics: dict[str, dict[str, dict[str, float]]],
    requested: str,
) -> str:
    if requested != "auto":
        return requested
    candidates = {name: values for name, values in baseline_metrics.items() if name != "dummy_mean"}
    if not candidates:
        return "lightgbm"
    summaries = {
        name: {
            "mae": float(np.mean([target_metrics.get("mae", 999.0) for target_metrics in values.values()])),
            "mape": float(np.mean([target_metrics.get("mape", 999.0) for target_metrics in values.values()])),
            "r2": float(np.mean([target_metrics.get("r2", -999.0) for target_metrics in values.values()])),
        }
        for name, values in candidates.items()
    }
    rank_totals = {name: 0 for name in candidates}
    for metric, reverse in (("mae", False), ("mape", False), ("r2", True)):
        ordered = sorted(
            summaries,
            key=lambda name: summaries[name][metric],
            reverse=reverse,
        )
        for rank, name in enumerate(ordered):
            rank_totals[name] += rank
    preference = {"ridge": 0, "lightgbm": 1, "catboost": 2, "random_forest": 3}
    best = min(
        candidates,
        key=lambda name: (
            rank_totals[name],
            summaries[name]["mape"],
            preference.get(name, 99),
        ),
    )
    if best == "random_forest":
        return "random_forest"
    if best == "ridge":
        return "ridge"
    if best == "lightgbm":
        return "lightgbm"
    return best


def evaluate_regressor_holdout(model: Any, X: np.ndarray, y: pd.DataFrame) -> dict[str, dict[str, float]]:
    return metric_table(y, model.predict(X), target_names=list(y.columns))


def evaluate_tweak_holdout(
    model: Any,
    X: np.ndarray,
    y_tweak: pd.DataFrame,
    threshold: float,
) -> dict[str, dict[str, float]]:
    if y_tweak.empty:
        return {}
    probabilities = model.predict_tweak_probabilities(X)
    metrics: dict[str, dict[str, float]] = {}
    for tweak in y_tweak.columns:
        if tweak not in probabilities:
            continue
        valid = y_tweak[tweak].notna().to_numpy()
        if not valid.any():
            continue
        y = y_tweak.loc[valid, tweak].astype(int).to_numpy()
        proba = probabilities.loc[valid, tweak].to_numpy(dtype=float)
        predicted = (proba >= threshold).astype(int)
        values = {
            "accuracy": round(float(accuracy_score(y, predicted)), 4),
            "f1": round(float(f1_score(y, predicted, zero_division=0)), 4),
            "precision": round(float(precision_score(y, predicted, zero_division=0)), 4),
            "recall": round(float(recall_score(y, predicted, zero_division=0)), 4),
            "pr_auc": round(float(average_precision_score(y, proba)), 4),
            "brier": round(float(brier_score_loss(y, proba)), 4),
            "positive_rate": round(float(y.mean()), 4),
            "valid_count": int(len(y)),
            "positive_count": int(y.sum()),
        }
        if len(np.unique(y)) > 1:
            values["roc_auc"] = round(float(roc_auc_score(y, proba)), 4)
        else:
            values["roc_auc"] = 0.5
        metrics[tweak] = values
    return metrics


def tweak_ablation_summary(gains: pd.DataFrame) -> dict[str, dict[str, float]]:
    summary: dict[str, dict[str, float]] = {}
    for tweak in gains.columns:
        series = gains[tweak].dropna().astype(float)
        if series.empty:
            summary[tweak] = {
                "mean_gain_pct": 0.0,
                "positive_mean_gain_pct": 0.0,
                "p75_gain_pct": 0.0,
                "useful_rate": 0.0,
                "paired_count": 0,
            }
            continue
        positive = series[series > 0]
        useful = series[series >= 0.05]
        summary[tweak] = {
            "mean_gain_pct": round(float(series.mean() * 100.0), 3),
            "positive_mean_gain_pct": round(float(positive.mean() * 100.0), 3) if not positive.empty else 0.0,
            "p75_gain_pct": round(float(series.quantile(0.75) * 100.0), 3),
            "useful_rate": round(float(len(useful) / max(len(series), 1)), 4),
            "paired_count": int(len(series)),
        }
    return dict(sorted(summary.items(), key=lambda item: item[1]["positive_mean_gain_pct"], reverse=True))


def demo_predictions(model: Any, raw_frame: pd.DataFrame, limit: int = 5) -> list[dict[str, Any]]:
    if raw_frame.empty:
        return []
    baseline = raw_frame[raw_frame.filter(like="tweak_").sum(axis=1) == 0] if any(column.startswith("tweak_") for column in raw_frame.columns) else raw_frame
    sample = baseline.head(limit) if not baseline.empty else raw_frame.head(limit)
    rows: list[dict[str, Any]] = []
    for _, item in sample.iterrows():
        features = item.to_dict()
        rows.append(
            {
                "input": {
                    "game_id": features.get("game_id"),
                    "cpu_model": features.get("cpu_model"),
                    "gpu_model": features.get("gpu_model"),
                    "resolution": features.get("resolution"),
                    "graphics_preset": features.get("graphics_preset"),
                },
                "fps_prediction": model.predict_fps(features),
                "tweak_recommendation": model.recommend_tweaks(features),
            }
        )
    return rows


def _cv_splitter(
    cv: int,
    n_rows: int,
    groups: pd.Series | np.ndarray | None,
    random_state: int,
) -> tuple[Any, np.ndarray | None]:
    if groups is not None:
        groups_array = np.asarray(groups)
        unique_groups = np.unique(groups_array)
        if len(unique_groups) >= 2:
            return GroupKFold(n_splits=min(cv, len(unique_groups))), groups_array
    return KFold(n_splits=min(cv, n_rows), shuffle=True, random_state=random_state), None
