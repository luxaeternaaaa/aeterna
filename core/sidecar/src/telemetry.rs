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
    models::{CaptureStatus, DetectedGame, SessionState},
    paths::{feature_flags_path, live_telemetry_path, session_state_path, system_settings_path},
    power, presentmon,
    processes::{self, logical_processor_count},
    snapshots,
};

fn now() -> String {
    OffsetDateTime::now_utc().format(&Rfc3339).unwrap_or_else(|_| "1970-01-01T00:00:00Z".into())
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
    let value = name.to_ascii_lowercase();
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
    if value.contains("cod") || value.contains("warzone") {
        return Some("warzone-balanced".into());
    }
    None
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
            ..SessionState::default()
        })
}

fn write_session_state(state: &SessionState) {
    let payload = serde_json::to_value(state).unwrap_or_else(|_| json!({ "state": "idle" }));
    write_json(session_state_path(), &payload);
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

pub fn attach_session(process_id: u32, process_name: String, helper_available: bool) -> SessionState {
    let mut session = read_session_state();
    let attached_at = now();
    session.session_id = Some(session_identifier(process_id));
    session.state = "attached".into();
    session.process_id = Some(process_id);
    session.process_name = Some(process_name.clone());
    session.started_at.get_or_insert_with(|| attached_at.clone());
    session.attached_at = Some(attached_at.clone());
    session.last_seen_at = Some(attached_at);
    session.telemetry_source = telemetry_mode();
    session.auto_restore_pending = !session.active_snapshot_ids.is_empty();
    session.detected_candidate_pid = Some(process_id);
    session.detected_candidate_name = Some(process_name.clone());
    session.recommended_profile_id = recommended_profile(&process_name);
    session.capture_source = if helper_available { "presentmon".into() } else { "counters-fallback".into() };
    session.capture_quality = if helper_available { "warming".into() } else { "degraded".into() };
    session.capture_reason =
        (!helper_available).then_some("Bundled PresentMon helper is unavailable, using counters fallback.".into());
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
    session
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
    session.process_id = None;
    session.process_name = None;
    write_session_state(&session);
    Ok(session)
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

pub fn untrack_snapshot(snapshot_id: &str) {
    let mut session = read_session_state();
    session.active_snapshot_ids.retain(|item| item != snapshot_id);
    if session.active_snapshot_ids.is_empty() {
        session.active_tweaks.clear();
        session.auto_restore_pending = false;
    }
    write_session_state(&session);
}

pub fn detected_game(session: &SessionState, helper_available: bool) -> Option<DetectedGame> {
    let pid = session.detected_candidate_pid?;
    let name = session.detected_candidate_name.clone()?;
    Some(DetectedGame {
        exe_name: name.clone(),
        pid,
        observed_for_ms: 3000,
        capture_available: helper_available,
        recommended_profile_id: recommended_profile(&name),
        reason: if helper_available {
            "Stable foreground candidate with PresentMon capture available.".into()
        } else {
            "Stable foreground candidate detected. Capture will use counters fallback.".into()
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
        if restore_process_state {
            if let Some(process) = snapshot.process.as_ref() {
                let _ = processes::restore_process(process);
            }
        }
        if let Some(guid) = snapshot.power_plan_guid.as_deref() {
            let _ = power::set_active_power_plan(guid);
        }
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
    session.active_tweaks.clear();
    session.active_snapshot_ids.clear();
    session.auto_restore_pending = false;
    session.restored_at = Some(now());
    Ok(())
}

fn ignored_process(name: &str) -> bool {
    let value = name.to_ascii_lowercase();
    matches!(
        value.as_str(),
        "explorer.exe" | "applicationframehost.exe" | "searchhost.exe" | "shellexperiencehost.exe" | "aeterna.exe" | "aeterna-core.exe" | "aeterna-sidecar.exe"
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
        let mut detected_pid: Option<u32> = None;
        let mut stable_samples = 0u32;
        let mut focus_lost_at: Option<Instant> = None;
        let mut presentmon = presentmon::PresentMonSession::new();
        loop {
            let mode = telemetry_mode();
            let enabled = telemetry_enabled();
            let helper_available = presentmon.helper_available();
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
            let foreground_name = foreground_pid.and_then(processes::process_name).filter(|name| !ignored_process(name));

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
                        session.capture_source = "counters-fallback".into();
                        session.capture_quality = "ready".into();
                        session.capture_reason = Some(
                            helper_available
                                .then_some("Game candidate is stable. Attach to enable PresentMon-assisted capture.")
                                .unwrap_or("Game candidate is stable. Attach to enable counters-only live telemetry.")
                                .to_string(),
                        );
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
                session.state = "ended".into();
                session.ended_at = Some(now());
                let _ = restore_for_session_end(&mut session, false);
                session.state = "restored".into();
                session.process_id = None;
                session.process_name = None;
                session.capture_source = "counters-fallback".into();
                session.capture_quality = "idle".into();
                session.capture_reason = Some("Tracked process exited and session-scoped changes were restored.".into());
                write_session_state(&session);
                presentmon.stop();
                thread::sleep(Duration::from_secs(1));
                continue;
            }

            let is_foreground = foreground_pid == Some(pid);
            if is_foreground {
                focus_lost_at = None;
            } else {
                focus_lost_at.get_or_insert(observed_at);
            }
            if let Some(session_id) = session.session_id.clone() {
                if let Err(message) = presentmon.ensure_running(pid, &session_id) {
                    session.capture_source = "counters-fallback".into();
                    session.capture_quality = "degraded".into();
                    session.capture_reason = Some(message);
                }
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
            let presentmon_sample = presentmon.sample();
            let (fps_avg, frametime_avg_ms, frametime_p95_ms, frame_drop_ratio, gpu_usage_pct) = if let Some(sample) =
                presentmon_sample
            {
                session.capture_source = "presentmon".into();
                session.capture_quality = if focus_lost_at.map(|start| observed_at.duration_since(start) > Duration::from_secs(15)).unwrap_or(false) {
                    "degraded".into()
                } else {
                    "high".into()
                };
                session.capture_reason = focus_lost_at
                    .filter(|start| observed_at.duration_since(*start) > Duration::from_secs(15))
                    .map(|_| "Tracked process is no longer foreground. Capture remains attached, but quality is reduced.".into());
                (
                    sample.fps_avg,
                    sample.frametime_avg_ms,
                    sample.frametime_p95_ms,
                    sample.frame_drop_ratio,
                    sample.gpu_usage_pct,
                )
            } else {
                let (fps_avg, frametime_avg_ms, frametime_p95_ms, frame_drop_ratio) =
                    fallback_frame_metrics(cpu_process_pct, memory_pressure_pct, background_process_count);
                if !helper_available {
                    session.capture_reason = Some("Bundled PresentMon helper is unavailable, using counters fallback.".into());
                }
                session.capture_source = "counters-fallback".into();
                session.capture_quality = if is_foreground { "ready".into() } else { "degraded".into() };
                (fps_avg, frametime_avg_ms, frametime_p95_ms, frame_drop_ratio, None)
            };
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
                "frametime_avg_ms": frametime_avg_ms,
                "frametime_p95_ms": frametime_p95_ms,
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
            }));
            write_session_state(&session);
            thread::sleep(Duration::from_secs(1));
        }
    });
}
