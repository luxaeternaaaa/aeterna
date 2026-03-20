from typing import Literal

from pydantic import BaseModel, Field


class TelemetryPoint(BaseModel):
    timestamp: str
    capture_source: Literal["presentmon", "counters-fallback", "demo"]
    source: Literal["demo", "live"]
    mode: Literal["demo", "live", "disabled"]
    game_name: str
    process_id: int | None = None
    session_state: Literal["idle", "detected", "attached", "active", "ended", "restored"]
    fps_avg: float
    frametime_avg_ms: float
    frametime_p95_ms: float
    frame_drop_ratio: float
    cpu_process_pct: float
    cpu_total_pct: float
    gpu_usage_pct: float | None = None
    gpu_temp_c: float | None = None
    ram_working_set_mb: float
    memory_pressure_pct: float
    background_process_count: int
    background_cpu_pct: float
    disk_pressure_pct: float
    ping: float = 0
    jitter: float = 0
    packet_loss: float = 0
    anomaly_score: float = 0
    threat_level: Literal["low", "medium", "high"]


class StatCard(BaseModel):
    label: str
    value: str
    detail: str


class RecommendationItem(BaseModel):
    title: str
    summary: str
    impact: Literal["low", "medium", "high"]


class DashboardPayload(BaseModel):
    stats: list[StatCard]
    history: list[TelemetryPoint]
    recommendations: list[RecommendationItem]
    session_health: str
    mode: Literal["demo", "live", "disabled"]
    badge: str


class GameProfile(BaseModel):
    id: str
    game: str
    title: str
    detection_keywords: list[str] = Field(default_factory=list)
    description: str
    safe_preset: str
    expected_benefit: str
    risk_note: str
    benchmark_expectation: str
    allowed_actions: list[str] = Field(default_factory=list)


class BenchmarkWindow(BaseModel):
    captured_at: str
    sample_count: int
    mode: Literal["demo", "live", "disabled"]
    capture_source: str
    game_name: str
    process_id: int | None = None
    session_id: str | None = None
    fps_avg: float
    frametime_avg_ms: float
    frametime_p95_ms: float
    frame_drop_ratio: float
    cpu_total_pct: float
    background_cpu_pct: float
    anomaly_score: float
    session_health: str


class BenchmarkDelta(BaseModel):
    fps_avg: float
    frametime_avg_ms: float
    frametime_p95_ms: float
    frame_drop_ratio: float
    cpu_total_pct: float
    background_cpu_pct: float
    anomaly_score: float


class BenchmarkReport(BaseModel):
    id: str
    created_at: str
    profile_id: str | None = None
    game_name: str
    session_id: str | None = None
    action_id: str | None = None
    snapshot_id: str | None = None
    evidence_quality: Literal["live", "degraded", "demo", "disabled"] = "demo"
    baseline: BenchmarkWindow
    current: BenchmarkWindow
    delta: BenchmarkDelta
    verdict: Literal["better", "mixed", "worse", "inconclusive"]
    summary: str
    recommended_next_step: str


class FeatureFlags(BaseModel):
    telemetry_collect: bool = False
    network_optimizer: bool = False
    anomaly_detection: bool = False
    auto_security_scan: bool = False
    cloud_features: bool = False
    cloud_training: bool = False


class SystemSettings(BaseModel):
    privacy_mode: str = "local-only"
    telemetry_retention_days: int = 14
    sampling_interval_seconds: int = 5
    active_profile: str = "balanced"
    allow_outbound_sync: bool = False
    telemetry_mode: Literal["demo", "live", "disabled"] = "demo"
    automation_mode: Literal["manual", "assisted", "trusted_profiles"] = "manual"
    automation_allowlist: list[Literal["process_priority", "cpu_affinity", "power_plan"]] = Field(default_factory=list)
    registry_presets_enabled: bool = False
    show_advanced_registry_details: bool = False


class ModelRecord(BaseModel):
    id: str
    name: str
    family: str
    version: str
    created_at: str
    metrics: dict[str, float] = Field(default_factory=dict)
    status: str
    artifact_path: str | None = None
    metadata_path: str | None = None
    shap_preview_path: str | None = None
    shap_preview: list[str] = Field(default_factory=list)
    notes: str | None = None
    inference_mode: Literal["onnx", "metadata-fallback", "heuristic"] = "heuristic"


class SnapshotRecord(BaseModel):
    id: str
    kind: str
    created_at: str
    note: str
    surface: Literal["config"] = "config"


class ActivityEntry(BaseModel):
    id: str
    timestamp: str
    category: str
    action: str
    detail: str
    risk: str
    snapshot_id: str | None = None
    session_id: str | None = None
    action_id: str | None = None
    can_undo: bool
    proof_link: str | None = None
    blocked_by_policy: bool = False


class LogRecord(BaseModel):
    id: int
    timestamp: str
    category: str
    severity: str
    source: str
    message: str


class ActionResult(BaseModel):
    ok: bool
    message: str


class HealthPayload(BaseModel):
    status: str
    mode: str


class SecuritySummary(BaseModel):
    status: str
    label: str
    confidence: float
    auto_scan_enabled: bool


class OptimizationSummary(BaseModel):
    optimizer_enabled: bool
    risk_label: str
    spike_probability: float
    confidence: float
    model_source: str = "heuristic"
    next_action: str | None = None
    primary_blocker: str | None = None
    proof_state: Literal["missing-baseline", "baseline-ready", "comparison-ready", "blocked"] | None = None


class BuildMetadata(BaseModel):
    version: str
    build_timestamp: str
    git_commit: str
    runtime_schema_version: str
    sidecar_protocol_version: str


class DetectedGame(BaseModel):
    exe_name: str
    pid: int
    observed_for_ms: int
    capture_available: bool
    recommended_profile_id: str | None = None
    reason: str


class CaptureStatus(BaseModel):
    source: str
    available: bool
    quality: str
    helper_available: bool
    note: str | None = None


class SessionState(BaseModel):
    session_id: str | None = None
    state: Literal["idle", "detected", "attached", "active", "ended", "restored"] = "idle"
    process_id: int | None = None
    process_name: str | None = None
    started_at: str | None = None
    attached_at: str | None = None
    last_seen_at: str | None = None
    ended_at: str | None = None
    restored_at: str | None = None
    active_tweaks: list[str] = Field(default_factory=list)
    active_snapshot_ids: list[str] = Field(default_factory=list)
    telemetry_source: Literal["demo", "live", "disabled"] = "demo"
    auto_restore_pending: bool = False
    pending_registry_restore: bool = False
    pending_registry_snapshot_id: str | None = None
    detected_candidate_name: str | None = None
    detected_candidate_pid: int | None = None
    recommended_profile_id: str | None = None
    capture_source: str = "counters-fallback"
    capture_quality: str = "idle"
    capture_reason: str | None = None


class BootstrapSettingsPayload(BaseModel):
    feature_flags: FeatureFlags
    system: SystemSettings


class BootstrapPayload(BaseModel):
    settings: BootstrapSettingsPayload
    last_snapshot_meta: SnapshotRecord | None = None
    models: list[ModelRecord]
    demo_mode: bool = True
    session: SessionState = Field(default_factory=SessionState)
    detected_game: DetectedGame | None = None
    capture_status: CaptureStatus = Field(
        default_factory=lambda: CaptureStatus(
            source="counters-fallback", available=True, quality="idle", helper_available=False, note=None
        )
    )
    profiles: list[GameProfile] = Field(default_factory=list)
    benchmark_baseline: BenchmarkWindow | None = None
    latest_benchmark: BenchmarkReport | None = None
    build: BuildMetadata
