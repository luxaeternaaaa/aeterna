export type PageId = 'home' | 'optimize' | 'tests' | 'safety' | 'history' | 'settings'
export type EvidenceStage = 'Live' | 'Degraded' | 'Demo' | 'Unavailable'
export type SessionStageLabel = 'No session' | 'Attached' | 'Testing' | 'Restored' | 'Blocked'
export type ProofStageLabel = 'No baseline' | 'Ready to test' | 'Comparison ready' | 'Inconclusive'
export type AuthorityStageLabel = 'Blocked' | 'Manual' | 'Assisted' | 'Trusted'

export interface TelemetryPoint {
  timestamp: string
  capture_source: 'presentmon' | 'counters-fallback' | 'demo'
  source: 'demo' | 'live'
  mode: 'demo' | 'live' | 'disabled'
  game_name: string
  process_id?: number | null
  session_state: 'idle' | 'detected' | 'attached' | 'active' | 'ended' | 'restored'
  fps_avg: number
  frametime_avg_ms: number
  frametime_p95_ms: number
  frame_drop_ratio: number
  cpu_process_pct: number
  cpu_total_pct: number
  gpu_usage_pct: number | null
  gpu_temp_c?: number | null
  ram_working_set_mb: number
  memory_pressure_pct: number
  background_process_count: number
  background_cpu_pct: number
  disk_pressure_pct: number
  ping: number
  jitter: number
  packet_loss: number
  anomaly_score: number
  threat_level: 'low' | 'medium' | 'high'
}

export interface StatCard {
  label: string
  value: string
  detail: string
}

export interface RecommendationItem {
  title: string
  summary: string
  impact: 'low' | 'medium' | 'high'
}

export interface DashboardPayload {
  stats: StatCard[]
  history: TelemetryPoint[]
  recommendations: RecommendationItem[]
  session_health: string
  mode: 'demo' | 'live' | 'disabled'
  badge: string
}

export interface GameProfile {
  id: string
  game: string
  title: string
  detection_keywords: string[]
  description: string
  safe_preset: string
  expected_benefit: string
  risk_note: string
  benchmark_expectation: string
  allowed_actions: string[]
}

export interface BenchmarkWindow {
  captured_at: string
  sample_count: number
  mode: 'demo' | 'live' | 'disabled'
  capture_source: string
  game_name: string
  process_id?: number | null
  session_id?: string | null
  fps_avg: number
  frametime_avg_ms: number
  frametime_p95_ms: number
  frame_drop_ratio: number
  cpu_total_pct: number
  background_cpu_pct: number
  anomaly_score: number
  session_health: string
}

export interface BenchmarkDelta {
  fps_avg: number
  frametime_avg_ms: number
  frametime_p95_ms: number
  frame_drop_ratio: number
  cpu_total_pct: number
  background_cpu_pct: number
  anomaly_score: number
}

export interface BenchmarkReport {
  id: string
  created_at: string
  profile_id?: string | null
  game_name: string
  session_id?: string | null
  action_id?: string | null
  snapshot_id?: string | null
  evidence_quality: 'live' | 'degraded' | 'demo' | 'disabled'
  baseline: BenchmarkWindow
  current: BenchmarkWindow
  delta: BenchmarkDelta
  verdict: 'better' | 'mixed' | 'worse' | 'inconclusive'
  summary: string
  recommended_next_step: string
}

export interface FeatureFlags {
  telemetry_collect: boolean
  network_optimizer: boolean
  anomaly_detection: boolean
  auto_security_scan: boolean
  cloud_features: boolean
  cloud_training: boolean
}

export interface SystemSettings {
  privacy_mode: string
  telemetry_retention_days: number
  sampling_interval_seconds: number
  active_profile: string
  allow_outbound_sync: boolean
  telemetry_mode: 'demo' | 'live' | 'disabled'
  automation_mode: 'manual' | 'assisted' | 'trusted_profiles'
  automation_allowlist: Array<'process_priority' | 'cpu_affinity' | 'power_plan'>
  registry_presets_enabled: boolean
  show_advanced_registry_details: boolean
}

export interface ModelRecord {
  id: string
  name: string
  family: string
  version: string
  created_at: string
  metrics: Record<string, number>
  status: string
  artifact_path?: string | null
  metadata_path?: string | null
  shap_preview_path?: string | null
  shap_preview: string[]
  notes?: string | null
  inference_mode: 'onnx' | 'metadata-fallback' | 'heuristic'
}

export interface SnapshotRecord {
  id: string
  kind: string
  created_at: string
  note: string
  surface?: 'config'
}

export interface LogRecord {
  id: number
  timestamp: string
  category: string
  severity: string
  source: string
  message: string
}

export interface SecuritySummary {
  status: string
  label: string
  confidence: number
  auto_scan_enabled: boolean
}

export interface OptimizationSummary {
  optimizer_enabled: boolean
  risk_label: string
  spike_probability: number
  confidence: number
  model_source: string
  next_action?: string
  primary_blocker?: string | null
  proof_state?: 'missing-baseline' | 'baseline-ready' | 'comparison-ready' | 'blocked'
}

export interface HealthPayload {
  status: string
  mode: string
}

export interface BootstrapSettingsPayload {
  feature_flags: FeatureFlags
  system: SystemSettings
}

export interface RuntimeStatusPayload {
  state: 'starting' | 'ready' | 'stopped'
  ready: boolean
  launched_by_app: boolean
  diagnostics?: StartupDiagnostics
}

