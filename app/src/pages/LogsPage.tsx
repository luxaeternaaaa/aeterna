import { useDeferredValue, useMemo, useState } from 'react'

import type { ActivityEntry, LogRecord } from '../types'
import { Panel } from '../components/Panel'
import { stateCopy } from '../lib/stateCopy'

interface LogsPageProps {
  activity: ActivityEntry[]
  logs: LogRecord[]
}

export function LogsPage({ activity, logs }: LogsPageProps) {
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
          subtitle="Every reversible change should stay visible, explainable, and easy to inspect."
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
          title="Diagnostics posture"
          subtitle="Support logs stay available, but they never outrank the user-facing rollback history."
          variant="utility"
        >
          <div className="space-y-3">
            <div className="rounded-[1.5rem] border border-border bg-surface px-4 py-4 text-sm leading-6 text-muted">
              Developer logs exist for troubleshooting, not as the main product narrative.
            </div>
            <div className="rounded-[1.5rem] border border-border bg-surface px-4 py-4 text-sm leading-6 text-muted">
              If a user cannot understand what changed from the left column alone, the product is still hiding too much behind implementation detail.
            </div>
          </div>
        </Panel>
      </section>

      <section className="grid gap-6 xl:grid-cols-[1.12fr_0.88fr]">
        <Panel
          title="Activity & Rollback"
          subtitle="What changed, why it changed, and whether it can still be undone."
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
              <div className="rounded-[1.5rem] border border-dashed border-border-strong bg-surface-muted/60 px-4 py-4 text-sm leading-6 text-muted">
                {stateCopy.noActivity}
              </div>
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
                    <span className="rounded-full border border-border bg-surface px-3 py-1 text-xs uppercase tracking-[0.18em] text-muted">
                      {item.can_undo ? 'Undo ready' : 'Recorded'}
                    </span>
                  </div>
                </div>
                <div className="mt-3 grid gap-3 md:grid-cols-2">
                  <div className="rounded-[1.25rem] border border-border bg-surface px-3 py-3 text-sm text-muted">
                    Session {item.session_id ?? 'n/a'} | Snapshot {item.snapshot_id ?? 'n/a'}
                  </div>
                  <div className="rounded-[1.25rem] border border-border bg-surface px-3 py-3 text-sm text-muted">
                    {new Date(item.timestamp).toLocaleString()}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </Panel>

        <Panel
          title="Developer logs"
          subtitle="Low-priority support output for diagnostics, not a substitute for a trustworthy product timeline."
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
                <p className="mt-3 text-sm text-muted">{new Date(log.timestamp).toLocaleString()}</p>
              </div>
            ))}
          </div>
        </Panel>
      </section>
    </div>
  )
}
