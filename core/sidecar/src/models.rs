use serde::{Deserialize, Serialize};

#[derive(Clone, Default, Deserialize, Serialize)]
pub struct StartupDiagnostics {
    pub launch_started_at: Option<String>,
    pub window_visible_at: Option<String>,
    pub sidecar_ready_at: Option<String>,
    pub backend_ready_at: Option<String>,
    pub bootstrap_loaded_at: Option<String>,
}

#[derive(Deserialize)]
pub struct IpcRequest {
    pub command: String,
    #[serde(default)]
    pub payload: serde_json::Value,
}

#[derive(Serialize)]
pub struct IpcResponse {
    pub ok: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub payload: Option<serde_json::Value>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<String>,
}

#[derive(Clone, Deserialize, Serialize)]
pub struct SnapshotMeta {
    pub id: String,
    pub kind: String,
    pub created_at: String,
    pub note: String,
}

#[derive(Clone, Deserialize, Serialize)]
pub struct ProcessSummary {
    pub pid: u32,
    pub name: String,
    pub priority_label: String,
    pub affinity_label: String,
}

#[derive(Clone, Deserialize, Serialize)]
pub struct SelectedProcessState {
    pub pid: u32,
    pub name: String,
    pub priority_label: String,
    pub affinity_mask: String,
    pub affinity_label: String,
}

#[derive(Clone, Deserialize, Serialize)]
pub struct PowerPlanSummary {
    pub guid: String,
    pub name: String,
    pub active: bool,
}

#[derive(Clone, Deserialize, Serialize)]
pub struct RegistryPresetSummary {
    pub id: String,
    pub title: String,
    pub category: String,
    pub risk: String,
    pub requires_admin: bool,
    pub requires_baseline: bool,
    pub allowed_now: bool,
    pub blocking_reason: Option<String>,
    pub next_action: Option<String>,
    pub expected_benefit: String,
    pub current_state: String,
    pub target_state: String,
    pub affected_values_count: usize,
    pub scope: String,
    #[serde(default)]
    pub advanced_details: Vec<String>,
}

#[derive(Clone, Deserialize, Serialize)]
pub struct ActivityEntry {
    pub id: String,
    pub timestamp: String,
    #[serde(default)]
    pub category: String,
    pub action: String,
    pub detail: String,
    pub risk: String,
    pub snapshot_id: Option<String>,
    #[serde(default)]
    pub session_id: Option<String>,
    #[serde(default)]
    pub action_id: Option<String>,
    pub can_undo: bool,
    #[serde(default)]
    pub proof_link: Option<String>,
    #[serde(default)]
    pub blocked_by_policy: bool,
}

#[derive(Clone, Default, Deserialize, Serialize)]
pub struct DetectedGame {
    pub exe_name: String,
    pub pid: u32,
    pub observed_for_ms: u64,
    pub capture_available: bool,
    pub recommended_profile_id: Option<String>,
    pub reason: String,
}

#[derive(Clone, Default, Deserialize, Serialize)]
pub struct CaptureStatus {
    pub source: String,
    pub available: bool,
    pub quality: String,
    pub helper_available: bool,
    pub note: Option<String>,
}

#[derive(Clone, Default, Deserialize, Serialize)]
pub struct SessionState {
    #[serde(default)]
    pub session_id: Option<String>,
    pub state: String,
    pub process_id: Option<u32>,
    pub process_name: Option<String>,
    pub started_at: Option<String>,
    #[serde(default)]
    pub attached_at: Option<String>,
    pub last_seen_at: Option<String>,
    #[serde(default)]
    pub ended_at: Option<String>,
    pub restored_at: Option<String>,
    pub active_tweaks: Vec<String>,
    pub active_snapshot_ids: Vec<String>,
    pub telemetry_source: String,
    #[serde(default)]
    pub auto_restore_pending: bool,
    #[serde(default)]
    pub pending_registry_restore: bool,
    #[serde(default)]
    pub pending_registry_snapshot_id: Option<String>,
    #[serde(default)]
    pub detected_candidate_name: Option<String>,
    #[serde(default)]
    pub detected_candidate_pid: Option<u32>,
    #[serde(default)]
    pub recommended_profile_id: Option<String>,
    #[serde(default)]
    pub capture_source: String,
    #[serde(default)]
    pub capture_quality: String,
    #[serde(default)]
    pub capture_reason: Option<String>,
}

#[derive(Clone, Deserialize, Serialize)]
pub struct OptimizationStatePayload {
    pub processes: Vec<ProcessSummary>,
    pub advanced_processes: Vec<ProcessSummary>,
    pub selected_process: Option<SelectedProcessState>,
    pub power_plans: Vec<PowerPlanSummary>,
    #[serde(default)]
    pub registry_presets: Vec<RegistryPresetSummary>,
    pub activity: Vec<ActivityEntry>,
    pub last_snapshot: Option<SnapshotMeta>,
    pub session: SessionState,
    pub detected_game: Option<DetectedGame>,
    pub capture_status: CaptureStatus,
}

#[derive(Clone, Deserialize, Serialize)]
pub struct InspectRequest {
    pub process_id: Option<u32>,
}

