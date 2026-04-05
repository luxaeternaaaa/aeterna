import type { SecuritySummary } from '../types'
import { Panel } from '../components/Panel'

interface SecurityPageProps {
  security: SecuritySummary
}

export function SecurityPage({ security: _security }: SecurityPageProps) {
  const trustRows = [
    {
      title: 'Reads locally',
      value: 'Session telemetry and process state',
    },
    {
      title: 'Changes safely',
      value: 'Only safe, reversible session actions',
    },
    {
      title: 'Keeps risky actions blocked',
      value: 'No stealthy or high-risk behavior',
    },
    {
      title: 'Requests approval when needed',
      value: 'Some system-wide presets',
    },
    {
      title: 'Creates rollback first',
      value: 'Snapshot before change',
    },
    {
      title: 'Keeps data local by default',
      value: 'Local unless policy allows more',
    },
  ]

  return (
    <div className="space-y-5">
      <Panel title="Safety boundaries" variant="secondary">
        <div className="grid gap-3 md:grid-cols-2">
          {trustRows.map((item) => (
            <div key={item.title} className="summary-card">
              <p className="text-xs uppercase tracking-[0.18em] text-muted">{item.title}</p>
              <p className="mt-2 text-base font-semibold tracking-tight text-text">{item.value}</p>
            </div>
          ))}
        </div>
      </Panel>

      <Panel title="Hard boundaries" variant="secondary">
        <div className="grid gap-3 md:grid-cols-2">
          {[
            'No memory editing or stealthy behavior aimed at games.',
            'No silent outbound sync unless you explicitly allow it.',
            'No permanent system change is required during a live session.',
            'If proof is weak, Aeterna should slow down instead of acting smarter.',
          ].map((item) => (
            <div key={item} className="surface-card text-sm leading-6 text-muted">
              {item}
            </div>
          ))}
        </div>
      </Panel>
    </div>
  )
}
