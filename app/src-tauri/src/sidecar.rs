use std::{
    io::{BufRead, BufReader, Write},
    path::PathBuf,
    process::{Child, ChildStdin, ChildStdout, Command, Stdio},
    sync::Mutex,
    time::Instant,
};

#[cfg(windows)]
use std::os::windows::process::CommandExt;

use serde::de::DeserializeOwned;
use serde::Deserialize;
use serde_json::{json, Value};
use tauri::{path::BaseDirectory, AppHandle, Manager, State};

use crate::sidecar_models::{
    ApplyRegistryPresetRequest, ApplyRegistryPresetResponse, ApplyTweakRequest, ApplyTweakResponse,
    AttachSessionRequest, MlInferencePayload, MlInferenceRequest, MlRuntimeTruth, OptimizationStatePayload,
    RollbackResponse, SidecarStatusPayload,
};
use crate::startup::{mark_sidecar_ready, StartupState};

const NO_WINDOW_FLAG: u32 = 0x08000000;

#[derive(Default)]
struct SidecarProcess {
    child: Option<Child>,
    stdin: Option<ChildStdin>,
    stdout: Option<BufReader<ChildStdout>>,
    launched_by_app: bool,
    startup_ms: Option<u128>,
}

pub struct SidecarState(Mutex<SidecarProcess>);

impl Default for SidecarState {
    fn default() -> Self {
        Self(Mutex::new(SidecarProcess::default()))
    }
}

#[derive(Deserialize)]
struct IpcResponse<T> {
    ok: bool,
    payload: Option<T>,
    error: Option<String>,
}

fn repo_root() -> PathBuf {
    let root = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("..").join("..");
    root.canonicalize().unwrap_or(root)
}

fn runtime_root() -> PathBuf {
    if cfg!(debug_assertions) {
        return repo_root();
    }
    std::env::var_os("LOCALAPPDATA")
        .map(PathBuf::from)
        .unwrap_or_else(|| std::env::current_dir().expect("cwd unavailable"))
        .join("Aeterna")
}

fn sidecar_path(app: &AppHandle) -> PathBuf {
    if cfg!(debug_assertions) {
        let debug_candidate = repo_root()
            .join("core")
            .join("sidecar")
            .join("target")
            .join("debug")
            .join(if cfg!(windows) { "aeterna-sidecar.exe" } else { "aeterna-sidecar" });
        if debug_candidate.exists() {
            return debug_candidate;
        }
    }
    let target = env!("TAURI_ENV_TARGET_TRIPLE");
    let names = if cfg!(windows) {
        vec![format!("aeterna-sidecar-{target}.exe"), "aeterna-sidecar.exe".into()]
    } else {
        vec![format!("aeterna-sidecar-{target}"), "aeterna-sidecar".into()]
    };
    for candidate in &names {
        if let Ok(path) = app.path().resolve(candidate, BaseDirectory::Resource) {
            if path.exists() {
                return path;
            }
        }
    }
    for candidate in &names {
        if let Ok(root) = app.path().executable_dir() {
            let path = root.join(candidate);
            if path.exists() {
                return path;
            }
        }
    }
    panic!("failed to resolve bundled sidecar")
}

fn bundled_resource(app: &AppHandle, relative: &str) -> Option<PathBuf> {
    if cfg!(debug_assertions) {
        let path = repo_root().join(relative);
        if path.exists() {
            return Some(path);
        }
    }
    app.path().resolve(relative, BaseDirectory::Resource).ok()
}

fn child_running(process: &mut SidecarProcess) -> bool {
    let Some(child) = process.child.as_mut() else {
        return false;
    };
    match child.try_wait() {
        Ok(None) => true,
        _ => {
            process.child = None;
            process.stdin = None;
            process.stdout = None;
            process.launched_by_app = false;
            false
        }
    }
}

