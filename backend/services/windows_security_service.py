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
$defender = Get-MpComputerStatus
$services = Get-Service -Name WinDefend,wscsvc,MpsSvc -ErrorAction SilentlyContinue |
  Select-Object Name,Status,StartType
$firewall = Get-NetFirewallProfile -ErrorAction SilentlyContinue |
  Select-Object Name,Enabled
$smartScreen = Get-ItemProperty -Path 'HKLM:\SOFTWARE\Policies\Microsoft\Windows\System' -ErrorAction SilentlyContinue
$uac = Get-ItemProperty -Path 'HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\Policies\System' -ErrorAction SilentlyContinue
$hvci = Get-ItemProperty -Path 'HKLM:\SYSTEM\CurrentControlSet\Control\DeviceGuard\Scenarios\HypervisorEnforcedCodeIntegrity' -ErrorAction SilentlyContinue
$secureBoot = $null
try { $secureBoot = Confirm-SecureBootUEFI } catch { $secureBoot = $null }
[pscustomobject]@{
  Defender = $defender
  Services = $services
  Firewall = $firewall
  SmartScreenEnabled = $smartScreen.EnableSmartScreen
  SmartScreenLevel = $smartScreen.ShellSmartScreenLevel
  UacEnabled = $uac.EnableLUA
  HvciEnabled = $hvci.Enabled
  SecureBoot = $secureBoot
  ScannedAt = (Get-Date).ToUniversalTime().ToString("o")
} | ConvertTo-Json -Compress -Depth 6
"""
    output = subprocess.run(
        ["powershell", "-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-Command", script],
        capture_output=True,
        check=False,
        encoding="utf-8",
        errors="replace",
        timeout=6,
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
        return value != 0
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


def _firewall_enabled(scan: dict[str, Any]) -> bool | None:
    profiles = [item for item in _as_list(scan.get("Firewall")) if isinstance(item, dict)]
    if not profiles:
        return None
    return all(_bool_value(profile.get("Enabled")) is True for profile in profiles)


def _defender_enabled(scan: dict[str, Any]) -> bool | None:
    defender = scan.get("Defender")
    if not isinstance(defender, dict):
        return None
    antivirus = _bool_value(defender.get("AntivirusEnabled"))
    realtime = _bool_value(defender.get("RealTimeProtectionEnabled"))
    if antivirus is None and realtime is None:
        return None
    return antivirus is not False and realtime is not False


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
    defender_service = _service_status(scan, "WinDefend")
    security_center_service = _service_status(scan, "wscsvc")
    firewall_service = _service_status(scan, "MpsSvc")
    smart_screen_enabled = _bool_value(scan.get("SmartScreenEnabled"))
    smart_screen_level = str(scan.get("SmartScreenLevel") or "").strip()
    uac_enabled = _bool_value(scan.get("UacEnabled"))
    hvci_enabled = _bool_value(scan.get("HvciEnabled"))
    secure_boot = _bool_value(scan.get("SecureBoot"))

    checks = [
        _check_from_bool(
            value=_defender_enabled(scan),
            check_id="defender",
            title="Windows Defender Antivirus",
            pass_label="Protected",
            fail_label="Disabled",
            unknown_label="Unknown",
            pass_detail="Antivirus and real-time protection are reported as enabled by Windows Defender.",
            fail_detail="Defender or real-time protection is disabled. Do not apply risky tweaks until protection is restored.",
            unknown_detail="Windows Defender status could not be read from Get-MpComputerStatus.",
        ),
        _check_from_bool(
            value=defender_service is not None and defender_service[0].lower() == "running",
            check_id="defender-service",
            title="Defender service",
            pass_label="Running",
            fail_label="Stopped",
            unknown_label="Unknown",
            pass_detail=f"WinDefend service is {defender_service[0]} with start type {defender_service[1]}.",
            fail_detail="WinDefend service is not running.",
            unknown_detail="WinDefend service was not visible to the scanner.",
        ),
        _check_from_bool(
            value=security_center_service is not None and security_center_service[0].lower() == "running",
            check_id="security-center",
            title="Security Center",
            pass_label="Running",
            fail_label="Stopped",
            unknown_label="Unknown",
            pass_detail=f"wscsvc is {security_center_service[0]} with start type {security_center_service[1]}.",
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
        _check_from_bool(
            value=firewall_service is not None and firewall_service[0].lower() == "running",
            check_id="firewall-service",
            title="Firewall service",
            pass_label="Running",
            fail_label="Stopped",
            unknown_label="Unknown",
            pass_detail=f"MpsSvc is {firewall_service[0]} with start type {firewall_service[1]}.",
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
            pass_detail=f"SmartScreen policy is enabled{f' ({smart_screen_level})' if smart_screen_level else ''}.",
            fail_detail="SmartScreen policy is explicitly disabled.",
            unknown_detail="No machine policy override was found; Windows may be using the user/default SmartScreen setting.",
            unknown_status="warn",
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
            pass_detail="Hypervisor-protected Code Integrity is enabled.",
            fail_detail="Memory Integrity is disabled. This may be intentional for performance, but it is a security tradeoff.",
            unknown_detail="Memory Integrity policy was not configured or could not be read.",
            unknown_status="warn",
        ),
        _check_from_bool(
            value=secure_boot,
            check_id="secure-boot",
            title="Secure Boot",
            pass_label="Enabled",
            fail_label="Disabled",
            unknown_label="Unavailable",
            pass_detail="Confirm-SecureBootUEFI returned True.",
            fail_detail="Secure Boot is disabled.",
            unknown_detail="Secure Boot could not be queried from this Windows session.",
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
    status = "high" if fail_count > 0 else "medium" if warn_count > 0 else "low"
    label = "windows-protection-risk" if fail_count > 0 else "windows-review-needed" if warn_count > 0 else "windows-protected"
    confidence = max(0.45, min(0.96, 0.92 - fail_count * 0.1 - warn_count * 0.035))
    return {
        "status": status,
        "label": label,
        "confidence": round(confidence, 2),
        "source": "windows-security-scan",
        "checked_at": scan.get("ScannedAt") or datetime.now(UTC).isoformat(),
        "checks": [check.as_dict() for check in checks],
    }
