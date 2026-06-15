import type {
  BenchmarkReport,
  BenchmarkEvidenceSummary,
  BenchmarkWindow,
  BootstrapPayload,
  DashboardPayload,
  FeatureFlags,
  LogRecord,
  ModelRecord,
  OptimizationSummary,
  SecuritySummary,
  SnapshotRecord,
  SystemSettings,
  SystemTelemetryPayload,
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
  if (!response.ok) {
    let detail = ''
    try {
      const payload = (await response.json()) as { detail?: unknown }
      detail = typeof payload.detail === 'string' ? payload.detail : ''
    } catch {
      detail = await response.text().catch(() => '')
    }
    throw new Error(detail || `Request failed for ${path}`)
  }
  return response.json() as Promise<T>
}

export const api = {
  bootstrap: () => request<BootstrapPayload>('/api/bootstrap'),
  benchmarkBaseline: () => request<BenchmarkWindow | null>('/api/benchmark/baseline'),
  benchmarkCsvText: async (csvId: string) => {
    await ensureBackendReady()
    const response = await fetch(`${baseUrl}/api/benchmark/csv/${encodeURIComponent(csvId)}`)
    if (!response.ok) throw new Error('Benchmark CSV was not found.')
    return response.text()
  },
  benchmarkLatest: () => request<BenchmarkReport | null>('/api/benchmark/latest'),
  benchmarkEvidence: () => request<BenchmarkEvidenceSummary[]>('/api/benchmark/evidence'),
  captureBenchmarkBaseline: (sampleLimit = 60, scenarioId?: string) => {
    const query = new URLSearchParams({ sample_limit: String(sampleLimit) })
    if (scenarioId) query.set('scenario_id', scenarioId)
    return request<BenchmarkWindow>(`/api/benchmark/capture-baseline?${query.toString()}`, { method: 'POST' })
  },
  runBenchmark: (profileId?: string, sampleLimit = 60) => {
    const query = new URLSearchParams()
    query.set('sample_limit', String(sampleLimit))
    if (profileId) query.set('profile_id', profileId)
    return request<BenchmarkReport>(`/api/benchmark/run?${query.toString()}`, { method: 'POST' })
  },
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
  createSnapshot: (note?: string) =>
    request<SnapshotRecord>('/api/snapshots', { method: 'POST', body: JSON.stringify({ note: note ?? null }) }),
  importSnapshot: (record: unknown) =>
    request<SnapshotRecord>('/api/snapshots/import', { method: 'POST', body: JSON.stringify({ record }) }),
  exportSnapshot: (id: string) => request<Record<string, unknown>>(`/api/snapshots/${id}/export`),
  deleteSnapshot: (id: string) => request<{ ok: boolean; message: string }>(`/api/snapshots/${id}`, { method: 'DELETE' }),
  restoreSnapshot: (id: string) => request<{ ok: boolean; message: string }>(`/api/snapshots/${id}/restore`, { method: 'POST' }),
  snapshotDiff: (id: string) => request<{ diff: string }>(`/api/snapshots/${id}/diff`),
  security: () => request<SecuritySummary>('/api/security'),
  systemTelemetry: () => request<SystemTelemetryPayload>('/api/system/telemetry'),
  optimization: () => request<OptimizationSummary>('/api/optimization'),
  telemetrySocket: (onMessage: (payload: TelemetryPoint) => void) => {
    void ensureBackendReady()
    const socket = new WebSocket(`${wsUrl}/ws/telemetry`)
    socket.onmessage = (event) => onMessage(JSON.parse(event.data) as TelemetryPoint)
    return socket
  },
}
