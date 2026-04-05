# Product Truth

This document keeps Aeterna honest. Every statement in UI, demo, and presentation must map to one of the sections below.

## Real

- Windows desktop app (`Tauri + Rust sidecar + local backend`).
- Local-first runtime with bounded session-scoped tweaks.
- Safe tweak types in runtime:
  - process priority,
  - CPU affinity,
  - power plan switching,
  - allowlisted registry presets.
- Snapshot-before-change and rollback path exist.
- Session detection and attach flow exist.
- Benchmark baseline/compare flow exists.
- Activity trail exists for session/tweak/restore/proof events.
- ML advisory contract exists with fallback behavior when model path fails.

## Partial

- PresentMon-assisted capture path exists but may be unavailable in some environments.
- Live telemetry quality can degrade to fallback counters.
- ONNX runtime path is not yet guaranteed in all packaged runs.
- One-click ML orchestration for mass-market users is not yet fully hardened.
- Explainability is present in parts of the stack, but not yet uniform across all actions.

## Target (current direction)

- Mass-market UX: "few clicks -> measurable result".
- Three user paths:
  - `Normal`,
  - `Max performance`,
  - `Custom`.
- One-click ML path that:
  - analyzes local system state,
  - applies only safe bounded actions,
  - exposes clear "what changed / why / confidence / risk".
- Explicit `Stop` action that performs rollback-all.
- Optional auto-resume session after restart (configurable).
- Optional monitoring-only mode with user-configurable overlay metrics.

## Future (post pre-defense)

- Replace backend-sidecar runtime file synchronization with direct channels/events.
- Stronger model lifecycle with stable runtime model switching.
- Expanded game profile coverage.
- Better capture fidelity and packaging maturity for helper tooling.

## Things Aeterna does not claim

- It does not route game traffic like network route optimizers.
- It does not inject DLLs, edit game memory, or perform stealth anti-cheat bypass behavior.
- It does not guarantee FPS uplift on every hardware/system combination.
- It does not allow unrestricted ML-driven system mutation.

## Product framing

Aeterna is a Windows game-session performance optimizer with rollback-first safety.
It is not a network optimizer and not an unsafe tweak pack.
