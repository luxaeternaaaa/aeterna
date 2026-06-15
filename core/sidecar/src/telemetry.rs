use std::{
    collections::HashMap,
    fs::{self, OpenOptions},
    io::Write,
    thread,
    time::{Duration, Instant},
};

use serde_json::{json, Value};
use time::{format_description::well_known::Rfc3339, OffsetDateTime};

use crate::{
    activity,
    bootcfg,
    models::{CaptureStatus, DetectedGame, SessionState, TweakSnapshot},
    paths::{feature_flags_path, live_telemetry_path, session_state_path, system_settings_path},
    presentmon::PresentMonSession,
    power, registry,
    processes::{self, logical_processor_count},
    services,
    snapshots,
    timer,
};

fn now() -> String {
    OffsetDateTime::now_utc()
        .format(&Rfc3339)
        .expect("current utc time should format as rfc3339")
}

fn snapshot_extra_u32(value: &Value, key: &str) -> Option<u32> {
    value
        .get(key)
        .and_then(Value::as_u64)
        .and_then(|raw| u32::try_from(raw).ok())
}

fn restore_error(step: &str, error: String) -> String {
    format!("Rollback failed while restoring {step}: {error}")
}

pub fn restore_snapshot_state(snapshot: &TweakSnapshot, restore_process_state: bool) -> Result<(), String> {
    if restore_process_state {
        if let Some(process) = snapshot.process.as_ref() {
            processes::restore_process(process).map_err(|error| restore_error("process state", error))?;
        }
    }
    if let Some(guid) = snapshot.power_plan_guid.as_deref() {
        power::set_active_power_plan(guid).map_err(|error| restore_error("power plan", error))?;
    }
    if !snapshot.registry_entries.is_empty() {
        registry::restore_snapshot(snapshot).map_err(|error| restore_error("registry values", error))?;
    }
    if snapshot.kind == "boot-option" {
        let option_key = snapshot
            .extra
            .get("option_key")
            .and_then(Value::as_str)
            .ok_or_else(|| "Rollback failed: boot option snapshot is missing option_key.".to_string())?;
        if let Some(previous_value) = snapshot.extra.get("previous_value").and_then(Value::as_str) {
            bootcfg::set_option(option_key, previous_value)
                .map_err(|error| restore_error("boot option", error))?;
        } else {
            bootcfg::delete_option(option_key).map_err(|error| restore_error("boot option", error))?;
        }
    }
    if snapshot.kind == "power-setting" {
        let subgroup_guid = snapshot
            .extra
            .get("subgroup_guid")
            .and_then(Value::as_str)
            .ok_or_else(|| "Rollback failed: power setting snapshot is missing subgroup_guid.".to_string())?;
        let setting_guid = snapshot
            .extra
            .get("setting_guid")
            .and_then(Value::as_str)
            .ok_or_else(|| "Rollback failed: power setting snapshot is missing setting_guid.".to_string())?;
        let old_ac = snapshot_extra_u32(&snapshot.extra, "old_ac");
        let old_dc = snapshot_extra_u32(&snapshot.extra, "old_dc");
        power::set_setting_indices(subgroup_guid, setting_guid, old_ac, old_dc)
            .map_err(|error| restore_error("power setting", error))?;
    }
    if snapshot.kind == "timer-resolution" {
        let requested = snapshot_extra_u32(&snapshot.extra, "requested_100ns")
            .ok_or_else(|| "Rollback failed: timer snapshot is missing requested_100ns.".to_string())?;
        timer::disable_resolution(requested).map_err(|error| restore_error("timer resolution", error))?;
    }
    if snapshot.extra.get("kind").and_then(Value::as_str) == Some("service")
        && snapshot.extra.get("was_running").and_then(Value::as_bool).unwrap_or(false)
    {
        let service_name = snapshot
            .extra
            .get("service_name")
            .and_then(Value::as_str)
            .ok_or_else(|| "Rollback failed: service snapshot is missing service_name.".to_string())?;
        services::start_service(service_name)
            .map_err(|error| restore_error(&format!("service {service_name}"), error))?;
    }
    if snapshot.extra.get("kind").and_then(Value::as_str) == Some("services") {
        let service_states = snapshot
            .extra
            .get("services")
            .and_then(Value::as_array)
            .ok_or_else(|| "Rollback failed: services snapshot is missing service states.".to_string())?;
        for service in service_states {
            if !service.get("was_running").and_then(Value::as_bool).unwrap_or(false) {
                continue;
            }
            let service_name = service
                .get("name")
                .and_then(Value::as_str)
                .ok_or_else(|| "Rollback failed: service state is missing its name.".to_string())?;
            services::start_service(service_name)
                .map_err(|error| restore_error(&format!("service {service_name}"), error))?;
        }
    }
    Ok(())
}

