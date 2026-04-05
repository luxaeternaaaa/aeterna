mod activity;
mod bootcfg;
mod ml;
mod models;
mod paths;
mod policy;
mod power;
mod presentmon;
mod processes;
mod registry;
mod services;
mod snapshots;
mod telemetry;
mod timer;

use std::{
    fs,
    io::{self, BufRead, Write},
    thread,
    time::Duration,
};

use models::{
    ApplyRegistryPresetRequest, ApplyRegistryPresetResponse, ApplyTweakRequest, ApplyTweakResponse, AttachSessionRequest,
    InspectRequest, IpcRequest, IpcResponse, MlInferenceRequest, OptimizationStatePayload, RollbackRequest,
    RollbackResponse, StartupDiagnostics,
};
use serde_json::{json, Value};
use time::{format_description::well_known::Rfc3339, OffsetDateTime};

#[cfg(windows)]
use windows_sys::Win32::{
    Foundation::CloseHandle,
    System::Threading::{OpenProcess, WaitForSingleObject, PROCESS_QUERY_LIMITED_INFORMATION},
};

#[cfg(windows)]
const SYNCHRONIZE_ACCESS: u32 = 0x00100000;
const INTERRUPT_SUBGROUP_GUID: &str = "48672f38-7a9a-4bb2-8bf8-3d85be19de4e";
const INTERRUPT_MODE_SETTING_GUID: &str = "2bfc24f9-5ea2-4801-8213-3dbae01aa39d";
const USB_SUBGROUP_GUID: &str = "2a737441-1930-4402-8d77-b2bebba308a3";
const USB_SELECTIVE_SUSPEND_GUID: &str = "48e6b7a6-50f5-4782-a5d4-53bb8f07e226";
const PCIE_SUBGROUP_GUID: &str = "501a4d13-42af-4429-9fd1-a8218c268e20";
const PCIE_LSPM_GUID: &str = "ee12f906-d277-404b-b6da-e5fa1a576df5";

fn service_name_for_preset(preset_id: &str) -> Option<&'static str> {
    match preset_id {
        "sysmain_off" => Some("SysMain"),
        "windows_search_off" => Some("WSearch"),
        "dps_off" => Some("DPS"),
        _ => None,
    }
}

fn snapshot_extra_u32(value: &Value, key: &str) -> Option<u32> {
    value
        .get(key)
        .and_then(Value::as_u64)
        .and_then(|raw| u32::try_from(raw).ok())
}

fn snapshot_extra_string(value: &Value, key: &str) -> Option<String> {
    value.get(key).and_then(Value::as_str).map(str::to_string)
}

fn now() -> String {
    OffsetDateTime::now_utc()
        .format(&Rfc3339)
        .expect("current utc time should format as rfc3339")
}

fn write_startup_diagnostics() {
    let diagnostics = StartupDiagnostics {
        launch_started_at: std::env::var("AETERNA_LAUNCH_STARTED_AT").ok(),
        sidecar_ready_at: Some(now()),
        ..StartupDiagnostics::default()
    };
    let bytes = serde_json::to_vec_pretty(&diagnostics).unwrap_or_default();
    let _ = fs::write(paths::startup_diagnostics_path(), bytes);
}

fn response(payload: Value) -> IpcResponse {
    IpcResponse { ok: true, payload: Some(payload), error: None }
}

fn error(message: String) -> IpcResponse {
    IpcResponse { ok: false, payload: None, error: Some(message) }
}

fn helper_available() -> bool {
    presentmon::PresentMonSession::new().helper_available()
}

fn recommended_power_plan_guid(profile: &str) -> Result<Option<String>, String> {
    let plans = power::list_power_plans()?;
    let preferred = if profile == "competitive" {
        ["ultimate performance", "high performance", "balanced"].as_slice()
    } else if profile == "quiet" {
        ["balanced"].as_slice()
    } else {
        ["high performance", "balanced"].as_slice()
    };
    for target in preferred {
        if let Some(plan) = plans
            .iter()
            .find(|plan| !plan.active && plan.name.to_ascii_lowercase().contains(target))
        {
            return Ok(Some(plan.guid.clone()));
        }
    }
    Ok(None)
}

