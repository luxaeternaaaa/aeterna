# Safe Operation Guide

## Core safety policy

- Safety has priority over performance when they conflict.
- Any action with irreversible risk is forbidden in the default product path.
- Snapshot must exist before every state-changing action.
- `Stop` must attempt `rollback all` and report status.

## Allowed and blocked classes

Allowed (bounded):

- process priority,
- CPU affinity,
- power plan switch,
- allowlisted registry presets with explicit visibility.

Blocked:

- memory editing,
- DLL/code injection,
- stealth behavior,
- unsafe system mutation outside policy.

## Admin rights policy

- Admin can be required for selected actions only.
- UX must clearly state why admin is required and what changes will be made.
- If admin is missing for a required action:
  - block the action,
  - show actionable message.

## Explainability minimum

For ML-assisted action, UI must expose:

1. What changed.
2. Why it was selected.
3. Confidence and risk level.

If ML inference fails:

- system switches to stable heuristic fallback,
- action remains bounded by the same safety policy.

## Error message policy

Every error must answer:

1. What happened?
2. What should the user do next?

Examples:

- `Baseline missing. Capture 60s of gameplay data before applying tweaks.`
- `Model error. Stable heuristic fallback is active.`

## Runtime degradation policy

If high-fidelity capture is unavailable:

- switch to fallback counters,
- keep telemetry alive,
- show explicit limited-mode banner in UI.

## Sidecar resilience policy

- Sidecar crash -> auto-restart with backoff.
- After repeated failures -> hard stop with clear user message.
- If possible, restore active tweaks to safe defaults during failure handling.

## Logging policy (black-box trace)

Must log:

- timestamp + `session_id`,
- process lifecycle events (start/attach/detach/crash),
- apply/rollback operations,
- model input/output summary,
- OS/WinAPI return codes for failed operations.
