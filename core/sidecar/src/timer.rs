#[link(name = "ntdll")]
unsafe extern "system" {
    fn NtQueryTimerResolution(maximum_resolution: *mut u32, minimum_resolution: *mut u32, current_resolution: *mut u32)
        -> i32;
    fn NtSetTimerResolution(desired_resolution: u32, set_resolution: u8, current_resolution: *mut u32) -> i32;
}

const STATUS_SUCCESS: i32 = 0;

pub fn query_resolution() -> Result<(u32, u32, u32), String> {
    let mut maximum_resolution = 0u32;
    let mut minimum_resolution = 0u32;
    let mut current_resolution = 0u32;
    let status = unsafe {
        NtQueryTimerResolution(
            &mut maximum_resolution as *mut u32,
            &mut minimum_resolution as *mut u32,
            &mut current_resolution as *mut u32,
        )
    };
    if status != STATUS_SUCCESS {
        return Err(format!("NtQueryTimerResolution failed with status 0x{status:08X}."));
    }
    Ok((maximum_resolution, minimum_resolution, current_resolution))
}

pub fn enable_low_resolution() -> Result<u32, String> {
    let (_max, min, _current) = query_resolution()?;
    let mut updated_current = 0u32;
    let status = unsafe { NtSetTimerResolution(min, 1, &mut updated_current as *mut u32) };
    if status != STATUS_SUCCESS {
        return Err(format!("NtSetTimerResolution(enable) failed with status 0x{status:08X}."));
    }
    Ok(min)
}

pub fn disable_resolution(requested_resolution: u32) -> Result<(), String> {
    let mut updated_current = 0u32;
    let status = unsafe { NtSetTimerResolution(requested_resolution, 0, &mut updated_current as *mut u32) };
    if status != STATUS_SUCCESS {
        return Err(format!("NtSetTimerResolution(disable) failed with status 0x{status:08X}."));
    }
    Ok(())
}
