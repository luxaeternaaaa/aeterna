use std::{
    collections::{HashMap, VecDeque},
    fs,
    io::{BufRead, BufReader},
    path::{Path, PathBuf},
    process::{Child, ChildStdout, Command, Stdio},
    sync::{Arc, Mutex},
    thread::{self, JoinHandle},
    time::Instant,
};

#[cfg(windows)]
use std::os::windows::process::CommandExt;

#[cfg(windows)]
use windows_sys::Win32::{
    Foundation::CloseHandle,
    Security::{GetTokenInformation, TokenElevation, TOKEN_ELEVATION, TOKEN_QUERY},
    System::Threading::{GetCurrentProcess, OpenProcessToken},
};

use csv::StringRecord;

use crate::{models::CaptureStatus, paths::ensure_runtime_dirs};

const NO_WINDOW_FLAG: u32 = 0x08000000;
const PRESENTMON_SESSION_NAME: &str = "Aeterna-Capture";
const INTEL_PRESENTMON_ROOT: &str = r"C:\Program Files\Intel\PresentMon";

#[derive(Clone, Default)]
pub struct PresentMonMetrics {
    pub fps_avg: f64,
    pub fps_p1_low: f64,
    pub fps_p01_low: f64,
    pub frametime_avg_ms: f64,
    pub frametime_p95_ms: f64,
    pub frametime_p99_ms: f64,
    pub frame_drop_ratio: f64,
    pub gpu_usage_pct: Option<f64>,
    pub frame_count: usize,
}

#[derive(Default)]
struct FrameSample {
    between_ms: f64,
    gpu_pct: Option<f64>,
}

pub struct PresentMonSession {
    child: Option<Child>,
    process_id: Option<u32>,
    session_id: Option<String>,
    started_at: Option<Instant>,
    frames: Arc<Mutex<VecDeque<FrameSample>>>,
    reader_note: Arc<Mutex<Option<String>>>,
    reader: Option<JoinHandle<()>>,
    note: Option<String>,
}

impl Default for PresentMonSession {
    fn default() -> Self {
        Self {
            child: None,
            process_id: None,
            session_id: None,
            started_at: None,
            frames: Arc::new(Mutex::new(VecDeque::with_capacity(2400))),
            reader_note: Arc::new(Mutex::new(None)),
            reader: None,
            note: None,
        }
    }
}

impl PresentMonSession {
    pub fn new() -> Self {
        let _ = ensure_runtime_dirs();
        Self::default()
    }

    pub fn helper_path(&self) -> Option<PathBuf> {
        find_intel_presentmon_cli()
    }

    pub fn helper_available(&self) -> bool {
        self.helper_path().is_some() && presentmon_privilege_available()
    }

    pub fn ensure_running(&mut self, process_id: u32, session_id: &str) -> Result<(), String> {
        if self.process_id == Some(process_id)
            && self.session_id.as_deref() == Some(session_id)
            && self.child_running()
            && !self.capture_stalled()
        {
            return Ok(());
        }
        self.stop();
        let helper = self.helper_path().ok_or("Official Intel PresentMon CLI is unavailable. Install Intel PresentMon.")?;
        if let Ok(mut frames) = self.frames.lock() {
            frames.clear();
        }
        if let Ok(mut note) = self.reader_note.lock() {
            *note = None;
        }
        terminate_existing_session(&helper, &format!("Aeterna-{session_id}"));
        terminate_existing_session(&helper, PRESENTMON_SESSION_NAME);
        let mut command = Command::new(helper);
        command
            .arg("--process_id")
            .arg(process_id.to_string())
            .arg("--output_stdout")
            .arg("--qpc_time_ms")
            .arg("--terminate_on_proc_exit")
            .arg("--stop_existing_session")
            .arg("--session_name")
            .arg(PRESENTMON_SESSION_NAME)
            .arg("--v1_metrics")
            .arg("--no_console_stats")
            .stdout(Stdio::piped())
            .stderr(Stdio::null());
        #[cfg(windows)]
        command.creation_flags(NO_WINDOW_FLAG);
        let mut child = command.spawn().map_err(|error| format!("Unable to launch PresentMon: {error}"))?;
        let stdout = child.stdout.take().ok_or("Unable to read PresentMon stdout.")?;
        self.reader = Some(spawn_stdout_reader(stdout, Arc::clone(&self.frames), Arc::clone(&self.reader_note)));
        self.child = Some(child);
        self.process_id = Some(process_id);
        self.session_id = Some(session_id.to_string());
        self.started_at = Some(Instant::now());
        self.note = None;
        Ok(())
    }

