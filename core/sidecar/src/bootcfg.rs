use std::process::Command;

#[cfg(windows)]
use std::os::windows::process::CommandExt;

const NO_WINDOW_FLAG: u32 = 0x08000000;

fn run_bcdedit(args: &[&str]) -> Result<String, String> {
    let mut command = Command::new("bcdedit");
    command.args(args);
    #[cfg(windows)]
    command.creation_flags(NO_WINDOW_FLAG);
    let output = command.output().map_err(|error| format!("bcdedit failed: {error}"))?;
    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
        if stderr.is_empty() {
            return Err("bcdedit command failed.".into());
        }
        return Err(stderr);
    }
    String::from_utf8(output.stdout).map_err(|error| format!("bcdedit output error: {error}"))
}

pub fn query_option(key: &str) -> Result<Option<String>, String> {
    let output = run_bcdedit(&["/enum", "{current}"])?;
    for line in output.lines() {
        let trimmed = line.trim();
        if trimmed.is_empty() {
            continue;
        }
        let mut parts = trimmed.split_whitespace();
        let name = parts.next().unwrap_or_default();
        if name.eq_ignore_ascii_case(key) {
            let value = parts.collect::<Vec<_>>().join(" ");
            if value.trim().is_empty() {
                return Ok(None);
            }
            return Ok(Some(value));
        }
    }
    Ok(None)
}

pub fn set_option(key: &str, value: &str) -> Result<(), String> {
    run_bcdedit(&["/set", "{current}", key, value]).map(|_| ())
}

pub fn delete_option(key: &str) -> Result<(), String> {
    run_bcdedit(&["/deletevalue", "{current}", key]).map(|_| ())
}
