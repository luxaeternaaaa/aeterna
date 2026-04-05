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

fn all_snapshots() -> Vec<TweakSnapshot> {
    let mut paths = match fs::read_dir(snapshot_dir()) {
        Ok(entries) => entries.flatten().collect::<Vec<_>>(),
        Err(_) => return Vec::new(),
    };
    paths.sort_by_key(|entry| entry.file_name());
    paths
        .into_iter()
        .filter_map(|entry| fs::read(entry.path()).ok())
        .filter_map(|bytes| serde_json::from_slice::<TweakSnapshot>(&bytes).ok())
        .collect()
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
    let snapshot = all_snapshots().pop()?;
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

pub fn save_snapshot(snapshot: &TweakSnapshot) -> Result<(), String> {
    write_snapshot(snapshot)
}

pub fn mark_snapshot_applied(snapshot_id: &str) -> Result<TweakSnapshot, String> {
    let mut snapshot = load_snapshot(snapshot_id)?;
    snapshot.applied_at = Some(now().format(&Rfc3339).expect("current utc time should format as rfc3339"));
    save_snapshot(&snapshot)?;
    Ok(snapshot)
}

pub fn mark_snapshot_restored(snapshot_id: &str) -> Result<TweakSnapshot, String> {
    let mut snapshot = load_snapshot(snapshot_id)?;
    snapshot.restored_at = Some(now().format(&Rfc3339).expect("current utc time should format as rfc3339"));
    save_snapshot(&snapshot)?;
    Ok(snapshot)
}

pub fn pending_registry_restore() -> Option<TweakSnapshot> {
    all_snapshots()
        .into_iter()
        .rev()
        .find(|snapshot| snapshot.kind == "registry-preset" && snapshot.applied_at.is_some() && snapshot.restored_at.is_none())
}

pub fn next_snapshot(kind: &str, note: String, process: Option<crate::models::ProcessRestoreState>, power_plan_guid: Option<String>, power_plan_name: Option<String>) -> TweakSnapshot {
    let timestamp = now();
    let stamp = timestamp.format(&Rfc3339).expect("current utc time should format as rfc3339");
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
        registry_preset_id: None,
        registry_entries: Vec::new(),
        requires_admin: false,
        applied_at: None,
        restored_at: None,
        extra: serde_json::Value::Null,
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
    let timestamp = now().format(&Rfc3339).expect("current utc time should format as rfc3339");
    ActivityEntry {
        id: format!("activity-{}", now().unix_timestamp_nanos() / 1_000_000),
        timestamp,
        category: category.into(),
        action: action.into(),
        detail,
        risk: risk.into(),
        action_id: snapshot_id.clone(),
        snapshot_id,
        session_id,
        can_undo,
        proof_link: None,
        blocked_by_policy: false,
    }
}
