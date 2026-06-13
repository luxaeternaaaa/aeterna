from backend.services.windows_security_service import (
    _bool_value,
    _build_windows_checks,
    _firewall_enabled,
)


def _checks_by_id(scan: dict[str, object]) -> dict[str, object]:
    return {check.id: check for check in _build_windows_checks(scan)}


def test_enabled_windows_signals_are_reported_as_pass() -> None:
    scan = {
        "Defender": {
            "AntivirusEnabled": False,
            "RealTimeProtectionEnabled": False,
        },
        "WindowsSecurityHealth": [{"Name": "Antivirus", "Result": 0, "Health": 0}],
        "AntivirusProducts": {"displayName": "Example Antivirus"},
        "Services": [
            {"Name": "WinDefend", "Status": 4, "StartType": 2},
            {"Name": "wscsvc", "Status": 4, "StartType": 2},
            {"Name": "MpsSvc", "Status": 4, "StartType": 2},
        ],
        "Firewall": [
            {"Name": "Domain", "Enabled": 1},
            {"Name": "Private", "Enabled": "True"},
            {"Name": "Public", "Enabled": True},
        ],
        "SmartScreenPolicyEnabled": None,
        "SmartScreenExplorer": None,
        "SmartScreenAppHost": None,
        "UacEnabled": 1,
        "HvciEnabled": 1,
        "DeviceGuard": {
            "SecurityServicesConfigured": [2],
            "SecurityServicesRunning": [2],
        },
        "SecureBoot": 1,
        "SecureBootSource": "registry",
    }

    checks = _checks_by_id(scan)

    assert all(check.status == "pass" for check in checks.values())
    assert "Example Antivirus" in checks["defender"].detail
    assert checks["defender-service"].detail == "WinDefend is running with start type Automatic."
    assert checks["firewall-service"].detail == "MpsSvc is running with start type Automatic."


def test_explicitly_disabled_windows_signals_are_reported_as_fail() -> None:
    scan = {
        "Defender": {
            "AntivirusEnabled": True,
            "RealTimeProtectionEnabled": True,
        },
        "WindowsSecurityHealth": [{"Name": "Antivirus", "Result": 0, "Health": 2}],
        "Services": [
            {"Name": "WinDefend", "Status": "Stopped", "StartType": "Disabled"},
            {"Name": "wscsvc", "Status": 1, "StartType": 4},
            {"Name": "MpsSvc", "Status": "Paused", "StartType": "Automatic"},
        ],
        "Firewall": [
            {"Name": "Domain", "Enabled": True},
            {"Name": "Private", "Enabled": False},
            {"Name": "Public", "Enabled": True},
        ],
        "SmartScreenPolicyEnabled": 0,
        "UacEnabled": 0,
        "DeviceGuard": {
            "SecurityServicesConfigured": [2],
            "SecurityServicesRunning": [],
        },
        "SecureBoot": 0,
    }

    checks = _checks_by_id(scan)

    assert all(check.status == "fail" for check in checks.values())
    assert "start type Disabled" in checks["security-center"].detail


def test_missing_service_and_partial_firewall_data_stay_unknown() -> None:
    checks = _checks_by_id(
        {
            "Services": [],
            "Firewall": [{"Name": "Domain", "Enabled": "NotConfigured"}],
            "SmartScreenExplorer": "Warn",
        }
    )

    assert checks["defender-service"].status == "unknown"
    assert checks["security-center"].status == "unknown"
    assert checks["firewall-service"].status == "unknown"
    assert checks["firewall"].status == "unknown"
    assert checks["smartscreen"].status == "pass"


def test_non_boolean_numeric_values_are_not_treated_as_enabled() -> None:
    assert _bool_value(2) is None
    assert _firewall_enabled({"Firewall": [{"Name": "Domain", "Enabled": 2}]}) is None
