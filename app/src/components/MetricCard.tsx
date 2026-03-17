import type { StatCard } from '../types'
import { Panel } from './Panel'

export function MetricCard({ detail, label, value }: StatCard) {
  return (
    <Panel className="min-h-[136px]">
      <p className="text-xs uppercase tracking-[0.18em] text-muted">{label}</p>
      <p className="mt-5 text-3xl font-semibold tracking-tight text-text">{value}</p>
      <p className="mt-3 text-sm leading-6 text-muted">{detail}</p>
    </Panel>
  )
}

