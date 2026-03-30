import { Boxes, Gauge, History, Shield, SlidersHorizontal, Sparkles } from 'lucide-react'
import clsx from 'clsx'

import type { PageId } from '../types'
import { ThemeToggle } from './ThemeToggle'

const items = [
  { id: 'dashboard', label: 'Dashboard', icon: Gauge },
  { id: 'optimization', label: 'Optimization', icon: Sparkles },
  { id: 'security', label: 'Security', icon: Shield },
  { id: 'models', label: 'Models', icon: Boxes },
  { id: 'logs', label: 'Activity', icon: History },
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
    <aside className="flex h-full flex-col rounded-[2rem] bg-surface/90 p-5 shadow-panel backdrop-blur-xl ring-1 ring-inset ring-border/65">
      <div className="mb-8">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <p className="text-xs uppercase tracking-[0.28em] text-muted">Aeterna</p>
            <div className="mt-4 flex items-center gap-4">
              <div className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-accent-soft shadow-sm ring-1 ring-inset ring-accent/15">
                <span className="text-xl font-semibold tracking-tight text-text">A</span>
              </div>
              <div className="min-w-0">
                <h1 className="text-[1.8rem] font-semibold leading-[1.02] tracking-tight text-text">Session control</h1>
                <p className="mt-1 text-sm leading-6 text-muted">One safe step at a time.</p>
              </div>
            </div>
          </div>
          <ThemeToggle onToggle={onToggleTheme} theme={theme} />
        </div>
        <p className="mt-5 text-sm leading-6 text-muted">Attach a game, capture proof, try one safe test, and keep undo close.</p>
      </div>
      <nav className="space-y-2">
        {items.map(({ icon: Icon, id, label }) => (
          <button
            key={id}
            onClick={() => onSelect(id)}
            className={clsx(
              'flex w-full items-center gap-3 rounded-2xl px-4 py-3 text-sm transition',
              activePage === id
                ? 'bg-accent-soft/70 text-text shadow-sm ring-1 ring-inset ring-accent/20'
                : 'text-muted hover:bg-hover hover:text-text',
            )}
            type="button"
          >
            <span className={clsx('grid h-7 w-7 place-items-center rounded-full', activePage === id ? 'bg-surface text-text' : 'bg-transparent')}>
              <Icon size={16} />
            </span>
            <span className="font-medium">{label}</span>
          </button>
        ))}
      </nav>
      <div className="mt-auto rounded-[1.75rem] bg-surface-muted/90 p-4 ring-1 ring-inset ring-border/65">
        <div className="flex items-center gap-2 text-xs uppercase tracking-[0.18em] text-muted">
          <span className="h-2 w-2 rounded-full bg-accent" />
          Runtime
        </div>
        <p className="mt-3 text-base leading-7 text-text">{connection.title}</p>
        <p className="mt-1 text-sm leading-6 text-muted">{connection.detail}</p>
        <p className="mt-4 text-xs leading-5 text-muted">Theme {theme === 'dark' ? 'Dark' : 'Light'}.</p>
      </div>
    </aside>
  )
}