fn spawn_sidecar_process(app: &AppHandle, process: &mut SidecarProcess) -> Result<(), String> {
    let start = Instant::now();
    let diagnostics = app.state::<StartupState>().snapshot();
    let mut command = Command::new(sidecar_path(app));
    command.stdin(Stdio::piped()).stdout(Stdio::piped()).stderr(Stdio::null());
    command.arg("--parent-pid").arg(std::process::id().to_string());
    command.env("AETERNA_RUNTIME_ROOT", runtime_root());
    if let Some(metadata_path) = bundled_resource(app, "ml/models/latency_model.metadata.json") {
        command.env("AETERNA_MODEL_METADATA", metadata_path);
    }
    if let Some(presentmon_path) = bundled_resource(app, "presentmon/PresentMon.exe") {
        command.env("AETERNA_PRESENTMON_PATH", presentmon_path);
    }
    if let Some(started_at) = diagnostics.launch_started_at {
        command.env("AETERNA_LAUNCH_STARTED_AT", started_at);
    }
    #[cfg(windows)]
    command.creation_flags(NO_WINDOW_FLAG);
    let mut child = command.spawn().map_err(|error| format!("Unable to launch sidecar: {error}"))?;
    process.stdin = child.stdin.take();
    process.stdout = child.stdout.take().map(BufReader::new);
    process.child = Some(child);
    process.launched_by_app = true;
    process.startup_ms = Some(start.elapsed().as_millis());
    send_command::<Value>(process, "ping", json!({})).map(|_| ())
}

fn ensure_sidecar(app: &AppHandle, process: &mut SidecarProcess) -> Result<(), String> {
    if child_running(process) {
        return Ok(());
    }
    spawn_sidecar_process(app, process)
}

fn send_command<T: DeserializeOwned>(process: &mut SidecarProcess, command: &str, payload: Value) -> Result<T, String> {
    let stdin = process.stdin.as_mut().ok_or("sidecar stdin unavailable")?;
    let stdout = process.stdout.as_mut().ok_or("sidecar stdout unavailable")?;
    serde_json::to_writer(&mut *stdin, &json!({ "command": command, "payload": payload }))
        .map_err(|error| format!("Unable to encode sidecar request: {error}"))?;
    stdin.write_all(b"\n").map_err(|error| format!("Unable to finalize sidecar request: {error}"))?;
    stdin.flush().map_err(|error| format!("Unable to flush sidecar request: {error}"))?;
    let mut line = String::new();
    stdout.read_line(&mut line).map_err(|error| format!("Unable to read sidecar response: {error}"))?;
    let response: IpcResponse<T> =
        serde_json::from_str(&line).map_err(|error| format!("Unable to parse sidecar response: {error}"))?;
    if response.ok {
        response.payload.ok_or("Sidecar returned no payload".into())
    } else {
        Err(response.error.unwrap_or_else(|| "Unknown sidecar error".into()))
    }
}

fn status_payload(process: &mut SidecarProcess, diagnostics: crate::sidecar_models::StartupDiagnostics) -> SidecarStatusPayload {
    let running = child_running(process);
    SidecarStatusPayload {
        state: if running { "ready" } else { "stopped" },
        ready: running,
        launched_by_app: process.launched_by_app,
        startup_ms: process.startup_ms,
        diagnostics,
    }
}

#[tauri::command]
pub fn sidecar_status(state: State<'_, SidecarState>, startup: State<'_, StartupState>) -> SidecarStatusPayload {
    let mut process = state.0.lock().expect("sidecar state poisoned");
    status_payload(&mut process, startup.snapshot())
}

#[tauri::command]
pub fn start_sidecar(
    app: AppHandle,
    state: State<'_, SidecarState>,
    startup: State<'_, StartupState>,
) -> Result<SidecarStatusPayload, String> {
    let mut process = state.0.lock().expect("sidecar state poisoned");
    ensure_sidecar(&app, &mut process)?;
    mark_sidecar_ready(&app);
    Ok(status_payload(&mut process, startup.snapshot()))
}

