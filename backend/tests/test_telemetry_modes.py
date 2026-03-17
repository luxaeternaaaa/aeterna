import importlib
import json
import os
import shutil
import sys
import unittest
from pathlib import Path
from uuid import uuid4


def reload_module(runtime_root: str):
    for name in [module for module in sys.modules if module == "backend" or module.startswith("backend.")]:
        sys.modules.pop(name, None)
    os.environ["AETERNA_RUNTIME_ROOT"] = runtime_root
    from backend.core.bootstrap import bootstrap

    bootstrap()
    return importlib.import_module("backend.services.telemetry_service")


class TelemetryModeTests(unittest.TestCase):
    def test_demo_mode_returns_demo_history(self):
        temp_dir = Path.cwd() / "data" / "test-runs" / f"telemetry-{uuid4().hex[:8]}"
        temp_dir.mkdir(parents=True, exist_ok=True)
        try:
            telemetry = reload_module(str(temp_dir))
            rows = telemetry.list_recent(limit=4)
            self.assertTrue(rows)
            self.assertEqual(rows[-1].mode, "demo")
            self.assertEqual(rows[-1].source, "demo")
        finally:
            shutil.rmtree(temp_dir, ignore_errors=True)

    def test_disabled_mode_returns_placeholder_row(self):
        temp_dir = Path.cwd() / "data" / "test-runs" / f"telemetry-{uuid4().hex[:8]}"
        temp_dir.mkdir(parents=True, exist_ok=True)
        try:
            telemetry = reload_module(str(temp_dir))
            settings_path = Path(temp_dir) / "config" / "system_settings.json"
            settings_path.write_text(
                json.dumps(
                    {
                        "privacy_mode": "local-only",
                        "telemetry_retention_days": 14,
                        "sampling_interval_seconds": 5,
                        "active_profile": "balanced",
                        "allow_outbound_sync": False,
                        "telemetry_mode": "disabled",
                    }
                ),
                encoding="utf-8",
            )
            reloaded = reload_module(str(temp_dir))
            row = reloaded.list_recent(limit=1)[0]
            self.assertEqual(row.mode, "disabled")
            self.assertEqual(row.game_name, "Telemetry disabled")
        finally:
            shutil.rmtree(temp_dir, ignore_errors=True)


if __name__ == "__main__":
    unittest.main()
