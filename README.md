# Aeterna

Aeterna is a Windows-first desktop prototype for the thesis project **Machine-learning tool for optimization and security in online games**. The current baseline is focused on fast desktop startup, local-only telemetry modes, session-first safe automation, reversible system tweaks, and a lightweight ML decision layer that stays honest about fallback behavior.

## Product baseline

- Tauri opens the desktop window immediately and warms a Rust sidecar in the background.
- The Rust sidecar is the startup-critical runtime and handles tweak inspection, tweak apply, rollback, session tracking, and local ML inference.
- The bundled Python backend is lazy and read-focused: bootstrap, dashboard, models, settings, snapshots, logs.
- All sensitive actions remain `OFF` by default.
- Every tweak requires explicit preview and creates a rollback snapshot first.
- Automation stays policy-governed through `Manual`, `Assisted`, and `Trusted profiles` modes.
- No DLL injection, no game-memory edits, no anti-cheat-hostile hooks.

## Repository layout

- `app/` React, TypeScript, Tailwind, and the Tauri desktop shell
- `backend/` local FastAPI modules, settings, snapshots, and read-focused API routes
- `core/` bundled Python runtime entrypoint and the Rust sidecar
- `ml/` synthetic data, training/export helpers, metadata fallback model, and SHAP preview JSON
- `tools/` synthetic-data entrypoints for demo workflows
- `installer/` Windows build scripts, install checks, and helper tooling
- `docs/` safety notes, architecture notes, and acceptance checklist

## Runtime flow

1. The user launches `Aeterna.exe` or the installed shortcut.
2. Tauri opens the window immediately and starts the Rust sidecar with no console window.
3. The UI renders from cached shell state or startup skeletons.
4. The Python backend is started lazily on the first HTTP-backed request.
5. `/api/bootstrap` returns minimal shell state: settings, latest snapshot, models, session metadata, build metadata, and demo/live mode.
6. The dashboard reads either explicit demo telemetry or sidecar-written live telemetry.
7. If the user attaches a detected game session, Aeterna can apply approved session-scoped tweaks and restore them automatically when the tracked process exits.

## Telemetry modes

- `demo`: explicit synthetic session data for thesis demos and screenshots
- `live`: local foreground-session telemetry written by the Rust sidecar
- `disabled`: no live collection; the dashboard renders a safe placeholder state

Live telemetry currently focuses on local gaming-session pressure:

- foreground process detection
- manual session attach for stable candidates
- session lifecycle state
- CPU usage
- RAM working set
- background process count
- frame-time proxy and FPS estimate
- local anomaly score

PresentMon-assisted capture is wired into the sidecar. If the helper is not bundled or unavailable, the app stays functional and labels capture as counters fallback instead of pretending it has full capture quality.

Network metrics remain secondary and default to zero in live mode until an explicit local source is added.

## Optimization engine

Current reversible tweaks:

- process priority via `SetPriorityClass`
- CPU affinity via `SetProcessAffinityMask`
- Windows power plan switching via `powercfg /setactive`

Behavior:

- every tweak creates a snapshot under `data/snapshots`
- UI shows a preview modal with risk and consent
- Activity entries are written locally
- rollback restores the captured pre-change state
- power-plan tweaks can auto-restore when a tracked session ends

Automation modes:

- `Manual`: Aeterna only recommends and previews tweaks
- `Assisted`: Aeterna may auto-apply pre-approved safe session tweaks after attach
- `Trusted profiles`: the same bounded behavior, but only when a known profile recommendation exists

## ML path

Aeterna now treats ML as a **decision-support layer**, not magic.

- `ml/train_latency.py` refreshes a lightweight exported metadata model
- if ONNX tooling is available, the script can export `ml/models/latency_model.onnx`
- if ONNX is not available, the app falls back to `ml/models/latency_model.metadata.json`
- the Rust sidecar reads metadata and returns:
  - `spike_probability`
  - `risk_label`
  - `confidence`
  - `recommended_tweaks`
  - short factor summary
  - SHAP-style preview strings

## Windows release build

Build the full Windows release:

```powershell
cd C:\Users\foxal.DESKTOP-N1GCIEU\Desktop\aeterna
.\installer\build_windows.bat
```

Release artifacts:

- `installer/out/Aeterna.exe`
- `installer/out/Aeterna-setup.exe`

The build flow is deterministic:

1. write build metadata
2. refresh local ML metadata
3. build frontend
4. bundle Python backend with `--noconsole`
5. build Rust sidecar
6. run `tauri build`
7. copy stable release artifact names into `installer/out`

## Installation checks

After installing, verify the shortcut and Start Menu integration:

```powershell
cd C:\Users\foxal.DESKTOP-N1GCIEU\Desktop\aeterna
.\installer\install_test_check.ps1
```

The GitHub Actions Windows workflow also performs:

- artifact verification
- silent installer run
- shortcut check
- installed app smoke start
- sidecar presence check
- backend health check

## Development

Development-only launcher:

```powershell
cd C:\Users\foxal.DESKTOP-N1GCIEU\Desktop\aeterna
.\run_desktop_app.cmd
```

This uses `tauri dev` and is not the final user flow.

## Local data generation

Generate demo telemetry:

```powershell
cd C:\Users\foxal.DESKTOP-N1GCIEU\Desktop\aeterna
python tools\synthetic_data_generator.py
```

Refresh ML metadata:

```powershell
cd C:\Users\foxal.DESKTOP-N1GCIEU\Desktop\aeterna
python -m ml.train_latency
```

## Verification run in this workspace

These checks passed during the current refactor:

- `python -m compileall backend ml tools synthetic_data_generator.py`
- `cargo check --manifest-path core/sidecar/Cargo.toml`
- `cargo check` in `app/src-tauri`
- `npm run build` in `app/`
- `python -m unittest backend.tests.test_telemetry_modes`
- `python -m pytest backend\tests\test_local_api.py`
- `installer\build_windows.bat`

## Safety notes

- Sensitive features remain opt-in.
- Live telemetry is local-only.
- Tweak actions are reversible.
- The current live collector is intentionally conservative and does **not** claim true in-game FPS capture yet; it uses foreground-session pressure and frame-time proxies without overlays or injection.

See:

- [SAFE_OPERATION.md](/C:/Users/foxal.DESKTOP-N1GCIEU/Desktop/aeterna/docs/SAFE_OPERATION.md)
- [ACCEPTANCE_CHECKLIST.md](/C:/Users/foxal.DESKTOP-N1GCIEU/Desktop/aeterna/docs/ACCEPTANCE_CHECKLIST.md)
- [ARCHITECTURE.md](/C:/Users/foxal.DESKTOP-N1GCIEU/Desktop/aeterna/docs/ARCHITECTURE.md)
- [PRODUCT_TRUTH.md](/C:/Users/foxal.DESKTOP-N1GCIEU/Desktop/aeterna/docs/PRODUCT_TRUTH.md)
- [SOURCE_CONTROL.md](/C:/Users/foxal.DESKTOP-N1GCIEU/Desktop/aeterna/docs/SOURCE_CONTROL.md)
