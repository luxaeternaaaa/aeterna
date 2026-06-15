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
    serde_json::from_value::<SystemSettingsConfig>(read_value(system_settings_path()))
        .unwrap_or_default()
}

fn session_is_active(session: &SessionState) -> bool {
    session.session_id.is_some()
        && session.process_id.is_some()
        && matches!(session.state.as_str(), "attached" | "active")
}

fn baseline_matches_session_value(baseline: &Value, session: &SessionState) -> bool {
    let baseline_session = baseline.get("session_id").and_then(Value::as_str);
    let baseline_pid = baseline
        .get("process_id")
        .and_then(Value::as_u64)
        .and_then(|value| u32::try_from(value).ok());
    baseline_session == session.session_id.as_deref()
        && baseline_pid.is_some()
        && baseline_pid == session.process_id
}

pub fn baseline_matches_session(session: &SessionState) -> bool {
    baseline_matches_session_value(&read_value(benchmark_baseline_path()), session)
}

fn tweak_requires_process(kind: &str) -> bool {
    matches!(
        kind,
        "process_priority" | "cpu_affinity" | "process_qos" | "process_isolation"
    )
}

fn tweak_requires_baseline(kind: &str) -> bool {
    !matches!(kind, "autorun_disable")
}

fn common_mutation_block(
    session: &SessionState,
    optimizer_allowed: bool,
    baseline_matches: bool,
    requires_baseline: bool,
) -> Option<BlockingState> {
    if !optimizer_allowed {
        return Some(BlockingState {
            reason: "Safe optimization changes are disabled in Settings.".into(),
            next_action: "Enable Allow safe optimization changes in Settings.".into(),
        });
    }
    if !session_is_active(session) {
        return Some(BlockingState {
            reason: "Attach a running game before applying optimization changes.".into(),
            next_action: "Attach the game and keep the same session active.".into(),
        });
    }
    if requires_baseline && !baseline_matches {
        return Some(BlockingState {
            reason: "A matching baseline for the current game session is required.".into(),
            next_action:
                "Capture a fresh baseline for the attached game before applying this change.".into(),
        });
    }
    None
}

fn tweak_block_with_context(
    kind: &str,
    session: &SessionState,
    requested_pid: Option<u32>,
    optimizer_allowed: bool,
    baseline_matches: bool,
) -> Option<BlockingState> {
    if let Some(block) = common_mutation_block(
        session,
        optimizer_allowed,
        baseline_matches,
        tweak_requires_baseline(kind),
    ) {
        return Some(block);
    }
    if tweak_requires_process(kind) {
        let target_pid = requested_pid.or(session.process_id);
        if target_pid.is_none() {
            return Some(BlockingState {
                reason: "Select a running game process before applying this tweak.".into(),
                next_action: "Attach the game process and retry.".into(),
            });
        }
        if requested_pid.is_some() && requested_pid != session.process_id {
            return Some(BlockingState {
                reason: "The requested process does not match the attached game session.".into(),
                next_action: "Capture a baseline and apply the tweak to the same attached process."
                    .into(),
            });
        }
    }
    None
}

pub fn require_tweak_allowed(
    kind: &str,
    session: &SessionState,
    requested_pid: Option<u32>,
) -> Result<(), String> {
    if let Some(block) = tweak_block_with_context(
        kind,
        session,
        requested_pid,
        optimizer_enabled(),
        baseline_matches_session(session),
    ) {
        return Err(block.reason);
    }
    Ok(())
}

pub fn auto_apply_allowed(action: &str, session: &SessionState) -> bool {
    if !optimizer_enabled() || !session_is_active(session) || !baseline_matches_session(session) {
        return false;
    }
    let settings = system_settings();
    if settings.automation_mode == "manual" {
        return false;
    }
    if settings.automation_mode == "trusted_profiles" && session.recommended_profile_id.is_none() {
        return false;
    }
    settings
        .automation_allowlist
        .iter()
        .any(|item| item == action)
}

fn registry_block_with_context(
    session: &SessionState,
    requested_pid: Option<u32>,
    requires_baseline: bool,
    optimizer_allowed: bool,
    registry_allowed: bool,
    baseline_matches: bool,
) -> Option<BlockingState> {
    if let Some(block) = common_mutation_block(session, optimizer_allowed, baseline_matches, false)
    {
        return Some(block);
    }
    if !registry_allowed {
        return Some(BlockingState {
            reason: "System preset changes are disabled in Settings.".into(),
            next_action: "Enable Allow system preset changes in Settings.".into(),
        });
    }
    if requires_baseline && !baseline_matches {
        return Some(BlockingState {
            reason: "A matching baseline for the current game session is required.".into(),
            next_action:
                "Capture a fresh baseline for the attached game before applying this change.".into(),
        });
    }
    if requested_pid.is_some() && requested_pid != session.process_id {
        return Some(BlockingState {
            reason: "The requested process does not match the attached game session.".into(),
            next_action: "Apply the preset to the same process used for the baseline.".into(),
        });
    }
    None
}

pub fn require_registry_preset_allowed(
    session: &SessionState,
    requested_pid: Option<u32>,
    requires_baseline: bool,
) -> Result<(), String> {
    let settings = system_settings();
    if let Some(block) = registry_block_with_context(
        session,
        requested_pid,
        requires_baseline,
        optimizer_enabled(),
        settings.registry_presets_enabled,
        baseline_matches_session(session),
    ) {
        return Err(block.reason);
    }
    Ok(())
}

pub fn registry_preset_block(
    session: &SessionState,
    requires_baseline: bool,
) -> Option<BlockingState> {
    let settings = system_settings();
    registry_block_with_context(
        session,
        None,
        requires_baseline,
        optimizer_enabled(),
        settings.registry_presets_enabled,
        baseline_matches_session(session),
    )
}

#[cfg(test)]
mod tests {
    use super::{
        baseline_matches_session_value, registry_block_with_context, tweak_block_with_context,
    };
    use crate::models::SessionState;
    use serde_json::json;

    fn active_session() -> SessionState {
        SessionState {
            session_id: Some("session-1".into()),
            state: "active".into(),
            process_id: Some(42),
            ..SessionState::default()
        }
    }

    #[test]
    fn baseline_must_match_session_and_process() {
        let session = active_session();

        assert!(baseline_matches_session_value(
            &json!({ "session_id": "session-1", "process_id": 42 }),
            &session,
        ));
        assert!(!baseline_matches_session_value(
            &json!({ "session_id": "session-2", "process_id": 42 }),
            &session,
        ));
        assert!(!baseline_matches_session_value(
            &json!({ "session_id": "session-1", "process_id": 43 }),
            &session,
        ));
    }

    #[test]
    fn tweak_is_blocked_when_optimizer_or_baseline_is_missing() {
        let session = active_session();

        let disabled = tweak_block_with_context("power_plan", &session, None, false, true).unwrap();
        let no_baseline =
            tweak_block_with_context("power_plan", &session, None, true, false).unwrap();

        assert!(disabled.reason.contains("disabled"));
        assert!(no_baseline.reason.contains("baseline"));
    }

    #[test]
    fn process_tweak_rejects_another_pid() {
        let block =
            tweak_block_with_context("process_priority", &active_session(), Some(43), true, true)
                .unwrap();

        assert!(block.reason.contains("does not match"));
    }

    #[test]
    fn registry_preset_requires_explicit_permission() {
        let block =
            registry_block_with_context(&active_session(), None, true, true, false, false).unwrap();

        assert!(block.reason.contains("System preset changes"));
    }
}
