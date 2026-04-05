import type {
  ActivityEntry,
  AttachSessionRequest,
  BenchmarkReport,
  BenchmarkWindow,
  DashboardPayload,
  GameProfile,
  OptimizationRuntimeState,
  SessionState,
  TelemetryPoint,
} from '../types'
import { EmptyState } from '../components/EmptyState'
import { LineChart } from '../components/LineChart'
import { MetricCard } from '../components/MetricCard'
import { Panel } from '../components/Panel'
import { SessionControlBar } from '../components/SessionControlBar'
import { stateCopy } from '../lib/stateCopy'
import { formatTimestamp } from '../lib/time'

interface DashboardPageProps {
  benchmarkBaseline: BenchmarkWindow | null
  benchmarkBusy: boolean
  dashboard: DashboardPayload
  lastTweakAtMs: number | null
  latestBenchmark: BenchmarkReport | null
  onAttachSession: (request: AttachSessionRequest) => void
  onCaptureBaseline: () => void
  onClearSessionSelection: () => void
  onEndSession: () => void
  onOpenLogs: () => void
  onOpenOptimization: () => void
  onOpenSettings: () => void
  onRefresh: (processId?: number) => void
  onRunBenchmark: (profileId?: string) => void
  onSelectProcess: (processId: number) => void
  onStopSession: () => void
  profiles: GameProfile[]
  realtime?: TelemetryPoint | null
  runtimeState: OptimizationRuntimeState
  session: SessionState
  stopBusy: boolean
}

function resolveProfile(profiles: GameProfile[], session: SessionState, currentSample: TelemetryPoint | null) {
  if (session.recommended_profile_id) {
    const matched = profiles.find((profile) => profile.id === session.recommended_profile_id)
    if (matched) return matched
  }
  const name = (currentSample?.game_name ?? '').toLowerCase()
  return profiles.find((profile) => profile.detection_keywords.some((keyword) => name.includes(keyword)))
}

function verdictLabel(report: BenchmarkReport | null) {
  if (!report) return 'No result yet'
  if (report.verdict === 'better') return 'Better'
  if (report.verdict === 'worse') return 'Worse'
  if (report.verdict === 'inconclusive') return 'Inconclusive'
  return 'Mixed'
}

