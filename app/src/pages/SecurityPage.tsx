import type { SecuritySummary } from '../types'
import { Panel } from '../components/Panel'

interface SecurityPageProps {
  security: SecuritySummary
}

export function SecurityPage({ security }: SecurityPageProps) {
  const postureLabel = security.status === 'high' ? 'Stop and inspect' : security.status === 'medium' ? 'Proceed carefully' : 'Low concern'

  return (
    <div className="space-y-6">
      <section className="grid gap-6 xl:grid-cols-[1.05fr_0.95fr]">
        <Panel
          title="Current risk posture"
          subtitle="Security exists here to protect trust in the optimizer, not to pretend this app is an anti-cheat tool."
          variant="primary"
        >
          <div className="grid gap-3 md:grid-cols-[0.92fr_1.08fr]">
            <div className="rounded-[1.5rem] border border-border bg-surface-muted/70 px-4 py-4">
              <p className="text-xs uppercase tracking-[0.18em] text-muted">Posture</p>
              <p className="mt-3 text-3xl font-semibold tracking-tight text-text">{postureLabel}</p>
              <div className="mt-3 flex flex-wrap gap-2">
                <span className="rounded-full border border-border bg-surface px-3 py-1 text-xs uppercase tracking-[0.18em] text-muted">
                  Status {security.status}
                </span>
                <span className="rounded-full border border-border bg-surface px-3 py-1 text-xs uppercase tracking-[0.18em] text-muted">
                  {security.label}
                </span>
              </div>
            </div>
            <div className="grid gap-3 md:grid-cols-2">
              <div className="rounded-[1.5rem] border border-border bg-surface-muted/70 px-4 py-4">
                <p className="text-xs uppercase tracking-[0.18em] text-muted">Confidence</p>
                <p className="mt-3 text-2xl font-semibold tracking-tight text-text">{(security.confidence * 100).toFixed(0)}%</p>
                <p className="mt-2 text-sm leading-6 text-muted">How strongly the local classifier believes the current label.</p>
              </div>
              <div className="rounded-[1.5rem] border border-border bg-surface-muted/70 px-4 py-4">
                <p className="text-xs uppercase tracking-[0.18em] text-muted">Scanning mode</p>
                <p className="mt-3 text-2xl font-semibold tracking-tight text-text">{security.auto_scan_enabled ? 'Automatic' : 'Manual'}</p>
                <p className="mt-2 text-sm leading-6 text-muted">Automatic scanning stays opt-in; the default is explicit, local review.</p>
              </div>
            </div>
          </div>
        </Panel>

        <Panel
          title="Privacy posture"
          subtitle="The product stays understandable by refusing hidden sync, hidden privilege, and anti-cheat-looking behavior."
          variant="secondary"
        >
          <div className="space-y-3">
            {[
              'No outbound sync runs unless a user explicitly enables it.',
              'Security logs stay on-device and remain visible in Activity & Rollback.',
              'Cloud training and telemetry export stay disabled by default.',
              'Compatibility mode keeps overlays, DLL injection, and driver-level changes out of the current product path.',
            ].map((item) => (
              <div key={item} className="rounded-[1.5rem] border border-border bg-surface-muted/70 px-4 py-4 text-sm leading-6 text-muted">
                {item}
              </div>
            ))}
          </div>
        </Panel>
      </section>

      <section className="grid gap-6 xl:grid-cols-[1fr_1fr]">
        <Panel
          title="Hard boundaries"
          subtitle="These are non-negotiable product rules, not soft marketing promises."
          variant="secondary"
        >
          <div className="grid gap-3 md:grid-cols-2">
            {[
              'No DLL injection into games or launchers.',
              'No memory edits, code caves, or anti-cheat evasion.',
              'No silent outbound sync unless you explicitly enable it.',
              'No irreversible system tweaks during a game session.',
            ].map((item) => (
              <div key={item} className="rounded-[1.5rem] border border-border bg-surface-muted/70 px-4 py-4 text-sm leading-6 text-muted">
                {item}
              </div>
            ))}
          </div>
        </Panel>

        <Panel
          title="Operator guidance"
          subtitle="What to do next when the product is asking for caution."
          variant="utility"
        >
          <div className="space-y-3">
            {[
              'Use Manual or Assisted automation until a profile has proven safe on your machine.',
              'Treat any medium or high anomaly score as a reason to inspect the latest session before applying more tweaks.',
              'If a game uses strict anti-cheat, stay in compatibility mode and avoid any future overlay features until they are explicitly verified.',
            ].map((item) => (
              <div key={item} className="rounded-[1.5rem] border border-border bg-surface px-4 py-4 text-sm leading-6 text-muted">
                {item}
              </div>
            ))}
          </div>
        </Panel>
      </section>
    </div>
  )
}
