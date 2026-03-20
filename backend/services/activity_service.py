from __future__ import annotations

from datetime import datetime, timezone
from uuid import uuid4

from backend.core.paths import ACTIVITY_PATH
from backend.schemas.api import ActivityEntry, BenchmarkReport
from backend.services.json_store import read_json, write_json


def _read_all() -> list[ActivityEntry]:
    payload = read_json(ACTIVITY_PATH, [])
    if not isinstance(payload, list):
        return []
    return [ActivityEntry(**item) for item in payload]


def _write_all(entries: list[ActivityEntry]) -> None:
    write_json(ACTIVITY_PATH, [entry.model_dump() for entry in entries])


def latest_action(session_id: str | None) -> ActivityEntry | None:
    candidates = [
        entry
        for entry in _read_all()
        if entry.category in {"tweak", "registry"}
        and entry.can_undo
        and not entry.blocked_by_policy
        and (session_id is None or entry.session_id == session_id)
    ]
    candidates.sort(key=lambda entry: entry.timestamp, reverse=True)
    return candidates[0] if candidates else None


def link_proof(action_id: str | None, proof_link: str) -> None:
    if not action_id:
        return
    entries = _read_all()
    updated = False
    for entry in entries:
        if entry.id == action_id:
            entry.proof_link = proof_link
            updated = True
            break
    if updated:
        _write_all(entries)


def append_proof_event(report: BenchmarkReport) -> ActivityEntry:
    entries = _read_all()
    entry = ActivityEntry(
        id=f"activity-{uuid4().hex[:10]}",
        timestamp=report.created_at,
        category="proof",
        action="Compare complete",
        detail=report.summary,
        risk="low",
        snapshot_id=report.snapshot_id,
        session_id=report.session_id,
        action_id=report.action_id,
        can_undo=False,
        proof_link=report.id,
        blocked_by_policy=False,
    )
    entries.append(entry)
    cutoff = len(entries) - 80
    if cutoff > 0:
        entries = entries[cutoff:]
    _write_all(entries)
    return entry


def append_blocked_event(*, session_id: str | None, snapshot_id: str | None, action_id: str | None, action: str, detail: str) -> ActivityEntry:
    entries = _read_all()
    entry = ActivityEntry(
        id=f"activity-{uuid4().hex[:10]}",
        timestamp=datetime.now(timezone.utc).isoformat(),
        category="blocked",
        action=action,
        detail=detail,
        risk="medium",
        snapshot_id=snapshot_id,
        session_id=session_id,
        action_id=action_id,
        can_undo=False,
        proof_link=None,
        blocked_by_policy=True,
    )
    entries.append(entry)
    cutoff = len(entries) - 80
    if cutoff > 0:
        entries = entries[cutoff:]
    _write_all(entries)
    return entry
