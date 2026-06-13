from __future__ import annotations

import json
import platform
import subprocess
from dataclasses import dataclass
from datetime import UTC, datetime
from typing import Any


@dataclass
class SecurityCheck:
    id: str
    title: str
    status: str
    label: str
    detail: str

    def as_dict(self) -> dict[str, str]:
        return {
            "id": self.id,
            "title": self.title,
            "status": self.status,
            "label": self.label,
            "detail": self.detail,
        }


def _run_powershell_security_scan() -> dict[str, Any]:
    script = r"""
$ErrorActionPreference = 'SilentlyContinue'
$defender = Get-MpComputerStatus |
  Select-Object AMServiceEnabled,AntivirusEnabled,RealTimeProtectionEnabled,AMRunningMode,IsTamperProtected
$services = Get-Service -Name WinDefend,wscsvc,MpsSvc -ErrorAction SilentlyContinue |
  ForEach-Object {
    [pscustomobject]@{
      Name = $_.Name
      Status = $_.Status.ToString()
      StartType = $_.StartType.ToString()
    }
  }
$firewall = Get-NetFirewallProfile -ErrorAction SilentlyContinue |
  ForEach-Object {
    [pscustomobject]@{
      Name = $_.Name
      Enabled = $_.Enabled.ToString()
    }
  }
$smartScreenPolicy = Get-ItemProperty -Path 'HKLM:\SOFTWARE\Policies\Microsoft\Windows\System' -ErrorAction SilentlyContinue
$smartScreenExplorer = Get-ItemProperty -Path 'HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\Explorer' -ErrorAction SilentlyContinue
$smartScreenAppHost = Get-ItemProperty -Path 'HKCU:\SOFTWARE\Microsoft\Windows\CurrentVersion\AppHost' -ErrorAction SilentlyContinue
$uac = Get-ItemProperty -Path 'HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\Policies\System' -ErrorAction SilentlyContinue
$hvci = Get-ItemProperty -Path 'HKLM:\SYSTEM\CurrentControlSet\Control\DeviceGuard\Scenarios\HypervisorEnforcedCodeIntegrity' -ErrorAction SilentlyContinue
$deviceGuard = Get-CimInstance -ClassName Win32_DeviceGuard -Namespace 'root\Microsoft\Windows\DeviceGuard' -ErrorAction SilentlyContinue |
  Select-Object SecurityServicesConfigured,SecurityServicesRunning,VirtualizationBasedSecurityStatus
$antivirusProducts = Get-CimInstance -Namespace 'root\SecurityCenter2' -ClassName AntivirusProduct -ErrorAction SilentlyContinue |
  Select-Object displayName
$wscHealth = @()
try {
  Add-Type -TypeDefinition @'
using System.Runtime.InteropServices;
public static class AeternaWindowsSecurityCenter {
    [DllImport("wscapi.dll")]
    public static extern int WscGetSecurityProviderHealth(uint providers, out int health);
}
'@ -ErrorAction Stop
  foreach ($provider in @(
    @{ Name = 'Firewall'; Value = 1 },
    @{ Name = 'Antivirus'; Value = 4 }
  )) {
    $health = -1
    $result = [AeternaWindowsSecurityCenter]::WscGetSecurityProviderHealth($provider.Value, [ref]$health)
    $wscHealth += [pscustomobject]@{
      Name = $provider.Name
      Result = $result
      Health = $health
    }
  }
} catch {}
$secureBoot = $null
$secureBootSource = $null
try {
  $secureBoot = Confirm-SecureBootUEFI
  $secureBootSource = 'cmdlet'
} catch {}
if ($null -eq $secureBoot) {
  try {
    $secureBootRegistry = Get-ItemPropertyValue `
      -Path 'HKLM:\SYSTEM\CurrentControlSet\Control\SecureBoot\State' `
      -Name UEFISecureBootEnabled `
      -ErrorAction Stop
    if ($null -ne $secureBootRegistry) {
      $secureBoot = [bool]$secureBootRegistry
      $secureBootSource = 'registry'
    }
  } catch {}
}
[pscustomobject]@{
  Defender = $defender
  Services = $services
  Firewall = $firewall
  WindowsSecurityHealth = $wscHealth
  AntivirusProducts = $antivirusProducts
  SmartScreenPolicyEnabled = $smartScreenPolicy.EnableSmartScreen
  SmartScreenPolicyLevel = $smartScreenPolicy.ShellSmartScreenLevel
  SmartScreenExplorer = $smartScreenExplorer.SmartScreenEnabled
  SmartScreenAppHost = $smartScreenAppHost.EnableWebContentEvaluation
  UacEnabled = $uac.EnableLUA
  HvciEnabled = $hvci.Enabled
  DeviceGuard = $deviceGuard
  SecureBoot = $secureBoot
  SecureBootSource = $secureBootSource
  ScannedAt = (Get-Date).ToUniversalTime().ToString("o")
} | ConvertTo-Json -Compress -Depth 6
"""
    output = subprocess.run(
        ["powershell", "-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-Command", script],
        capture_output=True,
        check=False,
        encoding="utf-8",
        errors="replace",
        timeout=12,
    )
    if output.returncode != 0:
        raise RuntimeError(output.stderr.strip() or "PowerShell Windows security scan failed.")
    return json.loads(output.stdout)


