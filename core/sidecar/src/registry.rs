use std::process::Command;

use crate::{
    models::{
        RegistryHive, RegistryPresetSummary, RegistrySnapshotEntry, RegistryValueData, RegistryValueType, SessionState,
        TweakSnapshot,
    },
    policy,
};

#[derive(Clone)]
struct RegistryMutation {
    hive: RegistryHive,
    path: &'static str,
    value_name: &'static str,
    value_type: RegistryValueType,
    target_value: RegistryValueData,
}

#[derive(Clone)]
struct RegistryPreset {
    id: &'static str,
    title: &'static str,
    category: &'static str,
    risk: &'static str,
    requires_admin: bool,
    requires_baseline: bool,
    expected_benefit: &'static str,
    current_state_label: &'static str,
    target_state_label: &'static str,
    scope: &'static str,
    mutations: Vec<RegistryMutation>,
}

fn catalog() -> Vec<RegistryPreset> {
    vec![
        RegistryPreset {
            id: "mouse_precision_off",
            title: "Disable mouse acceleration",
            category: "input",
            risk: "medium",
            requires_admin: false,
            requires_baseline: true,
            expected_benefit: "Reduces pointer acceleration so aim input stays consistent across mouse movement speeds.",
            current_state_label: "Mouse acceleration follows the current Windows pointer settings.",
            target_state_label: "Enhance pointer precision is disabled for the current user.",
            scope: "user-scope",
            mutations: vec![
                RegistryMutation {
                    hive: RegistryHive::Hkcu,
                    path: r"Control Panel\Mouse",
                    value_name: "MouseSpeed",
                    value_type: RegistryValueType::RegSz,
                    target_value: RegistryValueData::Sz("0".into()),
                },
                RegistryMutation {
                    hive: RegistryHive::Hkcu,
                    path: r"Control Panel\Mouse",
                    value_name: "MouseThreshold1",
                    value_type: RegistryValueType::RegSz,
                    target_value: RegistryValueData::Sz("0".into()),
                },
                RegistryMutation {
                    hive: RegistryHive::Hkcu,
                    path: r"Control Panel\Mouse",
                    value_name: "MouseThreshold2",
                    value_type: RegistryValueType::RegSz,
                    target_value: RegistryValueData::Sz("0".into()),
                },
            ],
        },
        RegistryPreset {
            id: "game_capture_overhead_off",
            title: "Reduce Game DVR capture overhead",
            category: "graphics",
            risk: "low",
            requires_admin: false,
            requires_baseline: true,
            expected_benefit: "Disables built-in background capture flags that can add overhead during gameplay or benchmarking.",
            current_state_label: "Game capture flags follow the current user recording settings.",
            target_state_label: "Game DVR background capture is disabled for the current user.",
            scope: "user-scope",
            mutations: vec![
                RegistryMutation {
                    hive: RegistryHive::Hkcu,
                    path: r"System\GameConfigStore",
                    value_name: "GameDVR_Enabled",
                    value_type: RegistryValueType::RegDword,
                    target_value: RegistryValueData::Dword(0),
                },
                RegistryMutation {
                    hive: RegistryHive::Hkcu,
                    path: r"Software\Microsoft\Windows\CurrentVersion\GameDVR",
                    value_name: "AppCaptureEnabled",
                    value_type: RegistryValueType::RegDword,
                    target_value: RegistryValueData::Dword(0),
                },
            ],
        },
        RegistryPreset {
            id: "game_mode_on",
            title: "Force Game Mode on",
            category: "game-mode",
            risk: "low",
            requires_admin: false,
            requires_baseline: true,
            expected_benefit: "Pins Windows Game Mode on for the current user so the session runs under the expected scheduling posture.",
            current_state_label: "Game Mode follows the current Windows user setting.",
            target_state_label: "Game Mode is enabled for the current user.",
            scope: "user-scope",
            mutations: vec![RegistryMutation {
                hive: RegistryHive::Hkcu,
                path: r"Software\Microsoft\GameBar",
                value_name: "AutoGameModeEnabled",
                value_type: RegistryValueType::RegDword,
                target_value: RegistryValueData::Dword(1),
            }],
        },
        RegistryPreset {
            id: "power_throttling_off",
            title: "Disable power throttling",
            category: "game-mode",
            risk: "medium",
            requires_admin: true,
            requires_baseline: true,
            expected_benefit: "Removes Windows power throttling for the machine so the benchmark measures the performance path without that limiter.",
            current_state_label: "Machine power throttling follows the current Windows machine policy.",
            target_state_label: "Power throttling is disabled at machine scope.",
            scope: "machine-scope",
            mutations: vec![RegistryMutation {
                hive: RegistryHive::Hklm,
                path: r"SYSTEM\CurrentControlSet\Control\Power\PowerThrottling",
                value_name: "PowerThrottlingOff",
                value_type: RegistryValueType::RegDword,
                target_value: RegistryValueData::Dword(1),
            }],
        },
        RegistryPreset {
            id: "windowed_optimizations_on",
            title: "Enable windowed optimizations",
            category: "graphics",
            risk: "low",
            requires_admin: false,
            requires_baseline: false,
            expected_benefit: "Enables Windows optimizations for borderless and windowed DirectX games.",
            current_state_label: "Windowed optimizations follow the current user setting.",
            target_state_label: "Windowed optimizations are enabled for the current user.",
            scope: "user-scope",
            mutations: vec![RegistryMutation {
                hive: RegistryHive::Hkcu,
                path: r"Software\Microsoft\DirectX\UserGpuPreferences",
                value_name: "DirectXUserGlobalSettings",
                value_type: RegistryValueType::RegSz,
                target_value: RegistryValueData::Sz("SwapEffectUpgradeEnable=1;".into()),
            }],
        },
        RegistryPreset {
            id: "hags_on",
            title: "Enable Hardware-accelerated GPU scheduling",
            category: "graphics",
            risk: "medium",
            requires_admin: true,
            requires_baseline: false,
            expected_benefit: "Moves GPU scheduling overhead from CPU to GPU hardware scheduler.",
            current_state_label: "HAGS follows the current machine graphics scheduler policy.",
            target_state_label: "HAGS is enabled (HwSchMode=2).",
            scope: "machine-scope",
            mutations: vec![RegistryMutation {
                hive: RegistryHive::Hklm,
                path: r"SYSTEM\CurrentControlSet\Control\GraphicsDrivers",
                value_name: "HwSchMode",
                value_type: RegistryValueType::RegDword,
                target_value: RegistryValueData::Dword(2),
            }],
        },
        RegistryPreset {
            id: "mpo_off",
            title: "Disable Multiplane Overlay (MPO)",
            category: "graphics",
            risk: "medium",
            requires_admin: true,
            requires_baseline: false,
            expected_benefit: "Bypasses MPO composition path that can cause flicker/stutter on some drivers.",
            current_state_label: "MPO follows the current DWM policy.",
            target_state_label: "MPO test mode is forced off.",
            scope: "machine-scope",
            mutations: vec![RegistryMutation {
                hive: RegistryHive::Hklm,
                path: r"SOFTWARE\Microsoft\Windows\Dwm",
                value_name: "OverlayTestMode",
                value_type: RegistryValueType::RegDword,
                target_value: RegistryValueData::Dword(5),
            }],
        },
        RegistryPreset {
            id: "sysmain_off",
            title: "Disable SysMain service startup",
            category: "services",
            risk: "medium",
            requires_admin: true,
            requires_baseline: false,
            expected_benefit: "Reduces background memory/disk prefetch activity.",
            current_state_label: "SysMain startup follows current machine service policy.",
            target_state_label: "SysMain startup is disabled.",
            scope: "machine-scope",
            mutations: vec![RegistryMutation {
                hive: RegistryHive::Hklm,
                path: r"SYSTEM\CurrentControlSet\Services\SysMain",
                value_name: "Start",
                value_type: RegistryValueType::RegDword,
                target_value: RegistryValueData::Dword(4),
            }],
        },
        RegistryPreset {
            id: "windows_search_off",
            title: "Disable Windows Search service startup",
            category: "services",
            risk: "medium",
            requires_admin: true,
            requires_baseline: false,
            expected_benefit: "Reduces indexing-related CPU and disk activity.",
            current_state_label: "Windows Search startup follows current service policy.",
            target_state_label: "Windows Search startup is disabled.",
            scope: "machine-scope",
            mutations: vec![RegistryMutation {
                hive: RegistryHive::Hklm,
                path: r"SYSTEM\CurrentControlSet\Services\WSearch",
                value_name: "Start",
                value_type: RegistryValueType::RegDword,
                target_value: RegistryValueData::Dword(4),
            }],
        },
        RegistryPreset {
            id: "dps_off",
            title: "Disable Diagnostic Policy Service startup",
            category: "services",
            risk: "high",
            requires_admin: true,
            requires_baseline: false,
            expected_benefit: "Removes diagnostics service runtime overhead.",
            current_state_label: "Diagnostic Policy Service startup follows current service policy.",
            target_state_label: "Diagnostic Policy Service startup is disabled.",
            scope: "machine-scope",
            mutations: vec![RegistryMutation {
                hive: RegistryHive::Hklm,
                path: r"SYSTEM\CurrentControlSet\Services\DPS",
                value_name: "Start",
                value_type: RegistryValueType::RegDword,
                target_value: RegistryValueData::Dword(4),
            }],
        },
        RegistryPreset {
            id: "diagtrack_off",
            title: "Disable Connected User Experiences telemetry service",
            category: "privacy",
            risk: "medium",
            requires_admin: true,
            requires_baseline: false,
            expected_benefit: "Reduces Windows telemetry service runtime activity.",
            current_state_label: "DiagTrack startup follows current machine service policy.",
            target_state_label: "DiagTrack startup is disabled.",
            scope: "machine-scope",
            mutations: vec![RegistryMutation {
                hive: RegistryHive::Hklm,
                path: r"SYSTEM\CurrentControlSet\Services\DiagTrack",
                value_name: "Start",
                value_type: RegistryValueType::RegDword,
                target_value: RegistryValueData::Dword(4),
            }],
        },
        RegistryPreset {
            id: "maps_broker_off",
            title: "Disable downloaded maps service",
            category: "services",
            risk: "low",
            requires_admin: true,
            requires_baseline: false,
            expected_benefit: "Prevents offline maps maintenance from waking in gaming sessions.",
            current_state_label: "MapsBroker startup follows current service policy.",
            target_state_label: "MapsBroker startup is disabled.",
            scope: "machine-scope",
            mutations: vec![RegistryMutation {
                hive: RegistryHive::Hklm,
                path: r"SYSTEM\CurrentControlSet\Services\MapsBroker",
                value_name: "Start",
                value_type: RegistryValueType::RegDword,
                target_value: RegistryValueData::Dword(4),
            }],
        },
        RegistryPreset {
            id: "xbox_services_off",
            title: "Disable Xbox background services",
            category: "services",
            risk: "medium",
            requires_admin: true,
            requires_baseline: false,
            expected_benefit: "Stops Xbox accessory/save/network services when they are not part of the gaming setup.",
            current_state_label: "Xbox services follow current machine service policy.",
            target_state_label: "Xbox background services are disabled.",
            scope: "machine-scope",
            mutations: vec![
                RegistryMutation {
                    hive: RegistryHive::Hklm,
                    path: r"SYSTEM\CurrentControlSet\Services\XblAuthManager",
                    value_name: "Start",
                    value_type: RegistryValueType::RegDword,
                    target_value: RegistryValueData::Dword(4),
                },
                RegistryMutation {
                    hive: RegistryHive::Hklm,
                    path: r"SYSTEM\CurrentControlSet\Services\XblGameSave",
                    value_name: "Start",
                    value_type: RegistryValueType::RegDword,
                    target_value: RegistryValueData::Dword(4),
                },
                RegistryMutation {
                    hive: RegistryHive::Hklm,
                    path: r"SYSTEM\CurrentControlSet\Services\XboxNetApiSvc",
                    value_name: "Start",
                    value_type: RegistryValueType::RegDword,
                    target_value: RegistryValueData::Dword(4),
                },
                RegistryMutation {
                    hive: RegistryHive::Hklm,
                    path: r"SYSTEM\CurrentControlSet\Services\XboxGipSvc",
                    value_name: "Start",
                    value_type: RegistryValueType::RegDword,
                    target_value: RegistryValueData::Dword(4),
                },
            ],
        },
        RegistryPreset {
            id: "consumer_features_off",
            title: "Disable Windows consumer content",
            category: "debloat",
            risk: "low",
            requires_admin: true,
            requires_baseline: false,
            expected_benefit: "Blocks suggested apps and consumer content provisioning.",
            current_state_label: "Windows consumer features follow current policy.",
            target_state_label: "Windows consumer feature provisioning is disabled.",
            scope: "machine-scope",
            mutations: vec![RegistryMutation {
                hive: RegistryHive::Hklm,
                path: r"SOFTWARE\Policies\Microsoft\Windows\CloudContent",
                value_name: "DisableWindowsConsumerFeatures",
                value_type: RegistryValueType::RegDword,
                target_value: RegistryValueData::Dword(1),
            }],
        },
        RegistryPreset {
            id: "content_delivery_off",
            title: "Disable suggested apps and lock screen content",
            category: "debloat",
            risk: "low",
            requires_admin: false,
            requires_baseline: false,
            expected_benefit: "Stops per-user suggested app installation and promoted content surfaces.",
            current_state_label: "Content delivery follows current user settings.",
            target_state_label: "Suggested app and promoted content delivery is disabled.",
            scope: "user-scope",
            mutations: vec![
                RegistryMutation {
                    hive: RegistryHive::Hkcu,
                    path: r"Software\Microsoft\Windows\CurrentVersion\ContentDeliveryManager",
                    value_name: "ContentDeliveryAllowed",
                    value_type: RegistryValueType::RegDword,
                    target_value: RegistryValueData::Dword(0),
                },
                RegistryMutation {
                    hive: RegistryHive::Hkcu,
                    path: r"Software\Microsoft\Windows\CurrentVersion\ContentDeliveryManager",
                    value_name: "OemPreInstalledAppsEnabled",
                    value_type: RegistryValueType::RegDword,
                    target_value: RegistryValueData::Dword(0),
                },
                RegistryMutation {
                    hive: RegistryHive::Hkcu,
                    path: r"Software\Microsoft\Windows\CurrentVersion\ContentDeliveryManager",
                    value_name: "PreInstalledAppsEnabled",
                    value_type: RegistryValueType::RegDword,
                    target_value: RegistryValueData::Dword(0),
                },
                RegistryMutation {
                    hive: RegistryHive::Hkcu,
                    path: r"Software\Microsoft\Windows\CurrentVersion\ContentDeliveryManager",
                    value_name: "SilentInstalledAppsEnabled",
                    value_type: RegistryValueType::RegDword,
                    target_value: RegistryValueData::Dword(0),
                },
                RegistryMutation {
                    hive: RegistryHive::Hkcu,
                    path: r"Software\Microsoft\Windows\CurrentVersion\ContentDeliveryManager",
                    value_name: "SystemPaneSuggestionsEnabled",
                    value_type: RegistryValueType::RegDword,
                    target_value: RegistryValueData::Dword(0),
                },
            ],
        },
        RegistryPreset {
            id: "widgets_off",
            title: "Disable Widgets and News",
            category: "debloat",
            risk: "low",
            requires_admin: true,
            requires_baseline: false,
            expected_benefit: "Removes the Windows Widgets/News taskbar surface and its background updates.",
            current_state_label: "Widgets follow current Windows policy.",
            target_state_label: "Widgets and News are disabled by policy.",
            scope: "machine-scope",
            mutations: vec![RegistryMutation {
                hive: RegistryHive::Hklm,
                path: r"SOFTWARE\Policies\Microsoft\Dsh",
                value_name: "AllowNewsAndInterests",
                value_type: RegistryValueType::RegDword,
                target_value: RegistryValueData::Dword(0),
            }],
        },
        RegistryPreset {
            id: "advertising_id_off",
            title: "Disable advertising ID",
            category: "privacy",
            risk: "low",
            requires_admin: false,
            requires_baseline: false,
            expected_benefit: "Disables the per-user advertising identifier used for app personalization.",
            current_state_label: "Advertising ID follows current user privacy setting.",
            target_state_label: "Advertising ID is disabled for the current user.",
            scope: "user-scope",
            mutations: vec![RegistryMutation {
                hive: RegistryHive::Hkcu,
                path: r"Software\Microsoft\Windows\CurrentVersion\AdvertisingInfo",
                value_name: "Enabled",
                value_type: RegistryValueType::RegDword,
                target_value: RegistryValueData::Dword(0),
            }],
        },
        RegistryPreset {
            id: "telemetry_minimal",
            title: "Set Windows diagnostic telemetry to minimum",
            category: "privacy",
            risk: "medium",
            requires_admin: true,
            requires_baseline: false,
            expected_benefit: "Limits Windows diagnostic data collection policy where the edition allows it.",
            current_state_label: "Diagnostic telemetry follows current machine policy.",
            target_state_label: "Diagnostic telemetry is set to the minimum policy value.",
            scope: "machine-scope",
            mutations: vec![RegistryMutation {
                hive: RegistryHive::Hklm,
                path: r"SOFTWARE\Policies\Microsoft\Windows\DataCollection",
                value_name: "AllowTelemetry",
                value_type: RegistryValueType::RegDword,
                target_value: RegistryValueData::Dword(0),
            }],
        },
        RegistryPreset {
            id: "feedback_frequency_off",
            title: "Disable feedback prompts",
            category: "privacy",
            risk: "low",
            requires_admin: false,
            requires_baseline: false,
            expected_benefit: "Stops Windows feedback prompt scheduling for the current user.",
            current_state_label: "Feedback prompts follow current user setting.",
            target_state_label: "Feedback prompt frequency is disabled.",
            scope: "user-scope",
            mutations: vec![RegistryMutation {
                hive: RegistryHive::Hkcu,
                path: r"Software\Microsoft\Siuf\Rules",
                value_name: "NumberOfSIUFInPeriod",
                value_type: RegistryValueType::RegDword,
                target_value: RegistryValueData::Dword(0),
            }],
        },
        RegistryPreset {
            id: "activity_history_off",
            title: "Disable activity history sync",
            category: "privacy",
            risk: "low",
            requires_admin: true,
            requires_baseline: false,
            expected_benefit: "Disables timeline/activity publishing and upload policies.",
            current_state_label: "Activity history follows current machine policy.",
            target_state_label: "Activity history publishing and upload are disabled.",
            scope: "machine-scope",
            mutations: vec![
                RegistryMutation {
                    hive: RegistryHive::Hklm,
                    path: r"SOFTWARE\Policies\Microsoft\Windows\System",
                    value_name: "EnableActivityFeed",
                    value_type: RegistryValueType::RegDword,
                    target_value: RegistryValueData::Dword(0),
                },
                RegistryMutation {
                    hive: RegistryHive::Hklm,
                    path: r"SOFTWARE\Policies\Microsoft\Windows\System",
                    value_name: "PublishUserActivities",
                    value_type: RegistryValueType::RegDword,
                    target_value: RegistryValueData::Dword(0),
                },
                RegistryMutation {
                    hive: RegistryHive::Hklm,
                    path: r"SOFTWARE\Policies\Microsoft\Windows\System",
                    value_name: "UploadUserActivities",
                    value_type: RegistryValueType::RegDword,
                    target_value: RegistryValueData::Dword(0),
                },
            ],
        },
        RegistryPreset {
            id: "windows_error_reporting_off",
            title: "Disable Windows Error Reporting",
            category: "privacy",
            risk: "medium",
            requires_admin: true,
            requires_baseline: false,
            expected_benefit: "Prevents background error report collection and upload jobs.",
            current_state_label: "Windows Error Reporting follows current machine policy.",
            target_state_label: "Windows Error Reporting is disabled.",
            scope: "machine-scope",
            mutations: vec![RegistryMutation {
                hive: RegistryHive::Hklm,
                path: r"SOFTWARE\Microsoft\Windows\Windows Error Reporting",
                value_name: "Disabled",
                value_type: RegistryValueType::RegDword,
                target_value: RegistryValueData::Dword(1),
            }],
        },
        RegistryPreset {
            id: "app_launch_tracking_off",
            title: "Disable app launch tracking",
            category: "privacy",
            risk: "low",
            requires_admin: false,
            requires_baseline: false,
            expected_benefit: "Stops Windows from tracking app launches for Start/menu personalization.",
            current_state_label: "App launch tracking follows current user setting.",
            target_state_label: "App launch tracking is disabled.",
            scope: "user-scope",
            mutations: vec![RegistryMutation {
                hive: RegistryHive::Hkcu,
                path: r"Software\Microsoft\Windows\CurrentVersion\Explorer\Advanced",
                value_name: "Start_TrackProgs",
                value_type: RegistryValueType::RegDword,
                target_value: RegistryValueData::Dword(0),
            }],
        },
        RegistryPreset {
            id: "smartscreen_on",
            title: "Keep SmartScreen enabled",
            category: "security",
            risk: "low",
            requires_admin: true,
            requires_baseline: false,
            expected_benefit: "Keeps Windows SmartScreen protection explicitly enabled while performance tweaks are applied.",
            current_state_label: "SmartScreen follows current machine policy.",
            target_state_label: "SmartScreen is enabled by policy.",
            scope: "machine-scope",
            mutations: vec![
                RegistryMutation {
                    hive: RegistryHive::Hklm,
                    path: r"SOFTWARE\Policies\Microsoft\Windows\System",
                    value_name: "EnableSmartScreen",
                    value_type: RegistryValueType::RegDword,
                    target_value: RegistryValueData::Dword(1),
                },
                RegistryMutation {
                    hive: RegistryHive::Hklm,
                    path: r"SOFTWARE\Policies\Microsoft\Windows\System",
                    value_name: "ShellSmartScreenLevel",
                    value_type: RegistryValueType::RegSz,
                    target_value: RegistryValueData::Sz("Warn".into()),
                },
            ],
        },
        RegistryPreset {
            id: "memory_integrity_off",
            title: "Disable Memory Integrity (VBS)",
            category: "security",
            risk: "high",
            requires_admin: true,
            requires_baseline: false,
            expected_benefit: "Removes Hypervisor-protected Code Integrity overhead on systems where it hurts latency.",
            current_state_label: "Memory Integrity follows current Device Guard setting.",
            target_state_label: "Memory Integrity is disabled; restart required.",
            scope: "machine-scope",
            mutations: vec![RegistryMutation {
                hive: RegistryHive::Hklm,
                path: r"SYSTEM\CurrentControlSet\Control\DeviceGuard\Scenarios\HypervisorEnforcedCodeIntegrity",
                value_name: "Enabled",
                value_type: RegistryValueType::RegDword,
                target_value: RegistryValueData::Dword(0),
            }],
        },
        RegistryPreset {
            id: "ntfs_last_access_off",
            title: "Disable NTFS last access updates",
            category: "tweaks",
            risk: "low",
            requires_admin: true,
            requires_baseline: false,
            expected_benefit: "Reduces filesystem metadata writes caused by last-access timestamp maintenance.",
            current_state_label: "NTFS last access updates follow current filesystem policy.",
            target_state_label: "NTFS last access updates are disabled.",
            scope: "machine-scope",
            mutations: vec![RegistryMutation {
                hive: RegistryHive::Hklm,
                path: r"SYSTEM\CurrentControlSet\Control\FileSystem",
                value_name: "NtfsDisableLastAccessUpdate",
                value_type: RegistryValueType::RegDword,
                target_value: RegistryValueData::Dword(1),
            }],
        },
    ]
}

