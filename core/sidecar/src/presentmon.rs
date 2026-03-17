use std::{
    collections::HashMap,
    env, fs,
    path::PathBuf,
    process::{Child, Command, Stdio},
};

#[cfg(windows)]
use std::os::windows::process::CommandExt;

use csv::StringRecord;

use crate::{
    models::CaptureStatus,
    paths::{ensure_runtime_dirs, presentmon_capture_path},
};

const NO_WINDOW_FLAG: u32 = 0x08000000;

#[derive(Clone, Default)]
pub struct PresentMonMetrics {
    pub fps_avg: f64,
    pub frametime_avg_ms: f64,
    pub frametime_p95_ms: f64,
    pub frame_drop_ratio: f64,
    pub gpu_usage_pct: Option<f64>,
}

#[derive(Default)]
pub struct PresentMonSession {
    child: Option<Child>,
    process_id: Option<u32>,
    csv_path: PathBuf,
    note: Option<String>,
}

impl PresentMonSession {
    pub fn new() -> Self {
        let _ = ensure_runtime_dirs();
        Self { csv_path: presentmon_capture_path(), ..Self::default() }
    }

    pub fn helper_path(&self) -> Option<PathBuf> {
        env::var_os("AETERNA_PRESENTMON_PATH").map(PathBuf::from).filter(|path| path.exists())
    }

    pub fn helper_available(&self) -> bool {
        self.helper_path().is_some()
    }

    pub fn ensure_running(&mut self, process_id: u32, session_id: &str) -> Result<(), String> {
        if self.process_id == Some(process_id) && self.child_running() {
            return Ok(());
        }
        self.stop();
        let helper = self.helper_path().ok_or("Bundled PresentMon helper is unavailable.")?;
        let _ = fs::remove_file(&self.csv_path);
        let mut command = Command::new(helper);
        command
            .arg("--process_id")
            .arg(process_id.to_string())
            .arg("--output_file")
            .arg(&self.csv_path)
            .arg("--qpc_time_ms")
            .arg("--terminate_on_proc_exit")
            .arg("--stop_existing_session")
            .arg("--session_name")
            .arg(format!("Aeterna-{session_id}"))
            .arg("--no_console_stats")
            .stdout(Stdio::null())
            .stderr(Stdio::null());
        #[cfg(windows)]
        command.creation_flags(NO_WINDOW_FLAG);
        let child = command.spawn().map_err(|error| format!("Unable to launch PresentMon: {error}"))?;
        self.child = Some(child);
        self.process_id = Some(process_id);
        self.note = None;
        Ok(())
    }

    pub fn stop(&mut self) {
        if let Some(child) = self.child.as_mut() {
            let _ = child.kill();
        }
        self.child = None;
        self.process_id = None;
        let _ = fs::remove_file(&self.csv_path);
    }

    pub fn sample(&mut self) -> Option<PresentMonMetrics> {
        let bytes = fs::read(&self.csv_path).ok()?;
        if bytes.is_empty() {
            return None;
        }
        let mut reader = csv::ReaderBuilder::new().flexible(true).from_reader(bytes.as_slice());
        let headers = reader.headers().ok()?.clone();
        let index = header_index(&headers);
        let between_idx = *index.get("MsBetweenPresents")?;
        let gpu_idx = index.get("MsGPUBusy").copied();
        let rows = reader.records().flatten().collect::<Vec<_>>();
        let mut frames = Vec::new();
        let mut gpu_values = Vec::new();
        for row in rows.iter().rev().take(120) {
            let between = parse_float(row.get(between_idx));
            if !(between > 0.0) {
                continue;
            }
            frames.push(between);
            if let Some(idx) = gpu_idx {
                let gpu_busy = parse_float(row.get(idx));
                if gpu_busy >= 0.0 {
                    gpu_values.push((gpu_busy / between * 100.0).clamp(0.0, 100.0));
                }
            }
        }
        if frames.len() < 4 {
            return None;
        }
        frames.sort_by(|left, right| left.partial_cmp(right).unwrap_or(std::cmp::Ordering::Equal));
        let frametime_avg_ms = frames.iter().sum::<f64>() / frames.len() as f64;
        let p95_index = ((frames.len() as f64) * 0.95).floor() as usize;
        let frametime_p95_ms = frames[p95_index.min(frames.len() - 1)];
        Some(PresentMonMetrics {
            fps_avg: (1000.0 / frametime_avg_ms).clamp(1.0, 500.0),
            frametime_avg_ms,
            frametime_p95_ms,
            frame_drop_ratio: frames.iter().filter(|value| **value > 25.0).count() as f64 / frames.len() as f64,
            gpu_usage_pct: (!gpu_values.is_empty()).then_some(gpu_values.iter().sum::<f64>() / gpu_values.len() as f64),
        })
    }

    #[allow(dead_code)]
    pub fn status(&mut self) -> CaptureStatus {
        if !self.helper_available() {
            return CaptureStatus {
                source: "counters-fallback".into(),
                available: true,
                quality: "degraded".into(),
                helper_available: false,
                note: Some("Bundled PresentMon helper is missing, so live capture uses safe counters fallback.".into()),
            };
        }
        let running = self.child_running();
        CaptureStatus {
            source: if running { "presentmon".into() } else { "counters-fallback".into() },
            available: true,
            quality: if running { "high".into() } else { "degraded".into() },
            helper_available: true,
            note: self.note.clone(),
        }
    }

    fn child_running(&mut self) -> bool {
        let Some(child) = self.child.as_mut() else {
            return false;
        };
        match child.try_wait() {
            Ok(None) => true,
            _ => {
                self.child = None;
                self.process_id = None;
                false
            }
        }
    }
}

fn header_index(headers: &StringRecord) -> HashMap<String, usize> {
    headers.iter().enumerate().map(|(index, value)| (value.to_string(), index)).collect()
}

fn parse_float(value: Option<&str>) -> f64 {
    value.and_then(|item| item.parse::<f64>().ok()).unwrap_or(0.0)
}
