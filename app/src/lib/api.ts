import type {
  BootstrapPayload,
  DashboardPayload,
  FeatureFlags,
  LogRecord,
  ModelRecord,
  OptimizationSummary,
  SecuritySummary,
  SnapshotRecord,
  SystemSettings,
  TelemetryPoint,
} from '../types'
import { ensureBackendReady } from './runtime'

const baseUrl = import.meta.env.VITE_API_BASE ?? 'http://127.0.0.1:8000'
const wsUrl = baseUrl.replace('http', 'ws')

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  await ensureBackendReady()
  const response = await fetch(`${baseUrl}${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...init,
  })
  if (!response.ok) throw new Error(`Request failed for ${path}`)
  return response.json() as Promise<T>
}

export const api = {
  bootstrap: () => request<BootstrapPayload>('/api/bootstrap'),
  dashboard: () => request<DashboardPayload>('/api/dashboard'),
  featureFlags: () => request<FeatureFlags>('/api/settings/feature-flags'),
  updateFeatureFlags: (payload: FeatureFlags) =>
    request<FeatureFlags>('/api/settings/feature-flags', { method: 'PUT', body: JSON.stringify(payload) }),
  system: () => request<SystemSettings>('/api/settings/system'),
  updateSystem: (payload: SystemSettings) =>
    request<SystemSettings>('/api/settings/system', { method: 'PUT', body: JSON.stringify(payload) }),
  models: () => request<ModelRecord[]>('/api/models'),
  activateModel: (id: string) => request<ModelRecord>(`/api/models/${id}/activate`, { method: 'POST' }),
  rollbackModel: (id: string) => request<{ ok: boolean; message: string }>(`/api/models/${id}/rollback`, { method: 'POST' }),
  logs: () => request<LogRecord[]>('/api/logs'),
  snapshots: () => request<SnapshotRecord[]>('/api/snapshots'),
  restoreSnapshot: (id: string) => request<{ ok: boolean; message: string }>(`/api/snapshots/${id}/restore`, { method: 'POST' }),
  snapshotDiff: (id: string) => request<{ diff: string }>(`/api/snapshots/${id}/diff`),
  security: () => request<SecuritySummary>('/api/security'),
  optimization: () => request<OptimizationSummary>('/api/optimization'),
  telemetrySocket: (onMessage: (payload: TelemetryPoint) => void) => {
    void ensureBackendReady()
    const socket = new WebSocket(`${wsUrl}/ws/telemetry`)
    socket.onmessage = (event) => onMessage(JSON.parse(event.data) as TelemetryPoint)
    return socket
  },
}