export interface SidecarStatusPayload extends RuntimeStatusPayload {
  startup_ms?: number | null
}

export interface StartupDiagnostics {
  launch_started_at?: string | null
  window_visible_at?: string | null
  sidecar_ready_at?: string | null
  backend_ready_at?: string | null
  bootstrap_loaded_at?: string | null
}

export interface BuildMetadata {
  version: string
  build_timestamp: string
  git_commit: string
  runtime_schema_version: string
  sidecar_protocol_version: string
}

export interface SessionState {
  session_id?: string | null
  state: 'idle' | 'detected' | 'attached' | 'active' | 'ended' | 'restored'
  process_id?: number | null
  process_name?: string | null
  started_at?: string | null
  attached_at?: string | null
  last_seen_at?: string | null
  ended_at?: string | null
  restored_at?: string | null
  active_tweaks: string[]
  active_snapshot_ids: string[]
  telemetry_source: 'demo' | 'live' | 'disabled'
  auto_restore_pending: boolean
  pending_registry_restore: boolean
  pending_registry_snapshot_id?: string | null
  detected_candidate_name?: string | null
  detected_candidate_pid?: number | null
  recommended_profile_id?: string | null
  capture_source: string
  capture_quality: string
  capture_reason?: string | null
}

export interface DetectedGame {
  exe_name: string
  pid: number
  observed_for_ms: number
  capture_available: boolean
  recommended_profile_id?: string | null
  reason: string
}

export interface CaptureStatus {
  source: string
  available: boolean
  quality: string
  helper_available: boolean
  note?: string | null
}

export interface RegistryPresetSummary {
  id: string
  title: string
  category: string
  risk: string
  requires_admin: boolean
  requires_baseline: boolean
  allowed_now: boolean
  blocking_reason?: string | null
  next_action?: string | null
  expected_benefit: string
  current_state: string
  target_state: string
  affected_values_count: number
  scope: string
  advanced_details: string[]
}

export interface BootstrapPayload {
  settings: BootstrapSettingsPayload
  last_snapshot_meta: SnapshotRecord | null
  models: ModelRecord[]
  demo_mode: boolean
  session: SessionState
  detected_game: DetectedGame | null
  capture_status: CaptureStatus
  profiles: GameProfile[]
  benchmark_baseline: BenchmarkWindow | null
  latest_benchmark: BenchmarkReport | null
  build: BuildMetadata
}

export interface ProcessSummary {
  pid: number
  name: string
  priority_label: string
  affinity_label: string
}

export interface SelectedProcessState {
  pid: number
  name: string
  priority_label: string
  affinity_mask: string
  affinity_label: string
}

export interface PowerPlanSummary {
  guid: string
  name: string
  active: boolean
}

export interface ActivityEntry {
  id: string
  timestamp: string
  category: 'session' | 'tweak' | 'restore' | 'telemetry' | string
  action: string
  detail: string
  risk: string
  snapshot_id: string | null
  session_id: string | null
  action_id?: string | null
  can_undo: boolean
  proof_link?: string | null
  blocked_by_policy: boolean
}

export interface OptimizationRuntimeState {
  processes: ProcessSummary[]
  advanced_processes: ProcessSummary[]
  selected_process: SelectedProcessState | null
  power_plans: PowerPlanSummary[]
  registry_presets: RegistryPresetSummary[]
  activity: ActivityEntry[]
  last_snapshot: SnapshotRecord | null
  session: SessionState
  detected_game: DetectedGame | null
  capture_status: CaptureStatus
}

export interface ApplyTweakRequest {
  kind:
    | 'process_priority'
    | 'cpu_affinity'
    | 'power_plan'
    | 'process_qos'
    | 'process_isolation'
    | 'interrupt_affinity_lock'
    | 'disable_dynamic_ticks'
    | 'disable_hpet'
    | 'low_timer_resolution'
    | 'usb_selective_suspend_off'
    | 'pcie_lspm_off'
  process_id?: number
  priority?: 'above_normal' | 'high'
  affinity_preset?: 'all_threads' | 'balanced_threads' | 'one_thread_per_core'
  power_plan_guid?: string
}

export interface ApplyRegistryPresetRequest {
  preset_id: string
  process_id?: number
}

export interface AttachSessionRequest {
  process_id: number
  process_name: string
}

export interface ApplyTweakResponse {
  state: OptimizationRuntimeState
  snapshot: SnapshotRecord
  activity: ActivityEntry
}

export interface ApplyRegistryPresetResponse {
  status: 'applied' | 'blocked'
  state: OptimizationRuntimeState
  snapshot: SnapshotRecord | null
  activity: ActivityEntry
  blocking_reason?: string | null
  next_action?: string | null
}

export interface RollbackResponse {
  state: OptimizationRuntimeState
  activity: ActivityEntry
}

export interface MlInferencePayload {
  spike_probability: number
  risk_label: string
  confidence: number
  recommended_tweaks: string[]
  summary: string
  factors: string[]
  model_version?: string
  model_source?: string
  shap_preview?: string[]
}

export interface MlRuntimeTruth {
  runtime_mode: 'onnx' | 'fallback' | 'unavailable'
  model_source: string
  model_version?: string | null
  active_label: string
  summary: string
}

export interface TrustStatusPresentation {
  current_state: string
  target_state: string
  policy_status: string
  rollback_available: boolean
  blocking_reason?: string | null
  next_action?: string | null
  admin_required?: boolean
  scope?: string
}

export interface StartupCachePayload {
  bootstrap: BootstrapPayload | null
  dashboard: DashboardPayload | null
}
