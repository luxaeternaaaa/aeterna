# Master Prompt: Aeterna Thesis App
You are a Senior Fullstack + Machine Learning Engineer. Build a production-style local desktop prototype for the thesis:
**Development of a Machine Learning Based Tool for Optimization and Security in Online Games**
The app name is **Aeterna**. It must look like a real startup product, not a student demo.

## Mandatory workflow
1. Use **Sequential Thinking MCP** before implementation to break work into architecture, frontend, backend, ML, data, rollback, and privacy modules.
2. Use **Context7 MCP** to verify current official patterns for React + TypeScript, Tauri, FastAPI, WebSocket usage, and ML libraries where needed.
3. Inspect the existing repository before creating files.
4. Keep all app copy, labels, docs, and UI text in **English only**.
5. Write clean, human-readable code. Prefer small files and keep each source file under **200 lines whenever reasonably possible**.

## Product objective
Build a local-first desktop tool that:
- analyzes gaming network quality
- predicts latency spikes
- detects anomalies and suspicious session behavior
- recommends optimization steps
- protects privacy by default
- supports rollback of important changes

## Hard constraints
- The app must work locally.
- No data may be sent anywhere unless the user explicitly enables it.
- All optional functions must be **disabled by default**.
- Privacy must be real behavior, not decorative UI.
- Every meaningful settings or model change must support rollback.
- Avoid giant files, fake logic, broken imports, and toy examples.

## Required default feature flags
Create a local config with defaults like:
```json
{
  "telemetry_collect": false,
  "network_optimizer": false,
  "anomaly_detection": false,
  "auto_security_scan": false,
  "cloud_features": false,
  "cloud_training": false
}
```

Every feature controlled by these flags must remain inactive until enabled by the user.

## Required stack
- Frontend: **React + TypeScript + Tailwind CSS**
- Desktop shell: **Tauri**
- Backend: **Python + FastAPI**
- ML: **scikit-learn, PyTorch, LightGBM**
- Database: **SQLite**
- Realtime: **WebSocket**

Use modern patterns:
- Tauri dev/build integration for the frontend
- FastAPI `lifespan` for loading shared resources and models
- modular FastAPI routers
- typed frontend API clients

## Required repository structure
Generate a maintainable structure based on:
```text
project-root/
  app/
  backend/
  ml/
  data/
  config/
  docs/
```

Expand this into a realistic repository with only useful files.

## Core capabilities
The system must support:
- latency, jitter, and packet loss analysis
- CPU, GPU, and RAM monitoring
- anomaly detection
- suspicious event classification
- optimization recommendations
- local security session checks
- model management
- local logs and audit trail
- snapshot history and restore

## Telemetry schema
Support records like:
```json
{
  "timestamp": "2026-03-16T12:00:00Z",
  "game": "game_name",
  "ping": 45,
  "jitter": 3,
  "packet_loss": 0.1,
  "cpu_usage": 32,
  "gpu_usage": 40,
  "ram_usage": 6000
}
```

Add practical derived fields if useful, such as `session_id`, `anomaly_score`, `threat_level`, and `recommendation_state`.

## ML requirements
Implement three realistic local ML components:

### 1. Latency spike prediction
- Model: **LightGBM**
- Purpose: predict upcoming latency spikes from recent telemetry
- Output: spike probability, confidence, risk label

### 2. Network anomaly detection
- Model: **PyTorch autoencoder**
- Purpose: detect unusual telemetry patterns
- Output: anomaly score, threshold status

### 3. Suspicious event classification
- Model: practical classifier from **scikit-learn**
- Purpose: classify suspicious network or session events
- Output: label and confidence

Keep the ML layer lightweight but believable for a thesis demo.

## Synthetic data generator
Create `synthetic_data_generator.py`. It must generate:
- normal gaming sessions
- latency spikes
- packet loss incidents
- jitter instability
- high CPU / GPU stress periods
- suspicious or anomalous sessions

The generated data must be usable for UI demos, model training, validation, logs, and rollback demonstrations.

## Rollback requirements
Implement local snapshots for:
- configuration
- application settings
- ML models
- optimization presets

The rollback system must allow the user to:
- view snapshot history
- inspect diffs
- restore a chosen version
- confirm restore status in the UI

## Frontend design direction
The interface must be minimal, premium, monochrome, and inspired by **Figma**, **Notion**, and **Linear**.
Typography:
- Inter
- SF Pro
- Geist
- fallback `system-ui`

Color system:
- background: `#FFFFFF`
- text: `#000000`
- secondary text: `#6B6B6B`
- border: `#EAEAEA`
- hover: `#F5F5F5`
- active: `#EFEFEF`

Do not use bright accents or playful dashboard styling.

## Navigation and pages
Create a left sidebar with:
- Dashboard
- Optimization
- Security
- Models
- Logs
- Settings

Each item must have icon, text label, hover feedback, and a light gray active state.

### Dashboard
Show:
- current ping
- packet loss
- jitter
- CPU usage
- GPU usage
- RAM usage
- session health summary
- recommendations preview

Charts must be clean, thin-line, and monochrome.

### Models
Show:
- model name
- version
- creation date
- metrics
- status

Actions:
- Activate
- Rollback
- Inspect

### Privacy and telemetry
Create a dedicated privacy section where every toggle is **OFF by default**:
- telemetry collection
- anomaly detection
- optimization engine
- security scanning
- cloud features

## Logging
Store logs locally. Provide a Logs page with:
- timestamp
- category
- severity
- message
- source

Include events for app actions, model actions, rollback events, optimization changes, and security detections.

## Backend requirements
Build a local FastAPI backend with:
- REST endpoints for metrics, settings, models, logs, snapshots, and recommendations
- WebSocket endpoint for real-time telemetry streaming
- SQLite persistence
- service layer for model registry and rollback
- clear Pydantic request and response schemas

Use modular routers and load long-lived resources through `lifespan`.

## Security and privacy behavior
The app must:
- default to local-only mode
- avoid outbound communication unless explicitly enabled
- clearly show feature states in the UI
- document local data storage
- log sensitive actions locally

## Deliverables
Generate:
1. full repository structure
2. frontend implementation
3. backend implementation
4. ML modules
5. synthetic data generator
6. feature flag config
7. rollback subsystem
8. SQLite schema or initialization layer
9. documentation
10. run instructions

## Output contract
Return results in this order:
1. short architecture summary
2. repository tree
3. key technical decisions
4. full implementation by file
5. setup and run instructions
6. privacy-default and rollback notes

## Quality bar
The final result must be modular, readable, typed where appropriate, professionally structured, and easy to explain during thesis defense.

Prefer:
- local-first
- privacy-first
- rollback-safe
- readable over clever
- realistic over overengineered

Do not stop at planning. Create the actual project.
