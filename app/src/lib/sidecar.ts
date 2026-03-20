import { invoke } from '@tauri-apps/api/core'

import type {
  ApplyRegistryPresetRequest,
  ApplyRegistryPresetResponse,
  ApplyTweakRequest,
  ApplyTweakResponse,
  AttachSessionRequest,
  MlInferencePayload,
  MlRuntimeTruth,
  OptimizationRuntimeState,
  RollbackResponse,
  SidecarStatusPayload,
  TelemetryPoint,
} from '../types'

const fallbackStatus: SidecarStatusPayload = {
  state: 'stopped',
  ready: false,
  launched_by_app: false,
  startup_ms: null,
  diagnostics: {},
}

const fallbackState: OptimizationRuntimeState = {
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

function isTauriRuntime() {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window
}

export async function startSidecar(): Promise<SidecarStatusPayload> {
  if (!isTauriRuntime()) return fallbackStatus
  try {
    return await invoke<SidecarStatusPayload>('start_sidecar')
  } catch {
    return fallbackStatus
  }
}

export async function getSidecarStatus(): Promise<SidecarStatusPayload> {
  if (!isTauriRuntime()) return fallbackStatus
  try {
    return await invoke<SidecarStatusPayload>('sidecar_status')
  } catch {
    return fallbackStatus
  }
}

export async function inspectOptimization(processId?: number): Promise<OptimizationRuntimeState> {
  if (!isTauriRuntime()) return fallbackState
  try {
    return await invoke<OptimizationRuntimeState>('inspect_optimization', { processId })
  } catch {
    return fallbackState
  }
}

export async function attachOptimizationSession(request: AttachSessionRequest): Promise<OptimizationRuntimeState> {
  return invoke<OptimizationRuntimeState>('attach_session', { request })
}

export async function endOptimizationSession(): Promise<OptimizationRuntimeState> {
  return invoke<OptimizationRuntimeState>('end_session')
}

export async function applyOptimizationTweak(request: ApplyTweakRequest): Promise<ApplyTweakResponse> {
  return invoke<ApplyTweakResponse>('apply_tweak', { request })
}

export async function applyRegistryPreset(request: ApplyRegistryPresetRequest): Promise<ApplyRegistryPresetResponse> {
  return invoke<ApplyRegistryPresetResponse>('apply_registry_preset', { request })
}

export async function rollbackOptimizationTweak(snapshotId: string, processId?: number): Promise<RollbackResponse> {
  return invoke<RollbackResponse>('rollback_tweak', { snapshotId, processId })
}

export async function runOptimizationInference(point: TelemetryPoint): Promise<MlInferencePayload | null> {
  if (!isTauriRuntime()) return null
  try {
    return await invoke<MlInferencePayload>('run_ml_inference', {
      payload: {
        fps_avg: point.fps_avg,
        frametime_avg_ms: point.frametime_avg_ms,
        frametime_p95_ms: point.frametime_p95_ms,
        frame_drop_ratio: point.frame_drop_ratio,
        cpu_process_pct: point.cpu_process_pct,
        cpu_total_pct: point.cpu_total_pct,
        gpu_usage_pct: point.gpu_usage_pct ?? 0,
        ram_working_set_mb: point.ram_working_set_mb,
        background_process_count: point.background_process_count,
        anomaly_score: point.anomaly_score,
      },
    })
  } catch {
    return null
  }
}

export async function getMlRuntimeTruth(): Promise<MlRuntimeTruth | null> {
  if (!isTauriRuntime()) return null
  try {
    return await invoke<MlRuntimeTruth>('ml_runtime_truth')
  } catch {
    return null
  }
}