    pub fn stop(&mut self) {
        if let Some(child) = self.child.as_mut() {
            let _ = child.kill();
        }
        self.child = None;
        self.process_id = None;
        self.session_id = None;
        self.started_at = None;
        self.reader = None;
        if let Ok(mut frames) = self.frames.lock() {
            frames.clear();
        }
        if let Ok(mut note) = self.reader_note.lock() {
            *note = None;
        }
    }

    pub fn sample(&mut self) -> Option<PresentMonMetrics> {
        let samples = self.frames.lock().ok()?;
        let mut frames = Vec::new();
        let mut gpu_values = Vec::new();
        for sample in samples.iter().rev().take(500) {
            frames.push(sample.between_ms);
            if let Some(gpu_pct) = sample.gpu_pct {
                gpu_values.push(gpu_pct);
            }
        }
        drop(samples);
        if frames.len() < 4 {
            return None;
        }
        frames.sort_by(|left, right| left.partial_cmp(right).unwrap_or(std::cmp::Ordering::Equal));
        let frame_count = frames.len();
        let frametime_avg_ms = frames.iter().sum::<f64>() / frames.len() as f64;
        let frametime_p95_ms = percentile(&frames, 0.95);
        let frametime_p99_ms = percentile(&frames, 0.99);
        let frametime_p999_ms = percentile(&frames, 0.999);
        Some(PresentMonMetrics {
            fps_avg: (1000.0 / frametime_avg_ms).clamp(1.0, 500.0),
            fps_p1_low: (1000.0 / frametime_p99_ms).clamp(1.0, 500.0),
            fps_p01_low: (1000.0 / frametime_p999_ms).clamp(1.0, 500.0),
            frametime_avg_ms,
            frametime_p95_ms,
            frametime_p99_ms,
            frame_drop_ratio: frames
                .iter()
                .filter(|value| **value > (frametime_avg_ms * 2.0).max(33.3))
                .count() as f64
                / frames.len() as f64,
            gpu_usage_pct: (!gpu_values.is_empty()).then_some(gpu_values.iter().sum::<f64>() / gpu_values.len() as f64),
            frame_count,
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
                note: Some("Official Intel PresentMon requires Aeterna to run as administrator for real FPS capture.".into()),
            };
        }
        let running = self.child_running();
        CaptureStatus {
            source: if running { "presentmon".into() } else { "counters-fallback".into() },
            available: true,
            quality: if running { "high".into() } else { "degraded".into() },
            helper_available: true,
            note: self.note(),
        }
    }

    pub fn note(&self) -> Option<String> {
        self.reader_note.lock().ok().and_then(|note| note.clone()).or_else(|| self.note.clone())
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
                self.session_id = None;
                self.started_at = None;
                false
            }
        }
    }

    fn capture_stalled(&self) -> bool {
        self.reader.as_ref().is_some_and(|reader| reader.is_finished())
    }
}

fn find_intel_presentmon_cli() -> Option<PathBuf> {
    let root = PathBuf::from(INTEL_PRESENTMON_ROOT);
    find_presentmon_cli_in(&root.join("PresentMonConsoleApplication"))
}

fn find_presentmon_cli_in(dir: &Path) -> Option<PathBuf> {
    let exact = dir.join("PresentMon-2.4.1-x64.exe");
    if exact.exists() {
        return Some(exact);
    }
    let mut candidates = fs::read_dir(dir)
        .ok()?
        .filter_map(Result::ok)
        .map(|entry| entry.path())
        .filter(|path| path.is_file())
        .filter(|path| {
            path.file_name()
                .and_then(|name| name.to_str())
                .map(|name| {
                    let lowered = name.to_ascii_lowercase();
                    lowered.starts_with("presentmon-") && lowered.ends_with("-x64.exe")
                })
                .unwrap_or(false)
        })
        .collect::<Vec<_>>();
    candidates.sort();
    candidates.pop()
}

#[cfg(windows)]
fn presentmon_privilege_available() -> bool {
    unsafe {
        let mut token = std::ptr::null_mut();
        if OpenProcessToken(GetCurrentProcess(), TOKEN_QUERY, &mut token) == 0 {
            return false;
        }
        let mut elevation: TOKEN_ELEVATION = std::mem::zeroed();
        let mut returned = 0u32;
        let ok = GetTokenInformation(
            token,
            TokenElevation,
            &mut elevation as *mut TOKEN_ELEVATION as *mut _,
            std::mem::size_of::<TOKEN_ELEVATION>() as u32,
            &mut returned,
        ) != 0;
        let _ = CloseHandle(token);
        ok && elevation.TokenIsElevated != 0
    }
}

