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
    String::from_utf8(output.stdout).map_err(|error| format!("powercfg output error: {error}"))
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