fn inspect(process_id: Option<u32>) -> Result<OptimizationStatePayload, String> {
    telemetry::sync_pending_restore_state();
    let advanced_processes = processes::list_processes(24)?;
    let selected_process = process_id
        .map(|pid| {
            let fallback = advanced_processes
                .iter()
                .find(|item| item.pid == pid)
                .map(|item| item.name.clone())
                .unwrap_or_else(|| format!("Process {pid}"));
            processes::inspect_process(pid, &fallback)
        })
        .transpose()?;
    let session = telemetry::read_session_state();
    let detected_game = telemetry::detected_game(&session, helper_available());
    let capture_status = telemetry::capture_status(&session, helper_available());
    Ok(OptimizationStatePayload {
        processes: advanced_processes.clone(),
        advanced_processes,
        selected_process,
        power_plans: power::list_power_plans()?,
        registry_presets: registry::preset_summaries(&session, policy::system_settings().show_advanced_registry_details),
        activity: activity::list_recent(12),
        last_snapshot: snapshots::latest_snapshot(),
        session,
        detected_game,
        capture_status,
    })
}

fn attach(request: AttachSessionRequest) -> Result<OptimizationStatePayload, String> {
    let session = telemetry::attach_session(request.process_id, request.process_name.clone(), helper_available());
    let settings = policy::system_settings();
    if policy::auto_apply_allowed("process_priority", &session) {
        let _ = apply(ApplyTweakRequest {
            kind: "process_priority".into(),
            process_id: Some(request.process_id),
            priority: Some("above_normal".into()),
            affinity_preset: None,
            power_plan_guid: None,
        });
    }
    if policy::auto_apply_allowed("cpu_affinity", &session) {
        let _ = apply(ApplyTweakRequest {
            kind: "cpu_affinity".into(),
            process_id: Some(request.process_id),
            priority: None,
            affinity_preset: Some("balanced_threads".into()),
            power_plan_guid: None,
        });
    }
    if policy::auto_apply_allowed("power_plan", &session) {
        if let Some(guid) = recommended_power_plan_guid(&settings.active_profile)? {
            let _ = apply(ApplyTweakRequest {
                kind: "power_plan".into(),
                process_id: Some(request.process_id),
                priority: None,
                affinity_preset: None,
                power_plan_guid: Some(guid),
            });
        }
    }
    inspect(Some(request.process_id))
}