#[tauri::command]
pub fn inspect_optimization(
    app: AppHandle,
    state: State<'_, SidecarState>,
    process_id: Option<u32>,
) -> Result<OptimizationStatePayload, String> {
    let mut process = state.0.lock().expect("sidecar state poisoned");
    ensure_sidecar(&app, &mut process)?;
    send_command(&mut process, "inspect", json!({ "process_id": process_id }))
}

#[tauri::command]
pub fn apply_tweak(
    app: AppHandle,
    state: State<'_, SidecarState>,
    request: ApplyTweakRequest,
) -> Result<ApplyTweakResponse, String> {
    let mut process = state.0.lock().expect("sidecar state poisoned");
    ensure_sidecar(&app, &mut process)?;
    send_command(&mut process, "apply_tweak", json!(request))
}

#[tauri::command]
pub fn apply_registry_preset(
    app: AppHandle,
    state: State<'_, SidecarState>,
    request: ApplyRegistryPresetRequest,
) -> Result<ApplyRegistryPresetResponse, String> {
    let mut process = state.0.lock().expect("sidecar state poisoned");
    ensure_sidecar(&app, &mut process)?;
    send_command(&mut process, "apply_registry_preset", json!(request))
}

#[tauri::command]
pub fn attach_session(
    app: AppHandle,
    state: State<'_, SidecarState>,
    request: AttachSessionRequest,
) -> Result<OptimizationStatePayload, String> {
    let mut process = state.0.lock().expect("sidecar state poisoned");
    ensure_sidecar(&app, &mut process)?;
    send_command(&mut process, "attach_session", json!(request))
}

#[tauri::command]
pub fn end_session(app: AppHandle, state: State<'_, SidecarState>) -> Result<OptimizationStatePayload, String> {
    let mut process = state.0.lock().expect("sidecar state poisoned");
    ensure_sidecar(&app, &mut process)?;
    send_command(&mut process, "end_session", json!({}))
}

#[tauri::command]
pub fn rollback_tweak(
    app: AppHandle,
    state: State<'_, SidecarState>,
    snapshot_id: String,
    process_id: Option<u32>,
) -> Result<RollbackResponse, String> {
    let mut process = state.0.lock().expect("sidecar state poisoned");
    ensure_sidecar(&app, &mut process)?;
    send_command(&mut process, "rollback", json!({ "snapshot_id": snapshot_id, "process_id": process_id }))
}

#[tauri::command]
pub fn run_ml_inference(
    app: AppHandle,
    state: State<'_, SidecarState>,
    payload: MlInferenceRequest,
) -> Result<MlInferencePayload, String> {
    let mut process = state.0.lock().expect("sidecar state poisoned");
    ensure_sidecar(&app, &mut process)?;
    send_command(&mut process, "ml_inference", json!(payload))
}

#[tauri::command]
pub fn ml_runtime_truth(app: AppHandle, state: State<'_, SidecarState>) -> Result<MlRuntimeTruth, String> {
    let mut process = state.0.lock().expect("sidecar state poisoned");
    ensure_sidecar(&app, &mut process)?;
    send_command(&mut process, "ml_runtime_truth", json!({}))
}

pub fn warm_sidecar(app: &AppHandle) -> Result<(), String> {
    let state = app.state::<SidecarState>();
    let mut process = state.0.lock().expect("sidecar state poisoned");
    let result = ensure_sidecar(app, &mut process);
    if result.is_ok() {
        mark_sidecar_ready(app);
    }
    result
}

pub fn shutdown_sidecar(app: &AppHandle) {
    let state = app.state::<SidecarState>();
    let mut process = state.0.lock().expect("sidecar state poisoned");
    let _ = send_command::<OptimizationStatePayload>(&mut process, "end_session", json!({}));
    if let Some(child) = process.child.as_mut() {
        let _ = child.kill();
    }
    process.child = None;
    process.stdin = None;
    process.stdout = None;
    process.launched_by_app = false;
}
