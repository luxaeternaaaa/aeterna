from __future__ import annotations

import json
import warnings
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import joblib
import numpy as np
import pandas as pd
from sklearn.calibration import CalibratedClassifierCV
from sklearn.ensemble import RandomForestClassifier, RandomForestRegressor
from sklearn.linear_model import LogisticRegression, Ridge
from sklearn.metrics import (
    average_precision_score,
    brier_score_loss,
    mean_absolute_error,
    precision_score,
    r2_score,
    recall_score,
)
from sklearn.model_selection import GroupKFold, KFold, StratifiedKFold, cross_val_predict
from sklearn.multioutput import MultiOutputRegressor
from sklearn.pipeline import Pipeline

from ml.dataset_loader import DatasetLoader, FEATURE_SCHEMA_VERSION, TARGET_COLUMNS


MODEL_VERSION = "aeterna-fps-v2"

RECOMMENDATION_REASONS = {
    "tweak_priority": "Foreground scheduling pressure is likely limiting frame delivery.",
    "tweak_affinity": "CPU contention pattern suggests affinity can improve frame pacing.",
    "tweak_power_plan": "Sustained clocks are likely to improve average and 1pct FPS.",
    "tweak_registry_preset": "Safe gaming registry preset can reduce scheduling and background noise.",
    "tweak_service": "Background service pressure is high enough to justify safe service reduction.",
    "tweak_hags": "GPU-bound modern hardware is likely to benefit from HAGS.",
    "tweak_game_mode": "Windows game scheduling signals are favorable for Game Mode.",
    "tweak_recording_off": "Capture/recording overhead is likely to reduce GPU headroom.",
    "tweak_low_timer_resolution": "Frame pacing pressure is high enough for a timer-resolution tweak.",
}


class ConstantBinaryClassifier:
    def __init__(self, value: int) -> None:
        self.value = int(value)

    def fit(self, X: np.ndarray, y: np.ndarray) -> "ConstantBinaryClassifier":
        return self

    def predict_proba(self, X: np.ndarray) -> np.ndarray:
        positive = np.full((X.shape[0],), float(self.value), dtype=float)
        return np.column_stack([1.0 - positive, positive])


