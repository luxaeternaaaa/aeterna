import type { SecuritySummary } from '../types'
import { Panel } from '../components/Panel'

interface SecurityPageProps {
  security: SecuritySummary
}

export function SecurityPage({ security }: SecurityPageProps) {
  const postureLabel = security.status === 'high' ? 'Stop and inspect' : security.status === 'medium' ? 'Proceed carefully' : 'Low concern'
  const reviewMode = security.auto_scan_enabled ? 'Automatic' : 'Manual'

  const trustRows = [
    {
      title: 'What Aeterna can read',
      value: 'Session telemetry, process state, proof signals',
      detail: 'Read access is local-first and used to detect, measure, compare, and explain.',
    },
    {
      title: 'What Aeterna can change',
      value: 'Only safe, reversible session actions',
      detail: 'Normal flow stays inside rollback-ready actions like priority, affinity, and approved presets.',
    },
    {
      title: 'What stays blocked',
      value: 'Risky or stealthy behavior',
      detail: 'No anti-cheat bypassing, no game memory editing, no silent high-risk system changes.',
    },
    {
      title: 'What may require approval',
      value: 'Some system-scoped presets',
      detail: 'If an action needs extra trust, it should be explicit, narrow, and reversible.',
    },
    {
      title: 'Rollback guarantee',
      value: 'Snapshot before change',
      detail: 'Proof and rollback take priority over automation speed.',
    },
    {
      title: 'Data path',
      value: 'Local by default',
      detail: 'Nothing leaves the machine unless policy allows it.',
    },
  ]

  return (
    <div className="space-y-5">
      <Panel variant="primary">
        <div className="grid gap-4 xl:grid-cols-[1.1fr_0.9fr]">
          <div className="action-stage">
            <p className="text-xs uppercase tracking-[0.18em] text-muted">Safety posture</p>
            <h3 className="mt-3 text-2xl font-semibold tracking-tight text-text md:text-[2.35rem]">{postureLabel}</h3>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-muted md:text-base md:leading-7">
              Aeterna is built around measured changes, explicit boundaries, and rollback-first behavior.
            </p>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="surface-card">
              <p className="text-xs uppercase tracking-[0.18em] text-muted">Confidence</p>
              <p className="mt-2 text-2xl font-semibold tracking-tight text-text">{(security.confidence * 100).toFixed(0)}%</p>
              <p className="mt-2 text-sm leading-6 text-muted">A read on how stable the current safety signal looks.</p>
            </div>
            <div className="surface-card">
              <p className="text-xs uppercase tracking-[0.18em] text-muted">Review mode</p>
              <p className="mt-2 text-2xl font-semibold tracking-tight text-text">{reviewMode}</p>
              <p className="mt-2 text-sm leading-6 text-muted">Automatic review stays opt-in. Manual control remains the default.</p>
            </div>
          </div>
        </div>
      </Panel>

      <Panel subtitle="This is the trust contract the product should communicate clearly." title="Trust contract" variant="secondary">
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

      <Panel subtitle="Hard rules, not soft promises." title="Non-negotiables" variant="secondary">
        <div className="grid gap-3 md:grid-cols-2">
          {[
            'No memory editing or stealthy behavior aimed at games.',
            'No silent outbound sync unless you explicitly allow it.',
            'No permanent system change is required during a live session.',
            'If proof is weak, the product should slow down instead of acting smarter.',
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
