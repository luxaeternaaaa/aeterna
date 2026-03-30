import type { SecuritySummary } from '../types'
import { Panel } from '../components/Panel'

interface SecurityPageProps {
  security: SecuritySummary
}

export function SecurityPage({ security }: SecurityPageProps) {
  const postureLabel = security.status === 'high' ? 'Review before continuing' : security.status === 'medium' ? 'Proceed carefully' : 'Low risk'
  const reviewMode = security.auto_scan_enabled ? 'Automatic' : 'Manual'

  const trustRows = [
    {
      title: 'Reads locally',
      value: 'Session telemetry and process state',
      detail: 'Aeterna reads local signals to detect, measure, compare, and explain changes.',
    },
    {
      title: 'Changes safely',
      value: 'Only safe, reversible session actions',
      detail: 'Normal flow stays inside rollback-ready actions like priority, affinity, and approved presets.',
    },
    {
      title: 'Keeps risky actions blocked',
      value: 'No stealthy or high-risk behavior',
      detail: 'No anti-cheat bypassing, no game memory editing, and no silent high-risk system changes.',
    },
    {
      title: 'Requests approval when needed',
      value: 'Some system-wide presets',
      detail: 'If an action needs extra trust, it should be explicit, narrow, and reversible.',
    },
    {
      title: 'Creates rollback first',
      value: 'Snapshot before change',
      detail: 'Proof and rollback take priority over automation speed.',
    },
    {
      title: 'Keeps data local by default',
      value: 'Local unless policy allows more',
      detail: 'Nothing leaves the machine unless policy allows it.',
    },
  ]

  return (
    <div className="space-y-5">
      <Panel variant="primary">
        <div className="grid gap-4 xl:grid-cols-[1.1fr_0.9fr]">
          <div className="action-stage">
            <p className="text-xs uppercase tracking-[0.18em] text-muted">Security posture</p>
            <h3 className="mt-3 text-2xl font-semibold tracking-tight text-text md:text-[2.35rem]">{postureLabel}</h3>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-muted md:text-base md:leading-7">
              Aeterna is designed around measured changes, clear limits, and rollback-first behavior.
            </p>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="surface-card">
              <p className="text-xs uppercase tracking-[0.18em] text-muted">Confidence</p>
              <p className="mt-2 text-2xl font-semibold tracking-tight text-text">{(security.confidence * 100).toFixed(0)}%</p>
              <p className="mt-2 text-sm leading-6 text-muted">How stable the current safety signal looks.</p>
            </div>
            <div className="surface-card">
              <p className="text-xs uppercase tracking-[0.18em] text-muted">Review mode</p>
              <p className="mt-2 text-2xl font-semibold tracking-tight text-text">{reviewMode}</p>
              <p className="mt-2 text-sm leading-6 text-muted">Automatic review stays opt-in. Manual control remains the default.</p>
            </div>
          </div>
        </div>
      </Panel>

      <Panel subtitle="The key safety boundaries, without the lecture." title="Safety boundaries" variant="secondary">
        <div className="grid gap-3 md:grid-cols-2">
          {trustRows.map((item) => (
            <div key={item.title} className="summary-card">
              <p className="text-xs uppercase tracking-[0.18em] text-muted">{item.title}</p>
              <p className="mt-2 text-base font-semibold tracking-tight text-text">{item.value}</p>
              <p className="mt-2 text-sm leading-6 text-muted">{item.detail}</p>
            </div>
          ))}
        </div>
      </Panel>

      <Panel subtitle="Rules Aeterna should not cross." title="Hard boundaries" variant="secondary">
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