class AeternaModel:
    """Regression and safe-tweak recommendation bundle for Aeterna."""

    def __init__(
        self,
        dataset_loader: DatasetLoader | None = None,
        tweak_dataset_loader: DatasetLoader | None = None,
        confidence_threshold: float = 0.62,
        random_state: int = 17,
        regressor_kind: str = "lightgbm",
    ) -> None:
        self.dataset_loader = dataset_loader
        self.tweak_dataset_loader = tweak_dataset_loader
        self.confidence_threshold = confidence_threshold
        self.random_state = random_state
        self.regressor_kind = regressor_kind
        self.regressor: Any | None = None
        self.regressor_family = "untrained"
        self.tweak_classifiers: dict[str, Any] = {}
        self.tweak_selectors: dict[str, None] = {}
        self.tweak_fallback_classifiers: dict[str, Any] = {}
        self.tweak_gain_priors: dict[str, float] = {}
        self.feature_names: list[str] = []
        self.target_names: list[str] = TARGET_COLUMNS.copy()
        self.metrics: dict[str, float] = {}
        self.detailed_metrics: dict[str, dict[str, float]] = {}
        self.tweak_metrics: dict[str, dict[str, float]] = {}
        self.tweak_reliability: dict[str, list[dict[str, float | int]]] = {}
        self.tweak_release_gates: dict[str, dict[str, Any]] = {}
        self.training_data_origin = "unknown"
        self.external_validation_present = False
        self.n_features_in_: int = 0

    def fit(
        self,
        X: np.ndarray,
        y_reg: pd.DataFrame | np.ndarray,
        y_tweak: pd.DataFrame | np.ndarray | None = None,
        tweak_gains: pd.DataFrame | None = None,
        X_tweak: np.ndarray | None = None,
    ) -> "AeternaModel":
        X = np.asarray(X, dtype=np.float32)
        y_reg_array = np.asarray(y_reg, dtype=np.float32)
        self.n_features_in_ = X.shape[1]
        self.feature_names = self._resolve_feature_names()
        self.target_names = list(y_reg.columns) if isinstance(y_reg, pd.DataFrame) else TARGET_COLUMNS.copy()

        self.regressor, self.regressor_family = self._build_regressor()
        self.regressor.fit(X, y_reg_array)

        if y_tweak is not None:
            y_tweak_frame = self._as_tweak_frame(y_tweak)
            tweak_matrix = np.asarray(X_tweak if X_tweak is not None else X, dtype=np.float32)
            for tweak in y_tweak_frame.columns:
                valid = y_tweak_frame[tweak].notna().to_numpy()
                if not valid.any():
                    continue
                gate = self.tweak_release_gates.get(
                    tweak,
                    {
                        "enabled": False,
                        "reason": "Classifier was not evaluated with out-of-fold predictions.",
                    },
                )
                if not gate.get("enabled", False):
                    continue
                y = y_tweak_frame.loc[valid, tweak].astype(int).to_numpy()
                selector, classifier, fallback = self._fit_tweak_classifier(tweak_matrix[valid], y)
                self.tweak_selectors[tweak] = selector
                self.tweak_classifiers[tweak] = classifier
                self.tweak_fallback_classifiers[tweak] = fallback
                if tweak_gains is not None and tweak in tweak_gains.columns:
                    gains = tweak_gains.loc[valid, tweak].dropna().astype(float)
                    positive_gains = gains[gains >= 0.0]
                    self.tweak_gain_priors[tweak] = float(positive_gains.median()) if not positive_gains.empty else 0.0
                else:
                    self.tweak_gain_priors[tweak] = float(y.mean()) * 0.08
        return self

    def predict_fps(self, input_features: dict[str, Any] | list[dict[str, Any]] | pd.DataFrame | np.ndarray) -> dict[str, Any] | list[dict[str, Any]]:
        if self.regressor is None:
            raise RuntimeError("AeternaModel must be fitted before predict_fps().")
        X = self._matrix(input_features)
        with warnings.catch_warnings():
            warnings.filterwarnings("ignore", message="X does not have valid feature names")
            predictions = np.asarray(self.regressor.predict(X), dtype=float)
        if predictions.ndim == 1:
            predictions = predictions.reshape(-1, len(self.target_names))
        confidence = self._regression_confidence()
        rows = [
            {
                "mean_fps": round(float(row[0]), 2),
                "fps_1pct": round(float(row[1]), 2) if len(row) > 1 else None,
                "confidence": confidence,
                "model_version": MODEL_VERSION,
                "model_source": self.regressor_family,
            }
            for row in predictions
        ]
        return rows[0] if self._is_single_input(input_features) else rows

    def recommend_tweaks(
        self,
        input_features: dict[str, Any] | list[dict[str, Any]] | pd.DataFrame | np.ndarray,
    ) -> dict[str, Any]:
        if not self.tweak_classifiers:
            return {
                "recommendations": [],
                "confidence": 0.0,
                "threshold": self.confidence_threshold,
                "abstained": True,
                "reason": "No tweak classifiers are trained.",
            }
        released_tweaks = self._released_tweaks()
        if not released_tweaks:
            return {
                "recommendations": [],
                "confidence": 0.0,
                "threshold": self.confidence_threshold,
                "abstained": True,
                "reason": "Tweak recommendations are not released without independent external validation.",
                "model_version": MODEL_VERSION,
            }
        X = self._tweak_matrix(input_features)
        if X.shape[0] != 1:
            raise ValueError("recommend_tweaks() expects one configuration at a time.")

        active_tweaks = self._active_tweaks(input_features)
        recommendations: list[dict[str, Any]] = []
        max_confidence = 0.0
        for tweak, classifier in self.tweak_classifiers.items():
            if tweak not in released_tweaks:
                continue
            if active_tweaks.get(tweak, 0) == 1:
                continue
            probability = self._positive_probability(classifier, X)
            confidence = probability
            max_confidence = max(max_confidence, confidence)
            if probability < self.confidence_threshold:
                continue
            recommendations.append(
                {
                    "tweak": tweak,
                    "confidence": round(confidence, 3),
                    "expected_gain_pct": round(self.tweak_gain_priors.get(tweak, 0.0) * 100.0, 2),
                    "reason": RECOMMENDATION_REASONS.get(tweak, "Safe tweak has a positive learned FPS signal."),
                }
            )

        recommendations.sort(key=lambda item: (item["confidence"], item["expected_gain_pct"]), reverse=True)
        return {
            "recommendations": recommendations,
            "confidence": round(max_confidence, 3),
            "threshold": self.confidence_threshold,
            "abstained": len(recommendations) == 0,
            "model_version": MODEL_VERSION,
        }

    def predict_tweak_probabilities(
        self,
        input_features: dict[str, Any] | list[dict[str, Any]] | pd.DataFrame | np.ndarray,
    ) -> pd.DataFrame:
        if not self.tweak_classifiers:
            return pd.DataFrame()
        X = self._tweak_matrix(input_features)
        values: dict[str, np.ndarray] = {}
        for tweak, classifier in self.tweak_classifiers.items():
            probabilities = classifier.predict_proba(X)
            values[tweak] = probabilities[:, 1] if probabilities.shape[1] > 1 else probabilities[:, 0]
        return pd.DataFrame(values)

    def evaluate_regression_cv(
        self,
        X: pd.DataFrame | np.ndarray,
        y_reg: pd.DataFrame | np.ndarray,
        cv: int = 5,
        groups: np.ndarray | pd.Series | None = None,
    ) -> dict[str, dict[str, float]]:
        y = np.asarray(y_reg, dtype=np.float32)
        estimator, _ = self._build_regressor()
        if isinstance(X, pd.DataFrame):
            if self.dataset_loader is None:
                raise RuntimeError("Raw regression CV requires a DatasetLoader.")
            estimator = Pipeline(
                steps=[
                    ("preprocessor", self.dataset_loader.make_preprocessor()),
                    ("regressor", estimator),
                ]
            )
            X_values: Any = X
        else:
            X_values = np.asarray(X, dtype=np.float32)
        folds, groups_array = self._cv_splitter(cv, len(X_values), groups)
        prediction = self._cross_val_predict(estimator, X_values, y, folds, groups_array)
        target_names = list(y_reg.columns) if isinstance(y_reg, pd.DataFrame) else TARGET_COLUMNS.copy()
        metrics: dict[str, dict[str, float]] = {}
        flat_metrics: dict[str, float] = {}
        for index, target in enumerate(target_names):
            actual = y[:, index]
            predicted = prediction[:, index]
            mae = float(mean_absolute_error(actual, predicted))
            mape = float(np.mean(np.abs((actual - predicted) / np.clip(np.abs(actual), 1.0, None))) * 100.0)
            r2 = float(r2_score(actual, predicted))
            metrics[target] = {"mae": round(mae, 4), "mape": round(mape, 4), "r2": round(r2, 4)}
            flat_metrics[f"{target}_mae"] = round(mae, 4)
            flat_metrics[f"{target}_mape"] = round(mape, 4)
            flat_metrics[f"{target}_r2"] = round(r2, 4)
        self.detailed_metrics = metrics
        self.metrics.update(flat_metrics)
        return metrics

    def evaluate_tweak_cv(
        self,
        X: pd.DataFrame | np.ndarray,
        y_tweak: pd.DataFrame,
        cv: int = 5,
        groups: np.ndarray | pd.Series | None = None,
    ) -> dict[str, dict[str, float]]:
        from sklearn.metrics import accuracy_score, f1_score, roc_auc_score

        metrics: dict[str, dict[str, float]] = {}
        reliability: dict[str, list[dict[str, float | int]]] = {}
        release_gates: dict[str, dict[str, Any]] = {}
        for tweak in y_tweak.columns:
            valid = y_tweak[tweak].notna().to_numpy()
            valid_count = int(valid.sum())
            if valid_count == 0:
                metrics[tweak] = self._empty_tweak_metrics()
                reliability[tweak] = []
                release_gates[tweak] = self._tweak_release_gate(metrics[tweak])
                continue
            y = y_tweak.loc[valid, tweak].astype(int).to_numpy()
            X_valid: Any
            if isinstance(X, pd.DataFrame):
                X_valid = X.loc[valid].reset_index(drop=True)
            else:
                X_valid = np.asarray(X, dtype=np.float32)[valid]
            groups_valid = np.asarray(groups)[valid] if groups is not None else None
            if len(np.unique(y)) < 2:
                metrics[tweak] = self._empty_tweak_metrics(valid_count, int(y.sum()), float(y.mean()))
                reliability[tweak] = []
                release_gates[tweak] = self._tweak_release_gate(metrics[tweak])
                continue
            min_class_count = int(np.bincount(y).min())
            if min_class_count < 2:
                metrics[tweak] = self._empty_tweak_metrics(valid_count, int(y.sum()), float(y.mean()))
                reliability[tweak] = []
                release_gates[tweak] = self._tweak_release_gate(metrics[tweak])
                continue
            base_classifier = RandomForestClassifier(
                n_estimators=120,
                min_samples_leaf=3,
                class_weight="balanced",
                random_state=self.random_state,
                n_jobs=-1,
            )
            classifier: Any = base_classifier
            if isinstance(X_valid, pd.DataFrame):
                if self.tweak_dataset_loader is None:
                    raise RuntimeError("Raw tweak CV requires a tweak DatasetLoader.")
                classifier = Pipeline(
                    steps=[
                        ("preprocessor", self.tweak_dataset_loader.make_preprocessor()),
                        ("classifier", base_classifier),
                    ]
                )
            folds, groups_array = self._cv_splitter(
                min(cv, min_class_count),
                len(X_valid),
                groups_valid,
                stratified_target=y,
            )
            try:
                probabilities = self._cross_val_predict(
                    classifier,
                    X_valid,
                    y,
                    folds,
                    groups_array,
                    method="predict_proba",
                )[:, 1]
            except ValueError:
                folds, groups_array = self._cv_splitter(
                    min(cv, min_class_count),
                    len(X_valid),
                    None,
                    stratified_target=y,
                )
                probabilities = self._cross_val_predict(
                    classifier,
                    X_valid,
                    y,
                    folds,
                    groups_array,
                    method="predict_proba",
                )[:, 1]
            predicted = (probabilities >= self.confidence_threshold).astype(int)
            metrics[tweak] = {
                "accuracy": round(float(accuracy_score(y, predicted)), 4),
                "f1": round(float(f1_score(y, predicted, zero_division=0)), 4),
                "precision": round(float(precision_score(y, predicted, zero_division=0)), 4),
                "recall": round(float(recall_score(y, predicted, zero_division=0)), 4),
                "roc_auc": round(float(roc_auc_score(y, probabilities)), 4),
                "pr_auc": round(float(average_precision_score(y, probabilities)), 4),
                "brier": round(float(brier_score_loss(y, probabilities)), 4),
                "positive_rate": round(float(y.mean()), 4),
                "valid_count": valid_count,
                "positive_count": int(y.sum()),
            }
            reliability[tweak] = self._reliability_buckets(y, probabilities)
            release_gates[tweak] = self._tweak_release_gate(metrics[tweak])
        self.tweak_metrics = metrics
        self.tweak_reliability = reliability
        self.tweak_release_gates = release_gates
        return metrics

    def fit_incremental(
        self,
        X_new: np.ndarray,
        y_reg_new: pd.DataFrame | np.ndarray,
        y_tweak_new: pd.DataFrame | np.ndarray | None = None,
    ) -> "AeternaModel":
        raise RuntimeError(
            "Incremental updates are disabled. Build a versioned full training dataset "
            "and run a complete refit so historical behavior is not forgotten."
        )

    def apply_external_tweak_validation(
        self,
        metrics: dict[str, dict[str, float]],
    ) -> None:
        self.external_validation_present = bool(metrics)
        for tweak, internal_gate in self.tweak_release_gates.items():
            external_metrics = metrics.get(tweak)
            external_gate = (
                self._tweak_release_gate(external_metrics)
                if external_metrics is not None
                else {
                    "enabled": False,
                    "checks": {},
                    "failed_checks": ["missing_external_validation"],
                    "reason": "No external validation rows were available.",
                }
            )
            internal_gate["internal_enabled"] = bool(internal_gate.get("enabled", False))
            internal_gate["external"] = external_gate
            internal_gate["enabled"] = bool(internal_gate["internal_enabled"] and external_gate["enabled"])
            if not internal_gate["enabled"]:
                internal_gate["reason"] = (
                    f"Internal: {internal_gate.get('reason', 'unknown')} "
                    f"External: {external_gate.get('reason', 'unknown')}"
                )

    def save_to_onnx(self, path: str | Path) -> dict[str, Any]:
        path = Path(path)
        path.parent.mkdir(parents=True, exist_ok=True)
        joblib_path = path.with_suffix(".joblib")
        metadata_path = path.with_suffix(".metadata.json")
        export_model = self._onnx_export_model()
        joblib.dump(self, joblib_path)

        onnx_saved = False
        onnx_error = None
        preprocessing_included = self._onnx_preprocessing_included()
        initial_types: list[tuple[str, Any]] = []
        try:
            from skl2onnx import convert_sklearn
            from skl2onnx.common.data_types import FloatTensorType, StringTensorType

            initial_types = self._onnx_initial_types(FloatTensorType, StringTensorType)
            onnx_model = convert_sklearn(
                export_model,
                initial_types=initial_types,
                target_opset=15,
            )
            path.write_bytes(onnx_model.SerializeToString())
            onnx_saved = True
        except Exception as exc:
            onnx_error = str(exc)
            try:
                import onnxmltools
                from onnxmltools.convert.common.data_types import FloatTensorType as OnnxToolsFloatTensorType
                from onnxmltools.convert.common.data_types import StringTensorType as OnnxToolsStringTensorType

                initial_types = self._onnx_initial_types(OnnxToolsFloatTensorType, OnnxToolsStringTensorType)
                onnx_model = onnxmltools.convert_sklearn(
                    export_model,
                    initial_types=initial_types,
                    target_opset=15,
                )
                path.write_bytes(onnx_model.SerializeToString())
                onnx_saved = True
                onnx_error = None
            except Exception as fallback_exc:
                onnx_error = f"{onnx_error}; onnxmltools fallback: {fallback_exc}"

        metadata = self._metadata(path, joblib_path, onnx_saved, onnx_error)
        metadata["onnx_input_schema"] = self._onnx_input_schema()
        metadata["preprocessing"] = {
            "included_in_onnx": preprocessing_included and onnx_saved,
            "source": "DatasetLoader ColumnTransformer",
            "categorical_columns": self.dataset_loader.categorical_columns_ if self.dataset_loader else [],
            "numeric_columns": self.dataset_loader.numeric_columns_ if self.dataset_loader else [],
            "raw_feature_columns": self.dataset_loader.feature_columns_ if self.dataset_loader else [],
            "transformed_feature_names": self.feature_names,
        }
        metadata["feature_schema"] = {
            "version": FEATURE_SCHEMA_VERSION,
            "fps": self.dataset_loader.feature_schema() if self.dataset_loader else None,
            "tweak_recommendation": (
                self.tweak_dataset_loader.feature_schema() if self.tweak_dataset_loader else None
            ),
        }
        metadata_path.write_text(json.dumps(metadata, indent=2), encoding="utf-8")
        return metadata

    def _onnx_export_model(self) -> Any:
        if self._onnx_preprocessing_included():
            return Pipeline(
                steps=[
                    ("preprocessor", self.dataset_loader.preprocessor),
                    ("regressor", self.regressor),
                ]
            )
        return self.regressor

    def _onnx_preprocessing_included(self) -> bool:
        return self.dataset_loader is not None and self.dataset_loader.preprocessor is not None

    def _onnx_initial_types(self, float_type: Any, string_type: Any) -> list[tuple[str, Any]]:
        if not self._onnx_preprocessing_included():
            return [("features", float_type([None, self.n_features_in_]))]
        initial_types: list[tuple[str, Any]] = []
        assert self.dataset_loader is not None
        for column in self.dataset_loader.feature_columns_:
            tensor_type = string_type if column in self.dataset_loader.categorical_columns_ else float_type
            initial_types.append((column, tensor_type([None, 1])))
        return initial_types

    def _onnx_input_schema(self) -> list[dict[str, str]]:
        if not self._onnx_preprocessing_included():
            return [{"name": "features", "dtype": "float32", "shape": "[N, transformed_feature_count]"}]
        assert self.dataset_loader is not None
        return [
            {
                "name": column,
                "dtype": "string" if column in self.dataset_loader.categorical_columns_ else "float32",
                "shape": "[N, 1]",
            }
            for column in self.dataset_loader.feature_columns_
        ]

    @classmethod
    def load(cls, path: str | Path) -> "AeternaModel":
        return joblib.load(path)

    def _build_regressor(self) -> tuple[Any, str]:
        if self.regressor_kind == "ridge":
            return MultiOutputRegressor(Ridge(alpha=1.0, random_state=self.random_state)), "ridge"
        if self.regressor_kind == "random_forest":
            return (
                RandomForestRegressor(
                    n_estimators=260,
                    min_samples_leaf=2,
                    random_state=self.random_state,
                    n_jobs=-1,
                ),
                "sklearn-random-forest",
            )
        try:
            import lightgbm as lgb

            if self.regressor_kind in {"lightgbm", "auto"}:
                base = lgb.LGBMRegressor(
                    n_estimators=420,
                    learning_rate=0.045,
                    num_leaves=48,
                    subsample=0.9,
                    colsample_bytree=0.9,
                    random_state=self.random_state,
                    objective="regression",
                    verbose=-1,
                )
                return MultiOutputRegressor(base), "lightgbm"
        except Exception:
            pass
        try:
            from catboost import CatBoostRegressor

            if self.regressor_kind in {"catboost", "auto"}:
                base = CatBoostRegressor(
                    iterations=420,
                    depth=7,
                    learning_rate=0.05,
                    loss_function="RMSE",
                    random_seed=self.random_state,
                    verbose=False,
                )
                return MultiOutputRegressor(base), "catboost"
        except Exception:
            pass
        return (
            RandomForestRegressor(
                n_estimators=260,
                min_samples_leaf=2,
                random_state=self.random_state,
                n_jobs=-1,
            ),
            "sklearn-random-forest",
        )

    def _fit_tweak_classifier(self, X: np.ndarray, y: np.ndarray) -> tuple[None, Any, Any]:
        if len(np.unique(y)) < 2:
            constant = ConstantBinaryClassifier(int(y[0]) if len(y) else 0)
            return None, constant, constant

        base_classifier = RandomForestClassifier(
            n_estimators=220,
            min_samples_leaf=3,
            class_weight="balanced",
            random_state=self.random_state,
            n_jobs=-1,
        )
        min_class_count = int(np.bincount(y).min())
        if min_class_count >= 3:
            classifier = CalibratedClassifierCV(
                estimator=base_classifier,
                method="sigmoid",
                cv=min(3, min_class_count),
            )
        else:
            classifier = base_classifier
        classifier.fit(X, y)

        fallback = LogisticRegression(max_iter=600, class_weight="balanced", random_state=self.random_state)
        fallback.fit(X, y)
        return None, classifier, fallback

    def _matrix(self, input_features: dict[str, Any] | list[dict[str, Any]] | pd.DataFrame | np.ndarray) -> np.ndarray:
        if isinstance(input_features, np.ndarray):
            return np.asarray(input_features, dtype=np.float32)
        if self.dataset_loader is None:
            raise RuntimeError("Raw feature prediction requires a fitted DatasetLoader.")
        return self.dataset_loader.transform_features(input_features)

    def _tweak_matrix(
        self,
        input_features: dict[str, Any] | list[dict[str, Any]] | pd.DataFrame | np.ndarray,
    ) -> np.ndarray:
        if isinstance(input_features, np.ndarray):
            return np.asarray(input_features, dtype=np.float32)
        loader = self.tweak_dataset_loader or self.dataset_loader
        if loader is None:
            raise RuntimeError("Raw tweak prediction requires a fitted DatasetLoader.")
        return loader.transform_features(input_features)

    def _active_tweaks(self, input_features: Any) -> dict[str, int]:
        if isinstance(input_features, dict):
            return {key: int(input_features.get(key, 0) or 0) for key in self.tweak_classifiers}
        if isinstance(input_features, pd.DataFrame) and len(input_features) == 1:
            row = input_features.iloc[0]
            return {key: int(row.get(key, 0) or 0) for key in self.tweak_classifiers}
        return {key: 0 for key in self.tweak_classifiers}

    def _released_tweaks(self) -> set[str]:
        if not self.external_validation_present:
            return set()
        return {
            tweak
            for tweak, gate in self.tweak_release_gates.items()
            if bool(gate.get("enabled", False)) and tweak in self.tweak_classifiers
        }

    def _as_tweak_frame(self, y_tweak: pd.DataFrame | np.ndarray) -> pd.DataFrame:
        if isinstance(y_tweak, pd.DataFrame):
            return y_tweak
        columns = [f"tweak_{index}" for index in range(np.asarray(y_tweak).shape[1])]
        return pd.DataFrame(y_tweak, columns=columns)

    def _resolve_feature_names(self) -> list[str]:
        if self.dataset_loader is not None and self.dataset_loader.feature_names_:
            return self.dataset_loader.feature_names_
        return [f"feature_{index}" for index in range(self.n_features_in_)]

    def _positive_probability(self, classifier: Any, X: np.ndarray) -> float:
        probabilities = classifier.predict_proba(X)
        if probabilities.shape[1] == 1:
            return float(probabilities[0, 0])
        return float(probabilities[0, 1])

    def _regression_confidence(self) -> float:
        mape_values = [value for key, value in self.metrics.items() if key.endswith("_mape")]
        if not mape_values:
            return 0.72
        mean_mape = float(np.mean(mape_values))
        return round(float(np.clip(1.0 - mean_mape / 100.0, 0.35, 0.96)), 3)

    def _feature_importance(self) -> dict[str, float]:
        names = self.feature_names or [f"feature_{index}" for index in range(self.n_features_in_)]
        importances = np.zeros((len(names),), dtype=float)
        model = self.regressor
        if hasattr(model, "feature_importances_"):
            importances = np.asarray(model.feature_importances_, dtype=float)
        elif hasattr(model, "estimators_"):
            values = []
            for estimator in model.estimators_:
                if hasattr(estimator, "feature_importances_"):
                    values.append(np.asarray(estimator.feature_importances_, dtype=float))
                elif hasattr(estimator, "coef_"):
                    values.append(np.abs(np.asarray(estimator.coef_, dtype=float)).reshape(-1))
            if values:
                importances = np.mean(values, axis=0)
        total = float(importances.sum()) or 1.0
        weighted = {name: round(float(value / total), 6) for name, value in zip(names, importances)}
        return dict(sorted(weighted.items(), key=lambda item: item[1], reverse=True)[:80])

    def _metadata(self, onnx_path: Path, joblib_path: Path, onnx_saved: bool, onnx_error: str | None) -> dict[str, Any]:
        weights = self._feature_importance()
        top_features = list(weights)[:8]
        model_source = "onnx-artifact" if onnx_saved else "joblib-artifact"
        released_tweaks = [
            tweak
            for tweak, gate in self.tweak_release_gates.items()
            if gate.get("enabled", False)
        ]
        recommendation_release_enabled = self.external_validation_present and bool(released_tweaks)
        return {
            "version": MODEL_VERSION,
            "updated_at": datetime.now(timezone.utc).isoformat(),
            "model_source": model_source,
            "runtime_capability": "artifact-validation-only",
            "training_data_origin": self.training_data_origin,
            "metrics": self.metrics or {"mean_fps_mae": 0.0, "fps_1pct_mae": 0.0},
            "weights": weights,
            "intercept": 0.0,
            "shap_preview": [f"Global feature importance: {feature}." for feature in top_features[:4]],
            "explanation_type": "global_feature_importance_not_shap",
            "recommendation_map": {key: [value] for key, value in RECOMMENDATION_REASONS.items()},
            "targets": self.target_names,
            "regressor_family": self.regressor_family,
            "feature_names": self.feature_names,
            "tweak_columns": list(self.tweak_metrics),
            "trained_tweak_columns": list(self.tweak_classifiers),
            "tweak_gain_priors": self.tweak_gain_priors,
            "tweak_metrics": self.tweak_metrics,
            "tweak_reliability": self.tweak_reliability,
            "tweak_release_gates": self.tweak_release_gates,
            "recommendation_release": {
                "enabled": recommendation_release_enabled,
                "released_tweaks": released_tweaks if recommendation_release_enabled else [],
                "requires_external_validation": True,
                "external_validation_present": self.external_validation_present,
                "reason": (
                    "Externally validated classifiers passed release gates."
                    if recommendation_release_enabled
                    else "Synthetic or internally cross-validated priors are not released to runtime."
                ),
            },
            "detailed_metrics": self.detailed_metrics,
            "confidence_threshold": self.confidence_threshold,
            "artifacts": {
                "onnx_path": str(onnx_path),
                "joblib_path": str(joblib_path),
                "onnx_exported": onnx_saved,
                "onnx_error": onnx_error,
            },
            "fallback": {
                "type": "logistic_regression_per_tweak",
                "available": bool(self.tweak_fallback_classifiers),
                "reason": "Stored for offline comparison; runtime release still requires external validation.",
            },
            "retraining": {
                "strategy": "full versioned refit",
                "incremental_learning_supported": False,
                "reason": "Warm updates without a replay dataset are not considered safe model updates.",
            },
            "examples": [
                {
                    "game_id": "cs2",
                    "resolution": "1920x1080",
                    "graphics_preset": "medium",
                    "tweak_priority": 0,
                    "tweak_power_plan": 0,
                }
            ],
        }

    @staticmethod
    def _empty_tweak_metrics(
        valid_count: int = 0,
        positive_count: int = 0,
        positive_rate: float = 0.0,
    ) -> dict[str, float]:
        return {
            "accuracy": 0.0,
            "f1": 0.0,
            "precision": 0.0,
            "recall": 0.0,
            "roc_auc": 0.5,
            "pr_auc": 0.0,
            "brier": 1.0,
            "positive_rate": round(float(positive_rate), 4),
            "valid_count": valid_count,
            "positive_count": positive_count,
        }

    @staticmethod
    def _tweak_release_gate(metrics: dict[str, float]) -> dict[str, Any]:
        checks = {
            "valid_count": metrics.get("valid_count", 0) >= 80,
            "positive_count": metrics.get("positive_count", 0) >= 8,
            "precision": metrics.get("precision", 0.0) >= 0.4,
            "recall": metrics.get("recall", 0.0) >= 0.25,
            "f1": metrics.get("f1", 0.0) >= 0.3,
            "roc_auc": metrics.get("roc_auc", 0.5) >= 0.65,
            "pr_auc": metrics.get("pr_auc", 0.0)
            >= max(0.2, metrics.get("positive_rate", 0.0) * 2.0),
        }
        failed = [name for name, passed in checks.items() if not passed]
        return {
            "enabled": not failed,
            "checks": checks,
            "failed_checks": failed,
            "reason": "Passed internal quality gates." if not failed else f"Failed: {', '.join(failed)}.",
        }

    @staticmethod
    def _is_single_input(input_features: Any) -> bool:
        if isinstance(input_features, dict):
            return True
        if isinstance(input_features, pd.DataFrame):
            return len(input_features) == 1
        if isinstance(input_features, np.ndarray):
            return input_features.ndim == 1 or input_features.shape[0] == 1
        return False

    def _cv_splitter(
        self,
        cv: int,
        n_rows: int,
        groups: np.ndarray | pd.Series | None,
        stratified_target: np.ndarray | None = None,
    ) -> tuple[Any, np.ndarray | None]:
        if groups is not None:
            groups_array = np.asarray(groups)
            unique_groups = np.unique(groups_array)
            if len(unique_groups) >= 2:
                return GroupKFold(n_splits=min(cv, len(unique_groups))), groups_array
        if stratified_target is not None and len(np.unique(stratified_target)) > 1:
            min_class_count = int(np.bincount(stratified_target).min())
            if min_class_count >= 2:
                return StratifiedKFold(n_splits=min(cv, min_class_count), shuffle=True, random_state=self.random_state), None
        return KFold(n_splits=min(cv, n_rows), shuffle=True, random_state=self.random_state), None

    @staticmethod
    def _cross_val_predict(
        estimator: Any,
        X: np.ndarray,
        y: np.ndarray,
        folds: Any,
        groups: np.ndarray | None,
        method: str = "predict",
    ) -> np.ndarray:
        with warnings.catch_warnings():
            warnings.filterwarnings("ignore", message="X does not have valid feature names")
            if groups is None:
                return cross_val_predict(estimator, X, y, cv=folds, method=method)
            return cross_val_predict(estimator, X, y, cv=folds, groups=groups, method=method)

    def _reliability_buckets(self, y: np.ndarray, probabilities: np.ndarray) -> list[dict[str, float | int]]:
        buckets: list[dict[str, float | int]] = []
        edges = [0.0, 0.4, 0.55, self.confidence_threshold, 0.75, 0.9, 1.0]
        edges = sorted(set(round(edge, 4) for edge in edges))
        predicted = (probabilities >= self.confidence_threshold).astype(int)
        for lower, upper in zip(edges[:-1], edges[1:]):
            if upper == 1.0:
                mask = (probabilities >= lower) & (probabilities <= upper)
            else:
                mask = (probabilities >= lower) & (probabilities < upper)
            count = int(mask.sum())
            if count == 0:
                continue
            buckets.append(
                {
                    "lower": float(lower),
                    "upper": float(upper),
                    "count": count,
                    "mean_probability": round(float(probabilities[mask].mean()), 4),
                    "positive_rate": round(float(y[mask].mean()), 4),
                    "accuracy_at_threshold": round(float((predicted[mask] == y[mask]).mean()), 4),
                }
            )
        return buckets
