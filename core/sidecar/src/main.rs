mod activity;
mod ml;
mod models;
mod paths;
mod policy;
mod power;
mod presentmon;
mod processes;
mod snapshots;
mod telemetry;

use std::{
    fs,
    io::{self, BufRead, Write},
    thread,
    time::Duration,
};

use models::{
    ApplyTweakRequest, ApplyTweakResponse, AttachSessionRequest, InspectRequest, IpcRequest, IpcResponse,
    MlInferenceRequest, OptimizationStatePayload, RollbackRequest, RollbackResponse, StartupDiagnostics,
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

fn now() -> String {
    OffsetDateTime::now_utc().format(&Rfc3339).unwrap_or_else(|_| "1970-01-01T00:00:00Z".into())
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
        _ => Err(format!("Unsupported tweak kind: {}", request.kind)),
    }
}

fn rollback(request: RollbackRequest) -> Result<RollbackResponse, String> {
    let snapshot = snapshots::load_snapshot(&request.snapshot_id)?;
    if let Some(process) = snapshot.process.as_ref() {
        processes::restore_process(process)?;
    }
    if let Some(guid) = snapshot.power_plan_guid.as_deref() {
        power::set_active_power_plan(guid)?;
    }
    telemetry::untrack_snapshot(&request.snapshot_id);
    let entry = activity::append(snapshots::activity(
        "restore",
        "Rollback completed",
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
        "rollback" => Ok(json!(rollback(
            serde_json::from_value::<RollbackRequest>(request.payload).map_err(|error| error.to_string())?
        )?)),
        "ml_inference" => Ok(json!(ml::infer(
            serde_json::from_value::<MlInferenceRequest>(request.payload).map_err(|error| error.to_string())?
        ))),
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
