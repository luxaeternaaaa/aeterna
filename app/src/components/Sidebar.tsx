import { Gauge, History, Shield, SlidersHorizontal, Sparkles } from 'lucide-react'
import clsx from 'clsx'

import type { PageId } from '../types'

const items = [
  { id: 'home', label: 'Dashboard', icon: Gauge },
  { id: 'optimize', label: 'Optimize', icon: Sparkles },
  { id: 'history', label: 'History', icon: History },
  { id: 'safety', label: 'Security', icon: Shield },
  { id: 'settings', label: 'Settings', icon: SlidersHorizontal },
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
    <aside className="flex h-full w-[78px] flex-col rounded-[1.4rem] border border-border/80 bg-surface/95 px-2 py-3 shadow-panel">
      <div className="mb-3 flex items-center justify-center">
        <div className="grid h-11 w-11 place-items-center rounded-xl border border-border/80 bg-accent/15">
          <span className="text-lg font-bold tracking-tight text-text">A</span>
        </div>
      </div>

      <nav className="space-y-1.5">
        {items.map(({ icon: Icon, id, label }) => (
          <button
            key={id}
            onClick={() => onSelect(id)}
            title={label}
            className={clsx(
              'relative flex h-11 w-full items-center justify-center rounded-xl text-sm transition',
              activePage === id
                ? 'bg-accent/20 text-text ring-1 ring-inset ring-accent/45'
                : 'text-muted hover:bg-hover hover:text-text',
            )}
            type="button"
          >
            {activePage === id ? <span className="absolute -left-2 h-7 w-1 rounded-r-full bg-accent" /> : null}
            <Icon size={17} />
          </button>
        ))}
      </nav>

      <div className="mt-auto rounded-xl border border-border/75 bg-surface-muted/75 p-2">
        <div className="flex items-center justify-center gap-1">
          <span className="h-2 w-2 rounded-full bg-accent" />
          <span className="text-[9px] uppercase tracking-[0.12em] text-muted">Live</span>
        </div>
        <p className="mt-1 text-center text-[10px] leading-4 text-muted" title={`${connection.title} — ${connection.detail}`}>
          {connection.title}
        </p>
      </div>
    </aside>
  )
}
