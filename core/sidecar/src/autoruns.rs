use crate::{
    models::{AutorunEntry, RegistryHive, RegistrySnapshotEntry, RegistryValueType, TweakSnapshot},
    registry,
};

fn encode(raw: &str) -> String {
    raw.as_bytes().iter().map(|byte| format!("{byte:02x}")).collect::<String>()
}

fn decode(raw: &str) -> Option<String> {
    if raw.len() % 2 != 0 {
        return None;
    }
    let mut bytes = Vec::with_capacity(raw.len() / 2);
    for index in (0..raw.len()).step_by(2) {
        bytes.push(u8::from_str_radix(&raw[index..index + 2], 16).ok()?);
    }
    String::from_utf8(bytes).ok()
}

fn autorun_id(hive: &RegistryHive, path: &str, value_name: &str) -> String {
    let hive_token = match hive {
        RegistryHive::Hkcu => "HKCU",
        RegistryHive::Hklm => "HKLM",
    };
    format!("reg:{hive_token}:{}:{}", encode(path), encode(value_name))
}

fn parse_autorun_id(id: &str) -> Option<(RegistryHive, String, String)> {
    let mut parts = id.split(':');
    if parts.next()? != "reg" {
        return None;
    }
    let hive = match parts.next()? {
        "HKCU" => RegistryHive::Hkcu,
        "HKLM" => RegistryHive::Hklm,
        _ => return None,
    };
    let path = decode(parts.next()?)?;
    let value_name = decode(parts.next()?)?;
    if parts.next().is_some() {
        return None;
    }
    Some((hive, path, value_name))
}

fn query_registry_key(hive: &RegistryHive, path: &str) -> Result<String, String> {
    let key = format!(r"{}\{}", registry::hive_name(hive), path);
    let args = vec!["query".into(), key];
    registry::run_reg_command(&args, false).or_else(|_| Ok(String::new()))
}

fn parse_run_entries(hive: RegistryHive, path: &'static str) -> Result<Vec<AutorunEntry>, String> {
    let output = query_registry_key(&hive, path)?;
    let mut entries = Vec::new();
    for line in output.lines() {
        let trimmed = line.trim();
        if trimmed.is_empty() || trimmed.starts_with("HKEY_") {
            continue;
        }
        let Some((value_type, index)) = ["REG_SZ", "REG_EXPAND_SZ"]
            .iter()
            .find_map(|marker| trimmed.find(marker).map(|index| (*marker, index)))
        else {
            continue;
        };
        let name = trimmed[..index].trim();
        let command = trimmed[index + value_type.len()..].trim();
        if name.is_empty() || command.is_empty() {
            continue;
        }
        let hive_label = registry::hive_name(&hive);
        entries.push(AutorunEntry {
            id: autorun_id(&hive, path, name),
            name: name.into(),
            source: "Registry Run".into(),
            location: format!(r"{hive_label}\{path}"),
            command: command.into(),
            enabled: true,
            supported: value_type == "REG_SZ",
        });
    }
    Ok(entries)
}

pub fn list_autoruns() -> Result<Vec<AutorunEntry>, String> {
    let path = r"Software\Microsoft\Windows\CurrentVersion\Run";
    let mut entries = parse_run_entries(RegistryHive::Hkcu, path)?;
    entries.extend(parse_run_entries(RegistryHive::Hklm, path)?);
    entries.sort_by(|a, b| a.name.to_ascii_lowercase().cmp(&b.name.to_ascii_lowercase()));
    Ok(entries)
}

pub fn build_disable_snapshot(id: &str, session_id: Option<String>) -> Result<TweakSnapshot, String> {
    let (hive, path, value_name) = parse_autorun_id(id).ok_or("Unsupported autorun entry id.")?;
    let value_type = RegistryValueType::RegSz;
    let old_value = registry::query_value_dynamic(&hive, &path, &value_name, &value_type)?
        .ok_or("Autorun entry no longer exists.")?;
    let requires_admin = matches!(hive, RegistryHive::Hklm);
    let entry = RegistrySnapshotEntry {
        hive,
        path,
        value_name: value_name.clone(),
        value_type,
        old_value: Some(old_value.clone()),
        existed_before: true,
        target_value: old_value,
    };
    Ok(TweakSnapshot {
        id: format!(
            "{}-autorun-disable",
            time::OffsetDateTime::now_utc().unix_timestamp_nanos() / 1_000_000
        ),
        kind: "autorun".into(),
        created_at: time::OffsetDateTime::now_utc()
            .format(&time::format_description::well_known::Rfc3339)
            .expect("current utc time should format as rfc3339"),
        note: format!("Before disabling autorun {value_name}"),
        scope: "session".into(),
        session_id,
        process: None,
        power_plan_guid: None,
        power_plan_name: None,
        registry_preset_id: Some("autorun_disable".into()),
        registry_entries: vec![entry],
        requires_admin,
        applied_at: None,
        restored_at: None,
        extra: serde_json::json!({
            "kind": "autorun",
            "autorun_id": id,
            "value_name": value_name,
        }),
    })
}

pub fn disable_from_snapshot(snapshot: &TweakSnapshot) -> Result<(), String> {
    let entry = snapshot
        .registry_entries
        .first()
        .ok_or("Autorun snapshot is missing the registry entry.")?;
    let key = format!(r"{}\{}", registry::hive_name(&entry.hive), entry.path);
    let args = vec!["delete".into(), key, "/v".into(), entry.value_name.clone(), "/f".into()];
    registry::run_reg_command(&args, snapshot.requires_admin).map(|_| ())
}
