use std::sync::Mutex;

use serde::Serialize;
use time::{format_description::well_known::Rfc3339, OffsetDateTime};
use tauri::{AppHandle, Manager, State};

use crate::sidecar_models::StartupDiagnostics;

fn now() -> String {
    OffsetDateTime::now_utc().format(&Rfc3339).unwrap_or_else(|_| "1970-01-01T00:00:00Z".into())
}

#[derive(Default)]
pub struct StartupState(pub Mutex<StartupDiagnostics>);

impl StartupState {
    pub fn touch(&self, apply: impl FnOnce(&mut StartupDiagnostics)) {
        let mut diagnostics = self.0.lock().expect("startup state poisoned");
        apply(&mut diagnostics);
    }

    pub fn snapshot(&self) -> StartupDiagnostics {
        self.0.lock().expect("startup state poisoned").clone()
    }
}

#[derive(Serialize)]
pub struct StartupPayload {
    pub diagnostics: StartupDiagnostics,
}

#[tauri::command]
pub fn startup_diagnostics(state: State<'_, StartupState>) -> StartupPayload {
    StartupPayload {
        diagnostics: state.snapshot(),
    }
}

#[tauri::command]
pub fn mark_bootstrap_loaded(state: State<'_, StartupState>) -> StartupPayload {
    state.touch(|diagnostics| diagnostics.bootstrap_loaded_at = Some(now()));
    StartupPayload {
        diagnostics: state.snapshot(),
    }
}

pub fn initialize_startup(state: &StartupState) {
    state.touch(|diagnostics| diagnostics.launch_started_at = Some(now()));
}

pub fn mark_window_visible(app: &AppHandle) {
    app.state::<StartupState>()
        .touch(|diagnostics| {
            diagnostics.window_visible_at.get_or_insert_with(now);
        });
}

pub fn mark_sidecar_ready(app: &AppHandle) {
    app.state::<StartupState>()
        .touch(|diagnostics| diagnostics.sidecar_ready_at = Some(now()));
}

pub fn mark_backend_ready(app: &AppHandle) {
    app.state::<StartupState>()
        .touch(|diagnostics| diagnostics.backend_ready_at = Some(now()));
}
