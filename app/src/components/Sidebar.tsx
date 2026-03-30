import { Gauge, History, Shield, SlidersHorizontal, Sparkles } from 'lucide-react'
import clsx from 'clsx'

import type { PageId } from '../types'
import { ThemeToggle } from './ThemeToggle'

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
  onToggleTheme: () => void
  theme: 'dark' | 'light'
}

export function Sidebar({ activePage, connection, onSelect, onToggleTheme, theme }: SidebarProps) {
  return (
    <aside className="flex h-full flex-col rounded-[1.75rem] bg-surface/92 p-4 shadow-panel ring-1 ring-inset ring-border/65">
      <div className="mb-6 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-3">
            <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-accent-soft ring-1 ring-inset ring-accent/15">
              <span className="text-base font-semibold tracking-tight text-text">A</span>
            </div>
            <div className="min-w-0">
              <h1 className="text-lg font-semibold tracking-tight text-text">Aeterna</h1>
              <p className="text-xs uppercase tracking-[0.18em] text-muted">Measured control</p>
            </div>
          </div>
        </div>
        <ThemeToggle onToggle={onToggleTheme} theme={theme} />
      </div>

      <nav className="space-y-1.5">
        {items.map(({ icon: Icon, id, label }) => (
          <button
            key={id}
            onClick={() => onSelect(id)}
            className={clsx(
              'flex w-full items-center gap-3 rounded-xl px-3.5 py-2.5 text-sm transition',
              activePage === id
                ? 'bg-accent-soft/70 text-text ring-1 ring-inset ring-accent/20'
                : 'text-muted hover:bg-hover hover:text-text',
            )}
            type="button"
          >
            <span className={clsx('grid h-7 w-7 place-items-center rounded-lg', activePage === id ? 'bg-surface text-text' : 'bg-transparent')}>
              <Icon size={16} />
            </span>
            <span className="font-medium">{label}</span>
          </button>
        ))}
      </nav>

      <div className="mt-auto rounded-[1.25rem] bg-surface-muted/90 p-4 ring-1 ring-inset ring-border/65">
        <div className="flex items-center gap-2 text-[11px] uppercase tracking-[0.18em] text-muted">
          <span className="h-2 w-2 rounded-full bg-accent" />
          Runtime
        </div>
        <p className="mt-2 text-sm font-medium text-text">{connection.title}</p>
        <p className="mt-1 text-sm leading-6 text-muted">{connection.detail}</p>
      </div>
    </aside>
  )
}
