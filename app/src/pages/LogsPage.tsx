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
    <div className="space-y-6">
      <section className="grid gap-6 xl:grid-cols-[1.15fr_0.85fr]">
        <Panel
          title="Rollback timeline"
          subtitle="This is where the product proves what changed and whether you can still walk it back."
          variant="primary"
        >
          <div className="grid gap-3 md:grid-cols-3">
            <div className="rounded-[1.5rem] border border-border bg-surface-muted/70 px-4 py-4">
              <p className="text-xs uppercase tracking-[0.18em] text-muted">Undo ready</p>
              <p className="mt-3 text-3xl font-semibold tracking-tight text-text">{undoReadyCount}</p>
              <p className="mt-2 text-sm leading-6 text-muted">Actions that can still be reverted from the current local window.</p>
            </div>
            <div className="rounded-[1.5rem] border border-border bg-surface-muted/70 px-4 py-4">
              <p className="text-xs uppercase tracking-[0.18em] text-muted">Recorded activity</p>
              <p className="mt-3 text-3xl font-semibold tracking-tight text-text">{filteredActivity.length}</p>
              <p className="mt-2 text-sm leading-6 text-muted">Timeline entries written by session control, rollback, and restore events.</p>
            </div>
            <div className="rounded-[1.5rem] border border-border bg-surface-muted/70 px-4 py-4">
              <p className="text-xs uppercase tracking-[0.18em] text-muted">Last change</p>
              <p className="mt-3 text-lg font-semibold tracking-tight text-text">{lastAction ? lastAction.action : 'No local history yet'}</p>
              <p className="mt-2 text-sm leading-6 text-muted">{lastAction ? lastAction.detail : 'Attach a session or apply a safe tweak to start a traceable history.'}</p>
            </div>
          </div>
        </Panel>

        <Panel
          title="Support logs"
          subtitle="Diagnostics stay available, but they never outrank the user-facing rollback story."
          variant="utility"
        >
          <div className="space-y-3">
            <div className="rounded-[1.5rem] border border-border bg-surface px-4 py-4 text-sm leading-6 text-muted">
              Developer logs exist for troubleshooting, not as the main product narrative.
            </div>
            <div className="rounded-[1.5rem] border border-border bg-surface px-4 py-4 text-sm leading-6 text-muted">
              Runtime rollback lives here. Settings and model snapshots stay in Settings so the product does not mix session undo with config history.
            </div>
          </div>
        </Panel>
      </section>

      <section className="grid gap-6 xl:grid-cols-[1.12fr_0.88fr]">
        <Panel
          title="Activity & Rollback"
          subtitle="The timeline should answer what changed, why it happened, and whether it is still reversible."
          variant="primary"
        >
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Filter by action, note, risk, or session"
            className="mb-4 w-full rounded-[1.5rem] border border-border-strong bg-surface-muted px-4 py-3 outline-none transition-colors focus:border-text/35"
          />
          <div className="space-y-3">
            {filteredActivity.length === 0 ? (
              <EmptyState actionLabel="Run a safe test" description={stateCopy.noActivity} onAction={onOpenOptimization} title="No reversible history yet" />
            ) : null}
            {filteredActivity.map((item) => (
              <div key={item.id} className="rounded-[1.5rem] border border-border bg-surface-muted/65 px-4 py-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="text-base font-semibold tracking-tight text-text">{item.action}</p>
                    <p className="mt-1 text-sm leading-6 text-muted">{item.detail}</p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <span className="rounded-full border border-border bg-surface px-3 py-1 text-xs uppercase tracking-[0.18em] text-muted">{item.category}</span>
                    <span className="rounded-full border border-border bg-surface px-3 py-1 text-xs uppercase tracking-[0.18em] text-muted">{item.risk}</span>
                    {item.blocked_by_policy ? (
                      <span className="rounded-full border border-border bg-surface px-3 py-1 text-xs uppercase tracking-[0.18em] text-muted">Blocked by policy</span>
                    ) : null}
                    <span className="rounded-full border border-border bg-surface px-3 py-1 text-xs uppercase tracking-[0.18em] text-muted">
                      {item.can_undo ? 'Undo ready' : 'Recorded'}
                    </span>
                  </div>
                </div>
                <div className="mt-3 grid gap-3 md:grid-cols-2">
                  <div className="rounded-[1.25rem] border border-border bg-surface px-3 py-3 text-sm text-muted">
                    Session {item.session_id ?? 'n/a'} | Action {item.action_id ?? 'n/a'}
                  </div>
                  <div className="rounded-[1.25rem] border border-border bg-surface px-3 py-3 text-sm text-muted">
                    {formatTimestamp(item.timestamp)}
                  </div>
                </div>
                {item.snapshot_id ? (
                  <div className="mt-3 rounded-[1.25rem] border border-border bg-surface px-3 py-3 text-sm text-muted">
                    Snapshot {item.snapshot_id}
                  </div>
                ) : null}
                {item.proof_link ? (
                  <div className="mt-3 rounded-[1.25rem] border border-border bg-surface px-3 py-3 text-sm text-muted">
                    Benchmark {item.proof_link}
                  </div>
                ) : null}
              </div>
            ))}
          </div>
        </Panel>

        <Panel
          title="Developer logs"
          subtitle="Support output for troubleshooting, not a substitute for the product timeline."
          variant="secondary"
        >
          <div className="space-y-3">
            {filteredLogs.length === 0 ? (
              <div className="rounded-[1.5rem] border border-dashed border-border bg-surface-muted/60 px-4 py-4 text-sm leading-6 text-muted">
                {stateCopy.logsEmpty}
              </div>
            ) : null}
            {filteredLogs.map((log) => (
              <div key={log.id} className="rounded-[1.5rem] border border-border bg-surface-muted/65 px-4 py-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold tracking-tight text-text">{log.message}</p>
                    <p className="mt-1 text-sm text-muted">
                      {log.category} | {log.source}
                    </p>
                  </div>
                  <span className="rounded-full border border-border bg-surface px-3 py-1 text-xs uppercase tracking-[0.18em] text-muted">{log.severity}</span>
                </div>
                <p className="mt-3 text-sm text-muted">{formatTimestamp(log.timestamp)}</p>
              </div>
            ))}
          </div>
        </Panel>
      </section>
    </div>
  )
}