fn apply(request: ApplyTweakRequest) -> Result<ApplyTweakResponse, String> {
    let session = telemetry::read_session_state();
    let session_id = session.session_id.clone();
    policy::require_tweak_allowed(&request.kind, &session, request.process_id)?;
    match request.kind.as_str() {
        "process_priority" => {
            let pid = request.process_id.or(session.process_id).ok_or("Process id is required.")?;
            let current = inspect(Some(pid))?.selected_process.ok_or("Selected process is unavailable.")?;
            let restore = processes::capture_restore_state(pid, &current.name)?;
            let mut draft = snapshots::next_snapshot(
                "process-priority",
                format!("Before raising priority for {}", current.name),
                Some(restore),
                None,
                None,
            );
            draft.session_id = session_id.clone();
            let snapshot = snapshots::create_snapshot(draft)?;
            processes::apply_priority(pid, request.priority.as_deref().unwrap_or("above_normal"))?;
            let _ = snapshots::mark_snapshot_applied(&snapshot.id);
            telemetry::track_tweak(&snapshot.id, "process_priority");
            let entry = activity::append(snapshots::activity(
                "tweak",
                "Priority applied",
                format!("Raised {} to {}.", current.name, request.priority.clone().unwrap_or_else(|| "above_normal".into())),
                "medium",
                Some(snapshot.id.clone()),
                session_id,
                true,
            ))?;
            Ok(ApplyTweakResponse { state: inspect(Some(pid))?, snapshot, activity: entry })
        }
        "process_qos" => {
            let pid = request.process_id.or(session.process_id).ok_or("Process id is required.")?;
            let current = inspect(Some(pid))?.selected_process.ok_or("Selected process is unavailable.")?;
            let restore = processes::capture_restore_state(pid, &current.name)?;
            let mut draft = snapshots::next_snapshot(
                "process-qos",
                format!("Before setting QoS for {}", current.name),
                Some(restore),
                None,
                None,
            );
            draft.session_id = session_id.clone();
            let snapshot = snapshots::create_snapshot(draft)?;
            processes::apply_process_qos(pid, "high")?;
            let _ = snapshots::mark_snapshot_applied(&snapshot.id);
            telemetry::track_tweak(&snapshot.id, "process_qos");
            let entry = activity::append(snapshots::activity(
                "tweak",
                "Per-process QoS applied",
                format!("Enabled high QoS policy for {}.", current.name),
                "medium",
                Some(snapshot.id.clone()),
                session_id,
                true,
            ))?;
            Ok(ApplyTweakResponse { state: inspect(Some(pid))?, snapshot, activity: entry })
        }
        "process_isolation" => {
            let pid = request.process_id.or(session.process_id).ok_or("Process id is required.")?;
            let current = inspect(Some(pid))?.selected_process.ok_or("Selected process is unavailable.")?;
            let restore = processes::capture_restore_state(pid, &current.name)?;
            let mut draft = snapshots::next_snapshot(
                "cpu-affinity-isolation",
                format!("Before isolating threads for {}", current.name),
                Some(restore),
                None,
                None,
            );
            draft.session_id = session_id.clone();
            let snapshot = snapshots::create_snapshot(draft)?;
            processes::apply_affinity(pid, "one_thread_per_core")?;
            let _ = snapshots::mark_snapshot_applied(&snapshot.id);
            telemetry::track_tweak(&snapshot.id, "process_isolation");
            let entry = activity::append(snapshots::activity(
                "tweak",
                "Process isolation applied",
                format!("Applied one-thread-per-core affinity for {}.", current.name),
                "medium",
                Some(snapshot.id.clone()),
                session_id,
                true,
            ))?;
            Ok(ApplyTweakResponse { state: inspect(Some(pid))?, snapshot, activity: entry })
        }
        "cpu_affinity" => {
            let pid = request.process_id.or(session.process_id).ok_or("Process id is required.")?;
            let current = inspect(Some(pid))?.selected_process.ok_or("Selected process is unavailable.")?;
            let restore = processes::capture_restore_state(pid, &current.name)?;
            let mut draft = snapshots::next_snapshot(
                "cpu-affinity",
                format!("Before changing affinity for {}", current.name),
                Some(restore),
                None,
                None,
            );
            draft.session_id = session_id.clone();
            let snapshot = snapshots::create_snapshot(draft)?;
            processes::apply_affinity(pid, request.affinity_preset.as_deref().unwrap_or("balanced_threads"))?;
            let _ = snapshots::mark_snapshot_applied(&snapshot.id);
            telemetry::track_tweak(&snapshot.id, "cpu_affinity");
            let entry = activity::append(snapshots::activity(
                "tweak",
                "Affinity applied",
                format!("Updated {} affinity preset.", current.name),
                "medium",
                Some(snapshot.id.clone()),
                session_id,
                true,
            ))?;
            Ok(ApplyTweakResponse { state: inspect(Some(pid))?, snapshot, activity: entry })
        }
        "power_plan" => {
            let current = power::active_power_plan()?;
            let target = request.power_plan_guid.ok_or("Power plan guid is required.")?;
            let mut draft = snapshots::next_snapshot(
                "power-plan",
                "Before switching power plan".into(),
                None,
                current.as_ref().map(|plan| plan.guid.clone()),
                current.as_ref().map(|plan| plan.name.clone()),
            );
            draft.session_id = session_id.clone();
            let snapshot = snapshots::create_snapshot(draft)?;
            power::set_active_power_plan(&target)?;
            let _ = snapshots::mark_snapshot_applied(&snapshot.id);
            telemetry::track_tweak(&snapshot.id, "power_plan");
            let entry = activity::append(snapshots::activity(
                "tweak",
                "Power plan applied",
                format!("Activated power plan {target}."),
                "low",
                Some(snapshot.id.clone()),
                session_id,
                true,
            ))?;
            Ok(ApplyTweakResponse { state: inspect(request.process_id.or(session.process_id))?, snapshot, activity: entry })
        }
        "interrupt_affinity_lock" => {
            let (old_ac, old_dc) = power::query_setting_indices(INTERRUPT_SUBGROUP_GUID, INTERRUPT_MODE_SETTING_GUID)?;
            let mut draft = snapshots::next_snapshot(
                "power-setting",
                "Before changing interrupt steering mode".into(),
                None,
                None,
                None,
            );
            draft.session_id = session_id.clone();
            draft.extra = json!({
                "kind": "power_setting",
                "subgroup_guid": INTERRUPT_SUBGROUP_GUID,
                "setting_guid": INTERRUPT_MODE_SETTING_GUID,
                "old_ac": old_ac,
                "old_dc": old_dc,
            });
            let snapshot = snapshots::create_snapshot(draft)?;
            power::set_setting_indices(INTERRUPT_SUBGROUP_GUID, INTERRUPT_MODE_SETTING_GUID, Some(4), Some(4))?;
            let _ = snapshots::mark_snapshot_applied(&snapshot.id);
            telemetry::track_tweak(&snapshot.id, "interrupt_affinity_lock");
            let entry = activity::append(snapshots::activity(
                "tweak",
                "Interrupt affinity applied",
                "Locked interrupt steering mode for the active power scheme.".into(),
                "medium",
                Some(snapshot.id.clone()),
                session_id,
                true,
            ))?;
            Ok(ApplyTweakResponse { state: inspect(request.process_id.or(session.process_id))?, snapshot, activity: entry })
        }
        "usb_selective_suspend_off" => {
            let (old_ac, old_dc) = power::query_setting_indices(USB_SUBGROUP_GUID, USB_SELECTIVE_SUSPEND_GUID)?;
            let mut draft = snapshots::next_snapshot(
                "power-setting",
                "Before disabling USB selective suspend".into(),
                None,
                None,
                None,
            );
            draft.session_id = session_id.clone();
            draft.extra = json!({
                "kind": "power_setting",
                "subgroup_guid": USB_SUBGROUP_GUID,
                "setting_guid": USB_SELECTIVE_SUSPEND_GUID,
                "old_ac": old_ac,
                "old_dc": old_dc,
            });
            let snapshot = snapshots::create_snapshot(draft)?;
            power::set_setting_indices(USB_SUBGROUP_GUID, USB_SELECTIVE_SUSPEND_GUID, Some(0), Some(0))?;
            let _ = snapshots::mark_snapshot_applied(&snapshot.id);
            telemetry::track_tweak(&snapshot.id, "usb_selective_suspend_off");
            let entry = activity::append(snapshots::activity(
                "tweak",
                "USB selective suspend disabled",
                "Disabled USB selective suspend for AC/DC power mode.".into(),
                "medium",
                Some(snapshot.id.clone()),
                session_id,
                true,
            ))?;
            Ok(ApplyTweakResponse { state: inspect(request.process_id.or(session.process_id))?, snapshot, activity: entry })
        }
        "pcie_lspm_off" => {
            let (old_ac, old_dc) = power::query_setting_indices(PCIE_SUBGROUP_GUID, PCIE_LSPM_GUID)?;
            let mut draft = snapshots::next_snapshot(
                "power-setting",
                "Before disabling PCIe Link State Power Management".into(),
                None,
                None,
                None,
            );
            draft.session_id = session_id.clone();
            draft.extra = json!({
                "kind": "power_setting",
                "subgroup_guid": PCIE_SUBGROUP_GUID,
                "setting_guid": PCIE_LSPM_GUID,
                "old_ac": old_ac,
                "old_dc": old_dc,
            });
            let snapshot = snapshots::create_snapshot(draft)?;
            power::set_setting_indices(PCIE_SUBGROUP_GUID, PCIE_LSPM_GUID, Some(0), Some(0))?;
            let _ = snapshots::mark_snapshot_applied(&snapshot.id);
            telemetry::track_tweak(&snapshot.id, "pcie_lspm_off");
            let entry = activity::append(snapshots::activity(
                "tweak",
                "PCIe LSPM disabled",
                "Disabled PCIe Link State Power Management for AC/DC mode.".into(),
                "medium",
                Some(snapshot.id.clone()),
                session_id,
                true,
            ))?;
            Ok(ApplyTweakResponse { state: inspect(request.process_id.or(session.process_id))?, snapshot, activity: entry })
        }
        "disable_dynamic_ticks" => {
            let previous = bootcfg::query_option("disabledynamictick")?;
            let mut draft = snapshots::next_snapshot(
                "boot-option",
                "Before disabling dynamic ticks".into(),
                None,
                None,
                None,
            );
            draft.session_id = session_id.clone();
            draft.extra = json!({
                "kind": "boot_option",
                "option_key": "disabledynamictick",
                "previous_value": previous,
            });
            let snapshot = snapshots::create_snapshot(draft)?;
            bootcfg::set_option("disabledynamictick", "yes")?;
            let _ = snapshots::mark_snapshot_applied(&snapshot.id);
            telemetry::track_tweak(&snapshot.id, "disable_dynamic_ticks");
            let entry = activity::append(snapshots::activity(
                "tweak",
                "Dynamic ticks disabled",
                "Set boot option disabledynamictick=yes.".into(),
                "high",
                Some(snapshot.id.clone()),
                session_id,
                true,
            ))?;
            Ok(ApplyTweakResponse { state: inspect(request.process_id.or(session.process_id))?, snapshot, activity: entry })
        }
        "disable_hpet" => {
            let previous = bootcfg::query_option("useplatformclock")?;
            let mut draft = snapshots::next_snapshot(
                "boot-option",
                "Before disabling HPET boot option".into(),
                None,
                None,
                None,
            );
            draft.session_id = session_id.clone();
            draft.extra = json!({
                "kind": "boot_option",
                "option_key": "useplatformclock",
                "previous_value": previous,
            });
            let snapshot = snapshots::create_snapshot(draft)?;
            bootcfg::set_option("useplatformclock", "false")?;
            let _ = snapshots::mark_snapshot_applied(&snapshot.id);
            telemetry::track_tweak(&snapshot.id, "disable_hpet");
            let entry = activity::append(snapshots::activity(
                "tweak",
                "HPET boot flag disabled",
                "Set boot option useplatformclock=false.".into(),
                "high",
                Some(snapshot.id.clone()),
                session_id,
                true,
            ))?;
            Ok(ApplyTweakResponse { state: inspect(request.process_id.or(session.process_id))?, snapshot, activity: entry })
        }
        "low_timer_resolution" => {
            let requested = timer::enable_low_resolution()?;
            let mut draft = snapshots::next_snapshot(
                "timer-resolution",
                "Before lowering timer resolution".into(),
                None,
                None,
                None,
            );
            draft.session_id = session_id.clone();
            draft.extra = json!({
                "kind": "timer_resolution",
                "requested_100ns": requested,
            });
            let snapshot = snapshots::create_snapshot(draft)?;
            let _ = snapshots::mark_snapshot_applied(&snapshot.id);
            telemetry::track_tweak(&snapshot.id, "timer_resolution_low");
            let entry = activity::append(snapshots::activity(
                "tweak",
                "Timer resolution lowered",
                format!("Requested system timer resolution {} (100ns units).", requested),
                "medium",
                Some(snapshot.id.clone()),
                session_id,
                true,
            ))?;
            Ok(ApplyTweakResponse { state: inspect(request.process_id.or(session.process_id))?, snapshot, activity: entry })
        }
        _ => Err(format!("Unsupported tweak kind: {}", request.kind)),
    }
}

