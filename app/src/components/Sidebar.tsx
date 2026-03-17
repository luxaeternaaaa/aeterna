import { Activity, Lock, Logs, Network, Settings2, Sparkles } from 'lucide-react'
import clsx from 'clsx'

import type { PageId } from '../types'

const items = [
  { id: 'dashboard', label: 'Dashboard', icon: Activity },
  { id: 'optimization', label: 'Optimization', icon: Sparkles },
  { id: 'security', label: 'Security', icon: Lock },
  { id: 'models', label: 'Models', icon: Network },
  { id: 'logs', label: 'Activity', icon: Logs },
  { id: 'settings', label: 'Settings', icon: Settings2 },
] as const

type ConnectionState = {
  title: string
  detail: string
}

interface SidebarProps {
  activePage: PageId
  connection: ConnectionState
  onSelect: (page: PageId) => void
}

export function Sidebar({ activePage, connection, onSelect }: SidebarProps) {
  return (
    <aside className="flex h-full flex-col rounded-[2rem] border border-border bg-white/80 p-5 shadow-panel backdrop-blur">
      <div className="mb-10">
        <p className="text-xs uppercase tracking-[0.25em] text-muted">Aeterna</p>
        <h1 className="mt-3 text-2xl font-semibold tracking-tight">Session Control</h1>
      </div>
      <nav className="space-y-2">
        {items.map(({ icon: Icon, id, label }) => (
          <button
            key={id}
            onClick={() => onSelect(id)}
            className={clsx(
              'flex w-full items-center gap-3 rounded-2xl px-4 py-3 text-sm transition',
              activePage === id ? 'bg-active text-text' : 'text-muted hover:bg-hover',
            )}
          >
            <Icon size={16} />
            <span>{label}</span>
          </button>
        ))}
      </nav>
      <div className="mt-auto min-h-[124px] rounded-2xl border border-border p-4">
        <p className="text-xs uppercase tracking-[0.18em] text-muted">Runtime</p>
        <p className="mt-3 text-base leading-7 text-text">{connection.title}</p>
        <p className="mt-1 text-sm leading-6 text-muted">{connection.detail}</p>
      </div>
    </aside>
  )
}