fn read_json(path: std::path::PathBuf, fallback: Value) -> Value {
    fs::read(path)
        .ok()
        .and_then(|bytes| serde_json::from_slice(&bytes).ok())
        .unwrap_or(fallback)
}

fn write_json(path: std::path::PathBuf, payload: &Value) {
    let _ = fs::write(path, serde_json::to_vec_pretty(payload).unwrap_or_default());
}

fn telemetry_mode() -> String {
    read_json(system_settings_path(), json!({ "telemetry_mode": "demo" }))
        .get("telemetry_mode")
        .and_then(Value::as_str)
        .unwrap_or("demo")
        .to_string()
}

fn telemetry_enabled() -> bool {
    read_json(feature_flags_path(), json!({ "telemetry_collect": false }))
        .get("telemetry_collect")
        .and_then(Value::as_bool)
        .unwrap_or(false)
}

fn recommended_profile(name: &str) -> Option<String> {
    let value = normalized_process_name(name);
    if value.contains("valorant") {
        return Some("valorant-safe".into());
    }
    if value.contains("cs2") || value.contains("counter") {
        return Some("cs2-safe".into());
    }
    if value.contains("fortnite") {
        return Some("fortnite-balanced".into());
    }
    if value.contains("apex") {
        return Some("apex-balanced".into());
    }
    if value == "cod" || value.starts_with("cod2") || value.contains("callofduty") || value.contains("modernwarfare") || value.contains("warzone") {
        return Some("warzone-balanced".into());
    }
    None
}

fn normalized_process_name(name: &str) -> String {
    name
        .to_ascii_lowercase()
        .trim_end_matches(".exe")
        .chars()
        .filter(|ch| ch.is_ascii_alphanumeric())
        .collect::<String>()
}

fn is_known_game_process(name: &str) -> bool {
    let value = normalized_process_name(name);
    recommended_profile(name).is_some()
        || matches!(
            value.as_str(),
            "dota2"
                | "leagueoflegends"
                | "leagueoflegendsclient"
                | "gta5"
                | "gtasa"
                | "gtaiv"
                | "pubg"
                | "tslgame"
                | "destiny2"
                | "rustclient"
                | "eldenring"
                | "cyberpunk2077"
        )
        || value.contains("tarkov")
        || value.contains("overwatch")
}

pub fn read_session_state() -> SessionState {
    fs::read(session_state_path())
        .ok()
        .and_then(|bytes| serde_json::from_slice(&bytes).ok())
        .unwrap_or(SessionState {
            state: "idle".into(),
            telemetry_source: telemetry_mode(),
            capture_source: "counters-fallback".into(),
            capture_quality: "idle".into(),
            pending_registry_restore: false,
            pending_registry_snapshot_id: None,
            ..SessionState::default()
        })
}

fn write_session_state(state: &SessionState) {
    let payload = serde_json::to_value(state).unwrap_or_else(|_| json!({ "state": "idle" }));
    write_json(session_state_path(), &payload);
}

pub fn sync_pending_restore_state() {
    let mut session = read_session_state();
    if let Some(snapshot) = snapshots::pending_registry_restore() {
        session.pending_registry_restore = true;
        session.pending_registry_snapshot_id = Some(snapshot.id.clone());
        session.auto_restore_pending = true;
        if session.capture_reason.is_none() {
            session.capture_reason = Some("A previous system preset still needs to be restored before another one can be applied.".into());
        }
    } else {
        session.pending_registry_restore = false;
        session.pending_registry_snapshot_id = None;
    }
    write_session_state(&session);
}

fn append_live_point(point: Value) {
    let path = live_telemetry_path();
    if let Ok(mut handle) = OpenOptions::new().create(true).append(true).open(path) {
        let _ = handle.write_all(serde_json::to_string(&point).unwrap_or_default().as_bytes());
        let _ = handle.write_all(b"\n");
    }
}