pub(crate) fn hive_name(hive: &RegistryHive) -> &'static str {
    match hive {
        RegistryHive::Hkcu => "HKCU",
        RegistryHive::Hklm => "HKLM",
    }
}

pub(crate) fn reg_type_name(value_type: &RegistryValueType) -> &'static str {
    match value_type {
        RegistryValueType::RegSz => "REG_SZ",
        RegistryValueType::RegDword => "REG_DWORD",
    }
}

pub(crate) fn reg_data_string(value: &RegistryValueData) -> String {
    match value {
        RegistryValueData::Sz(value) => value.clone(),
        RegistryValueData::Dword(value) => value.to_string(),
    }
}

fn parse_query_value(value_type: &RegistryValueType, raw: &str) -> Option<RegistryValueData> {
    match value_type {
        RegistryValueType::RegSz => Some(RegistryValueData::Sz(raw.trim().to_string())),
        RegistryValueType::RegDword => {
            let trimmed = raw.trim();
            let parsed = if let Some(hex) = trimmed.strip_prefix("0x") {
                u32::from_str_radix(hex, 16).ok()
            } else {
                trimmed.parse::<u32>().ok()
            }?;
            Some(RegistryValueData::Dword(parsed))
        }
    }
}

pub(crate) fn run_reg_command(args: &[String], elevated: bool) -> Result<String, String> {
    if !elevated {
        let output = Command::new("reg")
            .args(args)
            .output()
            .map_err(|error| format!("Unable to launch reg.exe: {error}"))?;
        if output.status.success() {
            return Ok(String::from_utf8_lossy(&output.stdout).to_string());
        }
        return Err(String::from_utf8_lossy(&output.stderr).trim().to_string().if_empty_then("Registry command failed."));
    }

    let powershell_args = args
        .iter()
        .map(|value| format!("'{}'", value.replace('\'', "''")))
        .collect::<Vec<_>>()
        .join(",");
    let script = format!(
        "$p = Start-Process -FilePath reg.exe -Verb RunAs -WindowStyle Hidden -ArgumentList @({powershell_args}) -PassThru -Wait; exit $p.ExitCode"
    );
    let output = Command::new("powershell")
        .args(["-NoProfile", "-NonInteractive", "-Command", &script])
        .output()
        .map_err(|error| format!("Unable to request elevation for reg.exe: {error}"))?;
    if output.status.success() {
        return Ok(String::from_utf8_lossy(&output.stdout).to_string());
    }
    let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
    if stderr.is_empty() {
        return Err("Registry action requires elevation and the UAC request was denied or failed.".into());
    }
    Err(stderr)
}

