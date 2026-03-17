import json
import subprocess
from datetime import datetime, timezone
from pathlib import Path


ROOT_DIR = Path(__file__).resolve().parents[1]
TARGET = ROOT_DIR / "config" / "build_metadata.json"


def git_commit() -> str:
    try:
        return (
            subprocess.check_output(["git", "rev-parse", "--short", "HEAD"], cwd=ROOT_DIR, text=True, stderr=subprocess.DEVNULL)
            .strip()
        )
    except Exception:
        return "development"


def main() -> None:
    payload = {
        "version": "1.0.0",
        "build_timestamp": datetime.now(timezone.utc).isoformat(),
        "git_commit": git_commit(),
        "runtime_schema_version": "3.0.0",
        "sidecar_protocol_version": "3",
    }
    TARGET.write_text(json.dumps(payload, indent=2), encoding="utf-8")
    print(f"Build metadata written to {TARGET}")


if __name__ == "__main__":
    main()
