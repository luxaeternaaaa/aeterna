use std::fs;

use serde::Deserialize;
use serde_json::Value;

use crate::{
    models::SessionState,
    paths::{benchmark_baseline_path, feature_flags_path, system_settings_path},
};

#[derive(Clone)]
pub struct BlockingState {
    pub reason: String,
    pub next_action: String,
}

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
    #[serde(default)]
    pub registry_presets_enabled: bool,
    #[serde(default)]
    pub show_advanced_registry_details: bool,
}

impl Default for SystemSettingsConfig {
    fn default() -> Self {
        Self {
            active_profile: default_active_profile(),
            automation_mode: default_automation_mode(),
            automation_allowlist: Vec::new(),
            registry_presets_enabled: false,
            show_advanced_registry_details: false,
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

pub fn has_benchmark_baseline() -> bool {
    let path = benchmark_baseline_path();
    path.exists() && fs::metadata(path).map(|meta| meta.len() > 0).unwrap_or(false)
}

pub fn require_tweak_allowed(kind: &str, session: &SessionState, requested_pid: Option<u32>) -> Result<(), String> {
    if matches!(kind, "process_priority" | "cpu_affinity" | "process_qos" | "process_isolation")
        && requested_pid.or(session.process_id).is_none()
    {
        return Err("Select a running game process before applying this tweak.".into());
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

pub fn require_registry_preset_allowed(session: &SessionState, requires_admin: bool) -> Result<(), String> {
    if let Some(block) = registry_preset_block(session, requires_admin) {
        return Err(block.reason);
    }
    Ok(())
}

pub fn registry_preset_block(_session: &SessionState, requires_admin: bool) -> Option<BlockingState> {
    if requires_admin {
        return None;
    }
    None
}
