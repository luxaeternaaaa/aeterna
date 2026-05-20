from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
from typing import Iterable, Sequence

import numpy as np
import pandas as pd
from sklearn.compose import ColumnTransformer
from sklearn.impute import SimpleImputer
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import OneHotEncoder, StandardScaler


TARGET_COLUMNS = ["mean_fps", "fps_1pct"]

CATEGORICAL_COLUMNS = [
    "game_id",
    "cpu_model",
    "gpu_model",
    "drive_type",
    "resolution",
    "graphics_preset",
    "vsync",
    "antialiasing",
    "texture_quality",
    "special_effects",
    "label_target",
]

NUMERIC_COLUMNS = [
    "ram_gb",
    "laptop",
    "npc_count",
    "player_actions",
    "cpu_util",
    "gpu_util",
    "vram_util",
    "temperature",
    "background_process_count",
]

LEAKAGE_COLUMNS = [
    "mean_fps",
    "fps_1pct",
    "fps_0_1pct",
    "mean_frametime",
    "frametime_p95",
]

STABLE_CONFIG_COLUMNS = [
    "session_config_id",
    "game_id",
    "cpu_model",
    "gpu_model",
    "ram_gb",
    "drive_type",
    "laptop",
    "resolution",
    "graphics_preset",
    "vsync",
    "antialiasing",
    "texture_quality",
    "special_effects",
    "npc_count",
    "player_actions",
    "background_process_count",
    "label_target",
]


@dataclass
class LoadedDataset:
    X: np.ndarray
    y: pd.DataFrame
    raw: pd.DataFrame
    feature_frame: pd.DataFrame
    feature_names: list[str]
    categorical_columns: list[str]
    numeric_columns: list[str]
    tweak_columns: list[str]


def _make_one_hot_encoder() -> OneHotEncoder:
    try:
        return OneHotEncoder(handle_unknown="ignore", sparse_output=False)
    except TypeError:
        return OneHotEncoder(handle_unknown="ignore", sparse=False)