fn session_identifier(pid: u32) -> String {
    format!("session-{}-{pid}", OffsetDateTime::now_utc().unix_timestamp_nanos() / 1_000_000)
}

fn can_reuse_attached_session(session: &SessionState, process_id: u32) -> bool {
    session.session_id.is_some()
        && session.process_id == Some(process_id)
        && matches!(session.state.as_str(), "attached" | "active")
}

pub fn attach_session(process_id: u32, process_name: String, helper_available: bool) -> Result<(SessionState, bool), String> {
    sync_pending_restore_state();
    let mut session = read_session_state();
    if can_reuse_attached_session(&session, process_id) {
        session.process_name = Some(process_name);
        session.last_seen_at = Some(now());
        session.capture_requested = false;
        session.capture_source = "counters-fallback".into();
        session.capture_quality = if helper_available { "ready".into() } else { "degraded".into() };
        session.capture_reason = Some(if helper_available {
            "PresentMon is ready and will start only during a benchmark capture.".into()
        } else {
            "Official Intel PresentMon requires Aeterna to run as administrator before real FPS capture can start.".into()
        });
        write_session_state(&session);
        return Ok((session, false));
    }
    if session.process_id.is_some_and(|pid| pid != process_id) && !session.active_snapshot_ids.is_empty() {
        return Err("End or restore the current optimization session before attaching a different game.".into());
    }

    let _ = fs::remove_file(live_telemetry_path());
    let attached_at = now();
    session.session_id = Some(session_identifier(process_id));
    session.state = "attached".into();
    session.process_id = Some(process_id);
    session.process_name = Some(process_name.clone());
    session.started_at = Some(attached_at.clone());
    session.attached_at = Some(attached_at.clone());
    session.last_seen_at = Some(attached_at);
    session.ended_at = None;
    session.restored_at = None;
    session.telemetry_source = telemetry_mode();
    session.auto_restore_pending = !session.active_snapshot_ids.is_empty() || session.pending_registry_restore;
    session.detected_candidate_pid = Some(process_id);
    session.detected_candidate_name = Some(process_name.clone());
    session.recommended_profile_id = recommended_profile(&process_name);
    session.capture_requested = false;
    session.capture_source = "counters-fallback".into();
    session.capture_quality = if helper_available { "ready".into() } else { "degraded".into() };
    session.capture_reason = Some(if helper_available {
        "PresentMon is ready and will start only during a benchmark capture.".into()
    } else {
        "Official Intel PresentMon requires Aeterna to run as administrator before real FPS capture can start.".into()
    });
    write_session_state(&session);
    let _ = activity::append(snapshots::activity(
        "session",
        "Session attached",
        format!("Attached to {} ({process_id}).", process_name),
        "low",
        None,
        session.session_id.clone(),
        false,
    ));
    Ok((session, true))
}

pub fn end_session() -> Result<SessionState, String> {
    let mut session = read_session_state();
    let process_alive = session.process_id.map(processes::process_exists).unwrap_or(false);
    restore_for_session_end(&mut session, process_alive)?;
    session.state = "restored".into();
    session.ended_at = Some(now());
    session.capture_source = "counters-fallback".into();
    session.capture_quality = "idle".into();
    session.capture_reason = Some("Session ended by the user.".into());
    session.capture_requested = false;
    session.process_id = None;
    session.process_name = None;
    write_session_state(&session);
    sync_pending_restore_state();
    Ok(session)
}

pub fn recover_interrupted_session() -> Result<Option<SessionState>, String> {
    let mut session = read_session_state();
    if session.active_snapshot_ids.is_empty() {
        return Ok(None);
    }
    if session.process_id.map(processes::process_exists).unwrap_or(false) {
        return Ok(None);
    }

    if let Err(error) = restore_for_session_end(&mut session, false) {
        session.auto_restore_pending = true;
        session.capture_quality = "blocked".into();
        session.capture_reason = Some(format!(
            "Automatic recovery could not restore the interrupted session: {error}"
        ));
        write_session_state(&session);
        let snapshot_id = session.active_snapshot_ids.first().cloned();
        let _ = activity::append(snapshots::activity(
            "restore-failed",
            "Automatic recovery failed",
            error.clone(),
            "high",
            snapshot_id,
            session.session_id.clone(),
            true,
        ));
        return Err(error);
    }

    session.state = "restored".into();
    session.ended_at = Some(now());
    session.process_id = None;
    session.process_name = None;
    session.capture_source = "counters-fallback".into();
    session.capture_quality = "idle".into();
    session.capture_reason = Some("Recovered an interrupted optimization session during startup.".into());
    session.capture_requested = false;
    write_session_state(&session);
    Ok(Some(session))
}

