use std::fs;

use crate::{models::ActivityEntry, paths::activity_path};

fn read_all() -> Vec<ActivityEntry> {
    let path = activity_path();
    if !path.exists() {
        return Vec::new();
    }
    serde_json::from_slice(&fs::read(path).unwrap_or_default()).unwrap_or_default()
}

fn write_all(entries: &[ActivityEntry]) -> Result<(), String> {
    let bytes = serde_json::to_vec_pretty(entries).map_err(|error| error.to_string())?;
    fs::write(activity_path(), bytes).map_err(|error| error.to_string())
}

pub fn list_recent(limit: usize) -> Vec<ActivityEntry> {
    let mut entries = read_all();
    entries.sort_by(|left, right| right.timestamp.cmp(&left.timestamp));
    entries.into_iter().take(limit).collect()
}

pub fn append(entry: ActivityEntry) -> Result<ActivityEntry, String> {
    let mut entries = read_all();
    entries.push(entry.clone());
    let cutoff = entries.len().saturating_sub(80);
    if cutoff > 0 {
        entries.drain(0..cutoff);
    }
    write_all(&entries)?;
    Ok(entry)
}
