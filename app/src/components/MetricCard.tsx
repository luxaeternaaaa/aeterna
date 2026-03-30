import type { StatCard } from '../types'
import { Panel } from './Panel'

export function MetricCard({ detail, label, value }: StatCard) {
  return (
    <Panel className="min-h-[148px]" variant="utility">
      <div className="pointer-events-none absolute -right-10 -top-10 h-28 w-28 rounded-full bg-accent-soft/60 blur-3xl" />
      <div>
        <div className="flex items-center gap-2 text-xs uppercase tracking-[0.18em] text-muted">
          <span className="h-2 w-2 rounded-full bg-accent" />
          {label}
        </div>
        <p className="mt-5 text-[2.6rem] font-semibold tracking-tight text-text">{value}</p>
      </div>
      <p className="mt-4 text-sm leading-6 text-muted">{detail}</p>
    </Panel>
  )
}