def _as_list(value: Any) -> list[Any]:
    if value is None:
        return []
    if isinstance(value, list):
        return value
    return [value]


def _bool_value(value: Any) -> bool | None:
    if isinstance(value, bool):
        return value
    if isinstance(value, int):
        if value == 1:
            return True
        if value == 0:
            return False
        return None
    if isinstance(value, str):
        lowered = value.strip().lower()
        if lowered in {"true", "1", "yes", "enabled"}:
            return True
        if lowered in {"false", "0", "no", "disabled"}:
            return False
    return None


def _service_status(scan: dict[str, Any], name: str) -> tuple[str, str] | None:
    for service in _as_list(scan.get("Services")):
        if not isinstance(service, dict) or service.get("Name") != name:
            continue
        return str(service.get("Status", "Unknown")), str(service.get("StartType", "Unknown"))
    return None


def _normalized_service_status(value: Any) -> str | None:
    aliases = {
        "1": "stopped",
        "2": "startpending",
        "3": "stoppending",
        "4": "running",
        "5": "continuepending",
        "6": "pausepending",
        "7": "paused",
    }
    normalized = str(value or "").strip().lower().replace("_", "").replace(" ", "")
    return aliases.get(normalized, normalized or None)


def _normalized_service_start_type(value: Any) -> str:
    aliases = {
        "0": "Boot",
        "1": "System",
        "2": "Automatic",
        "3": "Manual",
        "4": "Disabled",
    }
    text = str(value or "").strip()
    return aliases.get(text, text or "Unknown")


def _service_running(service: tuple[str, str] | None) -> bool | None:
    if service is None:
        return None
    status = _normalized_service_status(service[0])
    if status == "running":
        return True
    if status in {"stopped", "paused"}:
        return False
    return None


def _service_check(
    scan: dict[str, Any],
    *,
    name: str,
    check_id: str,
    title: str,
    fail_detail: str,
    unknown_detail: str,
) -> SecurityCheck:
    service = _service_status(scan, name)
    running = _service_running(service)
    if service is not None:
        status = _normalized_service_status(service[0]) or "unknown"
        start_type = _normalized_service_start_type(service[1])
        observed = f"{name} is {status} with start type {start_type}."
    else:
        observed = unknown_detail
    return _check_from_bool(
        value=running,
        check_id=check_id,
        title=title,
        pass_label="Running",
        fail_label="Stopped",
        unknown_label="Unknown",
        pass_detail=observed,
        fail_detail=f"{fail_detail} Observed state: {observed}" if service is not None else fail_detail,
        unknown_detail=observed,
    )


def _firewall_enabled(scan: dict[str, Any]) -> bool | None:
    profiles = [item for item in _as_list(scan.get("Firewall")) if isinstance(item, dict)]
    if not profiles:
        return None
    states = [_bool_value(profile.get("Enabled")) for profile in profiles]
    if any(state is False for state in states):
        return False
    if all(state is True for state in states):
        return True
    return None


def _windows_security_health(scan: dict[str, Any], name: str) -> bool | None:
    for provider in _as_list(scan.get("WindowsSecurityHealth")):
        if not isinstance(provider, dict) or str(provider.get("Name", "")).lower() != name.lower():
            continue
        if provider.get("Result") != 0:
            return None
        health = provider.get("Health")
        if health == 0:
            return True
        if health in {2, 3}:
            return False
        return None
    return None


