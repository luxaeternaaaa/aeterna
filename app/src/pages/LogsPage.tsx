import type { ActivityEntry, LogRecord } from '../types'
import { EmptyState } from '../components/EmptyState'
import { Panel } from '../components/Panel'
import { stateCopy } from '../lib/stateCopy'
import { formatTimestamp } from '../lib/time'

interface LogsPageProps {
  activity: ActivityEntry[]
  logs: LogRecord[]
  onOpenOptimization: () => void
}

export function LogsPage({ activity, logs, onOpenOptimization }: LogsPageProps) {
  const filteredActivity = activity
  const filteredLogs = logs

  return (
    <div className="space-y-5">
      <Panel title="Timeline" variant="secondary">
        <div className="mt-5 space-y-3">
          {filteredActivity.length === 0 ? (
            <EmptyState actionLabel="Run a safe test" description={stateCopy.noActivity} onAction={onOpenOptimization} title="No timeline yet" />
          ) : null}
          {filteredActivity.map((item) => (
            <div key={item.id} className="summary-card">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-base font-semibold tracking-tight text-text">{item.action}</p>
                    <span className="status-chip">{item.can_undo ? 'Undo ready' : 'Recorded'}</span>
                    {item.blocked_by_policy ? <span className="status-chip">Blocked</span> : null}
                  </div>
                  <p className="mt-2 text-sm leading-6 text-muted">{item.detail}</p>
                </div>
                <span className="status-chip">{item.risk}</span>
              </div>
              <div className="mt-4 flex flex-wrap gap-4 text-sm text-muted">
                <span>{formatTimestamp(item.timestamp)}</span>
                {item.proof_link ? <span>Proof {item.proof_link}</span> : null}
                {item.snapshot_id ? <span>Snapshot {item.snapshot_id}</span> : null}
              </div>
            </div>
          ))}
        </div>
      </Panel>

      <Panel title="Logs" variant="secondary">
        <div className="space-y-3">
          {filteredLogs.length === 0 ? (
            <div className="surface-card">
              <p className="text-sm leading-6 text-muted">{stateCopy.logsEmpty}</p>
            </div>
          ) : null}
          {filteredLogs.map((log) => (
            <div key={log.id} className="surface-card">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold tracking-tight text-text">{log.message}</p>
                  <p className="mt-1 text-sm text-muted">
                    {log.category} | {log.source}
                  </p>
                </div>
                <span className="status-chip">{log.severity}</span>
              </div>
              <p className="mt-3 text-sm text-muted">{formatTimestamp(log.timestamp)}</p>
            </div>
          ))}
        </div>
      </Panel>
    </div>
  )
}
