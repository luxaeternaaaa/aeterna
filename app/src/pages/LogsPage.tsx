import { useDeferredValue, useMemo, useState } from 'react'

import type { ActivityEntry, LogRecord } from '../types'
import { Panel } from '../components/Panel'

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

  return (
    <div className="grid gap-6 xl:grid-cols-[1.02fr_0.98fr]">
      <Panel title="Activity & Rollback" subtitle="Applied tweaks, snapshots, and local restore history.">
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Filter local activity"
          className="mb-4 w-full rounded-2xl border border-border px-4 py-3 outline-none"
        />
        <div className="space-y-3">
          {filteredActivity.length === 0 ? <p className="text-sm text-muted">No reversible activity recorded yet.</p> : null}
          {filteredActivity.map((item) => (
            <div key={item.id} className="rounded-2xl border border-border px-4 py-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <p className="text-sm font-medium">{item.action}</p>
                <span className="text-xs uppercase tracking-[0.18em] text-muted">{item.risk}</span>
              </div>
              <p className="mt-2 text-sm leading-6 text-muted">{item.detail}</p>
              <p className="mt-2 text-sm text-muted">{new Date(item.timestamp).toLocaleString()}</p>
            </div>
          ))}
        </div>
      </Panel>
      <Panel title="Debug logs" subtitle="Developer-facing local logs remain available, but no longer drive the main workflow.">
        <div className="space-y-3">
          {filteredLogs.map((log) => (
            <div key={log.id} className="rounded-2xl border border-border px-4 py-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <p className="text-sm font-medium">{log.message}</p>
                <span className="text-xs uppercase tracking-[0.18em] text-muted">{log.severity}</span>
              </div>
              <p className="mt-2 text-sm text-muted">
                {new Date(log.timestamp).toLocaleString()} | {log.category} | {log.source}
              </p>
            </div>
          ))}
        </div>
      </Panel>
    </div>
  )
}
