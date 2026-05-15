from fastapi import APIRouter, HTTPException

from backend.schemas.api import ActionResult, SnapshotCreateRequest, SnapshotImportRequest, SnapshotRecord
from backend.services.log_service import add_log
from backend.services.snapshot_service import (
    create_profile_snapshot,
    delete_snapshot,
    diff_snapshot,
    export_snapshot,
    import_profile_snapshot,
    list_snapshots,
    restore_snapshot,
)


router = APIRouter(prefix="/api/snapshots", tags=["snapshots"])


@router.get("", response_model=list[SnapshotRecord])
def snapshots() -> list[SnapshotRecord]:
    return list_snapshots()


@router.post("", response_model=SnapshotRecord)
def create(payload: SnapshotCreateRequest) -> SnapshotRecord:
    snapshot = create_profile_snapshot(payload.note)
    add_log("backup", "info", "snapshot-service", f"Created backup profile {snapshot.id}.")
    return snapshot


@router.post("/import", response_model=SnapshotRecord)
def import_snapshot(payload: SnapshotImportRequest) -> SnapshotRecord:
    try:
        snapshot = import_profile_snapshot(payload.record)
    except ValueError as error:
        raise HTTPException(status_code=400, detail=str(error)) from error
    add_log("backup", "info", "snapshot-service", f"Imported backup profile {snapshot.id}.")
    return snapshot


@router.get("/{snapshot_id}/diff")
def snapshot_diff(snapshot_id: str) -> dict[str, str]:
    try:
        return {"diff": diff_snapshot(snapshot_id)}
    except FileNotFoundError as error:
        raise HTTPException(status_code=404, detail="Snapshot not found.") from error


@router.get("/{snapshot_id}/export")
def export(snapshot_id: str) -> dict[str, object]:
    try:
        return export_snapshot(snapshot_id)
    except FileNotFoundError as error:
        raise HTTPException(status_code=404, detail="Snapshot not found.") from error


@router.post("/{snapshot_id}/restore", response_model=ActionResult)
def restore(snapshot_id: str) -> ActionResult:
    try:
        result = restore_snapshot(snapshot_id)
    except FileNotFoundError as error:
        raise HTTPException(status_code=404, detail="Snapshot not found.") from error
    add_log("rollback", "warning", "snapshot-service", f"Restored snapshot {snapshot_id}.")
    return ActionResult(ok=True, message=f"Restored {result['kind']} from snapshot {snapshot_id}.")


@router.delete("/{snapshot_id}", response_model=ActionResult)
def delete(snapshot_id: str) -> ActionResult:
    try:
        delete_snapshot(snapshot_id)
    except FileNotFoundError as error:
        raise HTTPException(status_code=404, detail="Snapshot not found.") from error
    add_log("backup", "warning", "snapshot-service", f"Deleted backup profile {snapshot_id}.")
    return ActionResult(ok=True, message=f"Deleted snapshot {snapshot_id}.")