trait EmptyStringFallback {
    fn if_empty_then(self, fallback: &str) -> String;
}

impl EmptyStringFallback for String {
    fn if_empty_then(self, fallback: &str) -> String {
        if self.trim().is_empty() {
            fallback.to_string()
        } else {
            self
        }
    }
}

fn query_value(mutation: &RegistryMutation) -> Result<Option<RegistryValueData>, String> {
    query_value_dynamic(
        &mutation.hive,
        mutation.path,
        mutation.value_name,
        &mutation.value_type,
    )
}

pub(crate) fn query_value_dynamic(
    hive: &RegistryHive,
    path: &str,
    value_name: &str,
    value_type: &RegistryValueType,
) -> Result<Option<RegistryValueData>, String> {
    let key = format!(r"{}\{}", hive_name(hive), path);
    let args = vec!["query".into(), key, "/v".into(), value_name.into()];
    let output = Command::new("reg")
        .args(&args)
        .output()
        .map_err(|error| format!("Unable to query registry: {error}"))?;
    if !output.status.success() {
        return Ok(None);
    }
    let stdout = String::from_utf8_lossy(&output.stdout);
    let line = stdout
        .lines()
        .find(|line| line.trim_start().starts_with(value_name))
        .ok_or_else(|| "Registry query output could not be parsed.".to_string())?;
    let parts = line.split_whitespace().collect::<Vec<_>>();
    if parts.len() < 3 {
        return Err("Registry query output is incomplete.".into());
    }
    let data = parts[2..].join(" ");
    Ok(parse_query_value(value_type, &data))
}