fn apply_registry_preset(request: ApplyRegistryPresetRequest) -> Result<ApplyRegistryPresetResponse, String> {
    let session = telemetry::read_session_state();
    let session_id = session.session_id.clone();
    if request.preset_id == "gpu_preference_high" || request.preset_id == "fullscreen_optimizations_off" {
        policy::require_registry_preset_allowed(&session, false)?;
        let pid = request
            .process_id
            .or(session.process_id)
            .ok_or("Process id is required for per-app graphics preset.")?;
        let process_path = processes::process_image_path(pid).ok_or("Unable to resolve executable path for selected process.")?;
        let draft = if request.preset_id == "gpu_preference_high" {
            registry::build_gpu_preference_snapshot(&process_path, session_id.clone())?
        } else {
            registry::build_fullscreen_optimizations_snapshot(&process_path, session_id.clone())?
        };
        let snapshot = snapshots::create_snapshot(draft)?;
        let stored = snapshots::load_snapshot(&snapshot.id)?;
        registry::apply_snapshot(&stored)?;
        let _ = snapshots::mark_snapshot_applied(&snapshot.id);
        telemetry::track_tweak(&snapshot.id, &format!("registry:{}", request.preset_id));
        telemetry::sync_pending_restore_state();
        let detail = if request.preset_id == "gpu_preference_high" {
            "Applied per-app GPU preference (High performance).".to_string()
        } else {
            "Disabled fullscreen optimizations for the selected executable.".to_string()
        };
        let entry = activity::append(models::ActivityEntry {
            id: format!("activity-{}", OffsetDateTime::now_utc().unix_timestamp_nanos() / 1_000_000),
            timestamp: now(),
            category: "registry".into(),
            action: "System preset applied".into(),
            detail,
            risk: "low".into(),
            snapshot_id: Some(snapshot.id.clone()),
            session_id,
            action_id: Some(snapshot.id.clone()),
            can_undo: true,
            proof_link: None,
            blocked_by_policy: false,
        })?;
        return Ok(ApplyRegistryPresetResponse {
            status: "applied".into(),
            state: inspect(request.process_id.or(session.process_id))?,
            snapshot: Some(snapshot),
            activity: entry,
            blocking_reason: None,
            next_action: None,
        });
    }
    let summaries = registry::preset_summaries(&session, true);
    let summary = summaries
        .into_iter()
        .find(|preset| preset.id == request.preset_id)
        .ok_or_else(|| format!("Unknown registry preset: {}", request.preset_id))?;
    if let Some(reason) = summary.blocking_reason.clone() {
        let entry = activity::append(models::ActivityEntry {
            id: format!("activity-{}", OffsetDateTime::now_utc().unix_timestamp_nanos() / 1_000_000),
            timestamp: now(),
            category: "blocked".into(),
            action: "System preset blocked".into(),
            detail: reason.clone(),
            risk: summary.risk.clone(),
            snapshot_id: None,
            session_id: session_id.clone(),
            action_id: None,
            can_undo: false,
            proof_link: None,
            blocked_by_policy: true,
        })?;
        return Ok(ApplyRegistryPresetResponse {
            status: "blocked".into(),
            state: inspect(request.process_id.or(session.process_id))?,
            snapshot: None,
            activity: entry,
            blocking_reason: Some(reason),
            next_action: summary.next_action,
        });
    }
    policy::require_registry_preset_allowed(&session, summary.requires_admin)?;
    let mut draft = if request.preset_id == "windowed_optimizations_on" {
        registry::build_windowed_optimizations_snapshot(session_id.clone())?
    } else {
        registry::build_snapshot(&request.preset_id, session_id.clone())?
    };
    if let Some(service_name) = service_name_for_preset(&request.preset_id) {
        let was_running = services::is_service_running(service_name).unwrap_or(false);
        let old_start = services::query_service_start_type(service_name).ok().flatten();
        draft.extra = json!({
            "kind": "service",
            "service_name": service_name,
            "was_running": was_running,
            "old_start": old_start,
        });
    }
    let snapshot = snapshots::create_snapshot(draft)?;
    let stored = snapshots::load_snapshot(&snapshot.id)?;
    registry::apply_snapshot(&stored)?;
    if let Some(service_name) = service_name_for_preset(&request.preset_id) {
        let _ = services::stop_service(service_name);
    }
    let _ = snapshots::mark_snapshot_applied(&snapshot.id);
    telemetry::track_tweak(&snapshot.id, &format!("registry:{}", request.preset_id));
    telemetry::sync_pending_restore_state();
    let entry = activity::append(models::ActivityEntry {
        id: format!("activity-{}", OffsetDateTime::now_utc().unix_timestamp_nanos() / 1_000_000),
        timestamp: now(),
        category: "registry".into(),
        action: "System preset applied".into(),
        detail: format!("Applied {}.", summary.title),
        risk: summary.risk,
        snapshot_id: Some(snapshot.id.clone()),
        session_id,
        action_id: Some(snapshot.id.clone()),
        can_undo: true,
        proof_link: None,
        blocked_by_policy: false,
    })?;
    Ok(ApplyRegistryPresetResponse {
        status: "applied".into(),
        state: inspect(request.process_id.or(session.process_id))?,
        snapshot: Some(snapshot),
        activity: entry,
        blocking_reason: None,
        next_action: None,
    })
}

