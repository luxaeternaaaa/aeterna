import { toConnection } from './startup'
import type {
  BootstrapPayload,
  BuildMetadata,
  DashboardPayload,
  FeatureFlags,
  OptimizationRuntimeState,
  SecuritySummary,
  SystemSettings,
} from '../types'

export type ConnectionState = { title: string; detail: string }
export type LoadedState = { dashboard: boolean; logs: boolean; optimizationRuntime: boolean; security: boolean; snapshots: boolean }

export const initialFlags: FeatureFlags = {
  telemetry_collect: false,
  network_optimizer: false,
  anomaly_detection: false,
  auto_security_scan: false,
  cloud_features: false,
  cloud_training: false,
}

export const initialSystem: SystemSettings = {
  privacy_mode: 'local-only',
  telemetry_retention_days: 14,
  sampling_interval_seconds: 5,
  active_profile: 'balanced',
  allow_outbound_sync: false,
  telemetry_mode: 'demo',
  automation_mode: 'manual',
  automation_allowlist: ['process_priority', 'cpu_affinity', 'power_plan'],
  registry_presets_enabled: false,
  show_advanced_registry_details: false,
}

export const initialDashboard: DashboardPayload = {
  stats: [],
  history: [],
  recommendations: [],
  session_health: 'Loading',
  mode: 'demo',
  badge: 'Loading',
}

export const initialSecurity: SecuritySummary = {
  status: 'low',
  label: 'normal-session',
  confidence: 0.89,
  auto_scan_enabled: false,
}

export const initialOptimizationRuntime: OptimizationRuntimeState = {
  processes: [],
  advanced_processes: [],
  selected_process: null,
  power_plans: [],
  activity: [],
  last_snapshot: null,
  session: {
    state: 'idle',
    active_tweaks: [],
    active_snapshot_ids: [],
    telemetry_source: 'demo',
    auto_restore_pending: false,
    pending_registry_restore: false,
    pending_registry_snapshot_id: null,
    capture_source: 'counters-fallback',
    capture_quality: 'idle',
  },
  detected_game: null,
  capture_status: {
    source: 'counters-fallback',
    available: true,
    quality: 'idle',
    helper_available: false,
    note: null,
  },
  registry_presets: [],
}

export const initialBuild: BuildMetadata = {
  version: '1.0.0',
  build_timestamp: '',
  git_commit: 'development',
  runtime_schema_version: '3.0.0',
  sidecar_protocol_version: '3',
}

export function initialConnection(cache: BootstrapPayload | null): ConnectionState {
  if (!cache) return { title: 'Runtime starting', detail: 'Preparing the local sidecar and cached shell state.' }
  return toConnection({ state: 'starting', ready: false, launched_by_app: false }, cache.demo_mode)
}
