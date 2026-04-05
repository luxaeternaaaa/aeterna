use std::process::Command;

#[cfg(windows)]
use std::os::windows::process::CommandExt;

const NO_WINDOW_FLAG: u32 = 0x08000000;

fn run_command(program: &str, args: &[&str], allow_failure: bool) -> Result<String, String> {
    let mut command = Command::new(program);
    command.args(args);
    #[cfg(windows)]
    command.creation_flags(NO_WINDOW_FLAG);
    let output = command
        .output()
        .map_err(|error| format!("{program} failed: {error}"))?;
    if !output.status.success() && !allow_failure {
        let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
        if stderr.is_empty() {
            return Err(format!("{program} command failed."));
        }
        return Err(stderr);
    }
    Ok(String::from_utf8_lossy(&output.stdout).to_string())
}

fn parse_dword(raw: &str) -> Option<u32> {
    let trimmed = raw.trim();
    if let Some(hex) = trimmed.strip_prefix("0x") {
        return u32::from_str_radix(hex, 16).ok();
    }
    trimmed.parse::<u32>().ok()
}

pub fn query_service_start_type(service_name: &str) -> Result<Option<u32>, String> {
    let key = format!(r"HKLM\SYSTEM\CurrentControlSet\Services\{service_name}");
    let output = run_command("reg", &["query", &key, "/v", "Start"], true)?;
    for line in output.lines() {
        let trimmed = line.trim();
        if !trimmed.starts_with("Start") {
            continue;
        }
        let parts = trimmed.split_whitespace().collect::<Vec<_>>();
        if parts.len() < 3 {
            continue;
        }
        let value = parts[2..].join(" ");
        return Ok(parse_dword(&value));
    }
    Ok(None)
}

pub fn is_service_running(service_name: &str) -> Result<bool, String> {
    let output = run_command("sc", &["query", service_name], true)?;
    for line in output.lines() {
        if line.to_ascii_uppercase().contains("STATE") {
            return Ok(line.to_ascii_uppercase().contains("RUNNING"));
        }
    }
    Ok(false)
}

pub fn stop_service(service_name: &str) -> Result<(), String> {
    run_command("sc", &["stop", service_name], true).map(|_| ())
}

pub fn start_service(service_name: &str) -> Result<(), String> {
    run_command("sc", &["start", service_name], true).map(|_| ())
}