fn rollback(request: RollbackRequest) -> Result<RollbackResponse, String> {
    let snapshot = snapshots::load_snapshot(&request.snapshot_id)?;
    if let Some(process) = snapshot.process.as_ref() {
        processes::restore_process(process)?;
    }
    if let Some(guid) = snapshot.power_plan_guid.as_deref() {
        power::set_active_power_plan(guid)?;
    }
    if !snapshot.registry_entries.is_empty() {
        registry::restore_snapshot(&snapshot)?;
    }
    if snapshot.kind == "boot-option" {
        if let Some(option_key) = snapshot_extra_string(&snapshot.extra, "option_key") {
            let previous_value = snapshot.extra.get("previous_value").and_then(Value::as_str);
            if let Some(value) = previous_value {
                let _ = bootcfg::set_option(&option_key, value);
            } else {
                let _ = bootcfg::delete_option(&option_key);
            }
        }
    }
    if snapshot.kind == "power-setting" {
        if let (Some(subgroup_guid), Some(setting_guid)) = (
            snapshot_extra_string(&snapshot.extra, "subgroup_guid"),
            snapshot_extra_string(&snapshot.extra, "setting_guid"),
        ) {
            let old_ac = snapshot_extra_u32(&snapshot.extra, "old_ac");
            let old_dc = snapshot_extra_u32(&snapshot.extra, "old_dc");
            let _ = power::set_setting_indices(&subgroup_guid, &setting_guid, old_ac, old_dc);
        }
    }
    if snapshot.kind == "timer-resolution" {
        if let Some(requested) = snapshot_extra_u32(&snapshot.extra, "requested_100ns") {
            let _ = timer::disable_resolution(requested);
        }
    }
    if snapshot.extra.get("kind").and_then(Value::as_str) == Some("service") {
        if snapshot.extra.get("was_running").and_then(Value::as_bool).unwrap_or(false) {
            if let Some(service_name) = snapshot.extra.get("service_name").and_then(Value::as_str) {
                let _ = services::start_service(service_name);
            }
        }
    }
    let _ = snapshots::mark_snapshot_restored(&request.snapshot_id);
    telemetry::untrack_snapshot(&request.snapshot_id);
    telemetry::sync_pending_restore_state();
    let entry = activity::append(snapshots::activity(
        if snapshot.registry_entries.is_empty() { "restore" } else { "registry-restore" },
        if snapshot.registry_entries.is_empty() { "Rollback completed" } else { "System preset restored" },
        format!("Restored {}.", snapshot.note),
        "low",
        Some(snapshot.id.clone()),
        snapshot.session_id.clone(),
        false,
    ))?;
    Ok(RollbackResponse {
        state: inspect(request.process_id.or(snapshot.process.as_ref().map(|process| process.pid)))?,
        activity: entry,
    })
}

