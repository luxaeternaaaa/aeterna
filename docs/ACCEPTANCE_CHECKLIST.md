# Acceptance Checklist

This checklist is the pre-defense gate. The target is a stable Golden Flow, not feature breadth.

## Golden Flow (must pass live)

- [ ] App starts and UI is ready in under 3 seconds.
- [ ] Game process is detected (or manually selected) and attached.
- [ ] Live telemetry is visible after attach.
- [ ] `Capture baseline` runs for 60s and stores artifact.
- [ ] One bounded tweak can be applied.
- [ ] Cooldown step (5s) is enforced before compare.
- [ ] `Run compare` runs for 60s and returns verdict metadata.
- [ ] User can choose keep or rollback.
- [ ] `Stop` performs rollback-all attempt and updates status/logs.

## Strict button gating

- [ ] `Capture baseline` disabled when no attached process.
- [ ] `Apply tweak` disabled until baseline exists.
- [ ] `Run compare` disabled until at least one tweak has been applied.
- [ ] `Rollback` disabled when active tweak count is zero.

## Verdict integrity

- [ ] Baseline and compare must share same `session_id`.
- [ ] If `session_id` differs, verdict is invalid and re-measure is requested.
- [ ] Improvements are accepted only above noise threshold (`>5%` target rule).
- [ ] `degraded` capture is labeled and not treated as final trusted evidence.
- [ ] `demo` data is never used for real performance claims.

## Safety and rollback

- [ ] Snapshot created before each state-changing action.
- [ ] Rollback path exists for every applied tweak in active session.
- [ ] Unsafe action classes are blocked by policy.
- [ ] Any admin-required action explains why admin is needed.

## ML runtime contract

- [ ] Model path reports version and source.
- [ ] Inference result includes confidence and risk level.
- [ ] Explainability surface includes "what changed" and "why selected".
- [ ] If model fails, stable heuristic fallback activates and is visible in UI.

## Reliability targets

- [ ] Attach latency under 1 second (target).
- [ ] Compare computation latency under 0.5 second (target).
- [ ] Collector overhead near target (`CPU <1%`, `RAM <120MB` total runtime).
- [ ] Sidecar crash handling uses restart with backoff.

## Required artifacts per test run

- [ ] Baseline telemetry snapshot (JSON/CSV).
- [ ] Compare telemetry snapshot (JSON/CSV).
- [ ] Verdict metadata with timestamp, tweak id, deltas, verdict label.
- [ ] System state snapshot (game/process, OS info, power plan).
- [ ] Optional screenshot of compare screen.

## Packaging scope

- [ ] Windows-only path is clean and stable.
- [ ] Home, Optimization, Security, Settings are the only required pages.
- [ ] Logs are reachable from Optimization flow.
