import type { BenchmarkReport, BenchmarkWindow, DashboardPayload, GameProfile, OptimizationSummary, SessionState, TelemetryPoint } from '../types'
import { EmptyState } from '../components/EmptyState'
import { LineChart } from '../components/LineChart'
import { MetricCard } from '../components/MetricCard'
import { Panel } from '../components/Panel'
import { getEvidenceStage, getProofStage, getSessionStage, getWorkflowStep } from '../lib/productState'
import { stateCopy } from '../lib/stateCopy'

interface DashboardPageProps {
  benchmarkBaseline: BenchmarkWindow | null
  dashboard: DashboardPayload
  latestBenchmark: BenchmarkReport | null
  onOpenOptimization: () => void
  optimization: OptimizationSummary
  profiles: GameProfile[]
  realtime?: TelemetryPoint | null
  session: SessionState
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
  if (!report) return 'No proof yet'
  if (report.verdict === 'better') return 'Better'
  if (report.verdict === 'worse') return 'Worse'
  if (report.verdict === 'inconclusive') return 'Inconclusive'
  return 'Mixed'
}

export function DashboardPage({
  benchmarkBaseline,
  dashboard,
  latestBenchmark,
  onOpenOptimization,
  optimization,
  profiles,
  realtime,
  session,
}: DashboardPageProps) {
  const values = dashboard.history.map((point) => point.frametime_p95_ms || point.frametime_avg_ms || point.ping)
  const currentSample = realtime ?? dashboard.history.at(-1) ?? null
  const stats = dashboard.stats.slice(0, 4)
  const profile = resolveProfile(profiles, session, currentSample)
  const sessionStage = getSessionStage(session)
  const evidence = getEvidenceStage(dashboard.mode, session)
  const proof = getProofStage(optimization, benchmarkBaseline, latestBenchmark)
  const nextStep = getWorkflowStep({
    benchmarkBaseline,
    detectedGame: null,
    featureFlags: {
      anomaly_detection: false,
      auto_security_scan: false,
      cloud_features: false,
      cloud_training: false,
      network_optimizer: optimization.optimizer_enabled,
      telemetry_collect: dashboard.mode !== 'disabled',
    },
    latestBenchmark,
    optimization,
    session,
  })

  const stateItems = [
    { label: 'Session', value: sessionStage.label, detail: sessionStage.detail },
    { label: 'Proof', value: proof.label, detail: proof.detail },
    { label: 'Evidence', value: evidence.label, detail: evidence.detail },
    {
      label: 'Rollback',
      value: session.active_snapshot_ids.length > 0 ? 'Ready' : 'Not needed',
      detail: session.active_snapshot_ids.length > 0 ? 'A reversible change is still active.' : 'No active rollback snapshot yet.',
    },
  ]

  return (
    <div className="space-y-5">
      <Panel variant="primary">
        <div className="grid gap-4 xl:grid-cols-[1.15fr_0.85fr]">
          <div className="action-stage">
            <p className="text-xs uppercase tracking-[0.18em] text-muted">Next step</p>
            <h3 className="mt-3 text-2xl font-semibold tracking-tight text-text md:text-[2.35rem]">{nextStep.label}</h3>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-muted md:text-base md:leading-7">{nextStep.detail}</p>
            <button className="button-primary mt-6" onClick={onOpenOptimization} type="button">
              Open Optimize
            </button>
          </div>

          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-2">
            {stateItems.map((item) => (
              <div key={item.label} className="surface-card">
                <p className="text-xs uppercase tracking-[0.18em] text-muted">{item.label}</p>
                <p className="mt-2 text-base font-semibold tracking-tight text-text">{item.value}</p>
                <p className="mt-2 text-sm leading-6 text-muted">{item.detail}</p>
              </div>
            ))}
          </div>
        </div>
      </Panel>

      <div className="grid gap-5 xl:grid-cols-[1.1fr_0.9fr]">
        <Panel subtitle="Foreground process and pressure signals." title="Current session" variant="secondary">
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
                <p className="text-xs uppercase tracking-[0.18em] text-muted">Foreground</p>
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
          <Panel subtitle="What the latest benchmark says right now." title="Latest result" variant="secondary">
            <div className="summary-card">
              <div className="flex items-center justify-between gap-3">
                <p className="text-sm font-semibold tracking-tight text-text">Benchmark status</p>
                <span className="status-chip">{verdictLabel(latestBenchmark)}</span>
              </div>
              <p className="mt-3 text-sm leading-6 text-muted">{latestBenchmark ? latestBenchmark.summary : stateCopy.noBenchmark}</p>
              {latestBenchmark ? <p className="mt-3 text-sm leading-6 text-muted">{latestBenchmark.recommended_next_step}</p> : null}
              {!latestBenchmark && benchmarkBaseline ? (
                <p className="mt-3 text-sm leading-6 text-muted">Baseline captured for {benchmarkBaseline.game_name}. Run one safe change, then compare it.</p>
              ) : null}
            </div>
          </Panel>

          <Panel subtitle="Profile fit and current recommendations." title="Guidance" variant="secondary">
            <div className="space-y-3">
              <div className="summary-card">
                <p className="text-sm font-semibold tracking-tight text-text">Matched profile</p>
                <p className="mt-3 text-sm leading-6 text-muted">{profile ? profile.description : stateCopy.noProfile}</p>
                {profile ? <p className="mt-3 text-sm leading-6 text-muted">{profile.benchmark_expectation}</p> : null}
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
                <EmptyState actionLabel="Open Optimize" description="Recommendations will become more useful after a baseline and one measured test." onAction={onOpenOptimization} title="No recommendation yet" />
              )}
            </div>
          </Panel>
        </div>
      </div>
    </div>
  )
}