fn dispatch(request: IpcRequest) -> Result<Value, String> {
    match request.command.as_str() {
        "ping" => Ok(json!({
            "version": env!("CARGO_PKG_VERSION"),
            "protocol_version": "3",
            "session": telemetry::read_session_state(),
        })),
        "inspect" => Ok(json!(inspect(
            serde_json::from_value::<InspectRequest>(request.payload).map_err(|error| error.to_string())?.process_id
        )?)),
        "attach_session" => Ok(json!(attach(
            serde_json::from_value::<AttachSessionRequest>(request.payload).map_err(|error| error.to_string())?
        )?)),
        "end_session" => {
            telemetry::end_session()?;
            Ok(json!(inspect(None)?))
        }
        "apply_tweak" => Ok(json!(apply(
            serde_json::from_value::<ApplyTweakRequest>(request.payload).map_err(|error| error.to_string())?
        )?)),
        "apply_registry_preset" => Ok(json!(apply_registry_preset(
            serde_json::from_value::<ApplyRegistryPresetRequest>(request.payload).map_err(|error| error.to_string())?
        )?)),
        "rollback" => Ok(json!(rollback(
            serde_json::from_value::<RollbackRequest>(request.payload).map_err(|error| error.to_string())?
        )?)),
        "ml_inference" => Ok(json!(ml::infer(
            serde_json::from_value::<MlInferenceRequest>(request.payload).map_err(|error| error.to_string())?
        ))),
        "ml_runtime_truth" => Ok(json!(ml::runtime_truth())),
        _ => Err(format!("Unknown command: {}", request.command)),
    }
}

