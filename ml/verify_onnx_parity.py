from __future__ import annotations

import argparse
import sys
from pathlib import Path

if __package__ is None or __package__ == "":
    sys.path.append(str(Path(__file__).resolve().parents[1]))

import joblib
import numpy as np
import onnxruntime as ort
import pandas as pd


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Verify Python DatasetLoader parity with exported ONNX pipeline.")
    parser.add_argument("--model", type=Path, default=Path("ml/models/aeterna_fps_model.joblib"))
    parser.add_argument("--onnx", type=Path, default=Path("ml/models/aeterna_fps_model.onnx"))
    parser.add_argument("--csv", type=Path, default=Path("ml/artifacts/synthetic_fps_sessions.csv"))
    parser.add_argument("--rows", type=int, default=16)
    parser.add_argument("--tolerance", type=float, default=1e-4)
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    bundle = joblib.load(args.model)
    frame = pd.read_csv(args.csv).head(args.rows)
    python_prediction = bundle.regressor.predict(bundle.dataset_loader.transform_features(frame))

    session = ort.InferenceSession(str(args.onnx), providers=["CPUExecutionProvider"])
    feeds = {}
    for column in bundle.dataset_loader.feature_columns_:
        if column in bundle.dataset_loader.categorical_columns_:
            feeds[column] = frame[column].fillna("unknown").astype(str).to_numpy().reshape((-1, 1))
        else:
            feeds[column] = pd.to_numeric(frame[column], errors="coerce").fillna(0).astype("float32").to_numpy().reshape((-1, 1))

    onnx_prediction = session.run(None, feeds)[0]
    max_abs_diff = float(np.max(np.abs(python_prediction - onnx_prediction)))
    print(f"rows={len(frame)} max_abs_diff={max_abs_diff:.8f}")
    if max_abs_diff > args.tolerance:
        raise SystemExit(f"ONNX parity check failed: {max_abs_diff:.8f} > {args.tolerance}")


if __name__ == "__main__":
    main()