fn set_entry_target(entry: &RegistrySnapshotEntry, elevated: bool) -> Result<(), String> {
    let key = format!(r"{}\{}", hive_name(&entry.hive), entry.path);
    let args = vec![
        "add".into(),
        key,
        "/v".into(),
        entry.value_name.clone(),
        "/t".into(),
        reg_type_name(&entry.value_type).into(),
        "/d".into(),
        reg_data_string(&entry.target_value),
        "/f".into(),
    ];
    run_reg_command(&args, elevated).map(|_| ())
}

fn restore_value(entry: &RegistrySnapshotEntry, elevated: bool) -> Result<(), String> {
    let key = format!(r"{}\{}", hive_name(&entry.hive), entry.path);
    if entry.existed_before {
        let old_value = entry
            .old_value
            .as_ref()
            .ok_or_else(|| "Registry restore is missing the original value.".to_string())?;
        let args = vec![
            "add".into(),
            key,
            "/v".into(),
            entry.value_name.clone(),
            "/t".into(),
            reg_type_name(&entry.value_type).into(),
            "/d".into(),
            reg_data_string(old_value),
            "/f".into(),
        ];
        run_reg_command(&args, elevated).map(|_| ())
    } else {
        let args = vec!["delete".into(), key, "/v".into(), entry.value_name.clone(), "/f".into()];
        run_reg_command(&args, elevated).map(|_| ())
    }
}

