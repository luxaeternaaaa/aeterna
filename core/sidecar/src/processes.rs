use std::mem::{size_of, zeroed};

use windows_sys::Win32::{
    Foundation::{CloseHandle, FILETIME, HANDLE, INVALID_HANDLE_VALUE},
    System::{
        Diagnostics::ToolHelp::{
            CreateToolhelp32Snapshot, Process32FirstW, Process32NextW, PROCESSENTRY32W, TH32CS_SNAPPROCESS,
        },
        ProcessStatus::{K32GetProcessMemoryInfo, PROCESS_MEMORY_COUNTERS},
        SystemInformation::{GetSystemInfo, GlobalMemoryStatusEx, MEMORYSTATUSEX, SYSTEM_INFO},
        Threading::{
            GetPriorityClass, GetProcessAffinityMask, GetProcessTimes, GetSystemTimes, OpenProcess,
            QueryFullProcessImageNameW, SetPriorityClass, SetProcessAffinityMask, SetProcessInformation,
            ProcessPowerThrottling, PROCESS_POWER_THROTTLING_CURRENT_VERSION, PROCESS_POWER_THROTTLING_EXECUTION_SPEED,
            PROCESS_POWER_THROTTLING_STATE, ABOVE_NORMAL_PRIORITY_CLASS, HIGH_PRIORITY_CLASS,
            PROCESS_QUERY_INFORMATION, PROCESS_QUERY_LIMITED_INFORMATION, PROCESS_SET_INFORMATION,
        },
    },
    UI::WindowsAndMessaging::{GetForegroundWindow, GetWindowThreadProcessId},
};

use crate::models::{ProcessRestoreState, ProcessSummary, SelectedProcessState};

fn open_process(pid: u32) -> Result<HANDLE, String> {
    let handle = unsafe {
        OpenProcess(
            PROCESS_QUERY_INFORMATION | PROCESS_QUERY_LIMITED_INFORMATION | PROCESS_SET_INFORMATION,
            0,
            pid,
        )
    };
    if handle.is_null() { Err(format!("Unable to open process {pid}.")) } else { Ok(handle) }
}

fn priority_label(class: u32) -> &'static str {
    match class {
        ABOVE_NORMAL_PRIORITY_CLASS => "Above normal",
        HIGH_PRIORITY_CLASS => "High",
        _ => "Normal",
    }
}

fn balanced_affinity(system_mask: usize) -> usize {
    let total = system_mask.count_ones() as usize;
    if total <= 8 {
        return system_mask;
    }
    let keep = ((total as f64) * 0.75).ceil() as usize;
    let stride = (total / keep.max(1)).max(1);
    let mut result = 0usize;
    let mut ordinal = 0usize;
    for bit in 0..usize::BITS {
        let mask = 1usize << bit;
        if system_mask & mask == 0 {
            continue;
        }
        if ordinal % stride == 0 || result.count_ones() as usize + (total - ordinal) <= keep {
            result |= mask;
        }
        ordinal += 1;
        if result.count_ones() as usize >= keep {
            break;
        }
    }
    if result == 0 { system_mask } else { result }
}

fn affinity_preset(system_mask: usize, preset: &str) -> usize {
    match preset {
        "all_threads" => system_mask,
        "balanced_threads" => balanced_affinity(system_mask),
        "one_thread_per_core" => {
            let mut selected = 0usize;
            let mut use_bit = true;
            for bit in 0..usize::BITS {
                let mask = 1usize << bit;
                if system_mask & mask == 0 {
                    continue;
                }
                if use_bit {
                    selected |= mask;
                }
                use_bit = !use_bit;
            }
            if selected == 0 { system_mask } else { selected }
        }
        _ => system_mask,
    }
}

fn filetime_to_u64(value: FILETIME) -> u64 {
    ((value.dwHighDateTime as u64) << 32) | value.dwLowDateTime as u64
}

pub fn logical_processor_count() -> usize {
    let mut info: SYSTEM_INFO = unsafe { zeroed() };
    unsafe { GetSystemInfo(&mut info) };
    info.dwNumberOfProcessors.max(1) as usize
}

pub fn foreground_process_id() -> Option<u32> {
    let window = unsafe { GetForegroundWindow() };
    if window.is_null() {
        return None;
    }
    let mut pid = 0u32;
    unsafe { GetWindowThreadProcessId(window, &mut pid) };
    (pid != 0).then_some(pid)
}

