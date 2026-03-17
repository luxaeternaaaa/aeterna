use std::fs;

use serde::Deserialize;
use serde_json::Value;

use crate::{models::SessionState, paths::{feature_flags_path, system_settings_path}};

#[derive(Default, Deserialize)]
struct FeatureFlagsConfig {
    #[serde(default)]
    network_optimizer: bool,
}

#[derive(Clone, Deserialize)]
pub struct SystemSettingsConfig {
    #[serde(default = "default_active_profile")]
    pub active_profile: String,
    #[serde(default = "default_automation_mode")]
    pub automation_mode: String,
    #[serde(default)]
    pub automation_allowlist: Vec<String>,
}

impl Default for SystemSettingsConfig {
    fn default() -> Self {
        Self {
            active_profile: default_active_profile(),
            automation_mode: default_automation_mode(),
            automation_allowlist: Vec::new(),
        }
    }
}

fn default_active_profile() -> String {
    "balanced".into()
}

fn default_automation_mode() -> String {
    "manual".into()
}

fn read_value(path: std::path::PathBuf) -> Value {
    fs::read(path)
        .ok()
        .and_then(|bytes| serde_json::from_slice(&bytes).ok())
        .unwrap_or(Value::Null)
}

pub fn optimizer_enabled() -> bool {
    serde_json::from_value::<FeatureFlagsConfig>(read_value(feature_flags_path()))
        .map(|flags| flags.network_optimizer)
        .unwrap_or(false)
}

pub fn system_settings() -> SystemSettingsConfig {
    serde_json::from_value::<SystemSettingsConfig>(read_value(system_settings_path())).unwrap_or_default()
}

pub fn require_tweak_allowed(kind: &str, session: &SessionState, requested_pid: Option<u32>) -> Result<(), String> {
    if !optimizer_enabled() {
        return Err("Enable Performance optimizer in Settings before applying session tweaks.".into());
    }
    if !matches!(session.state.as_str(), "attached" | "active") || session.session_id.is_none() {
        return Err("Attach a game session before applying session-scoped tweaks.".into());
    }
    if matches!(kind, "process_priority" | "cpu_affinity") {
        let attached_pid = session.process_id.ok_or("The attached session does not have a tracked process.")?;
        if let Some(pid) = requested_pid {
            if pid != attached_pid {
                return Err("The selected process does not match the attached game session. Attach that process first.".into());
            }
        }
    }
    Ok(())
}

pub fn auto_apply_allowed(action: &str, session: &SessionState) -> bool {
    if !optimizer_enabled() || session.session_id.is_none() {
        return false;
    }
    let settings = system_settings();
    if settings.automation_mode == "manual" {
        return false;
    }
    if settings.automation_mode == "trusted_profiles" && session.recommended_profile_id.is_none() {
        return false;
    }
    settings.automation_allowlist.iter().any(|item| item == action)
}