fn preset_by_id(preset_id: &str) -> Result<RegistryPreset, String> {
    catalog()
        .into_iter()
        .find(|preset| preset.id == preset_id)
        .ok_or_else(|| format!("Unknown registry preset: {preset_id}"))
}

fn advanced_details(preset: &RegistryPreset) -> Vec<String> {
    preset
        .mutations
        .iter()
        .map(|mutation| {
            format!(
                "{}\\{} -> {} ({}) = {}",
                hive_name(&mutation.hive),
                mutation.path,
                mutation.value_name,
                reg_type_name(&mutation.value_type),
                reg_data_string(&mutation.target_value)
            )
        })
        .collect()
}

fn matches_target(mutation: &RegistryMutation, current: Option<&RegistryValueData>) -> bool {
    matches!(current, Some(current) if *current == mutation.target_value)
}

pub fn preset_summaries(session: &SessionState, show_advanced_details: bool) -> Vec<RegistryPresetSummary> {
    catalog()
        .into_iter()
        .map(|preset| {
            let blocking_reason = if preset
                .mutations
                .iter()
                .all(|mutation| query_value(mutation).ok().flatten().as_ref().map(|value| matches_target(mutation, Some(value))).unwrap_or(false))
            {
                Some("This preset is already active on the current machine state.".to_string())
            } else {
                policy::registry_preset_block(session, preset.requires_admin).map(|block| block.reason)
            };
            let next_action = if blocking_reason.as_deref() == Some("This preset is already active on the current machine state.") {
                Some("Restore the active preset or choose another preset.".to_string())
            } else {
                policy::registry_preset_block(session, preset.requires_admin).map(|block| block.next_action)
            };
            RegistryPresetSummary {
                id: preset.id.into(),
                title: preset.title.into(),
                category: preset.category.into(),
                risk: preset.risk.into(),
                requires_admin: preset.requires_admin,
                requires_baseline: preset.requires_baseline,
                allowed_now: blocking_reason.is_none(),
                blocking_reason,
                next_action,
                expected_benefit: preset.expected_benefit.into(),
                current_state: preset.current_state_label.into(),
                target_state: preset.target_state_label.into(),
                affected_values_count: preset.mutations.len(),
                scope: preset.scope.into(),
                advanced_details: if show_advanced_details { advanced_details(&preset) } else { Vec::new() },
            }
        })
        .collect()
}

