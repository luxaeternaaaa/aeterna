import difflib
import json
from datetime import datetime, timezone
from pathlib import Path
from uuid import uuid4

from backend.core.paths import SNAPSHOT_DIR
from backend.schemas.api import SnapshotRecord
from backend.services.json_store import read_json, write_json


def create_snapshot(kind: str, source_path: str, payload: object, note: str) -> SnapshotRecord:
    snapshot_id = f"{kind}-{uuid4().hex[:8]}"
    record = {
        "id": snapshot_id,
        "kind": kind,
        "created_at": datetime.now(timezone.utc).isoformat(),
        "note": note,
        "surface": "config",
        "source_path": source_path,
        "payload": payload,
    }
    write_json(SNAPSHOT_DIR / f"{snapshot_id}.json", record)
    return SnapshotRecord(**{key: record[key] for key in ("id", "kind", "created_at", "note", "surface")})


def list_snapshots() -> list[SnapshotRecord]:
    rows = []
    for path in sorted(SNAPSHOT_DIR.glob("*.json"), reverse=True):
        record = read_json(path, {})
        if record and {"source_path", "payload"}.issubset(record):
            rows.append(
                SnapshotRecord(
                    **{
                        "id": record["id"],
                        "kind": record["kind"],
                        "created_at": record["created_at"],
                        "note": record["note"],
                        "surface": record.get("surface", "config"),
                    }
                )
            )
    return rows


def latest_snapshot() -> SnapshotRecord | None:
    return next(iter(list_snapshots()), None)


def restore_snapshot(snapshot_id: str) -> dict[str, object]:
    path = SNAPSHOT_DIR / f"{snapshot_id}.json"
    record = read_json(path, {})
    if not record or "source_path" not in record or "payload" not in record:
        raise FileNotFoundError(snapshot_id)
    source_path = Path(record["source_path"])
    source = read_json(source_path, {})
    write_json(source_path, record["payload"])
    return {"current": source, "restored": record["payload"], "kind": record["kind"]}


def diff_snapshot(snapshot_id: str) -> str:
    path = SNAPSHOT_DIR / f"{snapshot_id}.json"
    record = read_json(path, {})
    if not record or "source_path" not in record or "payload" not in record:
        raise FileNotFoundError(snapshot_id)
    source_path = Path(record["source_path"])
    current = json.dumps(read_json(source_path, {}), indent=2).splitlines()
    previous = json.dumps(record["payload"], indent=2).splitlines()
    return "\n".join(
        difflib.unified_diff(previous, current, fromfile="snapshot", tofile="current", lineterm="")
    )
