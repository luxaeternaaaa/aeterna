import type { PropsWithChildren, ReactNode } from 'react'
import clsx from 'clsx'

interface PanelProps extends PropsWithChildren {
  action?: ReactNode
  className?: string
  title?: string
  subtitle?: string
  variant?: 'primary' | 'secondary' | 'utility'
}

const panelVariants = {
  primary: 'border-border-strong bg-gradient-to-b from-surface to-surface-elevated shadow-float',
  secondary: 'border-border bg-gradient-to-b from-surface to-surface-elevated/90 shadow-panel',
  utility: 'border-border bg-surface-muted/45 shadow-none',
} as const

export function Panel({ action, children, className, title, subtitle, variant = 'secondary' }: PanelProps) {
  return (
    <section
      className={clsx(
        'relative overflow-hidden rounded-[1.85rem] border p-6',
        panelVariants[variant],
        className,
      )}
    >
      <div aria-hidden className="pointer-events-none absolute inset-x-0 top-0 h-px bg-border-strong/55" />
      {(title || subtitle) && (
        <header className="mb-5 border-b border-border/80 pb-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              {title && <h2 className="text-sm font-medium tracking-tight text-text">{title}</h2>}
              {subtitle && <p className="mt-1 text-sm leading-6 text-muted">{subtitle}</p>}
            </div>
            {action}
          </div>
        </header>
      )}
      {children}
    </section>
  )
}
