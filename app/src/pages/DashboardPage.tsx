import type { BenchmarkReport, BenchmarkWindow, DashboardPayload, GameProfile, OptimizationSummary, SessionState, TelemetryPoint } from '../types'
import { DisclosurePanel } from '../components/DisclosurePanel'
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
      <Panel variant="primary">
        <div className="grid gap-6 xl:grid-cols-[1.2fr_0.8fr] xl:items-start">
          <div className="action-stage">
            <p className="text-xs uppercase tracking-[0.18em] text-muted">Do this next</p>
            <h3 className="mt-3 text-3xl font-semibold tracking-tight text-text md:text-[2.6rem]">{nextStep.label}</h3>
            <p className="mt-3 max-w-2xl text-base leading-7 text-muted">{nextStep.detail}</p>
            <div className="mt-5 flex flex-wrap gap-2">
              <span className="status-chip">{sessionStage.label}</span>
              <span className="status-chip">{proof.label}</span>
              <span className="status-chip">{evidence.label}</span>
            </div>
            <button className="button-primary mt-7" onClick={onOpenOptimization} type="button">
              Continue to safe test
            </button>
          </div>

          <div className="grid gap-3">
            <div className="surface-card">
              <p className="text-xs uppercase tracking-[0.18em] text-muted">Current read</p>
              <p className="mt-3 text-2xl font-semibold tracking-tight text-text">{dashboard.session_health}</p>
              <p className="mt-2 text-sm leading-6 text-muted">{sessionStage.detail}</p>
            </div>
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-1">
              <div className="surface-card">
                <p className="text-xs uppercase tracking-[0.18em] text-muted">Proof</p>
                <p className="mt-2 text-lg font-semibold tracking-tight text-text">{proof.label}</p>
                <p className="mt-2 text-sm leading-6 text-muted">{proof.detail}</p>
              </div>
              <div className="surface-card">
                <p className="text-xs uppercase tracking-[0.18em] text-muted">Evidence</p>
                <p className="mt-2 text-lg font-semibold tracking-tight text-text">{evidence.label}</p>
                <p className="mt-2 text-sm leading-6 text-muted">{evidence.detail}</p>
              </div>
            </div>
          </div>
        </div>
      </Panel>

      <DisclosurePanel defaultOpen={Boolean(currentSample)} summary="Trend, foreground process, and pressure signals." title="Live session details">
        <div className="grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
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
              <p className="text-xs uppercase tracking-[0.18em] text-muted">Background pressure</p>
              <p className="mt-2 text-base font-semibold text-text">
                {currentSample ? `${currentSample.background_cpu_pct.toFixed(0)}% CPU` : 'Waiting for live data'}
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
          <div className="mt-6 grid gap-4 md:grid-cols-4">
            {stats.map((item) => (
              <MetricCard key={item.label} {...item} />
            ))}
          </div>
        ) : null}
      </DisclosurePanel>

      <DisclosurePanel summary="Benchmark proof, profile match, and secondary guidance." title="Proof and guidance">
        <div className="grid gap-4 xl:grid-cols-2">
          <div className="summary-card">
            <div className="flex items-center justify-between gap-3">
              <p className="text-sm font-semibold tracking-tight text-text">Latest benchmark</p>
              <span className="status-chip">{verdictLabel(latestBenchmark)}</span>
            </div>
            <p className="mt-3 text-sm leading-6 text-muted">{latestBenchmark ? latestBenchmark.summary : stateCopy.noBenchmark}</p>
            {latestBenchmark ? <p className="mt-3 text-sm leading-6 text-muted">{latestBenchmark.recommended_next_step}</p> : null}
            {!latestBenchmark && benchmarkBaseline ? (
              <p className="mt-3 text-sm leading-6 text-muted">
                Baseline captured for {benchmarkBaseline.game_name}. Run one safe change, then compare it.
              </p>
            ) : null}
          </div>

          <div className="summary-card">
            <p className="text-sm font-semibold tracking-tight text-text">Matched profile</p>
            <p className="mt-3 text-sm leading-6 text-muted">{profile ? profile.description : stateCopy.noProfile}</p>
            {profile ? <p className="mt-3 text-sm leading-6 text-muted">{profile.benchmark_expectation}</p> : null}
            {dashboard.recommendations.length ? (
              <div className="mt-5 space-y-3">
                {dashboard.recommendations.slice(0, 2).map((item) => (
                  <div key={item.title} className="surface-card">
                    <div className="flex items-center justify-between gap-3">
                      <p className="text-sm font-semibold tracking-tight text-text">{item.title}</p>
                      <span className="status-chip">{item.impact}</span>
                    </div>
                    <p className="mt-2 text-sm leading-6 text-muted">{item.summary}</p>
                  </div>
                ))}
              </div>
            ) : null}
          </div>
        </div>
      </DisclosurePanel>
    </div>
  )
}