#[cfg(not(windows))]
fn presentmon_privilege_available() -> bool {
    true
}

fn spawn_stdout_reader(
    stdout: ChildStdout,
    frames: Arc<Mutex<VecDeque<FrameSample>>>,
    reader_note: Arc<Mutex<Option<String>>>,
) -> JoinHandle<()> {
    thread::spawn(move || {
        let reader = BufReader::new(stdout);
        let mut columns: Option<(usize, Option<usize>)> = None;
        for line in reader.lines().map_while(Result::ok) {
            let trimmed = line.trim();
            if trimmed.is_empty() {
                continue;
            }
            let Some(record) = parse_csv_line(trimmed) else {
                capture_presentmon_note(&reader_note, trimmed);
                continue;
            };
            let (between_idx, gpu_idx) = match columns {
                Some(columns) => columns,
                None => {
                    let index = header_index(&record);
                    let Some(between_idx) = find_header(
                        &index,
                        &[
                            "MsBetweenPresents",
                            "MsBetweenDisplayChange",
                            "FrameTime",
                            "FrameTimeMs",
                            "msBetweenPresents",
                            "msBetweenDisplayChange",
                        ],
                    ) else {
                        capture_presentmon_note(&reader_note, trimmed);
                        continue;
                    };
                    let gpu_idx = find_header(&index, &["MsGPUBusy", "MsGPUActive", "GpuBusyMs", "msGPUActive"]);
                    columns = Some((between_idx, gpu_idx));
                    continue;
                }
            };
            let between = parse_float(record.get(between_idx));
            if !between.is_finite() || between <= 0.0 {
                continue;
            }
            let gpu_pct = gpu_idx.and_then(|idx| {
                let gpu_busy = parse_float(record.get(idx));
                (gpu_busy.is_finite() && gpu_busy >= 0.0).then_some((gpu_busy / between * 100.0).clamp(0.0, 100.0))
            });
            if let Ok(mut samples) = frames.lock() {
                if samples.len() >= 2400 {
                    samples.pop_front();
                }
                samples.push_back(FrameSample { between_ms: between, gpu_pct });
            }
        }
    })
}

fn terminate_existing_session(helper: &Path, session_name: &str) {
    let mut command = Command::new(helper);
    command
        .arg("--terminate_existing_session")
        .arg("--session_name")
        .arg(session_name)
        .stdout(Stdio::null())
        .stderr(Stdio::null());
    #[cfg(windows)]
    command.creation_flags(NO_WINDOW_FLAG);
    let _ = command.status();
}

fn parse_csv_line(line: &str) -> Option<StringRecord> {
    let mut reader = csv::ReaderBuilder::new()
        .has_headers(false)
        .flexible(true)
        .from_reader(line.as_bytes());
    reader.records().flatten().next()
}

fn capture_presentmon_note(reader_note: &Arc<Mutex<Option<String>>>, line: &str) {
    let lowered = line.to_ascii_lowercase();
    let is_diagnostic = ["warning", "error", "failed", "denied", "elevat", "privilege", "access"]
        .iter()
        .any(|needle| lowered.contains(needle));
    if !is_diagnostic {
        return;
    }
    if let Ok(mut note) = reader_note.lock() {
        if note.is_none() {
            *note = Some(line.chars().take(240).collect());
        }
    }
}

fn header_index(headers: &StringRecord) -> HashMap<String, usize> {
    headers
        .iter()
        .enumerate()
        .flat_map(|(index, value)| [(value.to_string(), index), (normalize_header(value), index)])
        .collect()
}

fn normalize_header(value: &str) -> String {
    value
        .chars()
        .filter(|ch| ch.is_ascii_alphanumeric())
        .flat_map(|ch| ch.to_lowercase())
        .collect()
}

fn find_header(index: &HashMap<String, usize>, names: &[&str]) -> Option<usize> {
    names
        .iter()
        .find_map(|name| index.get(*name).copied().or_else(|| index.get(&normalize_header(name)).copied()))
}

fn percentile(sorted: &[f64], fraction: f64) -> f64 {
    if sorted.is_empty() {
        return 0.0;
    }
    let index = ((sorted.len().saturating_sub(1)) as f64 * fraction).ceil() as usize;
    sorted[index.min(sorted.len() - 1)]
}

fn parse_float(value: Option<&str>) -> f64 {
    value.and_then(|item| item.parse::<f64>().ok()).unwrap_or(0.0)
}