def _antivirus_enabled(scan: dict[str, Any]) -> bool | None:
    aggregate = _windows_security_health(scan, "Antivirus")
    if aggregate is not None:
        return aggregate
    defender = scan.get("Defender")
    if not isinstance(defender, dict):
        return None
    antivirus = _bool_value(defender.get("AntivirusEnabled"))
    realtime = _bool_value(defender.get("RealTimeProtectionEnabled"))
    if antivirus is False or realtime is False:
        return False
    if antivirus is True and realtime is True:
        return True
    return None


def _smart_screen_enabled(scan: dict[str, Any]) -> bool | None:
    policy = _bool_value(scan.get("SmartScreenPolicyEnabled"))
    if policy is not None:
        return policy

    explorer_raw = str(scan.get("SmartScreenExplorer") or "").strip().lower()
    explorer = None
    if explorer_raw in {"off", "disabled"}:
        explorer = False
    elif explorer_raw in {"on", "warn", "requireadmin", "enabled"}:
        explorer = True

    app_host = _bool_value(scan.get("SmartScreenAppHost"))
    if explorer is False or app_host is False:
        return False
    if explorer is True or app_host is True:
        return True

    # No override means the built-in Windows default remains in effect.
    return True


def _int_values(value: Any) -> set[int]:
    values: set[int] = set()
    for item in _as_list(value):
        if isinstance(item, bool):
            continue
        try:
            values.add(int(item))
        except (TypeError, ValueError):
            continue
    return values


def _memory_integrity_enabled(scan: dict[str, Any]) -> bool | None:
    device_guard = scan.get("DeviceGuard")
    if isinstance(device_guard, dict):
        running_raw = device_guard.get("SecurityServicesRunning")
        configured_raw = device_guard.get("SecurityServicesConfigured")
        if running_raw is not None:
            if 2 in _int_values(running_raw):
                return True
            if configured_raw is not None:
                return False

    return _bool_value(scan.get("HvciEnabled"))


def _secure_boot_enabled(scan: dict[str, Any]) -> bool | None:
    return _bool_value(scan.get("SecureBoot"))


def _check_from_bool(
    *,
    value: bool | None,
    check_id: str,
    title: str,
    pass_label: str,
    fail_label: str,
    unknown_label: str,
    pass_detail: str,
    fail_detail: str,
    unknown_detail: str,
    unknown_status: str = "unknown",
) -> SecurityCheck:
    if value is True:
        return SecurityCheck(check_id, title, "pass", pass_label, pass_detail)
    if value is False:
        return SecurityCheck(check_id, title, "fail", fail_label, fail_detail)
    return SecurityCheck(check_id, title, unknown_status, unknown_label, unknown_detail)


