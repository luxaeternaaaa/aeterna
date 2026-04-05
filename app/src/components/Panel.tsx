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
  primary: 'bg-surface shadow-panel',
  secondary: 'bg-surface shadow-none',
  utility: 'bg-surface/88 shadow-none',
} as const

export function Panel({ action, children, className, title, subtitle, variant = 'secondary' }: PanelProps) {
  return (
    <section
      className={clsx(
        'relative overflow-hidden rounded-[1.5rem] p-5 md:p-6',
        panelVariants[variant],
        className,
      )}
    >
      {(title || subtitle) && (
        <header className="mb-6">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              {title && <h2 className="text-base font-semibold tracking-tight text-text">{title}</h2>}
              {subtitle && <p className="mt-2 max-w-3xl text-sm leading-6 text-muted">{subtitle}</p>}
            </div>
            {action}
          </div>
        </header>
      )}
      {children}
    </section>
  )
}
