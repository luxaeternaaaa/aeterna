# Pre-Defense Target Spec (User-Aligned)

This file captures the current target decisions from product/architecture discovery.

## Audience and platform

- Primary audience: mass-market Windows gamers.
- Main pain: low FPS, stutter, low responsiveness, and long manual tuning time.
- Success in first 10 minutes: few clicks and measurable improvement (`5-10%+` FPS target).
- Priority: performance first, but safety wins in conflict.

## UX principles

- No ambiguity about button outcomes.
- Complex logic is acceptable; visual overload is not.
- Plain language by default; advanced terms hidden behind info tooltips.
- Optional contextual helper (`i` / `!`) near each function/tweak.

## Runtime modes

- `Normal`.
- `Max performance` (ML-assisted one-click orchestration).
- `Custom` (manual tweak control).
- Optional monitoring-only mode (no apply rights) with configurable overlay metrics.

## Session and flow

Canonical flow:

`detect -> attach -> baseline(60s) -> apply one tweak -> cooldown(5s) -> compare(60s) -> keep/rollback`

Session scope:

- one active target process/game.
- session ends on process exit, `Stop`, or app exit.
- `Stop` triggers rollback-all attempt.
- auto-resume session after restart is configurable.

## Safety constraints

Always blocked:

- irreversible high-risk classes,
- stealth and memory-edit classes.

Risk classes:

- unstable tweaks must be explicit and policy-gated.
- warning + rationale must be visible before apply.

Rollback:

- mandatory snapshot before apply,
- rollback-all must exist.

## Data and verdict policy

Primary metrics:

- FPS,
- frametime,
- latency.

Secondary metrics:

- avg FPS,
- avg latency,
- CPU/GPU utilization and pressure indicators.

Verdict policy:

- `mixed` is valid and expected.
- accept improvement only when delta is above noise (`>5%` target threshold).
- if `session_id` mismatch between baseline and compare -> discard and re-measure.
- degraded capture is not trusted for final claim.
- demo data can be used only to explain interface/model logic, not performance proof.

## ML behavior

- ML should drive one-click path with safe bounded actions.
- Manual path remains available.
- Required explainability layers:
  - what changed,
  - why selected,
  - confidence + risk.
- Model version must be included in proof metadata.
- Fallback priority: stable heuristics over fragile model execution.
- No online model updates before pre-defense.

## API contract minimum (v1)

- `S_ATTACH`
- `M_INFER`
- `A_APPLY`
- `A_ROLLBACK`
- `S_STATUS`

Schema fields that should remain stable:

- `session_id`
- `timestamp`
- `feature_vector`
- `verdict`

## UI page scope (pre-defense)

Required pages:

- Home
- Optimization
- Security
- Settings

Logs:

- reachable from Optimization page via dedicated button.

## SLO and overhead targets

- app startup `<3s`,
- attach latency `<1s`,
- compare compute `<0.5s`,
- UI responsive while sidecar is busy,
- collector overhead target: `CPU <1%`, `RAM <120MB` total runtime.

## Sidecar and failure behavior

- graceful degradation if high-fidelity capture is unavailable.
- sidecar crash handling: restart with exponential backoff.
- after repeated failures: clear error and safe stop.

## Suggested defaults for open points

### Q21: what to automate safely

Safe candidates:

- process priority increase to bounded level,
- balanced CPU affinity preset,
- switch to existing high-performance power plan.

Avoid for auto mode:

- aggressive registry edits,
- actions requiring reboot unless user explicitly confirms.

### Q22: actions that should require admin (typical)

Usually admin-required:

- system-wide registry writes,
- machine-level power policy changes,
- protected process operations.

Usually non-admin:

- UI-only settings,
- local evidence export.

### Q26: partial rollback failure examples

If rollback fails:

1. mark session as `rollback-partial`,
2. show exact failed step and error code,
3. provide guided retry per failed item,
4. block new apply actions until state is resolved.

### Q71: top pre-defense technical risks

1. Sidecar/backend state drift due to file-based runtime bridge.
2. Capture fidelity variance when helper path is unavailable.
3. Inconsistent UX gating that allows invalid benchmark order.

## Delivery strategy

- prioritize Golden Flow stability over feature breadth.
- keep architecture simple for pre-defense.
- move larger transport refactor (channels/events) to roadmap.