pub fn build_snapshot(preset_id: &str, session_id: Option<String>) -> Result<TweakSnapshot, String> {
    let preset = preset_by_id(preset_id)?;
    let mut entries = Vec::new();
    for mutation in &preset.mutations {
        let existing = query_value(mutation)?;
        entries.push(RegistrySnapshotEntry {
            hive: mutation.hive.clone(),
            path: mutation.path.into(),
            value_name: mutation.value_name.into(),
            value_type: mutation.value_type.clone(),
            old_value: existing.clone(),
            existed_before: existing.is_some(),
            target_value: mutation.target_value.clone(),
        });
    }
    Ok(TweakSnapshot {
        id: format!(
            "{}-{}",
            time::OffsetDateTime::now_utc().unix_timestamp_nanos() / 1_000_000,
            preset.id
        ),
        kind: "registry-preset".into(),
        created_at: time::OffsetDateTime::now_utc()
            .format(&time::format_description::well_known::Rfc3339)
            .expect("current utc time should format as rfc3339"),
        note: format!("Before applying system preset {}", preset.title),
        scope: "session".into(),
        session_id,
        process: None,
        power_plan_guid: None,
        power_plan_name: None,
        registry_preset_id: Some(preset.id.into()),
        registry_entries: entries,
        requires_admin: preset.requires_admin,
        applied_at: None,
        restored_at: None,
        extra: serde_json::Value::Null,
    })
}

