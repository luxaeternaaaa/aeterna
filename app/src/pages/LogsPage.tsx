import { useDeferredValue, useMemo, useState } from 'react'

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
  const [query, setQuery] = useState('')
  const deferredQuery = useDeferredValue(query)
  const filteredActivity = useMemo(
    () => activity.filter((item) => `${item.action} ${item.detail}`.toLowerCase().includes(deferredQuery.toLowerCase())),
    [activity, deferredQuery],
  )
  const filteredLogs = useMemo(
    () => logs.filter((item) => `${item.category} ${item.message} ${item.source}`.toLowerCase().includes(deferredQuery.toLowerCase())),
    [deferredQuery, logs],
  )
  const undoReadyCount = filteredActivity.filter((item) => item.can_undo).length
  const lastAction = filteredActivity[0] ?? null

  return (
    <div className="space-y-5">
      <Panel variant="primary">
        <div className="grid gap-4 xl:grid-cols-[1.15fr_0.85fr]">
          <div className="action-stage">
            <p className="text-xs uppercase tracking-[0.18em] text-muted">History</p>
            <h3 className="mt-3 text-2xl font-semibold tracking-tight text-text md:text-[2.35rem]">
              {undoReadyCount > 0 ? `${undoReadyCount} change${undoReadyCount === 1 ? '' : 's'} ready to undo` : 'History is still empty'}
            </h3>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-muted md:text-base md:leading-7">
              {lastAction
                ? `Last recorded change: ${lastAction.action}. Review it below and decide whether to keep it or roll it back.`
                : stateCopy.noActivity}
            </p>
            {!lastAction ? (
              <button className="button-primary mt-6" onClick={onOpenOptimization} type="button">
                Start a measured test
              </button>
            ) : null}
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="surface-card">
              <p className="text-xs uppercase tracking-[0.18em] text-muted">Undo ready</p>
              <p className="mt-2 text-2xl font-semibold tracking-tight text-text">{undoReadyCount}</p>
              <p className="mt-2 text-sm leading-6 text-muted">Reversible changes remain visible here until they are restored or closed.</p>
            </div>
            <div className="surface-card">
              <p className="text-xs uppercase tracking-[0.18em] text-muted">Technical logs</p>
              <p className="mt-2 text-2xl font-semibold tracking-tight text-text">{filteredLogs.length}</p>
              <p className="mt-2 text-sm leading-6 text-muted">Debugging output stays secondary to the undo timeline.</p>
            </div>
          </div>
        </div>
      </Panel>

      <Panel subtitle="Search by action, session, result, or risk." title="Timeline" variant="secondary">
        <input
          className="input-shell"
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Filter timeline"
          value={query}
        />

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
                <div className="flex flex-wrap gap-2">
                  <span className="status-chip">{item.category}</span>
                  <span className="status-chip">{item.risk}</span>
                </div>
              </div>
              <div className="mt-4 flex flex-wrap gap-4 text-sm text-muted">
                <span>{formatTimestamp(item.timestamp)}</span>
                <span>Session {item.session_id ?? 'n/a'}</span>
                {item.proof_link ? <span>Proof {item.proof_link}</span> : null}
                {item.snapshot_id ? <span>Snapshot {item.snapshot_id}</span> : null}
              </div>
            </div>
          ))}
        </div>
      </Panel>

      <Panel subtitle="Use this only for debugging and support." title="Technical logs" variant="secondary">
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
