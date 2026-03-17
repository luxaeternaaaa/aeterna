import type { PropsWithChildren } from 'react'
import clsx from 'clsx'

interface PanelProps extends PropsWithChildren {
  className?: string
  title?: string
  subtitle?: string
}

export function Panel({ children, className, title, subtitle }: PanelProps) {
  return (
    <section className={clsx('rounded-3xl border border-border bg-white p-6 shadow-panel', className)}>
      {(title || subtitle) && (
        <header className="mb-5">
          {title && <h2 className="text-sm font-medium tracking-tight text-text">{title}</h2>}
          {subtitle && <p className="mt-1 text-sm text-muted">{subtitle}</p>}
        </header>
      )}
      {children}
    </section>
  )
}