pub fn build_windowed_optimizations_snapshot(session_id: Option<String>) -> Result<TweakSnapshot, String> {
    build_snapshot("windowed_optimizations_on", session_id)
}

pub fn build_gpu_preference_snapshot(
    process_path: &str,
    session_id: Option<String>,
) -> Result<TweakSnapshot, String> {
    let hive = RegistryHive::Hkcu;
    let path = r"Software\Microsoft\DirectX\UserGpuPreferences";
    let value_type = RegistryValueType::RegSz;
    let target_value = RegistryValueData::Sz("GpuPreference=2;".into());
    let existing = query_value_dynamic(&hive, path, process_path, &value_type)?;
    let entry = RegistrySnapshotEntry {
        hive,
        path: path.into(),
        value_name: process_path.into(),
        value_type,
        old_value: existing.clone(),
        existed_before: existing.is_some(),
        target_value,
    };
    Ok(TweakSnapshot {
        id: format!(
            "{}-gpu-preference",
            time::OffsetDateTime::now_utc().unix_timestamp_nanos() / 1_000_000
        ),
        kind: "registry-preset".into(),
        created_at: time::OffsetDateTime::now_utc()
            .format(&time::format_description::well_known::Rfc3339)
            .expect("current utc time should format as rfc3339"),
        note: format!("Before setting high GPU preference for {process_path}"),
        scope: "session".into(),
        session_id,
        process: None,
        power_plan_guid: None,
        power_plan_name: None,
        registry_preset_id: Some("gpu_preference_high".into()),
        registry_entries: vec![entry],
        requires_admin: false,
        applied_at: None,
        restored_at: None,
        extra: serde_json::Value::Null,
    })
}

