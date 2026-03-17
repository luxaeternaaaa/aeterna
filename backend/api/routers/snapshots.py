from fastapi import APIRouter, HTTPException

from backend.schemas.api import ActionResult, SnapshotRecord
from backend.services.log_service import add_log
from backend.services.snapshot_service import diff_snapshot, list_snapshots, restore_snapshot


router = APIRouter(prefix="/api/snapshots", tags=["snapshots"])


@router.get("", response_model=list[SnapshotRecord])
def snapshots() -> list[SnapshotRecord]:
    return list_snapshots()


@router.get("/{snapshot_id}/diff")
def snapshot_diff(snapshot_id: str) -> dict[str, str]:
    try:
        return {"diff": diff_snapshot(snapshot_id)}
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