pub fn list_processes(limit: usize) -> Result<Vec<ProcessSummary>, String> {
    let snapshot = unsafe { CreateToolhelp32Snapshot(TH32CS_SNAPPROCESS, 0) };
    if snapshot == INVALID_HANDLE_VALUE {
        return Err("Unable to enumerate running processes.".into());
    }
    let mut entry: PROCESSENTRY32W = unsafe { zeroed() };
    entry.dwSize = size_of::<PROCESSENTRY32W>() as u32;
    let mut rows = Vec::new();
    let mut has_entry = unsafe { Process32FirstW(snapshot, &mut entry) } != 0;
    while has_entry {
        let name = String::from_utf16_lossy(&entry.szExeFile).trim_matches(char::from(0)).to_string();
        if !name.is_empty() && !matches!(name.as_str(), "System" | "Registry" | "svchost.exe") {
            if let Ok(current) = describe_process(entry.th32ProcessID, &name) {
                rows.push(current);
            }
        }
        has_entry = unsafe { Process32NextW(snapshot, &mut entry) } != 0;
    }
    unsafe { CloseHandle(snapshot) };
    rows.sort_by(|left, right| left.name.cmp(&right.name));
    Ok(rows.into_iter().take(limit).collect())
}

pub fn process_name(pid: u32) -> Option<String> {
    let snapshot = unsafe { CreateToolhelp32Snapshot(TH32CS_SNAPPROCESS, 0) };
    if snapshot == INVALID_HANDLE_VALUE {
        return None;
    }
    let mut entry: PROCESSENTRY32W = unsafe { zeroed() };
    entry.dwSize = size_of::<PROCESSENTRY32W>() as u32;
    let mut value = None;
    let mut has_entry = unsafe { Process32FirstW(snapshot, &mut entry) } != 0;
    while has_entry {
        if entry.th32ProcessID == pid {
            value = Some(String::from_utf16_lossy(&entry.szExeFile).trim_matches(char::from(0)).to_string());
            break;
        }
        has_entry = unsafe { Process32NextW(snapshot, &mut entry) } != 0;
    }
    unsafe { CloseHandle(snapshot) };
    value
}

pub fn process_image_path(pid: u32) -> Option<String> {
    let handle = open_process(pid).ok()?;
    let mut size = 32768u32;
    let mut buffer = vec![0u16; size as usize];
    let ok = unsafe { QueryFullProcessImageNameW(handle, 0, buffer.as_mut_ptr(), &mut size) } != 0;
    unsafe { CloseHandle(handle) };
    if !ok || size == 0 {
        return None;
    }
    Some(String::from_utf16_lossy(&buffer[..size as usize]))
}

pub fn process_exists(pid: u32) -> bool {
    open_process(pid).map(|handle| unsafe { CloseHandle(handle) }).is_ok()
}

pub fn process_memory_mb(pid: u32) -> Option<f64> {
    let handle = open_process(pid).ok()?;
    let mut counters: PROCESS_MEMORY_COUNTERS = unsafe { zeroed() };
    counters.cb = size_of::<PROCESS_MEMORY_COUNTERS>() as u32;
    let ok = unsafe { K32GetProcessMemoryInfo(handle, &mut counters, counters.cb) } != 0;
    unsafe { CloseHandle(handle) };
    ok.then_some(counters.WorkingSetSize as f64 / (1024.0 * 1024.0))
}

pub fn process_cpu_time_100ns(pid: u32) -> Option<u64> {
    let handle = open_process(pid).ok()?;
    let mut creation: FILETIME = unsafe { zeroed() };
    let mut exit: FILETIME = unsafe { zeroed() };
    let mut kernel: FILETIME = unsafe { zeroed() };
    let mut user: FILETIME = unsafe { zeroed() };
    let ok = unsafe { GetProcessTimes(handle, &mut creation, &mut exit, &mut kernel, &mut user) } != 0;
    unsafe { CloseHandle(handle) };
    ok.then_some(filetime_to_u64(kernel) + filetime_to_u64(user))
}

pub fn system_memory_pressure() -> Option<f64> {
    let mut status = MEMORYSTATUSEX {
        dwLength: size_of::<MEMORYSTATUSEX>() as u32,
        ..unsafe { zeroed() }
    };
    let ok = unsafe { GlobalMemoryStatusEx(&mut status) } != 0;
    ok.then_some(status.dwMemoryLoad as f64)
}

pub fn system_cpu_times_100ns() -> Option<(u64, u64, u64)> {
    let mut idle: FILETIME = unsafe { zeroed() };
    let mut kernel: FILETIME = unsafe { zeroed() };
    let mut user: FILETIME = unsafe { zeroed() };
    let ok = unsafe { GetSystemTimes(&mut idle, &mut kernel, &mut user) } != 0;
    ok.then_some((filetime_to_u64(idle), filetime_to_u64(kernel), filetime_to_u64(user)))
}

