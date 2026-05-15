import difflib
import json
from datetime import datetime, timezone
from pathlib import Path
from uuid import uuid4

from backend.core.paths import FEATURE_FLAGS_PATH, SNAPSHOT_DIR, SYSTEM_SETTINGS_PATH
from backend.schemas.api import SnapshotRecord
from backend.services.json_store import read_json, write_json

PROFILE_SOURCE = "__aeterna_profile__"
PROFILE_FILE_KEYS = {
    "feature_flags": FEATURE_FLAGS_PATH,
    "system_settings": SYSTEM_SETTINGS_PATH,
}


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


def create_profile_snapshot(note: str | None = None) -> SnapshotRecord:
    snapshot_id = f"profile-{uuid4().hex[:8]}"
    record = {
        "id": snapshot_id,
        "kind": "app-profile",
        "created_at": datetime.now(timezone.utc).isoformat(),
        "note": note.strip() if note and note.strip() else "Manual app profile snapshot",
        "surface": "config",
        "source_path": PROFILE_SOURCE,
        "payload": {
            "schema": 1,
            "files": {
                key: read_json(path, {})
                for key, path in PROFILE_FILE_KEYS.items()
            },
        },
    }
    write_json(SNAPSHOT_DIR / f"{snapshot_id}.json", record)
    return SnapshotRecord(**{key: record[key] for key in ("id", "kind", "created_at", "note", "surface")})


def list_snapshots() -> list[SnapshotRecord]:
    rows = []
    for path in SNAPSHOT_DIR.glob("*.json"):
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
    return sorted(rows, key=lambda item: item.created_at, reverse=True)


def latest_snapshot() -> SnapshotRecord | None:
    return next(iter(list_snapshots()), None)


def restore_snapshot(snapshot_id: str) -> dict[str, object]:
    path = SNAPSHOT_DIR / f"{snapshot_id}.json"
    record = read_json(path, {})
    if not record or "source_path" not in record or "payload" not in record:
        raise FileNotFoundError(snapshot_id)
    if record["source_path"] == PROFILE_SOURCE:
        payload = record["payload"]
        if not isinstance(payload, dict) or not isinstance(payload.get("files"), dict):
            raise FileNotFoundError(snapshot_id)
        current = {
            key: read_json(source_path, {})
            for key, source_path in PROFILE_FILE_KEYS.items()
        }
        for key, source_path in PROFILE_FILE_KEYS.items():
            value = payload["files"].get(key)
            if isinstance(value, dict):
                write_json(source_path, value)
        return {"current": current, "restored": payload["files"], "kind": record["kind"]}
    source_path = Path(record["source_path"])
    source = read_json(source_path, {})
    write_json(source_path, record["payload"])
    return {"current": source, "restored": record["payload"], "kind": record["kind"]}


def diff_snapshot(snapshot_id: str) -> str:
    path = SNAPSHOT_DIR / f"{snapshot_id}.json"
    record = read_json(path, {})
    if not record or "source_path" not in record or "payload" not in record:
        raise FileNotFoundError(snapshot_id)
    if record["source_path"] == PROFILE_SOURCE:
        payload = record["payload"]
        if not isinstance(payload, dict) or not isinstance(payload.get("files"), dict):
            raise FileNotFoundError(snapshot_id)
        sections: list[str] = []
        for key, source_path in PROFILE_FILE_KEYS.items():
            current = json.dumps(read_json(source_path, {}), indent=2).splitlines()
            previous_payload = payload["files"].get(key, {})
            previous = json.dumps(previous_payload, indent=2).splitlines()
            diff = "\n".join(
                difflib.unified_diff(previous, current, fromfile=f"{key}: snapshot", tofile=f"{key}: current", lineterm="")
            )
            sections.append(diff or f"{key}: no changes")
        return "\n\n".join(sections)
    source_path = Path(record["source_path"])
    current = json.dumps(read_json(source_path, {}), indent=2).splitlines()
    previous = json.dumps(record["payload"], indent=2).splitlines()
    return "\n".join(
        difflib.unified_diff(previous, current, fromfile="snapshot", tofile="current", lineterm="")
    )


def export_snapshot(snapshot_id: str) -> dict[str, object]:
    path = SNAPSHOT_DIR / f"{snapshot_id}.json"
    record = read_json(path, {})
    if not record or "source_path" not in record or "payload" not in record:
        raise FileNotFoundError(snapshot_id)
    return record


def import_profile_snapshot(record: dict[str, object]) -> SnapshotRecord:
    payload = record.get("payload")
    if not isinstance(payload, dict) or not isinstance(payload.get("files"), dict):
        raise ValueError("Invalid snapshot payload.")
    files = payload["files"]
    if not all(isinstance(files.get(key), dict) for key in PROFILE_FILE_KEYS):
        raise ValueError("Snapshot does not contain an Aeterna profile.")

    snapshot_id = f"profile-imported-{uuid4().hex[:8]}"
    imported = {
        "id": snapshot_id,
        "kind": "app-profile",
        "created_at": datetime.now(timezone.utc).isoformat(),
        "note": str(record.get("note") or "Imported app profile snapshot"),
        "surface": "config",
        "source_path": PROFILE_SOURCE,
        "payload": {
            "schema": 1,
            "files": {
                key: files[key]
                for key in PROFILE_FILE_KEYS
            },
        },
    }
    write_json(SNAPSHOT_DIR / f"{snapshot_id}.json", imported)
    return SnapshotRecord(**{key: imported[key] for key in ("id", "kind", "created_at", "note", "surface")})


def delete_snapshot(snapshot_id: str) -> None:
    path = SNAPSHOT_DIR / f"{snapshot_id}.json"
    if not path.exists():
        raise FileNotFoundError(snapshot_id)
    path.unlink()
