from pathlib import Path

from ml.synthetic import export_dataset


ROOT_DIR = Path(__file__).resolve().parents[1]
TARGET_PATH = ROOT_DIR / "data" / "generated" / "telemetry_seed.json"


def main() -> None:
    path = export_dataset(TARGET_PATH, points=240, seed=11)
    print(f"Synthetic telemetry exported to {path}")


if __name__ == "__main__":
    main()
