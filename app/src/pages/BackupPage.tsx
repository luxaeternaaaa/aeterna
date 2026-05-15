import { useMemo, useRef, useState, type ReactNode } from 'react'
import {
  Activity,
  Check,
  Download,
  Eye,
  FileUp,
  RefreshCw,
  RotateCcw,
  Save,
  Trash2,
  UploadCloud,
} from 'lucide-react'

import type { ActivityEntry, RollbackResponse, SnapshotRecord } from '../types'
import { formatTimestamp } from '../lib/time'

interface BackupPageProps {
  activity: ActivityEntry[]
  diffText: string
  onCreateSnapshot: (note?: string) => Promise<void> | void
  onDeleteSnapshot: (id: string) => Promise<void> | void
  onExportSnapshot: (id: string) => Promise<Record<string, unknown>>
  onImportSnapshot: (record: unknown) => Promise<void> | void
  onInspectSnapshot: (id: string) => Promise<void> | void
  onRefresh: () => Promise<void> | void
  onRestoreSnapshot: (id: string) => Promise<void> | void
  onRollbackSnapshot: (snapshotId: string) => Promise<RollbackResponse>
  snapshots: SnapshotRecord[]
}

function uniqueUndoPoints(activity: ActivityEntry[]) {
  const seen = new Set<string>()
  return activity
    .filter((item) => item.can_undo && item.snapshot_id)
    .slice()
    .reverse()
    .filter((item) => {
      const id = item.snapshot_id as string
      if (seen.has(id)) return false
      seen.add(id)
      return true
    })
}

function downloadJson(name: string, payload: unknown) {
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = `${name}.json`
  anchor.click()
  URL.revokeObjectURL(url)
}

function BackupActionButton({
  children,
  disabled,
  onClick,
  tone = 'secondary',
}: {
  children: ReactNode
  disabled?: boolean
  onClick?: () => void
  tone?: 'primary' | 'secondary' | 'danger'
}) {
  const className =
    tone === 'primary'
      ? 'bg-[#315cff] text-white hover:bg-[#416aff]'
      : tone === 'danger'
        ? 'bg-[#e93c41] text-white hover:bg-[#f04b50]'
        : 'bg-[#202942] text-white hover:bg-[#2a3657]'
  return (
    <button
      className={`inline-flex min-h-11 items-center justify-center gap-2 rounded-[1rem] px-5 text-base font-semibold transition disabled:cursor-not-allowed disabled:opacity-45 ${className}`}
      disabled={disabled}
      onClick={onClick}
      type="button"
    >
      {children}
    </button>
  )
}