pub fn start_capture() -> Result<SessionState, String> {
    let mut session = read_session_state();
    let process_id = session.process_id.ok_or("Attach a running game before starting capture.")?;
    if !processes::process_exists(process_id) {
        return Err("The selected game process is no longer running.".into());
    }
    session.capture_requested = true;
    session.capture_source = "counters-fallback".into();
    session.capture_quality = "starting".into();
    session.capture_reason = Some("PresentMon benchmark capture is starting.".into());
    write_session_state(&session);
    Ok(session)
}

pub fn stop_capture() -> SessionState {
    let mut session = read_session_state();
    session.capture_requested = false;
    session.capture_source = "counters-fallback".into();
    session.capture_quality = if session.process_id.is_some() { "ready".into() } else { "idle".into() };
    session.capture_reason = Some(if session.process_id.is_some() {
        "Benchmark capture stopped. PresentMon is idle.".into()
    } else {
        "No game session is attached.".into()
    });
    write_session_state(&session);
    session
}

pub fn track_tweak(snapshot_id: &str, tweak_kind: &str) {
    let mut session = read_session_state();
    session.auto_restore_pending = true;
    session.last_seen_at = Some(now());
    if !session.active_tweaks.iter().any(|item| item == tweak_kind) {
        session.active_tweaks.push(tweak_kind.into());
    }
    if !session.active_snapshot_ids.iter().any(|item| item == snapshot_id) {
        session.active_snapshot_ids.push(snapshot_id.into());
    }
    write_session_state(&session);
}

fn snapshot_track_kind(snapshot: &TweakSnapshot) -> Option<String> {
    if let Some(value) = snapshot.extra.get("track_kind").and_then(Value::as_str) {
        return Some(value.into());
    }
    if let Some(preset_id) = snapshot.registry_preset_id.as_deref() {
        return Some(format!("registry:{preset_id}"));
    }
    match snapshot.kind.as_str() {
        "process-priority" => Some("process_priority".into()),
        "cpu-affinity" => Some("cpu_affinity".into()),
        "process-qos" => Some("process_qos".into()),
        "cpu-affinity-isolation" => Some("process_isolation".into()),
        "power-plan" => Some("power_plan".into()),
        "timer-resolution" => Some("timer_resolution_low".into()),
        "autorun" => Some("autorun_disable".into()),
        "boot-option" => match snapshot.extra.get("option_key").and_then(Value::as_str) {
            Some("disabledynamictick") => Some("disable_dynamic_ticks".into()),
            Some("useplatformclock") => Some("disable_hpet".into()),
            _ => None,
        },
        "power-setting" => match snapshot.extra.get("setting_guid").and_then(Value::as_str) {
            Some("2bfc24f9-5ea2-4801-8213-3dbae01aa39d") => {
                Some("interrupt_affinity_lock".into())
            }
            Some("48e6b7a6-50f5-4782-a5d4-53bb8f07e226") => {
                Some("usb_selective_suspend_off".into())
            }
            Some("ee12f906-d277-404b-b6da-e5fa1a576df5") => Some("pcie_lspm_off".into()),
            _ => None,
        },
        _ => None,
    }
}

fn refresh_active_tracking(session: &mut SessionState) {
    let mut active_tweaks = Vec::new();
    for active_snapshot_id in &session.active_snapshot_ids {
        let Some(track_kind) = snapshots::load_snapshot(active_snapshot_id)
            .ok()
            .and_then(|snapshot| snapshot_track_kind(&snapshot))
        else {
            continue;
        };
        if !active_tweaks.contains(&track_kind) {
            active_tweaks.push(track_kind);
        }
    }
    session.active_tweaks = active_tweaks;
    session.auto_restore_pending =
        !session.active_snapshot_ids.is_empty() || session.pending_registry_restore;
}