def _build_windows_checks(scan: dict[str, Any]) -> list[SecurityCheck]:
    smart_screen_enabled = _smart_screen_enabled(scan)
    smart_screen_level = str(
        scan.get("SmartScreenPolicyLevel") or scan.get("SmartScreenExplorer") or ""
    ).strip()
    uac_enabled = _bool_value(scan.get("UacEnabled"))
    hvci_enabled = _memory_integrity_enabled(scan)
    secure_boot = _secure_boot_enabled(scan)
    antivirus_products = [
        str(product.get("displayName")).strip()
        for product in _as_list(scan.get("AntivirusProducts"))
        if isinstance(product, dict) and product.get("displayName")
    ]
    antivirus_suffix = f" Active provider: {', '.join(antivirus_products)}." if antivirus_products else ""
    smart_screen_detail = (
        f"SmartScreen is enabled ({smart_screen_level})."
        if smart_screen_level
        else "No disabling override was found, so the enabled Windows default applies."
    )
    hvci_detail = (
        "Win32_DeviceGuard reports Hypervisor-protected Code Integrity is running."
        if isinstance(scan.get("DeviceGuard"), dict)
        else "The Memory Integrity policy is enabled."
    )
    secure_boot_source = str(scan.get("SecureBootSource") or "").strip()
    secure_boot_detail = (
        f"Secure Boot is enabled according to the Windows {secure_boot_source} check."
        if secure_boot_source
        else "Secure Boot is enabled."
    )

    checks = [
        _check_from_bool(
            value=_antivirus_enabled(scan),
            check_id="defender",
            title="Antivirus protection",
            pass_label="Protected",
            fail_label="Disabled",
            unknown_label="Unknown",
            pass_detail=f"Windows reports a healthy active antivirus provider.{antivirus_suffix}",
            fail_detail=f"Windows reports that antivirus or real-time protection is not active.{antivirus_suffix}",
            unknown_detail="Active antivirus protection could not be confirmed from Windows Security Center or Microsoft Defender.",
        ),
        _service_check(
            scan,
            name="WinDefend",
            check_id="defender-service",
            title="Defender service",
            fail_detail="WinDefend service is not running.",
            unknown_detail="WinDefend service was not visible to the scanner.",
        ),
        _service_check(
            scan,
            name="wscsvc",
            check_id="security-center",
            title="Security Center",
            fail_detail="Security Center is not running, so Windows protection state may not be visible.",
            unknown_detail="Security Center service was not visible to the scanner.",
        ),
        _check_from_bool(
            value=_firewall_enabled(scan),
            check_id="firewall",
            title="Windows Firewall",
            pass_label="Enabled",
            fail_label="Disabled",
            unknown_label="Unknown",
            pass_detail="All Windows Firewall profiles reported Enabled=True.",
            fail_detail="At least one Windows Firewall profile is disabled.",
            unknown_detail="Firewall profiles could not be read.",
        ),
        _service_check(
            scan,
            name="MpsSvc",
            check_id="firewall-service",
            title="Firewall service",
            fail_detail="MpsSvc is not running, so firewall enforcement may be broken.",
            unknown_detail="MpsSvc service was not visible to the scanner.",
        ),
        _check_from_bool(
            value=smart_screen_enabled if smart_screen_enabled is not None else None,
            check_id="smartscreen",
            title="SmartScreen policy",
            pass_label="Enabled",
            fail_label="Disabled",
            unknown_label="Default",
            pass_detail=smart_screen_detail,
            fail_detail="SmartScreen is explicitly disabled by policy or a Windows user setting.",
            unknown_detail="SmartScreen status could not be determined.",
        ),
        _check_from_bool(
            value=uac_enabled,
            check_id="uac",
            title="User Account Control",
            pass_label="Enabled",
            fail_label="Disabled",
            unknown_label="Unknown",
            pass_detail="EnableLUA is enabled.",
            fail_detail="UAC is disabled. Risky optimizer actions should stay blocked until it is restored.",
            unknown_detail="UAC registry status could not be read.",
        ),
        _check_from_bool(
            value=hvci_enabled,
            check_id="memory-integrity",
            title="Memory Integrity",
            pass_label="Enabled",
            fail_label="Disabled",
            unknown_label="Not configured",
            pass_detail=hvci_detail,
            fail_detail="Win32_DeviceGuard reports that Memory Integrity is not running.",
            unknown_detail="Memory Integrity runtime status and policy could not be read.",
            unknown_status="warn",
        ),
        _check_from_bool(
            value=secure_boot,
            check_id="secure-boot",
            title="Secure Boot",
            pass_label="Enabled",
            fail_label="Disabled",
            unknown_label="Unavailable",
            pass_detail=secure_boot_detail,
            fail_detail="Secure Boot is disabled.",
            unknown_detail="Secure Boot could not be queried through the cmdlet or the Windows registry.",
            unknown_status="warn",
        ),
    ]
    return checks


def windows_security_summary() -> dict[str, Any] | None:
    if platform.system().lower() != "windows":
        return None
    try:
        scan = _run_powershell_security_scan()
    except Exception as exc:
        return {
            "status": "medium",
            "label": "windows-scan-unavailable",
            "confidence": 0.5,
            "source": "windows-scan-error",
            "checked_at": datetime.now(UTC).isoformat(),
            "checks": [
                SecurityCheck(
                    "windows-scan",
                    "Windows protection scan",
                    "unknown",
                    "Unavailable",
                    f"PowerShell security scan failed: {exc}",
                ).as_dict()
            ],
        }

    checks = _build_windows_checks(scan)
    fail_count = sum(1 for check in checks if check.status == "fail")
    warn_count = sum(1 for check in checks if check.status in {"warn", "unknown"})
    known_count = sum(1 for check in checks if check.status in {"pass", "fail"})
    status = "high" if fail_count > 0 else "medium" if warn_count > 0 else "low"
    label = "windows-protection-risk" if fail_count > 0 else "windows-review-needed" if warn_count > 0 else "windows-protected"
    confidence = 0.55 + 0.41 * (known_count / len(checks))
    return {
        "status": status,
        "label": label,
        "confidence": round(confidence, 2),
        "source": "windows-security-scan",
        "checked_at": scan.get("ScannedAt") or datetime.now(UTC).isoformat(),
        "checks": [check.as_dict() for check in checks],
    }