#[cfg(windows)]
fn spawn_parent_watch(parent_pid: u32) {
    thread::spawn(move || {
        let handle = unsafe { OpenProcess(SYNCHRONIZE_ACCESS | PROCESS_QUERY_LIMITED_INFORMATION, 0, parent_pid) };
        if handle.is_null() {
            std::process::exit(0);
        }
        loop {
            if unsafe { WaitForSingleObject(handle, 0) } == 0 {
                unsafe { CloseHandle(handle) };
                std::process::exit(0);
            }
            thread::sleep(Duration::from_secs(2));
        }
    });
}

fn main() {
    let _ = paths::ensure_runtime_dirs();
    write_startup_diagnostics();
    telemetry::sync_pending_restore_state();
    telemetry::spawn_collector();
    if let Some(value) = std::env::args()
        .collect::<Vec<_>>()
        .windows(2)
        .find(|part| part[0] == "--parent-pid")
        .and_then(|part| part[1].parse::<u32>().ok())
    {
        #[cfg(windows)]
        spawn_parent_watch(value);
    }
    let stdin = io::stdin();
    let stdout = io::stdout();
    let mut writer = stdout.lock();
    for line in stdin.lock().lines().map_while(Result::ok) {
        let packet = serde_json::from_str::<IpcRequest>(&line).map(dispatch);
        let outgoing = match packet {
            Ok(Ok(payload)) => response(payload),
            Ok(Err(message)) => error(message),
            Err(message) => error(message.to_string()),
        };
        let _ = serde_json::to_writer(&mut writer, &outgoing);
        let _ = writer.write_all(b"\n");
        let _ = writer.flush();
    }
}
