import type { DashboardPayload, SessionState, TelemetryPoint } from '../types'
import { LineChart } from '../components/LineChart'
import { MetricCard } from '../components/MetricCard'
import { Panel } from '../components/Panel'

interface DashboardPageProps {
  dashboard: DashboardPayload
  realtime?: TelemetryPoint | null
  session: SessionState
}

export function DashboardPage({ dashboard, realtime, session }: DashboardPageProps) {
  const values = dashboard.history.map((point) => point.frametime_p95_ms || point.frametime_avg_ms || point.ping)
  return (
    <div className="space-y-6">
      <section className="grid gap-4 xl:grid-cols-5">
        {dashboard.stats.map((item) => (
          <MetricCard key={item.label} {...item} />
        ))}
      </section>
      <section className="grid gap-6 xl:grid-cols-[1.4fr_0.8fr]">
        <Panel title="Session telemetry" subtitle="Thin-line trend chart for the current local history window.">
          <LineChart values={values} />
          <div className="mt-5 flex flex-wrap gap-6 text-sm text-muted">
            <span>{dashboard.badge}</span>
            <span>Session state: {session.state}</span>
            <span>Health: {dashboard.session_health}</span>
            <span>Foreground: {realtime?.game_name ?? dashboard.history.at(-1)?.game_name ?? 'No active session'}</span>
          </div>
        </Panel>
        <Panel title="Recommendations" subtitle="Local guidance derived from telemetry and lightweight ML signals.">
          <div className="space-y-4">
            {dashboard.recommendations.map((item) => (
              <div key={item.title} className="rounded-2xl border border-border px-4 py-4">
                <div className="flex items-center justify-between gap-3">
                  <p className="text-sm font-medium">{item.title}</p>
                  <span className="text-xs uppercase tracking-[0.18em] text-muted">{item.impact}</span>
                </div>
                <p className="mt-2 text-sm leading-6 text-muted">{item.summary}</p>
              </div>
            ))}
          </div>
        </Panel>
      </section>
    </div>
  )
}
