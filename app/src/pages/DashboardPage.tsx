import type { BenchmarkReport, BenchmarkWindow, DashboardPayload, GameProfile, SessionState, TelemetryPoint } from '../types'
import { LineChart } from '../components/LineChart'
import { MetricCard } from '../components/MetricCard'
import { Panel } from '../components/Panel'
import { stateCopy } from '../lib/stateCopy'

interface DashboardPageProps {
  benchmarkBaseline: BenchmarkWindow | null
  dashboard: DashboardPayload
  latestBenchmark: BenchmarkReport | null
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
  if (report.verdict === 'improved') return 'Improved'
  if (report.verdict === 'regressed') return 'Regressed'
  return 'Mixed'
}

export function DashboardPage({ benchmarkBaseline, dashboard, latestBenchmark, profiles, realtime, session }: DashboardPageProps) {
  const values = dashboard.history.map((point) => point.frametime_p95_ms || point.frametime_avg_ms || point.ping)
  const currentSample = realtime ?? dashboard.history.at(-1) ?? null
  const primaryRecommendation = dashboard.recommendations[0] ?? null
  const secondaryRecommendations = dashboard.recommendations.slice(1)
  const telemetryState =
    dashboard.mode === 'live' ? 'Live telemetry' : dashboard.mode === 'demo' ? 'Demo mode' : 'Telemetry disabled'
  const stats = dashboard.stats.slice(0, 4)
  const profile = resolveProfile(profiles, session, currentSample)

  return (
    <div className="space-y-6">
      <section className="grid gap-6 xl:grid-cols-[1.18fr_0.82fr]">
        <Panel
          title="Session health"
          subtitle="Read the current pressure, not just the prettiest number."
          variant="primary"
        >
          <div className="grid gap-4 md:grid-cols-[0.72fr_1.28fr]">
            <div className="rounded-[1.65rem] border border-border-strong bg-surface-muted/80 px-5 py-5">
              <p className="text-xs uppercase tracking-[0.18em] text-muted">Current posture</p>
              <p className="mt-3 text-3xl font-semibold tracking-tight text-text">{dashboard.session_health}</p>
              <p className="mt-3 text-sm leading-6 text-muted">
                {session.state === 'active'
                  ? 'A session is active. Watch frametime and background pressure before adding more tweaks.'
                  : 'No live session is locked in yet. Treat this screen as orientation, not evidence.'}
              </p>
              <div className="mt-5 flex flex-wrap gap-2">
                <span className="rounded-full border border-border bg-surface px-3 py-1 text-xs uppercase tracking-[0.18em] text-muted">{telemetryState}</span>
                <span className="rounded-full border border-border bg-surface px-3 py-1 text-xs uppercase tracking-[0.18em] text-muted">Session {session.state}</span>
                <span className="rounded-full border border-border bg-surface px-3 py-1 text-xs uppercase tracking-[0.18em] text-muted">
                  Capture {currentSample?.capture_source ?? 'pending'}
                </span>
              </div>
            </div>
            <div className="rounded-[1.65rem] border border-border bg-surface px-5 py-5">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-xs uppercase tracking-[0.18em] text-muted">Frametime view</p>
                  <p className="mt-2 text-sm leading-6 text-muted">This is the graph that should decide whether you trust the session.</p>
                </div>
                {currentSample ? (
                  <div className="rounded-full border border-border bg-surface-muted px-3 py-2 text-xs uppercase tracking-[0.18em] text-muted">
                    p95 {currentSample.frametime_p95_ms.toFixed(1)} ms
                  </div>
                ) : null}
              </div>
              <div className="mt-5">
                <LineChart values={values} />
              </div>
            </div>
          </div>
          <div className="mt-5 grid gap-3 md:grid-cols-3">
            <div className="rounded-[1.5rem] border border-border bg-surface-muted/70 px-4 py-4">
              <p className="text-xs uppercase tracking-[0.18em] text-muted">Foreground</p>
              <p className="mt-2 text-base font-medium text-text">{currentSample?.game_name ?? 'No active session'}</p>
            </div>
            <div className="rounded-[1.5rem] border border-border bg-surface-muted/70 px-4 py-4">
              <p className="text-xs uppercase tracking-[0.18em] text-muted">Background pressure</p>
              <p className="mt-2 text-base font-medium text-text">
                {currentSample ? `${currentSample.background_cpu_pct.toFixed(0)}% CPU` : 'Not measured yet'}
              </p>
            </div>
            <div className="rounded-[1.5rem] border border-border bg-surface-muted/70 px-4 py-4">
              <p className="text-xs uppercase tracking-[0.18em] text-muted">Memory pressure</p>
              <p className="mt-2 text-base font-medium text-text">
                {currentSample ? `${currentSample.memory_pressure_pct.toFixed(0)}%` : 'Waiting for samples'}
              </p>
            </div>
          </div>
        </Panel>

        <div className="space-y-6">
          <Panel title="Next move" subtitle="The screen should tell you what to do next, not just what it knows." variant="secondary">
            {primaryRecommendation ? (
              <>
                <div className="rounded-[1.65rem] border border-border-strong bg-surface-muted/80 px-5 py-5">
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-base font-medium text-text">{primaryRecommendation.title}</p>
                    <span className="rounded-full border border-border bg-surface px-3 py-1 text-xs uppercase tracking-[0.18em] text-muted">
                      {primaryRecommendation.impact}
                    </span>
                  </div>
                  <p className="mt-3 text-sm leading-6 text-muted">{primaryRecommendation.summary}</p>
                </div>
                {secondaryRecommendations.length ? (
                  <div className="mt-4 space-y-3">
                    {secondaryRecommendations.map((item) => (
                      <div key={item.title} className="rounded-[1.5rem] border border-border bg-surface-muted/60 px-4 py-4">
                        <p className="text-sm font-medium text-text">{item.title}</p>
                        <p className="mt-2 text-sm leading-6 text-muted">{item.summary}</p>
                      </div>
                    ))}
                  </div>
                ) : null}
              </>
            ) : (
              <div className="rounded-[1.5rem] border border-border bg-surface-muted/60 px-4 py-4 text-sm leading-6 text-muted">
                No next-step advice is available yet. That is acceptable only until the telemetry loop produces enough local evidence.
              </div>
            )}
          </Panel>

          <Panel title="Proof and trust" subtitle="A serious optimizer should show what it knows, what it has proven, and what is still assumption." variant="utility">
            <div className="space-y-3">
              <div className="rounded-[1.5rem] border border-border bg-surface px-4 py-4">
                <div className="flex items-center justify-between gap-3">
                  <p className="text-sm font-semibold tracking-tight text-text">Latest benchmark</p>
                  <span className="rounded-full border border-border bg-surface-muted px-3 py-1 text-xs uppercase tracking-[0.18em] text-muted">
                    {verdictLabel(latestBenchmark)}
                  </span>
                </div>
                <p className="mt-3 text-sm leading-6 text-muted">
                  {latestBenchmark ? latestBenchmark.summary : stateCopy.noBenchmark}
                </p>
                {latestBenchmark ? (
                  <div className="mt-3 grid gap-3 md:grid-cols-2">
                    <div className="rounded-[1.25rem] border border-border bg-surface-muted/70 px-3 py-3 text-sm text-muted">
                      Frametime p95 delta {latestBenchmark.delta.frametime_p95_ms > 0 ? '+' : ''}
                      {latestBenchmark.delta.frametime_p95_ms.toFixed(2)} ms
                    </div>
                    <div className="rounded-[1.25rem] border border-border bg-surface-muted/70 px-3 py-3 text-sm text-muted">
                      CPU contention delta {latestBenchmark.delta.cpu_total_pct > 0 ? '+' : ''}
                      {latestBenchmark.delta.cpu_total_pct.toFixed(2)}%
                    </div>
                  </div>
                ) : null}
                {!latestBenchmark && benchmarkBaseline ? (
                  <p className="mt-3 text-sm leading-6 text-muted">
                    Baseline captured for {benchmarkBaseline.game_name}. Run a comparison after testing a preset.
                  </p>
                ) : null}
              </div>

              <div className="rounded-[1.5rem] border border-border bg-surface px-4 py-4">
                <p className="text-sm font-semibold tracking-tight text-text">Recommended profile</p>
                <p className="mt-3 text-sm leading-6 text-muted">
                  {profile ? profile.description : stateCopy.noProfile}
                </p>
                {profile ? (
                  <>
                    <div className="mt-3 flex flex-wrap gap-2">
                      {profile.allowed_actions.map((action) => (
                        <span key={action} className="rounded-full border border-border bg-surface-muted px-3 py-1 text-xs uppercase tracking-[0.18em] text-muted">
                          {action.replace('_', ' ')}
                        </span>
                      ))}
                    </div>
                    <p className="mt-3 text-sm leading-6 text-muted">{profile.benchmark_expectation}</p>
                  </>
                ) : null}
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
