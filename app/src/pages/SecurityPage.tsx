import type { SecuritySummary } from '../types'
import { DisclosurePanel } from '../components/DisclosurePanel'
import { Panel } from '../components/Panel'

interface SecurityPageProps {
  security: SecuritySummary
}

export function SecurityPage({ security }: SecurityPageProps) {
  const postureLabel = security.status === 'high' ? 'Stop and inspect' : security.status === 'medium' ? 'Proceed carefully' : 'Low concern'

  return (
    <div className="space-y-6">
      <Panel variant="primary">
        <div className="grid gap-6 xl:grid-cols-[1.2fr_0.8fr] xl:items-start">
          <div>
            <p className="text-xs uppercase tracking-[0.18em] text-muted">Safety</p>
            <h3 className="mt-3 text-3xl font-semibold tracking-tight text-text md:text-[2.4rem]">{postureLabel}</h3>
            <p className="mt-3 max-w-2xl text-base leading-7 text-muted">
              Aeterna stays on the safe side: local-first, reversible, and designed to avoid anti-cheat conflicts.
            </p>
          </div>

          <div className="grid gap-3">
            <div className="surface-card">
              <p className="text-xs uppercase tracking-[0.18em] text-muted">Confidence</p>
              <p className="mt-2 text-2xl font-semibold tracking-tight text-text">{(security.confidence * 100).toFixed(0)}%</p>
              <p className="mt-2 text-sm leading-6 text-muted">A read on how stable the current safety signal looks.</p>
            </div>
            <div className="surface-card">
              <p className="text-xs uppercase tracking-[0.18em] text-muted">Review mode</p>
              <p className="mt-2 text-2xl font-semibold tracking-tight text-text">{security.auto_scan_enabled ? 'Automatic' : 'Manual'}</p>
              <p className="mt-2 text-sm leading-6 text-muted">Automatic review stays opt-in. Local inspection is still the default.</p>
            </div>
          </div>
        </div>
      </Panel>

      <DisclosurePanel defaultOpen summary="The short version of what Aeterna will never do." title="Why it stays safe">
        <div className="grid gap-3 md:grid-cols-2">
          {[
            'Safe for games. Aeterna does not try to bypass anti-cheat systems.',
            'Every real change is reversible before it runs.',
            'Nothing syncs out unless you explicitly allow it.',
            'Risky system-wide changes stay out of the normal play session path.',
          ].map((item) => (
            <div key={item} className="surface-card text-sm leading-6 text-muted">
              {item}
            </div>
          ))}
        </div>
      </DisclosurePanel>

      <DisclosurePanel summary="Open this only when you want the deeper trust rules." title="Technical details">
        <div className="grid gap-3 md:grid-cols-2">
          {[
            'No memory editing or stealthy behavior aimed at games.',
            'No silent background sync unless you turn it on yourself.',
            'No permanent system change is required during a live game session.',
            'If the app asks you to slow down, proof and rollback take priority over automation.',
          ].map((item) => (
            <div key={item} className="summary-card text-sm leading-6 text-muted">
              {item}
            </div>
          ))}
        </div>
      </DisclosurePanel>
    </div>
  )
}
