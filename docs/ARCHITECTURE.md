# Architecture Overview

## Core flow

1. The frontend requests local state from the FastAPI backend.
2. The backend bootstraps SQLite, feature flags, logs, snapshots, and demo telemetry on startup.
3. The ML pipeline evaluates local telemetry using lightweight wrappers around LightGBM, PyTorch, and scikit-learn.
4. Recommendations, security summaries, and optimization summaries are exposed through REST endpoints.
5. Live telemetry updates are streamed through a WebSocket endpoint.

## Privacy and rollback

- Feature flags default to `false`.
- System mode defaults to `local-only`.
- Updates to settings and model registry create snapshots before mutation.
- Snapshots can be inspected through a diff endpoint and restored from the UI.

## Demo strategy

- Synthetic telemetry is generated locally for dashboard charts and ML demos.
- Heavy ML libraries are optional at runtime; fallbacks keep the prototype usable in constrained environments.
- The product remains presentation-ready even without cloud or background collection enabled.

