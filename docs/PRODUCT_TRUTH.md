# Product Truth

This document keeps Aeterna honest. Every major feature must fit into one of these buckets before it is mentioned in README, demos, or presentations.

## Real

- Windows desktop delivery through Tauri with installer, Desktop shortcut, Start Menu entry, and local-first runtime.
- Rust sidecar as the startup-critical runtime for session tracking, tweak apply, rollback, and lightweight local inference.
- Session-scoped safe tweaks:
  - process priority
  - CPU affinity
  - power plan switching
- Rollback snapshots are created before every tweak and can be restored locally.
- Live session detection exists and can attach to a detected foreground game candidate.
- Activity history records session, tweak, and restore events.
- Automation is policy-governed:
  - `Manual`
  - `Assisted`
  - `Trusted profiles`
- Automation remains bounded by an allowlist and rollback-safe session scope.

## Partial

- PresentMon-assisted capture path exists in the sidecar, but the helper is not yet bundled in this repository. The app falls back honestly to counters when PresentMon is unavailable.
- Live telemetry is useful and local, but it is still conservative:
  - no true in-game overlay capture
  - GPU metrics remain best-effort / optional
  - thermal telemetry is not product-grade yet
- ML has a real training/export path and a stable inference contract, but ONNX runtime execution in the shipped app is still incomplete. The current shipped baseline is metadata fallback unless ONNX is explicitly available.
- Game recommendations exist through detected profile IDs, but per-game profile behavior is still early.

## Future

- Bundled PresentMon helper with license notice and hidden runtime packaging.
- True ONNX runtime inference in the sidecar with latency SLO under 100 ms.
- Benchmark / proof mode with before-and-after comparison.
- Strong per-game profiles for:
  - CS2
  - Valorant
  - Fortnite
  - Apex
  - Warzone
- NVIDIA-style compact telemetry HUD / overlay, only after the core product is stable and anti-cheat-safe.

## Things Aeterna does not claim

- It does not route network traffic like ExitLag.
- It does not inject DLLs, hook game memory, or edit game code.
- It does not promise guaranteed FPS gains on every system.
- It does not allow ML to make unrestricted system changes.

## Product framing

Aeterna is a **performance and session optimizer for online games**, not a network route optimizer and not a generic “Windows tweak pack”.
