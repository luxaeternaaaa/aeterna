use std::process::Command;

#[cfg(windows)]
use std::os::windows::process::CommandExt;

use crate::models::PowerPlanSummary;

const NO_WINDOW_FLAG: u32 = 0x08000000;

fn powercfg(args: &[&str]) -> Result<String, String> {
    let mut command = Command::new("powercfg");
    command.args(args);
    #[cfg(windows)]
    command.creation_flags(NO_WINDOW_FLAG);
    let output = command.output().map_err(|error| format!("powercfg failed: {error}"))?;
    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
        if stderr.is_empty() {
            return Err("powercfg command failed.".into());
        }
        return Err(stderr);
    }
    String::from_utf8(output.stdout).map_err(|error| format!("powercfg output error: {error}"))
}

fn parse_index(raw: &str) -> Option<u32> {
    let trimmed = raw.trim();
    if let Some(hex) = trimmed.strip_prefix("0x") {
        return u32::from_str_radix(hex, 16).ok();
    }
    trimmed.parse::<u32>().ok()
}

pub fn list_power_plans() -> Result<Vec<PowerPlanSummary>, String> {
    let output = powercfg(&["/list"])?;
    let mut plans = Vec::new();
    for line in output.lines() {
        if !line.contains("GUID:") {
            continue;
        }
        let active = line.contains('*');
        let cleaned = line.replace('*', "");
        let guid = cleaned.split("GUID:").nth(1).and_then(|value| value.split_whitespace().next()).unwrap_or("").trim();
        let name = cleaned.split('(').nth(1).and_then(|value| value.split(')').next()).unwrap_or("").trim();
        if !guid.is_empty() && !name.is_empty() {
            plans.push(PowerPlanSummary { guid: guid.into(), name: name.into(), active });
        }
    }
    Ok(plans)
}

pub fn active_power_plan() -> Result<Option<PowerPlanSummary>, String> {
    Ok(list_power_plans()?.into_iter().find(|plan| plan.active))
}

pub fn set_active_power_plan(guid: &str) -> Result<(), String> {
    powercfg(&["/setactive", guid]).map(|_| ())
}

pub fn query_setting_indices(subgroup_guid: &str, setting_guid: &str) -> Result<(Option<u32>, Option<u32>), String> {
    let output = powercfg(&["/query", "SCHEME_CURRENT", subgroup_guid, setting_guid])?;
    let mut ac: Option<u32> = None;
    let mut dc: Option<u32> = None;
    for line in output.lines() {
        let lower = line.to_ascii_lowercase();
        if lower.contains("current ac power setting index") {
            if let Some(value) = line.split(':').nth(1).and_then(parse_index) {
                ac = Some(value);
            }
            continue;
        }
        if lower.contains("current dc power setting index") {
            if let Some(value) = line.split(':').nth(1).and_then(parse_index) {
                dc = Some(value);
            }
        }
    }
    Ok((ac, dc))
}

pub fn set_setting_indices(
    subgroup_guid: &str,
    setting_guid: &str,
    ac_index: Option<u32>,
    dc_index: Option<u32>,
) -> Result<(), String> {
    if let Some(ac) = ac_index {
        powercfg(&[
            "/setacvalueindex",
            "SCHEME_CURRENT",
            subgroup_guid,
            setting_guid,
            &format!("{ac}"),
        ])?;
    }
    if let Some(dc) = dc_index {
        powercfg(&[
            "/setdcvalueindex",
            "SCHEME_CURRENT",
            subgroup_guid,
            setting_guid,
            &format!("{dc}"),
        ])?;
    }
    powercfg(&["/setactive", "SCHEME_CURRENT"]).map(|_| ())
}