#[derive(Clone, Deserialize, Serialize)]
pub struct AttachSessionRequest {
    pub process_id: u32,
    pub process_name: String,
}

#[derive(Clone, Deserialize, Serialize)]
pub struct ApplyTweakRequest {
    pub kind: String,
    pub process_id: Option<u32>,
    pub priority: Option<String>,
    pub affinity_preset: Option<String>,
    pub power_plan_guid: Option<String>,
}

#[derive(Clone, Deserialize, Serialize)]
pub struct ApplyRegistryPresetRequest {
    pub preset_id: String,
    pub process_id: Option<u32>,
}

#[derive(Clone, Deserialize, Serialize)]
pub struct ApplyTweakResponse {
    pub state: OptimizationStatePayload,
    pub snapshot: SnapshotMeta,
    pub activity: ActivityEntry,
}

#[derive(Clone, Deserialize, Serialize)]
pub struct ApplyRegistryPresetResponse {
    pub status: String,
    pub state: OptimizationStatePayload,
    pub snapshot: Option<SnapshotMeta>,
    pub activity: ActivityEntry,
    #[serde(default)]
    pub blocking_reason: Option<String>,
    #[serde(default)]
    pub next_action: Option<String>,
}

#[derive(Clone, Deserialize, Serialize)]
pub struct RollbackRequest {
    pub snapshot_id: String,
    pub process_id: Option<u32>,
}

#[derive(Clone, Deserialize, Serialize)]
pub struct RollbackResponse {
    pub state: OptimizationStatePayload,
    pub activity: ActivityEntry,
}

#[derive(Clone, Deserialize, Serialize)]
pub struct MlInferenceRequest {
    pub fps_avg: f64,
    pub frametime_avg_ms: f64,
    pub frametime_p95_ms: f64,
    pub frame_drop_ratio: f64,
    pub cpu_process_pct: f64,
    pub cpu_total_pct: f64,
    pub gpu_usage_pct: f64,
    pub ram_working_set_mb: f64,
    pub background_process_count: i32,
    pub anomaly_score: f64,
}

#[derive(Clone, Deserialize, Serialize)]
pub struct MlInferencePayload {
    pub spike_probability: f64,
    pub risk_label: String,
    pub confidence: f64,
    pub recommended_tweaks: Vec<String>,
    pub summary: String,
    pub factors: Vec<String>,
    pub model_version: Option<String>,
    pub model_source: Option<String>,
    pub shap_preview: Vec<String>,
}

#[derive(Clone, Deserialize, Serialize)]
pub struct MlRuntimeTruth {
    pub runtime_mode: String,
    pub model_source: String,
    pub model_version: Option<String>,
    pub active_label: String,
    pub summary: String,
}

#[derive(Clone, Default, Deserialize, Serialize)]
pub struct MlModelMetadata {
    pub version: String,
    pub updated_at: String,
    pub model_source: String,
    pub metrics: std::collections::BTreeMap<String, f64>,
    pub weights: std::collections::BTreeMap<String, f64>,
    pub intercept: f64,
    pub shap_preview: Vec<String>,
    pub recommendation_map: std::collections::BTreeMap<String, Vec<String>>,
}

#[derive(Clone, Deserialize, Serialize)]
pub struct ProcessRestoreState {
    pub pid: u32,
    pub name: String,
    pub priority_class: u32,
    pub affinity_mask: u64,
}

#[derive(Clone, Deserialize, Serialize, PartialEq, Eq)]
pub enum RegistryHive {
    Hkcu,
    Hklm,
}

#[derive(Clone, Deserialize, Serialize, PartialEq, Eq)]
pub enum RegistryValueType {
    RegSz,
    RegDword,
}

#[derive(Clone, Deserialize, Serialize, PartialEq, Eq)]
#[serde(tag = "kind", content = "value")]
pub enum RegistryValueData {
    Sz(String),
    Dword(u32),
}

#[derive(Clone, Deserialize, Serialize)]
pub struct RegistrySnapshotEntry {
    pub hive: RegistryHive,
    pub path: String,
    pub value_name: String,
    pub value_type: RegistryValueType,
    pub old_value: Option<RegistryValueData>,
    pub existed_before: bool,
    pub target_value: RegistryValueData,
}

#[derive(Clone, Deserialize, Serialize)]
pub struct TweakSnapshot {
    pub id: String,
    pub kind: String,
    pub created_at: String,
    pub note: String,
    #[serde(default = "default_scope")]
    pub scope: String,
    #[serde(default)]
    pub session_id: Option<String>,
    pub process: Option<ProcessRestoreState>,
    pub power_plan_guid: Option<String>,
    pub power_plan_name: Option<String>,
    #[serde(default)]
    pub registry_preset_id: Option<String>,
    #[serde(default)]
    pub registry_entries: Vec<RegistrySnapshotEntry>,
    #[serde(default)]
    pub requires_admin: bool,
    #[serde(default)]
    pub applied_at: Option<String>,
    #[serde(default)]
    pub restored_at: Option<String>,
    #[serde(default = "default_extra")]
    pub extra: serde_json::Value,
}

fn default_scope() -> String {
    "session".into()
}

fn default_extra() -> serde_json::Value {
    serde_json::Value::Null
}
