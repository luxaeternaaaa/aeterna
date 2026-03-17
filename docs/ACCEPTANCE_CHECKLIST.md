# Acceptance Checklist

## Startup and runtime

- [x] The desktop window opens without waiting for the Python backend.
- [x] The Rust sidecar is auto-started from the Tauri shell.
- [x] No console window is shown for `Aeterna.exe`, the sidecar, or the bundled backend.
- [x] Sidecar startup timing is exposed through startup diagnostics.
- [x] Bootstrap content is loaded after cached shell render, not before window creation.
- [x] Sidecar liveness is warmed periodically from the desktop shell.

## Packaging and release

- [x] `installer/build_windows.bat` writes build metadata before bundling.
- [x] `installer/build_windows.bat` refreshes ML metadata before bundling.
- [x] Release artifacts are copied to `installer/out/Aeterna.exe` and `installer/out/Aeterna-setup.exe`.
- [x] The NSIS installer creates Desktop and Start Menu shortcuts.
- [x] `.github/workflows/windows-bundle.yml` builds, installs, and smoke-checks the Windows bundle.
- [x] `installer/install_test_check.ps1` verifies installed shortcuts and target executable paths.

## Telemetry modes

- [x] Demo mode is explicit and separate from live mode.
- [x] Demo data is no longer seeded silently during backend bootstrap.
- [x] Live telemetry is written by the Rust sidecar into local runtime files.
- [x] Stable foreground detection can surface a game candidate before attach.
- [x] A user can attach a detected session and keep telemetry session-scoped.
- [x] Disabled mode renders a safe placeholder dashboard instead of fake live data.
- [x] Dashboard positioning emphasizes frametime/session stability over network metrics.

## Optimization and rollback

- [x] Process priority uses `SetPriorityClass`.
- [x] CPU affinity uses `SetProcessAffinityMask`.
- [x] Power plan switching uses `powercfg /setactive`.
- [x] Tweak application is session-first and requires an attached session.
- [x] Every tweak creates a snapshot before applying changes.
- [x] The Optimization page shows preview/risk/consent before applying a tweak.
- [x] Activity entries are visible in `Activity & Rollback`.
- [x] One-click rollback remains available after tweak application.
- [x] Power-plan restoration can happen automatically when a tracked session ends.
- [x] Automation mode and allowlist are visible in Settings.
- [x] Assisted automation remains bounded by the approved allowlist.

## ML baseline

- [x] `ml/train_latency.py` refreshes a lightweight exportable model path.
- [x] Metadata fallback is stored in `ml/models/latency_model.metadata.json`.
- [x] SHAP-style preview JSON is stored in `ml/shap/latest.json`.
- [x] The sidecar inference contract returns spike probability, risk label, confidence, recommended tweaks, and explainability preview.
- [x] Model metadata is surfaced in the UI with inference mode and preview text.
- [ ] ONNX runtime inference is active in the sidecar when an exported artifact is available.

## Verification

- [x] `python -m compileall backend ml tools synthetic_data_generator.py`
- [x] `cargo check --manifest-path core/sidecar/Cargo.toml`
- [x] `cargo check` in `app/src-tauri`
- [x] `npm run build` in `app/`
- [x] `python -m unittest backend.tests.test_telemetry_modes`
- [x] `python -m pytest backend\tests\test_local_api.py`
- [x] `installer\build_windows.bat`

## Known limits

- [ ] PresentMon helper packaging is not yet complete in this repository, so capture may stay in counters-fallback mode.
- [ ] Live telemetry still uses a frame-time proxy and FPS estimate when PresentMon is unavailable.
- [ ] GPU usage and temperature remain optional placeholders until a safe local collector is added.
- [ ] Affinity presets are safer than before, but they are still heuristic rather than topology-perfect.
- [ ] Benchmark proof mode and first five per-game profiles are not complete yet.
