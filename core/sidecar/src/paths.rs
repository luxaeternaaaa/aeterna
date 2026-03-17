use std::{env, fs, path::PathBuf};

pub fn runtime_root() -> PathBuf {
    if let Some(root) = env::var_os("AETERNA_RUNTIME_ROOT") {
        return PathBuf::from(root);
    }
    env::var_os("LOCALAPPDATA")
        .map(PathBuf::from)
        .unwrap_or_else(|| env::current_dir().expect("cwd unavailable"))
        .join("Aeterna")
}

pub fn data_dir() -> PathBuf {
    runtime_root().join("data")
}

pub fn config_dir() -> PathBuf {
    runtime_root().join("config")
}

pub fn snapshot_dir() -> PathBuf {
    data_dir().join("snapshots")
}

pub fn log_dir() -> PathBuf {
    data_dir().join("logs")
}

pub fn runtime_data_dir() -> PathBuf {
    data_dir().join("runtime")
}

pub fn activity_path() -> PathBuf {
    log_dir().join("tweak_activity.json")
}

pub fn live_telemetry_path() -> PathBuf {
    runtime_data_dir().join("telemetry_live.jsonl")
}

pub fn presentmon_capture_path() -> PathBuf {
    runtime_data_dir().join("presentmon_capture.csv")
}

pub fn session_state_path() -> PathBuf {
    runtime_data_dir().join("session_state.json")
}

pub fn startup_diagnostics_path() -> PathBuf {
    runtime_data_dir().join("startup_diagnostics.json")
}

pub fn ml_metadata_path() -> PathBuf {
    if let Some(path) = env::var_os("AETERNA_MODEL_METADATA") {
        return PathBuf::from(path);
    }
    runtime_root()
        .join("ml")
        .join("models")
        .join("latency_model.metadata.json")
}

pub fn feature_flags_path() -> PathBuf {
    config_dir().join("feature_flags.json")
}

pub fn system_settings_path() -> PathBuf {
    config_dir().join("system_settings.json")
}

pub fn ensure_runtime_dirs() -> std::io::Result<()> {
    for path in [data_dir(), snapshot_dir(), log_dir(), runtime_data_dir(), config_dir()] {
        fs::create_dir_all(path)?;
    }
    Ok(())
}
