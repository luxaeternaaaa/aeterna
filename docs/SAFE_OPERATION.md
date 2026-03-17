# Safe Operation Guide

## Local-first defaults

- Telemetry collection is off by default.
- Cloud features are off by default.
- Automatic security actions are off by default.
- Outbound sync is disabled unless the user explicitly opts in.

## Anti-cheat compatibility

- No DLL injection.
- No code injection.
- No game memory manipulation.
- No overlays are required for the baseline product flow.
- Driver-level vendor integrations should stay optional and clearly labeled.

## Safe optimization scope

- Process priority and affinity changes must be opt-in.
- Every optimization action should create a rollback snapshot first.
- Elevated or driver-sensitive actions should show a warning and ask for consent.

## Data handling

- Logs remain local.
- Snapshots remain local unless manually exported.
- Demo mode works with synthetic data and does not require a live game session.