class DatasetLoader:
    """Load Aeterna gameplay CSV files and prepare ML-ready matrices."""

    def __init__(
        self,
        target_columns: Sequence[str] = TARGET_COLUMNS,
        categorical_columns: Sequence[str] | None = None,
        numeric_columns: Sequence[str] | None = None,
    ) -> None:
        self.target_columns = list(target_columns)
        self.base_categorical_columns = list(categorical_columns or CATEGORICAL_COLUMNS)
        self.base_numeric_columns = list(numeric_columns or NUMERIC_COLUMNS)
        self.preprocessor: ColumnTransformer | None = None
        self.feature_columns_: list[str] = []
        self.categorical_columns_: list[str] = []
        self.numeric_columns_: list[str] = []
        self.tweak_columns_: list[str] = []
        self.feature_names_: list[str] = []

    def read_csv(self, csv_path: str | Path | Iterable[str | Path]) -> pd.DataFrame:
        if isinstance(csv_path, (str, Path)):
            paths = [Path(csv_path)]
        else:
            paths = [Path(path) for path in csv_path]
        frames = [pd.read_csv(path) for path in paths]
        if not frames:
            raise ValueError("At least one CSV path is required.")
        return pd.concat(frames, ignore_index=True)

    def load(self, csv_path: str | Path | Iterable[str | Path]) -> LoadedDataset:
        return self.fit_transform(self.read_csv(csv_path))

    def load_xy(self, csv_path: str | Path | Iterable[str | Path]) -> tuple[np.ndarray, pd.DataFrame]:
        loaded = self.load(csv_path)
        return loaded.X, loaded.y

    def fit_transform(self, frame: pd.DataFrame) -> LoadedDataset:
        clean = frame.copy()
        missing_targets = [column for column in self.target_columns if column not in clean.columns]
        if missing_targets:
            raise ValueError(f"CSV is missing target columns: {missing_targets}")
        clean = clean.dropna(subset=self.target_columns).reset_index(drop=True)

        self.tweak_columns_ = self.detect_tweak_columns(clean)
        self.categorical_columns_ = [column for column in self.base_categorical_columns if column in clean.columns]
        self.numeric_columns_ = [
            column
            for column in [*self.base_numeric_columns, *self.tweak_columns_]
            if column in clean.columns and column not in self.categorical_columns_
        ]

        known = set(self.categorical_columns_) | set(self.numeric_columns_) | set(self.target_columns) | set(LEAKAGE_COLUMNS)
        for column in clean.columns:
            if column in known or column.startswith("session_"):
                continue
            if pd.api.types.is_numeric_dtype(clean[column]):
                self.numeric_columns_.append(column)
            elif column not in LEAKAGE_COLUMNS:
                self.categorical_columns_.append(column)

        self.feature_columns_ = [*self.categorical_columns_, *self.numeric_columns_]
        feature_frame = self._coerce_features(clean[self.feature_columns_])
        self.preprocessor = self._build_preprocessor()
        X = self.preprocessor.fit_transform(feature_frame)
        self.feature_names_ = self._feature_names()
        y = clean[self.target_columns].astype(float)
        return LoadedDataset(
            X=np.asarray(X, dtype=np.float32),
            y=y,
            raw=clean,
            feature_frame=feature_frame,
            feature_names=self.feature_names_,
            categorical_columns=self.categorical_columns_,
            numeric_columns=self.numeric_columns_,
            tweak_columns=self.tweak_columns_,
        )

    def transform_features(self, input_features: pd.DataFrame | dict[str, object] | list[dict[str, object]]) -> np.ndarray:
        if self.preprocessor is None:
            raise RuntimeError("DatasetLoader must be fitted before transform_features().")
        if isinstance(input_features, pd.DataFrame):
            frame = input_features.copy()
        elif isinstance(input_features, dict):
            frame = pd.DataFrame([input_features])
        else:
            frame = pd.DataFrame(input_features)

        for column in self.feature_columns_:
            if column not in frame.columns:
                frame[column] = 0 if column in self.numeric_columns_ else "unknown"
        frame = self._coerce_features(frame[self.feature_columns_])
        return np.asarray(self.preprocessor.transform(frame), dtype=np.float32)

    def derive_tweak_labels(
        self,
        frame: pd.DataFrame,
        min_gain: float = 0.05,
        target_column: str = "mean_fps",
    ) -> tuple[pd.DataFrame, pd.DataFrame]:
        """Create one binary recommendation target per tweak from paired sessions."""

        if target_column not in frame.columns:
            raise ValueError(f"Missing target column for tweak labels: {target_column}")
        tweak_columns = self.detect_tweak_columns(frame)
        if not tweak_columns:
            empty = pd.DataFrame(index=frame.index)
            return empty, empty

        stable_columns = [column for column in STABLE_CONFIG_COLUMNS if column in frame.columns]
        labels = pd.DataFrame(0, index=frame.index, columns=tweak_columns, dtype=np.int8)
        gains = pd.DataFrame(0.0, index=frame.index, columns=tweak_columns, dtype=float)

        # For each tweak, compare rows with identical game/hardware/settings and
        # identical state of all other tweaks. This avoids teaching the classifier
        # to simply detect that the tweak is already enabled.
        for tweak in tweak_columns:
            other_tweaks = [column for column in tweak_columns if column != tweak]
            key_columns = [*stable_columns, *other_tweaks]
            if not key_columns:
                continue

            on_rows = frame[frame[tweak].fillna(0).astype(int) == 1]
            if on_rows.empty:
                continue

            paired_best = (
                on_rows.groupby(key_columns, dropna=False)[target_column]
                .max()
                .rename("paired_fps")
                .reset_index()
            )
            lookup = {
                tuple(row[column] for column in key_columns): float(row["paired_fps"])
                for _, row in paired_best.iterrows()
            }

            for index, row in frame.iterrows():
                if int(row.get(tweak, 0) or 0) != 0:
                    continue
                base_fps = float(row[target_column])
                if base_fps <= 0:
                    continue
                key = tuple(row[column] for column in key_columns)
                paired_fps = lookup.get(key)
                if paired_fps is None:
                    continue
                gain = paired_fps / base_fps - 1.0
                gains.at[index, tweak] = gain
                labels.at[index, tweak] = int(gain >= min_gain)

        return labels, gains

    @staticmethod
    def detect_tweak_columns(frame: pd.DataFrame) -> list[str]:
        return sorted(column for column in frame.columns if column.startswith("tweak_"))

    def _build_preprocessor(self) -> ColumnTransformer:
        categorical_pipeline = Pipeline(
            steps=[
                ("imputer", SimpleImputer(strategy="constant", fill_value="unknown")),
                ("onehot", _make_one_hot_encoder()),
            ]
        )
        numeric_pipeline = Pipeline(
            steps=[
                ("imputer", SimpleImputer(strategy="median")),
                ("scaler", StandardScaler()),
            ]
        )
        return ColumnTransformer(
            transformers=[
                ("cat", categorical_pipeline, self.categorical_columns_),
                ("num", numeric_pipeline, self.numeric_columns_),
            ],
            remainder="drop",
            verbose_feature_names_out=False,
        )

    def _coerce_features(self, frame: pd.DataFrame) -> pd.DataFrame:
        result = frame.copy()
        for column in self.categorical_columns_:
            result[column] = result[column].fillna("unknown").astype(str)
        for column in self.numeric_columns_:
            result[column] = pd.to_numeric(result[column], errors="coerce")
        return result

    def _feature_names(self) -> list[str]:
        if self.preprocessor is None:
            return []
        try:
            return [str(name) for name in self.preprocessor.get_feature_names_out()]
        except Exception:
            return [f"feature_{index}" for index in range(len(self.feature_columns_))]
