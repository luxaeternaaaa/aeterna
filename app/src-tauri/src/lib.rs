mod backend;
mod sidecar;
mod sidecar_models;
mod startup;

use tauri::RunEvent;

use backend::{backend_status, shutdown_backend, start_backend, stop_backend, BackendState};
use sidecar::{
    apply_tweak, attach_session, end_session, inspect_optimization, rollback_tweak, run_ml_inference,
    shutdown_sidecar, sidecar_status, start_sidecar, warm_sidecar, SidecarState,
};
use startup::{
    initialize_startup, mark_bootstrap_loaded, mark_window_visible, startup_diagnostics, StartupState,
};

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let startup = StartupState::default();
    initialize_startup(&startup);
    let app = tauri::Builder::default()
        .manage(BackendState::default())
        .manage(SidecarState::default())
        .manage(startup)
        .invoke_handler(tauri::generate_handler![
            backend_status,
            start_backend,
            stop_backend,
            sidecar_status,
            start_sidecar,
            inspect_optimization,
            attach_session,
            end_session,
            apply_tweak,
            rollback_tweak,
            run_ml_inference,
            startup_diagnostics,
            mark_bootstrap_loaded
        ])
        .setup(|app| {
            let handle = app.handle().clone();
            std::thread::spawn(move || {
                let _ = warm_sidecar(&handle);
                loop {
                    std::thread::sleep(std::time::Duration::from_secs(5));
                    let _ = warm_sidecar(&handle);
                }
            });
            Ok(())
        })
        .build(tauri::generate_context!())
        .expect("error while building tauri application");

    app.run(|app_handle, event| {
        if matches!(event, RunEvent::Ready) {
            mark_window_visible(app_handle);
        }
        if matches!(event, RunEvent::Exit | RunEvent::ExitRequested { .. }) {
            shutdown_backend(app_handle);
            shutdown_sidecar(app_handle);
        }
    });
}