pub fn describe_process(pid: u32, name: &str) -> Result<ProcessSummary, String> {
    let detail = inspect_process(pid, name)?;
    Ok(ProcessSummary {
        pid,
        name: name.into(),
        priority_label: detail.priority_label.clone(),
        affinity_label: detail.affinity_label,
    })
}

pub fn inspect_process(pid: u32, fallback_name: &str) -> Result<SelectedProcessState, String> {
    let handle = open_process(pid)?;
    let priority = unsafe { GetPriorityClass(handle) };
    let mut process_mask = 0usize;
    let mut system_mask = 0usize;
    let ok = unsafe { GetProcessAffinityMask(handle, &mut process_mask, &mut system_mask) } != 0;
    unsafe { CloseHandle(handle) };
    if !ok {
        return Err(format!("Unable to inspect process {pid}."));
    }
    Ok(SelectedProcessState {
        pid,
        name: fallback_name.into(),
        priority_label: priority_label(priority).into(),
        affinity_mask: format!("0x{process_mask:X}"),
        affinity_label: format!("{} logical threads", process_mask.count_ones()),
    })
}

pub fn capture_restore_state(pid: u32, name: &str) -> Result<ProcessRestoreState, String> {
    let handle = open_process(pid)?;
    let priority_class = unsafe { GetPriorityClass(handle) };
    let mut process_mask = 0usize;
    let mut system_mask = 0usize;
    let ok = unsafe { GetProcessAffinityMask(handle, &mut process_mask, &mut system_mask) } != 0;
    unsafe { CloseHandle(handle) };
    if !ok {
        return Err(format!("Unable to capture process state for {pid}."));
    }
    Ok(ProcessRestoreState { pid, name: name.into(), priority_class, affinity_mask: process_mask as u64 })
}

pub fn apply_priority(pid: u32, level: &str) -> Result<(), String> {
    let handle = open_process(pid)?;
    let class = if level == "high" { HIGH_PRIORITY_CLASS } else { ABOVE_NORMAL_PRIORITY_CLASS };
    let ok = unsafe { SetPriorityClass(handle, class) } != 0;
    unsafe { CloseHandle(handle) };
    if ok { Ok(()) } else { Err(format!("Unable to set priority for process {pid}.")) }
}

pub fn apply_affinity(pid: u32, preset: &str) -> Result<(), String> {
    let handle = open_process(pid)?;
    let mut process_mask = 0usize;
    let mut system_mask = 0usize;
    let ok = unsafe { GetProcessAffinityMask(handle, &mut process_mask, &mut system_mask) } != 0;
    if !ok {
        unsafe { CloseHandle(handle) };
        return Err(format!("Unable to read affinity for process {pid}."));
    }
    let target_mask = affinity_preset(system_mask, preset);
    let applied = unsafe { SetProcessAffinityMask(handle, target_mask) } != 0;
    unsafe { CloseHandle(handle) };
    if applied { Ok(()) } else { Err(format!("Unable to set affinity for process {pid}.")) }
}

pub fn apply_process_qos(pid: u32, mode: &str) -> Result<(), String> {
    let handle = open_process(pid)?;
    let mut state = PROCESS_POWER_THROTTLING_STATE {
        Version: PROCESS_POWER_THROTTLING_CURRENT_VERSION,
        ControlMask: PROCESS_POWER_THROTTLING_EXECUTION_SPEED,
        StateMask: if mode.eq_ignore_ascii_case("eco") {
            PROCESS_POWER_THROTTLING_EXECUTION_SPEED
        } else {
            0
        },
    };
    let ok = unsafe {
        SetProcessInformation(
            handle,
            ProcessPowerThrottling,
            &mut state as *mut _ as *mut _,
            size_of::<PROCESS_POWER_THROTTLING_STATE>() as u32,
        )
    } != 0;
    unsafe { CloseHandle(handle) };
    if ok {
        Ok(())
    } else {
        Err(format!("Unable to set process QoS for process {pid}."))
    }
}

pub fn restore_process(state: &ProcessRestoreState) -> Result<(), String> {
    let handle = open_process(state.pid)?;
    let priority = unsafe { SetPriorityClass(handle, state.priority_class) } != 0;
    let affinity = unsafe { SetProcessAffinityMask(handle, state.affinity_mask as usize) } != 0;
    unsafe { CloseHandle(handle) };
    if priority && affinity { Ok(()) } else { Err(format!("Unable to restore process {}.", state.pid)) }
}