pub fn build_fullscreen_optimizations_snapshot(
    process_path: &str,
    session_id: Option<String>,
) -> Result<TweakSnapshot, String> {
    let hive = RegistryHive::Hkcu;
    let path = r"Software\Microsoft\Windows NT\CurrentVersion\AppCompatFlags\Layers";
    let value_type = RegistryValueType::RegSz;
    let target_value = RegistryValueData::Sz("~ DISABLEDXMAXIMIZEDWINDOWEDMODE".into());
    let existing = query_value_dynamic(&hive, path, process_path, &value_type)?;
    let entry = RegistrySnapshotEntry {
        hive,
        path: path.into(),
        value_name: process_path.into(),
        value_type,
        old_value: existing.clone(),
        existed_before: existing.is_some(),
        target_value,
    };
    Ok(TweakSnapshot {
        id: format!(
            "{}-fullscreen-opt-off",
            time::OffsetDateTime::now_utc().unix_timestamp_nanos() / 1_000_000
        ),
        kind: "registry-preset".into(),
        created_at: time::OffsetDateTime::now_utc()
            .format(&time::format_description::well_known::Rfc3339)
            .expect("current utc time should format as rfc3339"),
        note: format!("Before disabling fullscreen optimizations for {process_path}"),
        scope: "session".into(),
        session_id,
        process: None,
        power_plan_guid: None,
        power_plan_name: None,
        registry_preset_id: Some("fullscreen_optimizations_off".into()),
        registry_entries: vec![entry],
        requires_admin: false,
        applied_at: None,
        restored_at: None,
        extra: serde_json::Value::Null,
    })
}

pub fn apply_snapshot(snapshot: &TweakSnapshot) -> Result<(), String> {
    for entry in &snapshot.registry_entries {
        set_entry_target(entry, snapshot.requires_admin)?;
    }
    Ok(())
}

pub fn restore_snapshot(snapshot: &TweakSnapshot) -> Result<(), String> {
    for entry in &snapshot.registry_entries {
        let elevated = snapshot.requires_admin || matches!(entry.hive, RegistryHive::Hklm);
        restore_value(entry, elevated)?;
    }
    Ok(())
}