export function DashboardPage({
  benchmarkBaseline,
  benchmarkBusy,
  dashboard,
  lastTweakAtMs,
  latestBenchmark,
  onAttachSession,
  onCaptureBaseline,
  onClearSessionSelection,
  onEndSession,
  onOpenLogs,
  onOpenOptimization,
  onOpenSettings,
  onRefresh,
  onRunBenchmark,
  onSelectProcess,
  onStopSession,
  profiles,
  realtime,
  runtimeState,
  session,
  stopBusy,
}: DashboardPageProps) {
  const values = dashboard.history.map((point) => point.frametime_p95_ms || point.frametime_avg_ms || point.ping)
  const currentSample = realtime ?? dashboard.history.at(-1) ?? null
  const stats = dashboard.stats.slice(0, 4)
  const profile = resolveProfile(profiles, session, currentSample)

  return (
    <div className="space-y-5">
      <Panel title="Optimization" variant="secondary">
        <SessionControlBar
          benchmarkBaseline={benchmarkBaseline}
          benchmarkBusy={benchmarkBusy}
          lastTweakAtMs={lastTweakAtMs}
          onAttachSession={onAttachSession}
          onCaptureBaseline={onCaptureBaseline}
          onClearSessionSelection={onClearSessionSelection}
          onEndSession={onEndSession}
          onOpenLogs={onOpenLogs}
          onOpenSettings={onOpenSettings}
          onRefresh={onRefresh}
          onRunBenchmark={onRunBenchmark}
          onSelectProcess={onSelectProcess}
          onStopSession={onStopSession}
          profiles={profiles}
          runtimeState={runtimeState}
          stopBusy={stopBusy}
        />
      </Panel>

      <div className="grid gap-5 xl:grid-cols-[1.1fr_0.9fr]">
        <Panel title="Session" variant="secondary">
          <div className="grid gap-4 xl:grid-cols-[1.15fr_0.85fr]">
            <div className="summary-card">
              <div className="flex items-center justify-between gap-3">
                <p className="text-sm font-semibold tracking-tight text-text">Frametime trend</p>
                {currentSample ? <span className="status-chip">p95 {currentSample.frametime_p95_ms.toFixed(1)} ms</span> : null}
              </div>
              <div className="mt-5">
                <LineChart values={values} />
              </div>
              {!currentSample ? <p className="mt-4 text-sm leading-6 text-muted">{stateCopy.chartEmpty}</p> : null}
            </div>

            <div className="grid gap-3">
              <div className="surface-card">
                <p className="text-xs uppercase tracking-[0.18em] text-muted">Game</p>
                <p className="mt-2 text-base font-semibold text-text">{currentSample?.game_name ?? 'No attached session yet'}</p>
              </div>
              <div className="surface-card">
                <p className="text-xs uppercase tracking-[0.18em] text-muted">Background CPU</p>
                <p className="mt-2 text-base font-semibold text-text">
                  {currentSample ? `${currentSample.background_cpu_pct.toFixed(0)}%` : 'Waiting for live data'}
                </p>
              </div>
              <div className="surface-card">
                <p className="text-xs uppercase tracking-[0.18em] text-muted">Memory pressure</p>
                <p className="mt-2 text-base font-semibold text-text">
                  {currentSample ? `${currentSample.memory_pressure_pct.toFixed(0)}%` : 'Waiting for live data'}
                </p>
              </div>
            </div>
          </div>

          {stats.length ? (
            <div className="mt-5 grid gap-4 md:grid-cols-4">
              {stats.map((item) => (
                <MetricCard key={item.label} {...item} />
              ))}
            </div>
          ) : null}
        </Panel>

        <div className="space-y-5">
          <Panel title="Latest result" variant="secondary">
            <div className="summary-card">
              <div className="flex items-center justify-between gap-3">
                <p className="text-sm font-semibold tracking-tight text-text">Result</p>
                <span className="status-chip">{verdictLabel(latestBenchmark)}</span>
              </div>
              <p className="mt-3 text-sm leading-6 text-muted">{latestBenchmark ? latestBenchmark.summary : stateCopy.noBenchmark}</p>
              {!latestBenchmark && benchmarkBaseline ? (
                <p className="mt-3 text-sm leading-6 text-muted">Baseline ready for {benchmarkBaseline.game_name}.</p>
              ) : null}
            </div>
          </Panel>

          <Panel title="Recommendations" variant="secondary">
            <div className="space-y-3">
              <div className="summary-card">
                <p className="text-sm font-semibold tracking-tight text-text">Matched profile</p>
                <p className="mt-3 text-sm leading-6 text-muted">{profile ? profile.description : stateCopy.noProfile}</p>
              </div>

              {dashboard.recommendations.length ? (
                dashboard.recommendations.slice(0, 2).map((item) => (
                  <div key={item.title} className="surface-card">
                    <div className="flex items-center justify-between gap-3">
                      <p className="text-sm font-semibold tracking-tight text-text">{item.title}</p>
                      <span className="status-chip">{item.impact}</span>
                    </div>
                    <p className="mt-2 text-sm leading-6 text-muted">{item.summary}</p>
                  </div>
                ))
              ) : (
                <EmptyState actionLabel="Open Optimize" description="Recommendations become useful after a baseline and one measured test." onAction={onOpenOptimization} title="No recommendation yet" />
              )}
            </div>
          </Panel>
        </div>
      </div>

      <Panel title="Logs" variant="secondary">
        <div className="space-y-3">
          {runtimeState.activity.length === 0 ? (
            <div className="surface-card text-sm text-muted">No logs yet.</div>
          ) : (
            runtimeState.activity.slice(0, 4).map((item: ActivityEntry) => (
              <div key={item.id} className="surface-card">
                <div className="flex items-center justify-between gap-3">
                  <p className="text-sm font-semibold text-text">{item.action}</p>
                  <span className="status-chip">{item.risk}</span>
                </div>
                <p className="mt-2 text-sm text-muted">{item.detail}</p>
                <p className="mt-2 text-xs text-muted">{formatTimestamp(item.timestamp)}</p>
              </div>
            ))
          )}
          <div>
            <button className="button-secondary" onClick={onOpenLogs} type="button">
              Open all logs
            </button>
          </div>
        </div>
      </Panel>
    </div>
  )
}