pub fn untrack_snapshot(snapshot_id: &str) {
    let mut session = read_session_state();
    session.active_snapshot_ids.retain(|item| item != snapshot_id);
    refresh_active_tracking(&mut session);
    write_session_state(&session);
}

pub fn detected_game(session: &SessionState, helper_available: bool) -> Option<DetectedGame> {
    let pid = session.detected_candidate_pid?;
    let stored_name = session.detected_candidate_name.as_deref()?;
    let live_name = processes::process_name(pid)?;
    if normalized_process_name(&live_name) != normalized_process_name(stored_name)
        || !is_known_game_process(&live_name)
    {
        return None;
    }
    let name = live_name;
    Some(DetectedGame {
        exe_name: name.clone(),
        pid,
        observed_for_ms: 3000,
        capture_available: true,
        recommended_profile_id: recommended_profile(&name),
        reason: if helper_available {
            "Stable foreground candidate detected. PresentMon capture is available.".into()
        } else {
            "Stable foreground candidate detected, but Aeterna must run as administrator for PresentMon capture.".into()
        },
    })
}

pub fn capture_status(session: &SessionState, helper_available: bool) -> CaptureStatus {
    CaptureStatus {
        source: session.capture_source.clone(),
        available: true,
        quality: session.capture_quality.clone(),
        helper_available,
        note: session.capture_reason.clone(),
    }
}

fn restore_for_session_end(session: &mut SessionState, restore_process_state: bool) -> Result<(), String> {
    let snapshot_ids = session.active_snapshot_ids.clone();
    for snapshot_id in &snapshot_ids {
        let snapshot = snapshots::load_snapshot(snapshot_id)?;
        restore_snapshot_state(&snapshot, restore_process_state)?;
        snapshots::mark_snapshot_restored(snapshot_id)?;
        session.active_snapshot_ids.retain(|item| item != snapshot_id);
        refresh_active_tracking(session);
        write_session_state(session);
        let _ = activity::append(snapshots::activity(
            "restore",
            "Automatic restore",
            format!("Restored {} after session end.", snapshot.note),
            "low",
            Some(snapshot.id.clone()),
            session.session_id.clone(),
            false,
        ));
    }
    session.restored_at = Some(now());
    write_session_state(session);
    Ok(())
}

fn ignored_process(name: &str) -> bool {
    let value = name.to_ascii_lowercase();
    let normalized = value.trim_end_matches(".exe");
    matches!(
        value.as_str(),
        "explorer.exe"
            | "applicationframehost.exe"
            | "searchhost.exe"
            | "shellexperiencehost.exe"
            | "aeterna.exe"
            | "aeterna-core.exe"
            | "aeterna-sidecar.exe"
    ) || matches!(
        normalized,
        "codex"
            | "cmd"
            | "conhost"
            | "cursor"
            | "node"
            | "npm"
            | "powershell"
            | "pwsh"
            | "python"
            | "pythonw"
            | "tauri"
            | "tsserver"
            | "windows-terminal"
    )
}

fn process_cpu_percent(
    samples: &mut HashMap<u32, (u64, Instant)>,
    pid: u32,
    current: u64,
    observed_at: Instant,
) -> f64 {
    samples
        .insert(pid, (current, observed_at))
        .and_then(|(previous_cpu, previous_at)| {
            let elapsed = observed_at.duration_since(previous_at).as_secs_f64();
            (elapsed > 0.0).then_some(
                (((current.saturating_sub(previous_cpu)) as f64 / 10_000_000.0)
                    / elapsed
                    / logical_processor_count() as f64
                    * 100.0)
                    .clamp(0.0, 100.0),
            )
        })
        .unwrap_or(0.0)
}

fn system_cpu_percent(sample: &mut Option<(u64, u64, u64)>, current: (u64, u64, u64)) -> f64 {
    let result = sample
        .replace(current)
        .map(|(idle_prev, kernel_prev, user_prev)| {
            let idle = current.0.saturating_sub(idle_prev);
            let kernel = current.1.saturating_sub(kernel_prev);
            let user = current.2.saturating_sub(user_prev);
            let total = kernel + user;
            if total == 0 {
                0.0
            } else {
                (((total.saturating_sub(idle)) as f64 / total as f64) * 100.0).clamp(0.0, 100.0)
            }
        })
        .unwrap_or(0.0);
    result
}

