use std::fs;

use time::{format_description::well_known::Rfc3339, OffsetDateTime};

use crate::{
    models::{ActivityEntry, SnapshotMeta, TweakSnapshot},
    paths::snapshot_dir,
};

fn now() -> OffsetDateTime {
    OffsetDateTime::now_utc()
}

fn write_snapshot(snapshot: &TweakSnapshot) -> Result<(), String> {
    let path = snapshot_dir().join(format!("{}.json", snapshot.id));
    let bytes = serde_json::to_vec_pretty(snapshot).map_err(|error| error.to_string())?;
    fs::write(path, bytes).map_err(|error| error.to_string())
}

pub fn create_snapshot(snapshot: TweakSnapshot) -> Result<SnapshotMeta, String> {
    write_snapshot(&snapshot)?;
    Ok(SnapshotMeta {
        id: snapshot.id,
        kind: snapshot.kind,
        created_at: snapshot.created_at,
        note: snapshot.note,
    })
}

pub fn latest_snapshot() -> Option<SnapshotMeta> {
    let mut paths = fs::read_dir(snapshot_dir()).ok()?.flatten().collect::<Vec<_>>();
    paths.sort_by_key(|entry| entry.file_name());
    let path = paths.pop()?.path();
    let snapshot = serde_json::from_slice::<TweakSnapshot>(&fs::read(path).ok()?).ok()?;
    Some(SnapshotMeta {
        id: snapshot.id,
        kind: snapshot.kind,
        created_at: snapshot.created_at,
        note: snapshot.note,
    })
}

pub fn load_snapshot(snapshot_id: &str) -> Result<TweakSnapshot, String> {
    let path = snapshot_dir().join(format!("{snapshot_id}.json"));
    let bytes = fs::read(path).map_err(|_| format!("Snapshot {snapshot_id} not found."))?;
    serde_json::from_slice(&bytes).map_err(|error| format!("Invalid snapshot {snapshot_id}: {error}"))
}

pub fn next_snapshot(kind: &str, note: String, process: Option<crate::models::ProcessRestoreState>, power_plan_guid: Option<String>, power_plan_name: Option<String>) -> TweakSnapshot {
    let timestamp = now();
    let stamp = timestamp.format(&Rfc3339).unwrap_or_else(|_| "1970-01-01T00:00:00Z".into());
    let compact = timestamp.unix_timestamp_nanos() / 1_000_000;
    TweakSnapshot {
        id: format!("{compact}-{kind}"),
        kind: kind.into(),
        created_at: stamp,
        note,
        scope: "session".into(),
        session_id: None,
        process,
        power_plan_guid,
        power_plan_name,
    }
}

pub fn activity(
    category: &str,
    action: &str,
    detail: String,
    risk: &str,
    snapshot_id: Option<String>,
    session_id: Option<String>,
    can_undo: bool,
) -> ActivityEntry {
    let timestamp = now().format(&Rfc3339).unwrap_or_else(|_| "1970-01-01T00:00:00Z".into());
    ActivityEntry {
        id: format!("activity-{}", now().unix_timestamp_nanos() / 1_000_000),
        timestamp,
        category: category.into(),
        action: action.into(),
        detail,
        risk: risk.into(),
        snapshot_id,
        session_id,
        can_undo,
    }
}
