# Architecture Overview

## Product target

- Platform: `Windows-only`.
- Audience: mass market users who want clear "few clicks -> measurable result".
- Core promise: improve game performance with safe, reversible system changes.
- Core safety rule: no irreversible or stealth behavior.

## Runtime component boundaries

1. `React + Tauri UI`:
- user actions,
- clear state presentation,
- no direct OS mutation.

2. `Rust sidecar` (runtime source of truth):
- process detection and session attach,
- telemetry collection,
- tweak apply / rollback,
- ML inference (or fallback heuristics),
- policy gates and safety checks.

3. `Python backend`:
- research/analytics adapter,
- benchmark baseline/compare calculation,
- proof artifacts and summary endpoints.

4. `Storage`:
- `JSON/JSONL` for runtime and proof flow (current bridge),
- optional `SQLite` for historical logs/state snapshots.

## Current transport and roadmap

- Current (pre-defense): backend and sidecar synchronize via local runtime files.
- Roadmap (after pre-defense): move runtime sync to Tauri channels/events and keep files as archival storage only.

## Canonical command surface (v1)

- `S_ATTACH`: attach to selected process.
- `M_INFER`: return ML scoring and explanation summary.
- `A_APPLY`: apply bounded tweak.
- `A_ROLLBACK`: rollback one or all active changes.
- `S_STATUS`: session + proof state.

## Canonical user flow

`detect -> attach -> baseline(60s) -> apply one tweak -> cooldown(5s) -> compare(60s) -> keep or rollback`

Rules:

- one active game/process per session,
- verdict is invalid across different `session_id`,
- `degraded` capture can be shown but should not be trusted as final evidence,
- `demo` is allowed for interface demonstration only, not for performance claims.

## UX operating modes

- `Normal`.
- `Max performance` (ML orchestrated one-click path with visible trace/risk).
- `Custom` (manual tweak control).

## Session lifecycle

Session ends on:

- process exit,
- explicit `Stop` action,
- app shutdown.

`Stop` behavior:

- attempt `rollback all`,
- update activity trail and session status.

Optional:

- auto-resume session on app restart (configurable in settings).

## Safety-first constraints

- no memory editing,
- no DLL/code injection,
- no irreversible system actions in default path,
- every apply path creates snapshot first,
- fallback to stable heuristics if model path fails.

## Performance targets (SLO)

- app startup: `< 3s`,
- attach latency: `< 1s`,
- compare compute latency: `< 0.5s`,
- UI rendering: stable and non-blocking during sidecar work.

Collector overhead target:

- CPU `< 1%` average,
- RAM `< 120MB` total across desktop runtime.