export function BackupPage({
  activity,
  diffText,
  onCreateSnapshot,
  onDeleteSnapshot,
  onExportSnapshot,
  onImportSnapshot,
  onInspectSnapshot,
  onRefresh,
  onRestoreSnapshot,
  onRollbackSnapshot,
  snapshots,
}: BackupPageProps) {
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [status, setStatus] = useState<string | null>(null)
  const undoPoints = useMemo(() => uniqueUndoPoints(activity), [activity])

  const run = async (key: string, action: () => Promise<void> | void, success: string) => {
    if (busy) return
    setBusy(key)
    setStatus(null)
    try {
      await action()
      setStatus(success)
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Action failed.'
      setStatus(message)
    } finally {
      setBusy(null)
    }
  }

  const handleImportFile = async (file: File | undefined) => {
    if (!file) return
    await run(
      'import',
      async () => {
        const text = await file.text()
        const parsed = JSON.parse(text) as unknown
        const record =
          parsed && typeof parsed === 'object' && 'record' in parsed ? (parsed as { record: unknown }).record : parsed
        await onImportSnapshot(record)
      },
      'Backup profile imported.',
    )
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  return (
    <div className="mx-auto flex h-full min-h-0 max-w-[1180px] flex-col gap-5 px-2 text-white">
      <header className="flex shrink-0 flex-wrap items-center justify-between gap-4">
        <h1 className="text-2xl font-black">Profiles</h1>
        <div className="flex min-w-[520px] max-w-full flex-1 items-center gap-2 rounded-[1.35rem] bg-[#070b1b]/88 p-2">
          <BackupActionButton
            disabled={busy !== null}
            onClick={() => void run('create', () => onCreateSnapshot(), 'Backup profile created.')}
            tone="primary"
          >
            <Save size={19} />
            <span>Take Snapshot</span>
          </BackupActionButton>
          <BackupActionButton disabled={busy !== null} onClick={() => fileInputRef.current?.click()}>
            <FileUp size={19} />
            <span>Import file</span>
          </BackupActionButton>
          <div className="flex-1" />
          <BackupActionButton disabled={busy !== null} onClick={() => void run('refresh', () => onRefresh(), 'Profiles updated.')}>
            <RefreshCw size={18} />
            <span>Update</span>
          </BackupActionButton>
          <input
            ref={fileInputRef}
            accept="application/json,.json"
            className="hidden"
            onChange={(event) => void handleImportFile(event.target.files?.[0])}
            type="file"
          />
        </div>
      </header>

      <section className="min-h-0 flex-1 overflow-y-auto pr-2">
        <h2 className="mb-3 text-xl font-black">Local</h2>
        <div className="space-y-3">
          {snapshots.length === 0 && undoPoints.length === 0 ? (
            <div className="rounded-[1.35rem] bg-[#070b1b]/88 p-5 text-white/82">
              <p className="text-base font-semibold">No local profiles yet</p>
              <p className="mt-1 text-sm text-white/55">Take a snapshot before changing settings or optimization presets.</p>
            </div>
          ) : null}

          {snapshots.map((snapshot) => (
            <article key={snapshot.id} className="rounded-[1.35rem] bg-[#070b1b]/88 px-5 py-4">
              <div className="flex min-w-0 items-center gap-4">
                <UploadCloud className="shrink-0 text-white/90" size={28} />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="min-w-0 truncate rounded-md bg-[#2b2a2a]/80 px-2 py-0.5 text-base font-semibold">
                      {snapshot.note || snapshot.id}
                    </h3>
                    <span className="rounded-md bg-[#315cff]/75 px-2 py-0.5 text-xs font-black uppercase text-white">
                      {snapshot.kind}
                    </span>
                  </div>
                  <p className="mt-1 text-sm text-[#7390cf]">{formatTimestamp(snapshot.created_at)}</p>
                  <p className="mt-1 truncate text-xs text-white/36">{snapshot.id}</p>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <button
                    aria-label={`Inspect ${snapshot.id}`}
                    className="grid h-10 w-10 place-items-center rounded-xl text-white/85 hover:bg-white/8"
                    onClick={() => void run(`inspect-${snapshot.id}`, () => onInspectSnapshot(snapshot.id), 'Snapshot diff opened.')}
                    title="Open diff"
                    type="button"
                  >
                    <Eye size={21} />
                  </button>
                  <button
                    aria-label={`Export ${snapshot.id}`}
                    className="grid h-10 w-10 place-items-center rounded-xl text-white/85 hover:bg-white/8"
                    onClick={() =>
                      void run(
                        `export-${snapshot.id}`,
                        async () => {
                          const payload = await onExportSnapshot(snapshot.id)
                          downloadJson(snapshot.id, payload)
                        },
                        'Backup profile exported.',
                      )
                    }
                    title="Export file"
                    type="button"
                  >
                    <Download size={21} />
                  </button>
                  <button
                    aria-label={`Delete ${snapshot.id}`}
                    className="grid h-10 w-10 place-items-center rounded-xl text-white/85 hover:bg-[#e93c41]/20 hover:text-[#ff6268]"
                    onClick={() => {
                      if (!window.confirm(`Delete backup profile ${snapshot.id}?`)) return
                      void run(`delete-${snapshot.id}`, () => onDeleteSnapshot(snapshot.id), 'Backup profile deleted.')
                    }}
                    title="Delete"
                    type="button"
                  >
                    <Trash2 size={21} />
                  </button>
                  <button
                    className="inline-flex h-10 items-center justify-center rounded-[0.9rem] bg-[#315cff] px-4 text-sm font-bold text-white hover:bg-[#416aff]"
                    onClick={() => {
                      if (!window.confirm(`Restore ${snapshot.note || snapshot.id}?`)) return
                      void run(`restore-${snapshot.id}`, () => onRestoreSnapshot(snapshot.id), 'Backup profile restored.')
                    }}
                    type="button"
                  >
                    Open
                  </button>
                </div>
              </div>
            </article>
          ))}

          {undoPoints.length > 0 ? <h2 className="pt-5 text-xl font-black">Optimization rollback</h2> : null}
          {undoPoints.map((entry) => (
            <article key={entry.snapshot_id} className="rounded-[1.35rem] bg-[#070b1b]/88 px-5 py-4">
              <div className="flex min-w-0 items-center gap-4">
                <Activity className="shrink-0 text-white/90" size={28} />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="min-w-0 truncate text-base font-semibold">{entry.action}</h3>
                    <span className="rounded-md bg-[#e93c41]/90 px-2 py-0.5 text-xs font-black uppercase text-white">
                      {entry.risk}
                    </span>
                  </div>
                  <p className="mt-1 text-sm text-[#7390cf]">{formatTimestamp(entry.timestamp)}</p>
                  <p className="mt-1 truncate text-xs text-white/45">{entry.detail}</p>
                </div>
                <button
                  className="inline-flex h-10 items-center justify-center gap-2 rounded-[0.9rem] border border-[#315cff] px-4 text-sm font-bold text-white hover:bg-[#315cff]/18"
                  onClick={() => {
                    if (!entry.snapshot_id || !window.confirm(`Rollback ${entry.action}?`)) return
                    void run(
                      `rollback-${entry.snapshot_id}`,
                      async () => {
                        await onRollbackSnapshot(entry.snapshot_id as string)
                      },
                      'Optimization rollback restored.',
                    )
                  }}
                  type="button"
                >
                  <RotateCcw size={17} />
                  <span>Restore</span>
                </button>
              </div>
            </article>
          ))}
        </div>
      </section>

      {status || diffText ? (
        <footer className="shrink-0 rounded-[1.15rem] bg-[#070b1b]/88 px-4 py-3">
          {status ? (
            <div className="flex items-center gap-2 text-sm font-semibold text-white/84">
              <Check size={17} className="text-[#5d8cff]" />
              <span>{status}</span>
            </div>
          ) : null}
          {diffText ? <pre className="mt-3 max-h-40 overflow-auto text-xs leading-5 text-white/68">{diffText}</pre> : null}
        </footer>
      ) : null}
    </div>
  )
}
