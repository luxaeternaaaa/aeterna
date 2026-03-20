import type { BenchmarkReport, BenchmarkWindow, DashboardPayload, GameProfile, OptimizationSummary, SessionState, TelemetryPoint } from '../types'
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

  return (
    <div className="space-y-6">
      <section className="grid gap-6 xl:grid-cols-[1.12fr_0.88fr]">
        <Panel title="Current pressure" subtitle="This is the shortest honest read of the session right now." variant="primary">
          <div className="grid gap-4 md:grid-cols-[0.74fr_1.26fr]">
            <div className="surface-card">
              <p className="text-xs uppercase tracking-[0.18em] text-muted">Session status</p>
              <p className="mt-3 text-3xl font-semibold tracking-tight text-text">{dashboard.session_health}</p>
              <p className="mt-3 text-sm leading-6 text-muted">{sessionStage.detail}</p>
              <div className="mt-5 flex flex-wrap gap-2">
                <span className="status-chip">{sessionStage.label}</span>
                <span className="status-chip">{evidence.label}</span>
                <span className="status-chip">{proof.label}</span>
              </div>
            </div>
            <div className="summary-card">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-xs uppercase tracking-[0.18em] text-muted">Frametime trend</p>
                  <p className="mt-2 text-sm leading-6 text-muted">Use this to judge whether the session is stable enough before you touch anything.</p>
                </div>
                {currentSample ? <span className="status-chip">p95 {currentSample.frametime_p95_ms.toFixed(1)} ms</span> : null}
              </div>
              <div className="mt-5">
                <LineChart values={values} />
              </div>
            </div>
          </div>
          <div className="mt-5 grid gap-3 md:grid-cols-3">
            <div className="surface-card">
              <p className="text-xs uppercase tracking-[0.18em] text-muted">Foreground</p>
              <p className="mt-2 text-base font-medium text-text">{currentSample?.game_name ?? 'No attached session yet'}</p>
            </div>
            <div className="surface-card">
              <p className="text-xs uppercase tracking-[0.18em] text-muted">Background pressure</p>
              <p className="mt-2 text-base font-medium text-text">{currentSample ? `${currentSample.background_cpu_pct.toFixed(0)}% CPU` : 'Waiting for live evidence'}</p>
            </div>
            <div className="surface-card">
              <p className="text-xs uppercase tracking-[0.18em] text-muted">Memory pressure</p>
              <p className="mt-2 text-base font-medium text-text">{currentSample ? `${currentSample.memory_pressure_pct.toFixed(0)}%` : 'Waiting for live evidence'}</p>
            </div>
          </div>
        </Panel>

        <div className="space-y-6">
          <Panel title="Next safe step" subtitle="One clear move matters more than six descriptive cards." variant="secondary">
            <div className="rounded-[1.65rem] border border-accent/30 bg-accent-soft/55 px-5 py-5">
              <p className="text-xs uppercase tracking-[0.18em] text-muted">Do this next</p>
              <p className="mt-3 text-2xl font-semibold tracking-tight text-text">{nextStep.label}</p>
              <p className="mt-3 text-sm leading-6 text-muted">{nextStep.detail}</p>
              <button className="button-primary mt-5" onClick={onOpenOptimization} type="button">
                Open session controls
              </button>
            </div>
            {dashboard.recommendations.length ? (
              <div className="space-y-3">
                {dashboard.recommendations.slice(0, 2).map((item) => (
                  <div key={item.title} className="summary-card">
                    <div className="flex items-center justify-between gap-3">
                      <p className="text-sm font-semibold tracking-tight text-text">{item.title}</p>
                      <span className="status-chip">{item.impact}</span>
                    </div>
                    <p className="mt-2 text-sm leading-6 text-muted">{item.summary}</p>
                  </div>
                ))}
              </div>
            ) : (
              <div className="empty-state">
                <p className="text-base font-semibold tracking-tight text-text">No recommendation yet</p>
                <p className="mt-2 text-sm leading-6 text-muted">Once the app sees a real or demo session, this area will reduce the next step to one safe action.</p>
              </div>
            )}
          </Panel>

          <Panel title="Proof and trust" subtitle="Trust should come from evidence and reversibility, not from long explanations." variant="utility">
            <div className="space-y-3">
              <div className="summary-card">
                <div className="flex items-center justify-between gap-3">
                  <p className="text-sm font-semibold tracking-tight text-text">Latest benchmark</p>
                  <span className="status-chip">{verdictLabel(latestBenchmark)}</span>
                </div>
                <p className="mt-3 text-sm leading-6 text-muted">{latestBenchmark ? latestBenchmark.summary : stateCopy.noBenchmark}</p>
                {latestBenchmark ? <p className="mt-3 text-sm leading-6 text-muted">{latestBenchmark.recommended_next_step}</p> : null}
                {!latestBenchmark && benchmarkBaseline ? (
                  <p className="mt-3 text-sm leading-6 text-muted">Baseline captured for {benchmarkBaseline.game_name}. The next honest step is one reversible change and then Compare.</p>
                ) : null}
              </div>
              <div className="summary-card">
                <p className="text-sm font-semibold tracking-tight text-text">Matched profile</p>
                <p className="mt-3 text-sm leading-6 text-muted">{profile ? profile.description : stateCopy.noProfile}</p>
                {profile ? <p className="mt-3 text-sm leading-6 text-muted">{profile.benchmark_expectation}</p> : null}
              </div>
            </div>
          </Panel>
        </div>
      </section>

      <section className="grid gap-4 md:grid-cols-4">
        {stats.map((item) => (
          <MetricCard key={item.label} {...item} />
        ))}
      </section>
    </div>
  )
}
