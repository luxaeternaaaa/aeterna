use std::{
    net::{SocketAddr, TcpStream},
    path::PathBuf,
    process::{Child, Command, Stdio},
    sync::Mutex,
    time::Duration,
};

#[cfg(windows)]
use std::os::windows::process::CommandExt;

use serde::Serialize;
use tauri::{path::BaseDirectory, AppHandle, Manager, State};

use crate::startup::mark_backend_ready;

const NO_WINDOW_FLAG: u32 = 0x08000000;

#[derive(Default)]
struct BackendProcess {
    child: Option<Child>,
    launched_by_app: bool,
}

pub struct BackendState(Mutex<BackendProcess>);

impl Default for BackendState {
    fn default() -> Self {
        Self(Mutex::new(BackendProcess::default()))
    }
}

#[derive(Clone, Serialize)]
pub struct BackendStatusPayload {
    pub state: &'static str,
    pub ready: bool,
    pub launched_by_app: bool,
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

fn backend_socket() -> SocketAddr {
    SocketAddr::from(([127, 0, 0, 1], 8000))
}

fn backend_ready() -> bool {
    TcpStream::connect_timeout(&backend_socket(), Duration::from_millis(200)).is_ok()
}

fn bundled_binary(app: &AppHandle, name: &str) -> PathBuf {
    let target = env!("TAURI_ENV_TARGET_TRIPLE");
    let names = if cfg!(windows) {
        vec![format!("{name}-{target}.exe"), format!("{name}.exe")]
    } else {
        vec![format!("{name}-{target}"), name.into()]
    };
    for candidate in &names {
        if let Ok(path) = app.path().resolve(candidate, BaseDirectory::Resource) {
            if path.exists() {
                return path;
            }
        }
    }
    if let Ok(root) = app.path().executable_dir() {
        for candidate in &names {
            let path = root.join(candidate);
            if path.exists() {
                return path;
            }
        }
    }
    panic!("failed to resolve bundled binary {name}")
}

fn spawn_dev_backend() -> Result<Child, String> {
    let root = repo_root();
    let commands: [(&str, [&str; 3]); 4] = [
        ("py", ["-m", "backend.main", ""]),
        ("python", ["-m", "backend.main", ""]),
        ("python3", ["-m", "backend.main", ""]),
        ("uv", ["run", "backend/main.py", ""]),
    ];
    for (program, args) in commands {
        let mut command = Command::new(program);
        command.current_dir(&root).stdout(Stdio::null()).stderr(Stdio::null());
        command.env("AETERNA_RUNTIME_ROOT", runtime_root());
        command.env("AETERNA_PARENT_PID", std::process::id().to_string());
        #[cfg(windows)]
        command.creation_flags(NO_WINDOW_FLAG);
        command.args(args.into_iter().filter(|value| !value.is_empty()));
        if let Ok(child) = command.spawn() {
            return Ok(child);
        }
    }
    Err("Unable to launch local backend in development mode.".into())
}

fn spawn_packaged_backend(app: &AppHandle) -> Result<Child, String> {
    let mut command = Command::new(bundled_binary(app, "aeterna-core"));
    command.stdout(Stdio::null()).stderr(Stdio::null());
    command.env("AETERNA_RUNTIME_ROOT", runtime_root());
    command.env("AETERNA_PARENT_PID", std::process::id().to_string());
    #[cfg(windows)]
    command.creation_flags(NO_WINDOW_FLAG);
    command
        .spawn()
        .map_err(|error| format!("Unable to launch bundled backend: {error}"))
}

fn child_running(process: &mut BackendProcess) -> bool {
    let Some(child) = process.child.as_mut() else {
        return false;
    };
    match child.try_wait() {
        Ok(None) => true,
        _ => {
            process.child = None;
            process.launched_by_app = false;
            false
        }
    }
}

fn status_payload(process: &mut BackendProcess) -> BackendStatusPayload {
    let ready = backend_ready();
    let running = child_running(process);
    let state = if ready {
        "ready"
    } else if running {
        "starting"
    } else {
        "stopped"
    };
    BackendStatusPayload {
        state,
        ready,
        launched_by_app: process.launched_by_app,
    }
}

#[tauri::command]
pub fn backend_status(app: AppHandle, state: State<'_, BackendState>) -> BackendStatusPayload {
    let mut process = state.0.lock().expect("backend state poisoned");
    let status = status_payload(&mut process);
    if status.ready {
        mark_backend_ready(&app);
    }
    status
}

#[tauri::command]
pub fn start_backend(app: AppHandle, state: State<'_, BackendState>) -> Result<BackendStatusPayload, String> {
    let mut process = state.0.lock().expect("backend state poisoned");
    if backend_ready() || child_running(&mut process) {
        if backend_ready() {
            mark_backend_ready(&app);
        }
        return Ok(status_payload(&mut process));
    }
    process.child = Some(if cfg!(debug_assertions) {
        spawn_dev_backend()?
    } else {
        spawn_packaged_backend(&app)?
    });
    process.launched_by_app = true;
    if backend_ready() {
        mark_backend_ready(&app);
    }
    Ok(status_payload(&mut process))
}

#[tauri::command]
pub fn stop_backend(state: State<'_, BackendState>) -> BackendStatusPayload {
    let mut process = state.0.lock().expect("backend state poisoned");
    if let Some(child) = process.child.as_mut() {
        let _ = child.kill();
    }
    process.child = None;
    process.launched_by_app = false;
    status_payload(&mut process)
}

pub fn shutdown_backend(app: &AppHandle) {
    let state = app.state::<BackendState>();
    let mut process = state.0.lock().expect("backend state poisoned");
    if let Some(child) = process.child.as_mut() {
        let _ = child.kill();
    }
    process.child = None;
    process.launched_by_app = false;
}