fn threat_level(score: f64) -> &'static str {
    if score > 0.76 {
        "high"
    } else if score > 0.48 {
        "medium"
    } else {
        "low"
    }
}

fn fallback_frame_metrics(cpu_process_pct: f64, memory_pressure_pct: f64, background_process_count: i32) -> (f64, f64, f64, f64) {
    let fps_avg = (230.0 - cpu_process_pct * 1.1 - memory_pressure_pct * 0.65 - background_process_count as f64 * 0.45).clamp(36.0, 240.0);
    let frametime_avg_ms = 1000.0 / fps_avg;
    let frametime_p95_ms = frametime_avg_ms * 1.25;
    let frame_drop_ratio = ((frametime_p95_ms - frametime_avg_ms) / 40.0).clamp(0.0, 0.35);
    (fps_avg, frametime_avg_ms, frametime_p95_ms, frame_drop_ratio)
}

pub fn spawn_collector() {
    thread::spawn(move || {
        let mut cpu_samples: HashMap<u32, (u64, Instant)> = HashMap::new();
        let mut system_sample: Option<(u64, u64, u64)> = None;
        let mut presentmon = PresentMonSession::new();
        let mut detected_pid: Option<u32> = None;
        let mut stable_samples = 0u32;
        let mut focus_lost_at: Option<Instant> = None;
        loop {
            let mode = telemetry_mode();
            let enabled = telemetry_enabled();
            let mut session = read_session_state();
            session.telemetry_source = mode.clone();
            if !enabled || mode != "live" {
                presentmon.stop();
                write_session_state(&session);
                thread::sleep(Duration::from_secs(1));
                continue;
            }
            let observed_at = Instant::now();
            let foreground_pid = processes::foreground_process_id();
            let foreground_name = foreground_pid
                .and_then(processes::process_name)
                .filter(|name| !ignored_process(name) && is_known_game_process(name));

            if session.process_id.is_none() {
                presentmon.stop();
                if let (Some(pid), Some(name)) = (foreground_pid, foreground_name.clone()) {
                    let current_cpu = processes::process_cpu_time_100ns(pid).unwrap_or_default();
                    let cpu_process_pct = process_cpu_percent(&mut cpu_samples, pid, current_cpu, observed_at);
                    if detected_pid == Some(pid) {
                        stable_samples += 1;
                    } else {
                        detected_pid = Some(pid);
                        stable_samples = 1;
                    }
                    if stable_samples >= 3 || cpu_process_pct >= 18.0 {
                        session.state = "detected".into();
                        session.detected_candidate_pid = Some(pid);
                        session.detected_candidate_name = Some(name.clone());
                        session.recommended_profile_id = recommended_profile(&name);
                        session.capture_source = if presentmon.helper_available() { "presentmon".into() } else { "counters-fallback".into() };
                        session.capture_quality = "ready".into();
                        session.capture_reason = Some(if presentmon.helper_available() {
                            "Game candidate is stable. Attach to start PresentMon frame capture.".into()
                        } else {
                            "Game candidate is stable. Restart Aeterna as administrator to enable official Intel PresentMon capture.".into()
                        });
                        session.last_seen_at = Some(now());
                        write_session_state(&session);
                    }
                } else if session.state == "detected" {
                    session.state = "idle".into();
                    session.detected_candidate_pid = None;
                    session.detected_candidate_name = None;
                    session.recommended_profile_id = None;
                    session.capture_reason = None;
                    write_session_state(&session);
                }
                thread::sleep(Duration::from_secs(1));
                continue;
            }

            let pid = session.process_id.unwrap_or_default();
            if !processes::process_exists(pid) {
                presentmon.stop();
                session.state = "ended".into();
                session.ended_at = Some(now());
                let _ = restore_for_session_end(&mut session, false);
                session.state = "restored".into();
                session.process_id = None;
                session.process_name = None;
                session.capture_source = "counters-fallback".into();
                session.capture_quality = "idle".into();
                session.capture_reason = Some("Tracked process exited and session-scoped changes were restored.".into());
                session.capture_requested = false;
                write_session_state(&session);
                thread::sleep(Duration::from_secs(1));
                continue;
            }

            let is_foreground = foreground_pid == Some(pid);
            if is_foreground {
                focus_lost_at = None;
            } else {
                focus_lost_at.get_or_insert(observed_at);
            }
            let process_cpu_time = processes::process_cpu_time_100ns(pid).unwrap_or_default();
            let cpu_process_pct = process_cpu_percent(&mut cpu_samples, pid, process_cpu_time, observed_at);
            let cpu_total_pct = processes::system_cpu_times_100ns()
                .map(|times| system_cpu_percent(&mut system_sample, times))
                .unwrap_or(cpu_process_pct);
            let background_cpu_pct = (cpu_total_pct - cpu_process_pct).max(0.0);
            let ram_working_set_mb = processes::process_memory_mb(pid).unwrap_or(0.0);
            let memory_pressure_pct = processes::system_memory_pressure().unwrap_or(0.0);
            let background_process_count = processes::list_processes(256)
                .map(|rows| rows.into_iter().filter(|item| item.pid != pid).count() as i32)
                .unwrap_or(0);
            let disk_pressure_pct = ((background_cpu_pct * 0.55) + (memory_pressure_pct * 0.2) + (background_process_count as f64 * 0.35))
                .clamp(0.0, 100.0);
            let mut presentmon_error: Option<String> = None;
            let presentmon_metrics = if session.capture_requested && presentmon.helper_available() {
                let session_id = session.session_id.as_deref().unwrap_or("live");
                match presentmon.ensure_running(pid, session_id) {
                    Ok(()) => presentmon.sample(),
                    Err(error) => {
                        presentmon_error = Some(error);
                        None
                    }
                }
            } else {
                presentmon.stop();
                None
            };
            let presentmon_note = presentmon.note();
            let fallback_metrics = fallback_frame_metrics(cpu_process_pct, memory_pressure_pct, background_process_count);
            let (
                fps_avg,
                fps_p1_low,
                fps_p01_low,
                frametime_avg_ms,
                frametime_p95_ms,
                frametime_p99_ms,
                frame_drop_ratio,
                gpu_usage_pct,
                frame_count,
                metrics_origin,
            ) = if let Some(metrics) = presentmon_metrics {
                (
                    metrics.fps_avg,
                    metrics.fps_p1_low,
                    metrics.fps_p01_low,
                    metrics.frametime_avg_ms,
                    metrics.frametime_p95_ms,
                    metrics.frametime_p99_ms,
                    metrics.frame_drop_ratio,
                    metrics.gpu_usage_pct,
                    metrics.frame_count,
                    "presentmon",
                )
            } else {
                let (fps_avg, frametime_avg_ms, frametime_p95_ms, frame_drop_ratio) = fallback_metrics;
                let frametime_p99_ms = frametime_p95_ms * 1.12;
                (
                    fps_avg,
                    (1000.0 / frametime_p99_ms).clamp(1.0, 500.0),
                    (1000.0 / (frametime_p99_ms * 1.18)).clamp(1.0, 500.0),
                    frametime_avg_ms,
                    frametime_p95_ms,
                    frametime_p99_ms,
                    frame_drop_ratio,
                    None,
                    0,
                    "counters-derived",
                )
            };
            session.capture_source = if metrics_origin == "presentmon" { "presentmon".into() } else { "counters-fallback".into() };
            session.capture_quality = if metrics_origin == "presentmon" {
                if is_foreground { "high".into() } else { "degraded".into() }
            } else if is_foreground {
                "degraded".into()
            } else {
                "degraded".into()
            };
            session.capture_reason = Some(if metrics_origin == "presentmon" {
                format!("PresentMon frame capture active ({frame_count} recent frames).")
            } else if !session.capture_requested && presentmon.helper_available() {
                "PresentMon is idle and will start only during a benchmark capture.".into()
            } else if let Some(error) = presentmon_error {
                format!("PresentMon failed: {error}. Using counters fallback.")
            } else if let Some(note) = presentmon_note {
                format!("PresentMon has not produced frame rows yet: {note}")
            } else if presentmon.helper_available() {
                "Waiting for PresentMon frame rows. Keep the game in foreground during capture.".into()
            } else {
                "Official Intel PresentMon requires Aeterna to run as administrator for real FPS capture.".into()
            });
            let anomaly_score = ((cpu_process_pct / 100.0) * 0.25
                + (cpu_total_pct / 100.0) * 0.15
                + (memory_pressure_pct / 100.0) * 0.15
                + (background_cpu_pct / 100.0) * 0.15
                + (frametime_p95_ms / 40.0) * 0.2
                + frame_drop_ratio * 0.1)
                .clamp(0.0, 1.0);
            session.state = "active".into();
            session.last_seen_at = Some(now());
            session.auto_restore_pending = !session.active_snapshot_ids.is_empty();
            append_live_point(json!({
                "timestamp": now(),
                "capture_source": session.capture_source,
                "source": "live",
                "mode": "live",
                "game_name": session.process_name.clone().unwrap_or_else(|| "Active session".into()),
                "process_id": pid,
                "session_state": session.state,
                "fps_avg": fps_avg,
                "fps_p1_low": fps_p1_low,
                "fps_p01_low": fps_p01_low,
                "frametime_avg_ms": frametime_avg_ms,
                "frametime_p95_ms": frametime_p95_ms,
                "frametime_p99_ms": frametime_p99_ms,
                "frame_drop_ratio": frame_drop_ratio,
                "cpu_process_pct": cpu_process_pct,
                "cpu_total_pct": cpu_total_pct,
                "gpu_usage_pct": gpu_usage_pct,
                "gpu_temp_c": Value::Null,
                "ram_working_set_mb": ram_working_set_mb,
                "memory_pressure_pct": memory_pressure_pct,
                "background_process_count": background_process_count,
                "background_cpu_pct": background_cpu_pct,
                "disk_pressure_pct": disk_pressure_pct,
                "ping": 0.0,
                "jitter": 0.0,
                "packet_loss": 0.0,
                "anomaly_score": anomaly_score,
                "threat_level": threat_level(anomaly_score),
                "metrics_origin": metrics_origin,
                "presentmon_frame_count": frame_count,
            }));
            write_session_state(&session);
            thread::sleep(Duration::from_secs(1));
        }
    });
}

#[cfg(test)]
mod tests {
    use super::{
        can_reuse_attached_session, is_known_game_process, normalized_process_name,
        restore_snapshot_state,
    };
    use crate::models::{SessionState, TweakSnapshot};
    use serde_json::json;

    #[test]
    fn recognizes_games_without_treating_desktop_apps_as_games() {
        assert!(is_known_game_process("cs2.exe"));
        assert!(is_known_game_process("VALORANT-Win64-Shipping.exe"));
        assert!(is_known_game_process("r5apex.exe"));
        assert!(is_known_game_process("Overwatch.exe"));
        assert!(!is_known_game_process("chrome.exe"));
        assert!(!is_known_game_process("explorer.exe"));
        assert!(!is_known_game_process("Code.exe"));
    }

    #[test]
    fn normalizes_process_names_for_stale_pid_validation() {
        assert_eq!(normalized_process_name("CS2.EXE"), "cs2");
        assert_eq!(
            normalized_process_name("VALORANT-Win64-Shipping.exe"),
            "valorantwin64shipping"
        );
    }

    #[test]
    fn reuses_live_session_for_same_process() {
        let session = SessionState {
            session_id: Some("session-1".into()),
            state: "active".into(),
            process_id: Some(42),
            ..SessionState::default()
        };

        assert!(can_reuse_attached_session(&session, 42));
        assert!(!can_reuse_attached_session(&session, 43));
    }

    #[test]
    fn does_not_reuse_ended_session() {
        let session = SessionState {
            session_id: Some("session-1".into()),
            state: "restored".into(),
            process_id: Some(42),
            ..SessionState::default()
        };

        assert!(!can_reuse_attached_session(&session, 42));
    }

    #[test]
    fn malformed_restore_snapshot_fails_before_success() {
        let snapshot = TweakSnapshot {
            id: "snapshot-1".into(),
            kind: "power-setting".into(),
            created_at: "2026-06-15T00:00:00Z".into(),
            note: "Malformed test snapshot".into(),
            scope: "session".into(),
            session_id: Some("session-1".into()),
            process: None,
            power_plan_guid: None,
            power_plan_name: None,
            registry_preset_id: None,
            registry_entries: Vec::new(),
            requires_admin: false,
            applied_at: Some("2026-06-15T00:00:01Z".into()),
            restored_at: None,
            extra: json!({}),
        };

        let error = restore_snapshot_state(&snapshot, false).expect_err("malformed snapshot must fail");

        assert!(error.contains("missing subgroup_guid"));
    }
}
